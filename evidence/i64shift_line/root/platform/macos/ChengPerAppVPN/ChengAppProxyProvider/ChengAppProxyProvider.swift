import Foundation
import NetworkExtension

final class ChengAppProxyProvider: NEAppProxyProvider {
    private let queueKey = DispatchSpecificKey<Void>()
    private let queue = DispatchQueue(label: "cheng.app.proxy.provider")
    private var activeRelays: [ObjectIdentifier: TCPFlowRelay] = [:]
    private var activeUDPRelays: [ObjectIdentifier: UDPFlowRelay] = [:]
    private var bridgeHost = "127.0.0.1"
    private var bridgePort: UInt16 = 17897
    private var udpSocksHost = ""
    private var udpSocksPort: UInt16 = 0
    private var udpRelayEnabled = false
    private var acceptingFlows = false
    private var pathMonitor: ChengNetworkPathWatcher?
    private var pathStatus = "unknown"
    private var startupBridgeCheck: ChengBridgeReachabilityProbe?
    private var startupUDPCheck: ChengSocks5UDPAssociateProbe?
    private var pendingStartCompletion: ((Error?) -> Void)?
    private var lastErrorCode = "ok"
    private var lastErrorMessage = ""

    override init() {
        super.init()
        queue.setSpecific(key: queueKey, value: ())
    }

    override func startProxy(options: [String: Any]? = nil, completionHandler: @escaping (Error?) -> Void) {
        queue.async {
            do {
                try self.loadConfiguration()
            } catch {
                self.record(error: error)
                completionHandler(error)
                return
            }

            self.acceptingFlows = false
            self.pathMonitor?.cancel()
            self.pathMonitor = nil
            self.startupBridgeCheck?.cancel()
            self.startupBridgeCheck = nil
            self.startupUDPCheck?.cancel()
            self.startupUDPCheck = nil
            if let previousStart = self.pendingStartCompletion {
                self.pendingStartCompletion = nil
                previousStart(ChengProxyError.providerStopped)
            }
            self.pendingStartCompletion = completionHandler
            self.cancelRelaysLocked(error: ChengProxyError.providerStopped)
            self.startPathMonitorLocked()
            self.verifyBridgeReachableLocked { [weak self] error in
                guard let self else { return }
                self.queue.async {
                    if let error {
                        self.completeStartLocked(error)
                        return
                    }
                    if self.udpRelayEnabled {
                        self.verifyUDPRelayReachableLocked { [weak self] error in
                            guard let self else { return }
                            self.queue.async {
                                self.completeStartLocked(error)
                            }
                        }
                    } else {
                        self.completeStartLocked(nil)
                    }
                }
            }
        }
    }

    override func stopProxy(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        queue.async {
            self.acceptingFlows = false
            self.pathMonitor?.cancel()
            self.pathMonitor = nil
            self.startupBridgeCheck?.cancel()
            self.startupBridgeCheck = nil
            self.startupUDPCheck?.cancel()
            self.startupUDPCheck = nil
            self.completeStartLocked(ChengProxyError.providerStopped)
            self.cancelRelaysLocked(error: ChengProxyError.providerStopped)
            NSLog("cheng_app_proxy status=stopped reason=\(reason.rawValue)")
            completionHandler()
        }
    }

    override func handleAppMessage(_ messageData: Data, completionHandler: ((Data?) -> Void)? = nil) {
        let status = onQueue {
            [
                "provider": "cheng-app-proxy",
                "accepting_flows": acceptingFlows,
                "path_status": pathStatus,
                "bridge_host": bridgeHost,
                "bridge_port": Int(bridgePort),
                "udp_socks_host": udpSocksHost,
                "udp_socks_port": Int(udpSocksPort),
                "udp_relay_enabled": udpRelayEnabled,
                "tcp_flow_count": activeRelays.count,
                "udp_flow_count": activeUDPRelays.count,
                "last_error_code": lastErrorCode,
                "last_error_message": lastErrorMessage
            ] as [String: Any]
        }
        let data = try? JSONSerialization.data(withJSONObject: status, options: [.sortedKeys])
        completionHandler?(data)
    }

    private func loadConfiguration() throws {
        let config = (protocolConfiguration as? NETunnelProviderProtocol)?.providerConfiguration ?? [:]
        if let rawHost = config["bridgeHost"] {
            guard let host = rawHost as? String, !host.isEmpty else {
                throw ChengProxyError.invalidProxyConfiguration("bridgeHost")
            }
            bridgeHost = host
        }
        if let rawPort = config["bridgePort"] {
            guard let port = rawPort as? Int, port > 0, port <= Int(UInt16.max) else {
                throw ChengProxyError.invalidBridgePort
            }
            bridgePort = UInt16(port)
        }
        if let rawHost = config["udpSocksHost"] ?? config["socksHost"] {
            guard let host = rawHost as? String, !host.isEmpty else {
                throw ChengProxyError.invalidProxyConfiguration("udpSocksHost")
            }
            udpSocksHost = host
        }
        if let rawPort = config["udpSocksPort"] ?? config["socksPort"] {
            guard let port = rawPort as? Int, port > 0, port <= Int(UInt16.max) else {
                throw ChengProxyError.invalidProxyConfiguration("udpSocksPort")
            }
            udpSocksPort = UInt16(port)
        }
        if let rawMode = config["udpRelayMode"] {
            guard let mode = rawMode as? String else {
                throw ChengProxyError.invalidProxyConfiguration("udpRelayMode")
            }
            switch mode {
            case "disabled":
                udpRelayEnabled = false
            case "socks5-udp-associate":
                udpRelayEnabled = true
            default:
                throw ChengProxyError.invalidProxyConfiguration("udpRelayMode")
            }
        } else if let rawEnabled = config["udpRelayEnabled"] {
            guard let enabled = rawEnabled as? Bool else {
                throw ChengProxyError.invalidProxyConfiguration("udpRelayEnabled")
            }
            udpRelayEnabled = enabled
        } else {
            udpRelayEnabled = false
        }
        if udpRelayEnabled && (udpSocksHost.isEmpty || udpSocksPort == 0) {
            throw ChengProxyError.invalidProxyConfiguration("udpSocksHost")
        }
    }

    private func startPathMonitorLocked() {
        pathMonitor?.cancel()
        let monitor = ChengNetworkPathWatcher(queue: queue) { [weak self] nextStatus, satisfied in
            guard let self else { return }
            guard self.pathStatus != nextStatus else { return }
            self.pathStatus = nextStatus
            NSLog("cheng_app_proxy path_status=\(nextStatus)")
            if satisfied {
                if self.lastErrorCode == ChengProxyError.networkUnavailable(nextStatus).statusCode {
                    self.record(error: nil)
                }
            } else {
                let error = ChengProxyError.networkUnavailable(nextStatus)
                self.record(error: error)
                self.cancelRelaysLocked(error: error)
            }
        }
        pathMonitor = monitor
        monitor.start()
    }

    private func verifyBridgeReachableLocked(completion: @escaping (Error?) -> Void) {
        let probe = ChengBridgeReachabilityProbe(host: bridgeHost, port: bridgePort, queue: queue)
        startupBridgeCheck = probe
        var completed = false

        let finish: (Error?) -> Void = { [weak self, weak probe] error in
            guard let self else { return }
            self.queue.async {
                guard !completed else { return }
                completed = true
                probe?.cancel()
                if self.startupBridgeCheck === probe {
                    self.startupBridgeCheck = nil
                }
                completion(error)
            }
        }

        probe.start(completion: finish)
    }

    private func verifyUDPRelayReachableLocked(completion: @escaping (Error?) -> Void) {
        let probe = ChengSocks5UDPAssociateProbe(host: udpSocksHost, port: udpSocksPort, queue: queue)
        startupUDPCheck = probe
        var completed = false

        let finish: (Error?) -> Void = { [weak self, weak probe] error in
            guard let self else { return }
            self.queue.async {
                guard !completed else { return }
                completed = true
                probe?.cancel()
                if self.startupUDPCheck === probe {
                    self.startupUDPCheck = nil
                }
                completion(error)
            }
        }

        probe.start(completion: finish)
    }

    private func completeStartLocked(_ error: Error?) {
        guard let completion = pendingStartCompletion else { return }
        pendingStartCompletion = nil
        if let error {
            acceptingFlows = false
            pathMonitor?.cancel()
            pathMonitor = nil
            record(error: error)
            completion(error)
            return
        }
        acceptingFlows = true
        record(error: nil)
        NSLog("cheng_app_proxy status=started bridge=\(bridgeHost):\(bridgePort)")
        completion(nil)
    }

    private func cancelRelaysLocked(error: Error?) {
        activeRelays.values.forEach { $0.cancel(error: error) }
        activeRelays.removeAll()
        activeUDPRelays.values.forEach { $0.cancel(error: error) }
        activeUDPRelays.removeAll()
    }

    private func record(error: Error?) {
        guard let error else {
            lastErrorCode = "ok"
            lastErrorMessage = ""
            return
        }
        if let proxyError = error as? ChengProxyError {
            lastErrorCode = proxyError.statusCode
            lastErrorMessage = proxyError.safeMessage
        } else {
            lastErrorCode = "apple_network_error"
            lastErrorMessage = error.localizedDescription
        }
    }

    private func onQueue<T>(_ body: () -> T) -> T {
        if DispatchQueue.getSpecific(key: queueKey) != nil {
            return body()
        }
        return queue.sync(execute: body)
    }

    private func pathAllowsFlows(_ status: String) -> Bool {
        status == "satisfied" || status == "unknown"
    }

    private func reject(_ flow: NEAppProxyFlow, error: Error) -> Bool {
        queue.async {
            self.record(error: error)
        }
        if let proxyError = error as? ChengProxyError {
            NSLog("cheng_app_proxy flow_reject error=\(proxyError.statusCode)")
        } else {
            NSLog("cheng_app_proxy flow_reject error=apple_network_error")
        }
        flow.closeReadWithError(error)
        flow.closeWriteWithError(error)
        return false
    }

    override func handleNewFlow(_ flow: NEAppProxyFlow) -> Bool {
        let snapshot = onQueue {
            (
                acceptingFlows: acceptingFlows,
                bridgeHost: bridgeHost,
                bridgePort: bridgePort,
                udpSocksHost: udpSocksHost,
                udpSocksPort: udpSocksPort,
                udpRelayEnabled: udpRelayEnabled,
                pathStatus: pathStatus
            )
        }
        guard snapshot.acceptingFlows else {
            return reject(flow, error: ChengProxyError.providerNotReady)
        }
        guard pathAllowsFlows(snapshot.pathStatus) else {
            let error = ChengProxyError.networkUnavailable(snapshot.pathStatus)
            return reject(flow, error: error)
        }
        if let udpFlow = flow as? NEAppProxyUDPFlow {
            NSLog("cheng_app_proxy udp_reject target=unknown error=udp_initial_endpoint_missing")
            return reject(udpFlow, error: ChengProxyError.unsupportedUDP("udp_initial_endpoint_missing"))
        }
        guard let tcpFlow = flow as? NEAppProxyTCPFlow else {
            return reject(flow, error: ChengProxyError.unsupportedFlow)
        }

        guard let target = ProxyTarget(endpoint: tcpFlow.remoteEndpoint) else {
            return reject(tcpFlow, error: ChengProxyError.invalidRemoteEndpoint)
        }

        let relayHost = target.isLoopback ? target.host : snapshot.bridgeHost
        let relayPort = target.isLoopback ? target.port : snapshot.bridgePort
        let relayMode: TCPFlowRelayMode = target.isLoopback ? .rawPassthrough : .httpConnect
        let relay = TCPFlowRelay(
            flow: tcpFlow,
            target: target,
            bridgeHost: relayHost,
            bridgePort: relayPort,
            mode: relayMode
        ) { [weak self] relay, error in
            self?.queue.async {
                self?.record(error: error)
                self?.activeRelays.removeValue(forKey: ObjectIdentifier(relay))
            }
        }

        queue.async {
            self.activeRelays[ObjectIdentifier(relay)] = relay
            relay.start()
        }
        return true
    }

    @available(macOS 15.0, *)
    func handleNewUDPFlow(_ flow: NEAppProxyUDPFlow, initialRemoteFlowEndpoint remoteEndpoint: nw_endpoint_t) -> Bool {
        guard let target = ProxyTarget(flowEndpoint: remoteEndpoint) else {
            flow.closeReadWithError(ChengProxyError.invalidRemoteEndpoint)
            flow.closeWriteWithError(ChengProxyError.invalidRemoteEndpoint)
            return false
        }
        return handleUDPFlow(flow, initialTarget: target)
    }

    @objc(handleNewUDPFlow:initialRemoteEndpoint:)
    override func handleNewUDPFlow(_ flow: NEAppProxyUDPFlow, initialRemoteEndpoint remoteEndpoint: NWEndpoint) -> Bool {
        guard let target = ProxyTarget(endpoint: remoteEndpoint) else {
            flow.closeReadWithError(ChengProxyError.invalidRemoteEndpoint)
            flow.closeWriteWithError(ChengProxyError.invalidRemoteEndpoint)
            return false
        }
        return handleUDPFlow(flow, initialTarget: target)
    }

    private func handleUDPFlow(_ flow: NEAppProxyUDPFlow, initialTarget target: ProxyTarget) -> Bool {
        let snapshot = onQueue {
            (
                acceptingFlows: acceptingFlows,
                bridgeHost: bridgeHost,
                bridgePort: bridgePort,
                udpSocksHost: udpSocksHost,
                udpSocksPort: udpSocksPort,
                udpRelayEnabled: udpRelayEnabled,
                pathStatus: pathStatus
            )
        }
        guard snapshot.acceptingFlows else {
            return reject(flow, error: ChengProxyError.providerNotReady)
        }
        guard pathAllowsFlows(snapshot.pathStatus) else {
            let error = ChengProxyError.networkUnavailable(snapshot.pathStatus)
            return reject(flow, error: error)
        }
        if !snapshot.udpRelayEnabled && target.port != 53 {
            NSLog("cheng_app_proxy udp_reject target=\(target.connectAuthority) error=udp_relay_disabled")
            return reject(flow, error: ChengProxyError.unsupportedUDP("udp_relay_disabled"))
        }
        let relay = UDPFlowRelay(
            flow: flow,
            initialTarget: target,
            bridgeHost: snapshot.bridgeHost,
            bridgePort: snapshot.bridgePort,
            udpSocksHost: snapshot.udpSocksHost,
            udpSocksPort: snapshot.udpSocksPort,
            udpRelayEnabled: snapshot.udpRelayEnabled
        ) { [weak self] relay, error in
            self?.queue.async {
                self?.record(error: error)
                self?.activeUDPRelays.removeValue(forKey: ObjectIdentifier(relay))
            }
        }

        queue.async {
            self.activeUDPRelays[ObjectIdentifier(relay)] = relay
            relay.start()
        }
        return true
    }
}

enum ChengProxyError: LocalizedError {
    case providerNotReady
    case providerStopped
    case invalidProxyConfiguration(String)
    case unsupportedFlow
    case invalidRemoteEndpoint
    case invalidBridgePort
    case bridgeConnectionFailed(String)
    case bridgeConnectTimeout
    case bridgeResponseTimeout
    case bridgeRejected(String)
    case networkUnavailable(String)
    case flowCancelled
    case dnsTimeout
    case unsupportedUDP(String)
    case udpAssociateRejected(String)
    case udpAssociateTimeout

    var statusCode: String {
        switch self {
        case .providerNotReady:
            return "provider_not_ready"
        case .providerStopped:
            return "provider_stopped"
        case .invalidProxyConfiguration:
            return "invalid_proxy_configuration"
        case .unsupportedFlow:
            return "unsupported_flow"
        case .invalidRemoteEndpoint:
            return "invalid_remote_endpoint"
        case .invalidBridgePort:
            return "invalid_bridge_port"
        case .bridgeConnectionFailed:
            return "bridge_connection_failed"
        case .bridgeConnectTimeout:
            return "bridge_connect_timeout"
        case .bridgeResponseTimeout:
            return "bridge_response_timeout"
        case .bridgeRejected:
            return "bridge_rejected"
        case .networkUnavailable:
            return "network_unavailable"
        case .flowCancelled:
            return "flow_cancelled"
        case .dnsTimeout:
            return "dns_timeout"
        case .unsupportedUDP:
            return "unsupported_udp"
        case .udpAssociateRejected:
            return "udp_associate_rejected"
        case .udpAssociateTimeout:
            return "udp_associate_timeout"
        }
    }

    var safeMessage: String {
        errorDescription ?? statusCode
    }

    var errorDescription: String? {
        switch self {
        case .providerNotReady:
            return "The Cheng app proxy provider is not ready."
        case .providerStopped:
            return "The Cheng app proxy provider has stopped."
        case .invalidProxyConfiguration(let key):
            return "Invalid Cheng app proxy configuration: \(key)."
        case .unsupportedFlow:
            return "Only TCP and UDP app proxy flows are supported by the Cheng app proxy provider."
        case .invalidRemoteEndpoint:
            return "The app proxy flow does not contain a usable remote host and port."
        case .invalidBridgePort:
            return "The configured Cheng bridge port is invalid."
        case .bridgeConnectionFailed(let detail):
            return "The Cheng HTTP CONNECT bridge connection failed: \(detail)"
        case .bridgeConnectTimeout:
            return "The Cheng HTTP CONNECT bridge connection timed out."
        case .bridgeResponseTimeout:
            return "The Cheng HTTP CONNECT bridge response timed out."
        case .bridgeRejected(let line):
            return "The Cheng HTTP CONNECT bridge rejected the flow: \(line)"
        case .networkUnavailable(let status):
            return "The macOS network path is unavailable: \(status)."
        case .flowCancelled:
            return "The app proxy flow was cancelled."
        case .dnsTimeout:
            return "The DNS-over-TCP query timed out."
        case .unsupportedUDP(let detail):
            return "Unsupported UDP flow: \(detail)"
        case .udpAssociateRejected(let detail):
            return "The SOCKS5 UDP associate was rejected: \(detail)"
        case .udpAssociateTimeout:
            return "The SOCKS5 UDP associate timed out."
        }
    }
}

struct ProxyTarget {
    let host: String
    let port: UInt16

    init(host: String, port: UInt16) {
        self.host = host
        self.port = port
    }

    init?(endpoint: NWEndpoint) {
        guard let hostEndpoint = endpoint as? NWHostEndpoint,
              let parsedPort = UInt16(hostEndpoint.port) else {
            return nil
        }
        self.host = hostEndpoint.hostname
        self.port = parsedPort
    }

    @available(macOS 15.0, *)
    init?(flowEndpoint endpoint: nw_endpoint_t) {
        let endpointType = nw_endpoint_get_type(endpoint)
        guard endpointType == nw_endpoint_type_host ||
              endpointType == nw_endpoint_type_address ||
              endpointType == nw_endpoint_type_url else {
            return nil
        }
        let parsedPort = nw_endpoint_get_port(endpoint)
        guard parsedPort > 0 else {
            return nil
        }
        self.host = String(cString: nw_endpoint_get_hostname(endpoint))
        self.port = parsedPort
    }

    var connectAuthority: String {
        if host.contains(":") && !host.hasPrefix("[") {
            return "[\(host)]:\(port)"
        }
        return "\(host):\(port)"
    }

    var isLoopback: Bool {
        let normalized = host.trimmingCharacters(in: CharacterSet(charactersIn: "[]")).lowercased()
        if normalized == "localhost" || normalized == "::1" {
            return true
        }
        if normalized.hasPrefix("127.") {
            return true
        }
        return false
    }
}
