import Foundation
import Network
import NetworkExtension

enum TCPFlowRelayMode {
    case httpConnect
    case rawPassthrough
}

final class TCPFlowRelay {
    private let flow: NEAppProxyTCPFlow
    private let target: ProxyTarget
    private let bridgeHost: String
    private let bridgePort: UInt16
    private let mode: TCPFlowRelayMode
    private let queue = DispatchQueue(label: "cheng.app.proxy.tcp.relay")
    private let onClose: (TCPFlowRelay, Error?) -> Void

    private var bridge: NWConnection?
    private var closed = false
    private var relayStarted = false
    private var responseBuffer = Data()
    private var deadline: DispatchSourceTimer?

    init(
        flow: NEAppProxyTCPFlow,
        target: ProxyTarget,
        bridgeHost: String,
        bridgePort: UInt16,
        mode: TCPFlowRelayMode = .httpConnect,
        onClose: @escaping (TCPFlowRelay, Error?) -> Void
    ) {
        self.flow = flow
        self.target = target
        self.bridgeHost = bridgeHost
        self.bridgePort = bridgePort
        self.mode = mode
        self.onClose = onClose
    }

    func start() {
        queue.async {
            self.armDeadline(seconds: 8, error: ChengProxyError.bridgeConnectTimeout)
            self.flow.open(withLocalEndpoint: nil) { [weak self] error in
                guard let self else { return }
                self.queue.async {
                    if let error {
                        self.closeNow(error)
                        return
                    }
                    self.openBridge()
                }
            }
        }
    }

    func cancel() {
        cancel(error: ChengProxyError.flowCancelled)
    }

    func cancel(error: Error?) {
        queue.async {
            self.closeNow(error)
        }
    }

    private func openBridge() {
        guard !closed else { return }
        guard let port = Network.NWEndpoint.Port(rawValue: bridgePort) else {
            closeNow(ChengProxyError.invalidBridgePort)
            return
        }

        let connection = NWConnection(host: Network.NWEndpoint.Host(bridgeHost), port: port, using: .tcp)
        bridge = connection
        connection.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
                switch self.mode {
                case .httpConnect:
                    self.sendConnectRequest()
                case .rawPassthrough:
                    self.cancelDeadline()
                    self.startRelayLoops()
                }
            case .failed(let error):
                self.queue.async {
                    self.closeNow(error)
                }
            case .cancelled:
                self.queue.async {
                    self.closeNow(ChengProxyError.flowCancelled)
                }
            default:
                break
            }
        }
        connection.start(queue: queue)
    }

    private func sendConnectRequest() {
        guard !closed else { return }
        armDeadline(seconds: 8, error: ChengProxyError.bridgeResponseTimeout)
        let authority = target.connectAuthority
        NSLog("cheng_app_proxy tcp_connect target=\(authority)")
        let request = "CONNECT \(authority) HTTP/1.1\r\n"
            + "Host: \(authority)\r\n"
            + "Proxy-Connection: Keep-Alive\r\n"
            + "\r\n"
        bridge?.send(content: Data(request.utf8), completion: .contentProcessed { [weak self] error in
            guard let self else { return }
            self.queue.async {
                if let error {
                    self.closeNow(error)
                    return
                }
                self.readConnectResponse()
            }
        })
    }

    private func readConnectResponse() {
        bridge?.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            self.queue.async {
                self.handleConnectResponse(data: data, isComplete: isComplete, error: error)
            }
        }
    }

    private func handleConnectResponse(data: Data?, isComplete: Bool, error: Error?) {
        guard !closed else { return }
        if let error {
            closeNow(error)
            return
        }
        if let data {
            responseBuffer.append(data)
        }
        if let headerEnd = responseBuffer.range(of: Data("\r\n\r\n".utf8)) {
            let headerData = responseBuffer[..<headerEnd.lowerBound]
            let header = String(decoding: headerData, as: UTF8.self)
            guard header.hasPrefix("HTTP/1.1 200") || header.hasPrefix("HTTP/1.0 200") else {
                let statusLine = header.split(separator: "\r\n", maxSplits: 1).first.map(String.init) ?? header
                closeNow(ChengProxyError.bridgeRejected(statusLine))
                return
            }

            cancelDeadline()
            let bodyStart = headerEnd.upperBound
            let leftover = responseBuffer[bodyStart...]
            responseBuffer.removeAll(keepingCapacity: false)
            if !leftover.isEmpty {
                writeToFlow(Data(leftover)) { [weak self] in
                    self?.queue.async {
                        self?.startRelayLoops()
                    }
                }
                return
            }
            startRelayLoops()
            return
        }

        if responseBuffer.count > 8192 || isComplete {
            closeNow(ChengProxyError.bridgeRejected("invalid CONNECT response"))
            return
        }
        readConnectResponse()
    }

    private func startRelayLoops() {
        guard !closed, !relayStarted else { return }
        relayStarted = true
        readFromFlow()
        readFromBridge()
    }

    private func readFromFlow() {
        guard !closed else { return }
        flow.readData { [weak self] data, error in
            guard let self else { return }
            self.queue.async {
                self.handleFlowRead(data: data, error: error)
            }
        }
    }

    private func handleFlowRead(data: Data?, error: Error?) {
        guard !closed else { return }
        if let error {
            closeNow(error)
            return
        }
        guard let data, !data.isEmpty else {
            bridge?.send(
                content: nil,
                contentContext: .defaultStream,
                isComplete: true,
                completion: .contentProcessed { _ in }
            )
            return
        }
        bridge?.send(content: data, completion: .contentProcessed { [weak self] sendError in
            guard let self else { return }
            self.queue.async {
                if let sendError {
                    self.closeNow(sendError)
                    return
                }
                self.readFromFlow()
            }
        })
    }

    private func readFromBridge() {
        guard !closed else { return }
        bridge?.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            self.queue.async {
                self.handleBridgeRead(data: data, isComplete: isComplete, error: error)
            }
        }
    }

    private func handleBridgeRead(data: Data?, isComplete: Bool, error: Error?) {
        guard !closed else { return }
        if let error {
            closeNow(error)
            return
        }
        if let data, !data.isEmpty {
            writeToFlow(data) { [weak self] in
                self?.queue.async {
                    guard let self else { return }
                    if isComplete {
                        self.flow.closeWriteWithError(nil)
                    } else {
                        self.readFromBridge()
                    }
                }
            }
            return
        }
        if isComplete {
            flow.closeWriteWithError(nil)
        } else {
            readFromBridge()
        }
    }

    private func writeToFlow(_ data: Data, completion: @escaping () -> Void) {
        guard !closed else { return }
        flow.write(data) { [weak self] error in
            guard let self else { return }
            self.queue.async {
                if let error {
                    self.closeNow(error)
                    return
                }
                completion()
            }
        }
    }

    private func armDeadline(seconds: Int, error: ChengProxyError) {
        cancelDeadline()
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + .seconds(seconds))
        timer.setEventHandler { [weak self] in
            self?.closeNow(error)
        }
        deadline = timer
        timer.resume()
    }

    private func cancelDeadline() {
        deadline?.cancel()
        deadline = nil
    }

    private func close(_ error: Error?) {
        queue.async {
            self.closeNow(error)
        }
    }

    private func closeNow(_ error: Error?) {
        guard !closed else { return }
        closed = true
        if let error {
            if let proxyError = error as? ChengProxyError {
                NSLog("cheng_app_proxy tcp_close target=\(target.connectAuthority) error=\(proxyError.statusCode)")
            } else {
                NSLog("cheng_app_proxy tcp_close target=\(target.connectAuthority) error=apple_network_error")
            }
        }
        cancelDeadline()
        bridge?.stateUpdateHandler = nil
        bridge?.cancel()
        bridge = nil
        flow.closeReadWithError(error)
        flow.closeWriteWithError(error)
        onClose(self, error)
    }
}

final class ChengNetworkPathWatcher {
    private let queue: DispatchQueue
    private let onChange: (String, Bool) -> Void
    private let monitor = NWPathMonitor()

    init(queue: DispatchQueue, onChange: @escaping (String, Bool) -> Void) {
        self.queue = queue
        self.onChange = onChange
    }

    func start() {
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            let status: String
            switch path.status {
            case .satisfied:
                status = "satisfied"
            case .unsatisfied:
                status = "unsatisfied"
            case .requiresConnection:
                status = "requires_connection"
            @unknown default:
                status = "unknown"
            }
            self.queue.async {
                self.onChange(status, path.status == .satisfied)
            }
        }
        monitor.start(queue: queue)
    }

    func cancel() {
        monitor.cancel()
    }
}

final class ChengBridgeReachabilityProbe {
    private let host: String
    private let port: UInt16
    private let queue: DispatchQueue
    private var connection: NWConnection?
    private var deadline: DispatchSourceTimer?
    private var completed = false
    private var sentHealthRequest = false

    init(host: String, port: UInt16, queue: DispatchQueue) {
        self.host = host
        self.port = port
        self.queue = queue
    }

    func start(completion: @escaping (Error?) -> Void) {
        guard let endpointPort = NWEndpoint.Port(rawValue: port) else {
            completion(ChengProxyError.invalidBridgePort)
            return
        }

        let connection = NWConnection(host: NWEndpoint.Host(host), port: endpointPort, using: .tcp)
        self.connection = connection
        connection.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
                self.sendHealthRequest(completion: completion)
            case .failed(let error):
                self.finish(ChengProxyError.bridgeConnectionFailed(error.localizedDescription), completion: completion)
            case .cancelled:
                self.finish(ChengProxyError.providerStopped, completion: completion)
            default:
                break
            }
        }
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + .seconds(4))
        timer.setEventHandler { [weak self] in
            self?.finish(ChengProxyError.bridgeConnectTimeout, completion: completion)
        }
        deadline = timer
        timer.resume()
        connection.start(queue: queue)
    }

    private func sendHealthRequest(completion: @escaping (Error?) -> Void) {
        guard !sentHealthRequest else { return }
        sentHealthRequest = true
        let request = Data("GET /health HTTP/1.1\r\nHost: cheng-bridge\r\nConnection: close\r\n\r\n".utf8)
        connection?.send(content: request, completion: .contentProcessed { [weak self] error in
            guard let self else { return }
            if let error {
                self.finish(ChengProxyError.bridgeConnectionFailed(error.localizedDescription), completion: completion)
                return
            }
            self.finish(nil, completion: completion)
        })
    }

    func cancel() {
        deadline?.cancel()
        deadline = nil
        connection?.stateUpdateHandler = nil
        connection?.cancel()
        connection = nil
    }

    private func finish(_ error: Error?, completion: @escaping (Error?) -> Void) {
        queue.async {
            guard !self.completed else { return }
            self.completed = true
            self.cancel()
            completion(error)
        }
    }
}
