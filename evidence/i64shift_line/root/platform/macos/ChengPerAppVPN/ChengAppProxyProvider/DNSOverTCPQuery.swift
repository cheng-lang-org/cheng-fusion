import Foundation
import Network

final class DNSOverTCPQuery {
    private let query: Data
    private let target: ProxyTarget
    private let bridgeHost: String
    private let bridgePort: UInt16
    private let queue: DispatchQueue
    private let completion: (Result<Data, Error>) -> Void

    private var connection: NWConnection?
    private var responseBuffer = Data()
    private var expectedResponseLength: Int?
    private var completed = false
    private var deadline: DispatchSourceTimer?

    init(
        query: Data,
        target: ProxyTarget,
        bridgeHost: String,
        bridgePort: UInt16,
        queue: DispatchQueue,
        completion: @escaping (Result<Data, Error>) -> Void
    ) {
        self.query = query
        self.target = target
        self.bridgeHost = bridgeHost
        self.bridgePort = bridgePort
        self.queue = queue
        self.completion = completion
    }

    func start() {
        guard query.count > 0 && query.count <= 4096 else {
            completion(.failure(ChengProxyError.unsupportedUDP("invalid DNS datagram length")))
            return
        }
        guard let port = Network.NWEndpoint.Port(rawValue: bridgePort) else {
            completion(.failure(ChengProxyError.invalidBridgePort))
            return
        }
        let connection = NWConnection(host: Network.NWEndpoint.Host(bridgeHost), port: port, using: .tcp)
        self.connection = connection
        armDeadline(seconds: 8, error: ChengProxyError.dnsTimeout)
        connection.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
                self.queue.async {
                    self.sendConnect()
                }
            case .failed(let error):
                self.queue.async {
                    self.complete(.failure(error))
                }
            case .cancelled:
                break
            default:
                break
            }
        }
        connection.start(queue: queue)
    }

    func cancel() {
        queue.async {
            self.completeSilently()
        }
    }

    private func sendConnect() {
        guard !completed else { return }
        let authority = target.connectAuthority
        let request = "CONNECT \(authority) HTTP/1.1\r\n"
            + "Host: \(authority)\r\n"
            + "Proxy-Connection: Close\r\n"
            + "\r\n"
        connection?.send(content: Data(request.utf8), completion: .contentProcessed { [weak self] error in
            guard let self else { return }
            self.queue.async {
                if let error {
                    self.complete(.failure(error))
                    return
                }
                self.readConnectResponse()
            }
        })
    }

    private func readConnectResponse() {
        connection?.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            self.queue.async {
                self.handleConnectResponse(data: data, isComplete: isComplete, error: error)
            }
        }
    }

    private func handleConnectResponse(data: Data?, isComplete: Bool, error: Error?) {
        guard !completed else { return }
        if let error {
            complete(.failure(error))
            return
        }
        if let data {
            responseBuffer.append(data)
        }
        if let headerEnd = responseBuffer.range(of: Data("\r\n\r\n".utf8)) {
            let header = String(decoding: responseBuffer[..<headerEnd.lowerBound], as: UTF8.self)
            guard header.hasPrefix("HTTP/1.1 200") || header.hasPrefix("HTTP/1.0 200") else {
                let statusLine = header.split(separator: "\r\n", maxSplits: 1).first.map(String.init) ?? header
                complete(.failure(ChengProxyError.bridgeRejected(statusLine)))
                return
            }
            let bodyStart = headerEnd.upperBound
            let leftover = Data(responseBuffer[bodyStart...])
            responseBuffer.removeAll(keepingCapacity: false)
            sendDNSQuery(initialResponseBytes: leftover)
            return
        }
        if responseBuffer.count > 8192 || isComplete {
            complete(.failure(ChengProxyError.bridgeRejected("invalid CONNECT response")))
            return
        }
        readConnectResponse()
    }

    private func sendDNSQuery(initialResponseBytes: Data) {
        guard !completed else { return }
        var wire = Data()
        wire.append(UInt8((query.count >> 8) & 0xff))
        wire.append(UInt8(query.count & 0xff))
        wire.append(query)
        connection?.send(content: wire, completion: .contentProcessed { [weak self] error in
            guard let self else { return }
            self.queue.async {
                if let error {
                    self.complete(.failure(error))
                    return
                }
                self.responseBuffer = initialResponseBytes
                self.readDNSResponse()
            }
        })
    }

    private func readDNSResponse() {
        guard !completed else { return }
        if expectedResponseLength == nil && responseBuffer.count >= 2 {
            expectedResponseLength = (Int(responseBuffer[0]) << 8) | Int(responseBuffer[1])
            if expectedResponseLength == nil || expectedResponseLength! <= 0 || expectedResponseLength! > 65535 {
                complete(.failure(ChengProxyError.unsupportedUDP("invalid DNS TCP response length")))
                return
            }
        }
        if let expectedResponseLength, responseBuffer.count >= expectedResponseLength + 2 {
            let response = Data(responseBuffer[2..<(expectedResponseLength + 2)])
            complete(.success(response))
            return
        }
        connection?.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            self.queue.async {
                self.handleDNSResponse(data: data, isComplete: isComplete, error: error)
            }
        }
    }

    private func handleDNSResponse(data: Data?, isComplete: Bool, error: Error?) {
        guard !completed else { return }
        if let error {
            complete(.failure(error))
            return
        }
        if let data {
            responseBuffer.append(data)
        }
        if isComplete && responseBuffer.isEmpty {
            complete(.failure(ChengProxyError.unsupportedUDP("DNS TCP response closed early")))
            return
        }
        readDNSResponse()
    }

    private func complete(_ result: Result<Data, Error>) {
        guard !completed else { return }
        completed = true
        cancelDeadline()
        connection?.cancel()
        connection = nil
        completion(result)
    }

    private func completeSilently() {
        guard !completed else { return }
        completed = true
        cancelDeadline()
        connection?.cancel()
        connection = nil
    }

    private func armDeadline(seconds: Int, error: ChengProxyError) {
        cancelDeadline()
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + .seconds(seconds))
        timer.setEventHandler { [weak self] in
            self?.complete(.failure(error))
        }
        deadline = timer
        timer.resume()
    }

    private func cancelDeadline() {
        deadline?.cancel()
        deadline = nil
    }

    static func servfailResponse(for query: Data) -> Data? {
        guard query.count >= 12 else { return nil }
        let questionCount = (Int(query[4]) << 8) | Int(query[5])
        guard questionCount > 0 else { return nil }

        var offset = 12
        for _ in 0..<questionCount {
            while true {
                guard offset < query.count else { return nil }
                let length = query[offset]
                offset += 1
                if length == 0 {
                    break
                }
                if (length & 0xc0) == 0xc0 {
                    guard offset < query.count else { return nil }
                    offset += 1
                    break
                }
                guard (length & 0xc0) == 0, offset + Int(length) <= query.count else {
                    return nil
                }
                offset += Int(length)
            }
            guard offset + 4 <= query.count else { return nil }
            offset += 4
        }

        var response = Data(query[..<offset])
        response[2] = 0x80 | (query[2] & 0x79)
        response[3] = 0x02
        response[6] = 0
        response[7] = 0
        response[8] = 0
        response[9] = 0
        response[10] = 0
        response[11] = 0
        return response
    }
}

struct Socks5UDPResponse {
    let payload: Data
    let target: ProxyTarget
}

final class ChengSocks5UDPAssociateProbe {
    private let host: String
    private let port: UInt16
    private let queue: DispatchQueue

    private var connection: NWConnection?
    private var responseBuffer = Data()
    private var deadline: DispatchSourceTimer?
    private var completed = false

    init(host: String, port: UInt16, queue: DispatchQueue) {
        self.host = host
        self.port = port
        self.queue = queue
    }

    func start(completion: @escaping (Error?) -> Void) {
        guard let endpointPort = NWEndpoint.Port(rawValue: port) else {
            completion(ChengProxyError.invalidProxyConfiguration("udpSocksPort"))
            return
        }

        armDeadline(seconds: 8, completion: completion)
        let connection = NWConnection(host: NWEndpoint.Host(host), port: endpointPort, using: .tcp)
        self.connection = connection
        connection.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            self.queue.async {
                switch state {
                case .ready:
                    self.sendMethodNegotiation(completion: completion)
                case .failed(let error):
                    self.finish(ChengProxyError.udpAssociateRejected(error.localizedDescription), completion: completion)
                case .cancelled:
                    self.finish(ChengProxyError.providerStopped, completion: completion)
                default:
                    break
                }
            }
        }
        connection.start(queue: queue)
    }

    func cancel() {
        cancelDeadline()
        connection?.stateUpdateHandler = nil
        connection?.cancel()
        connection = nil
    }

    private func sendMethodNegotiation(completion: @escaping (Error?) -> Void) {
        guard !completed else { return }
        connection?.send(content: Data([0x05, 0x01, 0x00]), completion: .contentProcessed { [weak self] error in
            guard let self else { return }
            self.queue.async {
                if let error {
                    self.finish(ChengProxyError.udpAssociateRejected(error.localizedDescription), completion: completion)
                    return
                }
                self.readMethodReply(completion: completion)
            }
        })
    }

    private func readMethodReply(completion: @escaping (Error?) -> Void) {
        connection?.receive(minimumIncompleteLength: 2, maximumLength: 2) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            self.queue.async {
                if let error {
                    self.finish(ChengProxyError.udpAssociateRejected(error.localizedDescription), completion: completion)
                    return
                }
                guard let data, data.count == 2, data[0] == 0x05, data[1] == 0x00 else {
                    self.finish(ChengProxyError.udpAssociateRejected("socks_no_auth_method_unavailable"), completion: completion)
                    return
                }
                if isComplete {
                    self.finish(ChengProxyError.udpAssociateRejected("socks_control_closed"), completion: completion)
                    return
                }
                self.sendUDPAssociateRequest(completion: completion)
            }
        }
    }

    private func sendUDPAssociateRequest(completion: @escaping (Error?) -> Void) {
        guard !completed else { return }
        let request = Data([0x05, 0x03, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
        connection?.send(content: request, completion: .contentProcessed { [weak self] error in
            guard let self else { return }
            self.queue.async {
                if let error {
                    self.finish(ChengProxyError.udpAssociateRejected(error.localizedDescription), completion: completion)
                    return
                }
                self.readUDPAssociateReply(completion: completion)
            }
        })
    }

    private func readUDPAssociateReply(completion: @escaping (Error?) -> Void) {
        connection?.receive(minimumIncompleteLength: 1, maximumLength: 512) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            self.queue.async {
                if let error {
                    self.finish(ChengProxyError.udpAssociateRejected(error.localizedDescription), completion: completion)
                    return
                }
                if let data {
                    self.responseBuffer.append(data)
                }
                if self.parseUDPAssociateReply(completion: completion) {
                    return
                }
                if isComplete {
                    self.finish(ChengProxyError.udpAssociateRejected("socks_control_closed"), completion: completion)
                    return
                }
                guard self.responseBuffer.count <= 512 else {
                    self.finish(ChengProxyError.udpAssociateRejected("socks_reply_too_large"), completion: completion)
                    return
                }
                self.readUDPAssociateReply(completion: completion)
            }
        }
    }

    private func parseUDPAssociateReply(completion: @escaping (Error?) -> Void) -> Bool {
        guard responseBuffer.count >= 4 else { return false }
        guard responseBuffer[0] == 0x05 else {
            finish(ChengProxyError.udpAssociateRejected("invalid_socks_version"), completion: completion)
            return true
        }
        guard responseBuffer[1] == 0x00 else {
            finish(ChengProxyError.udpAssociateRejected("reply_code_\(responseBuffer[1])"), completion: completion)
            return true
        }

        let atyp = responseBuffer[3]
        let addressStart = 4
        let portOffset: Int
        switch atyp {
        case 0x01:
            guard responseBuffer.count >= addressStart + 4 + 2 else { return false }
            portOffset = addressStart + 4
        case 0x03:
            guard responseBuffer.count >= addressStart + 1 else { return false }
            let count = Int(responseBuffer[addressStart])
            guard count > 0 else {
                finish(ChengProxyError.udpAssociateRejected("empty_domain_reply"), completion: completion)
                return true
            }
            guard responseBuffer.count >= addressStart + 1 + count + 2 else { return false }
            portOffset = addressStart + 1 + count
        case 0x04:
            guard responseBuffer.count >= addressStart + 16 + 2 else { return false }
            portOffset = addressStart + 16
        default:
            finish(ChengProxyError.udpAssociateRejected("unsupported_reply_address_type"), completion: completion)
            return true
        }

        let relayPort = UInt16(responseBuffer[portOffset]) << 8 | UInt16(responseBuffer[portOffset + 1])
        guard relayPort > 0 else {
            finish(ChengProxyError.udpAssociateRejected("invalid_udp_relay_endpoint"), completion: completion)
            return true
        }
        finish(nil, completion: completion)
        return true
    }

    private func armDeadline(seconds: Int, completion: @escaping (Error?) -> Void) {
        cancelDeadline()
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + .seconds(seconds))
        timer.setEventHandler { [weak self] in
            self?.finish(ChengProxyError.udpAssociateTimeout, completion: completion)
        }
        deadline = timer
        timer.resume()
    }

    private func cancelDeadline() {
        deadline?.cancel()
        deadline = nil
    }

    private func finish(_ error: Error?, completion: @escaping (Error?) -> Void) {
        guard !completed else { return }
        completed = true
        cancel()
        completion(error)
    }
}

final class Socks5UDPAssociation {
    private let socksHost: String
    private let socksPort: UInt16
    private let queue: DispatchQueue
    private let onDatagram: (Socks5UDPResponse) -> Void
    private let onClose: (Error?) -> Void

    private var controlConnection: NWConnection?
    private var udpConnection: NWConnection?
    private var controlBuffer = Data()
    private var pendingSends: [(Data, ProxyTarget)] = []
    private var ready = false
    private var closed = false
    private var deadline: DispatchSourceTimer?

    init(
        socksHost: String,
        socksPort: UInt16,
        queue: DispatchQueue,
        onDatagram: @escaping (Socks5UDPResponse) -> Void,
        onClose: @escaping (Error?) -> Void
    ) {
        self.socksHost = socksHost
        self.socksPort = socksPort
        self.queue = queue
        self.onDatagram = onDatagram
        self.onClose = onClose
    }

    func start() {
        queue.async {
            self.startLocked()
        }
    }

    func send(datagram: Data, target: ProxyTarget) {
        queue.async {
            self.sendLocked(datagram: datagram, target: target)
        }
    }

    func cancel() {
        queue.async {
            self.closeLocked(nil, notify: false)
        }
    }

    private func startLocked() {
        guard !closed else { return }
        guard let port = NWEndpoint.Port(rawValue: socksPort) else {
            closeLocked(ChengProxyError.invalidProxyConfiguration("udpSocksPort"), notify: true)
            return
        }
        armDeadline(seconds: 8, error: ChengProxyError.udpAssociateTimeout)
        let connection = NWConnection(host: NWEndpoint.Host(socksHost), port: port, using: .tcp)
        controlConnection = connection
        connection.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            self.queue.async {
                switch state {
                case .ready:
                    self.sendMethodNegotiation()
                case .failed(let error):
                    self.closeLocked(error, notify: true)
                case .cancelled:
                    self.closeLocked(nil, notify: true)
                default:
                    break
                }
            }
        }
        connection.start(queue: queue)
    }

    private func sendLocked(datagram: Data, target: ProxyTarget) {
        guard !closed else { return }
        guard datagram.count > 0 && datagram.count <= 65507 else {
            closeLocked(ChengProxyError.unsupportedUDP("invalid_udp_datagram_length"), notify: true)
            return
        }
        if !ready {
            guard pendingSends.count < 256 else {
                closeLocked(ChengProxyError.unsupportedUDP("udp_pending_queue_full"), notify: true)
                return
            }
            pendingSends.append((datagram, target))
            return
        }
        sendUDPDatagram(datagram, target: target)
    }

    private func sendMethodNegotiation() {
        guard !closed else { return }
        controlConnection?.send(content: Data([0x05, 0x01, 0x00]), completion: .contentProcessed { [weak self] error in
            guard let self else { return }
            self.queue.async {
                if let error {
                    self.closeLocked(error, notify: true)
                    return
                }
                self.readMethodReply()
            }
        })
    }

    private func readMethodReply() {
        controlConnection?.receive(minimumIncompleteLength: 2, maximumLength: 2) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            self.queue.async {
                if let error {
                    self.closeLocked(error, notify: true)
                    return
                }
                guard let data, data.count == 2, data[0] == 0x05, data[1] == 0x00 else {
                    self.closeLocked(ChengProxyError.udpAssociateRejected("socks_no_auth_method_unavailable"), notify: true)
                    return
                }
                if isComplete {
                    self.closeLocked(ChengProxyError.udpAssociateRejected("socks_control_closed"), notify: true)
                    return
                }
                self.sendUDPAssociateRequest()
            }
        }
    }

    private func sendUDPAssociateRequest() {
        guard !closed else { return }
        let request = Data([0x05, 0x03, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
        controlConnection?.send(content: request, completion: .contentProcessed { [weak self] error in
            guard let self else { return }
            self.queue.async {
                if let error {
                    self.closeLocked(error, notify: true)
                    return
                }
                self.readUDPAssociateReply()
            }
        })
    }

    private func readUDPAssociateReply() {
        controlConnection?.receive(minimumIncompleteLength: 1, maximumLength: 512) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            self.queue.async {
                if let error {
                    self.closeLocked(error, notify: true)
                    return
                }
                if let data {
                    self.controlBuffer.append(data)
                }
                if self.parseUDPAssociateReply() {
                    return
                }
                if isComplete {
                    self.closeLocked(ChengProxyError.udpAssociateRejected("socks_control_closed"), notify: true)
                    return
                }
                guard self.controlBuffer.count <= 512 else {
                    self.closeLocked(ChengProxyError.udpAssociateRejected("socks_reply_too_large"), notify: true)
                    return
                }
                self.readUDPAssociateReply()
            }
        }
    }

    private func parseUDPAssociateReply() -> Bool {
        guard controlBuffer.count >= 4 else { return false }
        guard controlBuffer[0] == 0x05 else {
            closeLocked(ChengProxyError.udpAssociateRejected("invalid_socks_version"), notify: true)
            return true
        }
        guard controlBuffer[1] == 0x00 else {
            closeLocked(ChengProxyError.udpAssociateRejected("reply_code_\(controlBuffer[1])"), notify: true)
            return true
        }
        let atyp = controlBuffer[3]
        let addressStart = 4
        var host = ""
        var portOffset = 0
        switch atyp {
        case 0x01:
            guard controlBuffer.count >= addressStart + 4 + 2 else { return false }
            host = "\(controlBuffer[addressStart]).\(controlBuffer[addressStart + 1]).\(controlBuffer[addressStart + 2]).\(controlBuffer[addressStart + 3])"
            portOffset = addressStart + 4
        case 0x03:
            guard controlBuffer.count >= addressStart + 1 else { return false }
            let count = Int(controlBuffer[addressStart])
            guard count > 0 else {
                closeLocked(ChengProxyError.udpAssociateRejected("empty_domain_reply"), notify: true)
                return true
            }
            guard controlBuffer.count >= addressStart + 1 + count + 2 else { return false }
            let domainStart = addressStart + 1
            host = String(decoding: controlBuffer[domainStart..<(domainStart + count)], as: UTF8.self)
            portOffset = domainStart + count
        case 0x04:
            guard controlBuffer.count >= addressStart + 16 + 2 else { return false }
            let address = IPv6Address(controlBuffer[addressStart..<(addressStart + 16)])
            host = address?.debugDescription ?? ""
            portOffset = addressStart + 16
        default:
            closeLocked(ChengProxyError.udpAssociateRejected("unsupported_reply_address_type"), notify: true)
            return true
        }
        let port = UInt16(controlBuffer[portOffset]) << 8 | UInt16(controlBuffer[portOffset + 1])
        guard port > 0, !host.isEmpty else {
            closeLocked(ChengProxyError.udpAssociateRejected("invalid_udp_relay_endpoint"), notify: true)
            return true
        }
        if host == "0.0.0.0" || host == "::" || host == "::0" {
            host = socksHost
        }
        openUDPRelay(host: host, port: port)
        return true
    }

    private func openUDPRelay(host: String, port: UInt16) {
        guard let endpointPort = NWEndpoint.Port(rawValue: port) else {
            closeLocked(ChengProxyError.udpAssociateRejected("invalid_udp_relay_port"), notify: true)
            return
        }
        let connection = NWConnection(host: NWEndpoint.Host(host), port: endpointPort, using: .udp)
        udpConnection = connection
        connection.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            self.queue.async {
                switch state {
                case .ready:
                    self.markReady()
                case .failed(let error):
                    self.closeLocked(error, notify: true)
                case .cancelled:
                    self.closeLocked(nil, notify: true)
                default:
                    break
                }
            }
        }
        connection.start(queue: queue)
    }

    private func markReady() {
        guard !closed, !ready else { return }
        ready = true
        cancelDeadline()
        startReceiveLoop()
        let sends = pendingSends
        pendingSends.removeAll(keepingCapacity: false)
        for item in sends {
            sendUDPDatagram(item.0, target: item.1)
        }
        NSLog("cheng_app_proxy udp_associate=ready socks=\(socksHost):\(socksPort)")
    }

    private func sendUDPDatagram(_ datagram: Data, target: ProxyTarget) {
        guard !closed else { return }
        guard let wire = Self.encodeUDPDatagram(datagram, target: target) else {
            closeLocked(ChengProxyError.unsupportedUDP("invalid_udp_target"), notify: true)
            return
        }
        udpConnection?.send(content: wire, completion: .contentProcessed { [weak self] error in
            guard let self else { return }
            self.queue.async {
                if let error {
                    self.closeLocked(error, notify: true)
                }
            }
        })
    }

    private func startReceiveLoop() {
        guard !closed else { return }
        udpConnection?.receiveMessage { [weak self] data, _, _, error in
            guard let self else { return }
            self.queue.async {
                if let error {
                    self.closeLocked(error, notify: true)
                    return
                }
                if let data, !data.isEmpty {
                    if let response = Self.decodeUDPDatagram(data) {
                        self.onDatagram(response)
                    } else {
                        NSLog("cheng_app_proxy udp_associate=drop_malformed_response")
                    }
                }
                self.startReceiveLoop()
            }
        }
    }

    private static func encodeUDPDatagram(_ payload: Data, target: ProxyTarget) -> Data? {
        var wire = Data([0x00, 0x00, 0x00])
        if let ipv4 = IPv4Address(target.host) {
            wire.append(0x01)
            wire.append(contentsOf: ipv4.rawValue)
        } else if let ipv6 = IPv6Address(target.host) {
            wire.append(0x04)
            wire.append(contentsOf: ipv6.rawValue)
        } else {
            let hostBytes = Array(target.host.utf8)
            guard !hostBytes.isEmpty, hostBytes.count <= 255 else { return nil }
            wire.append(0x03)
            wire.append(UInt8(hostBytes.count))
            wire.append(contentsOf: hostBytes)
        }
        wire.append(UInt8((target.port >> 8) & 0xff))
        wire.append(UInt8(target.port & 0xff))
        wire.append(payload)
        return wire
    }

    private static func decodeUDPDatagram(_ wire: Data) -> Socks5UDPResponse? {
        guard wire.count >= 4, wire[0] == 0x00, wire[1] == 0x00, wire[2] == 0x00 else {
            return nil
        }
        let atyp = wire[3]
        let addressStart = 4
        var host = ""
        var portOffset = 0
        switch atyp {
        case 0x01:
            guard wire.count >= addressStart + 4 + 2 else { return nil }
            host = "\(wire[addressStart]).\(wire[addressStart + 1]).\(wire[addressStart + 2]).\(wire[addressStart + 3])"
            portOffset = addressStart + 4
        case 0x03:
            guard wire.count >= addressStart + 1 else { return nil }
            let count = Int(wire[addressStart])
            guard count > 0, wire.count >= addressStart + 1 + count + 2 else { return nil }
            let domainStart = addressStart + 1
            host = String(decoding: wire[domainStart..<(domainStart + count)], as: UTF8.self)
            portOffset = domainStart + count
        case 0x04:
            guard wire.count >= addressStart + 16 + 2 else { return nil }
            let address = IPv6Address(wire[addressStart..<(addressStart + 16)])
            host = address?.debugDescription ?? ""
            portOffset = addressStart + 16
        default:
            return nil
        }
        let port = UInt16(wire[portOffset]) << 8 | UInt16(wire[portOffset + 1])
        guard port > 0, !host.isEmpty else { return nil }
        let payloadOffset = portOffset + 2
        guard payloadOffset <= wire.count else { return nil }
        let target = ProxyTarget(host: host, port: port)
        let payload = Data(wire[payloadOffset...])
        return Socks5UDPResponse(payload: payload, target: target)
    }

    private func armDeadline(seconds: Int, error: ChengProxyError) {
        cancelDeadline()
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + .seconds(seconds))
        timer.setEventHandler { [weak self] in
            self?.closeLocked(error, notify: true)
        }
        deadline = timer
        timer.resume()
    }

    private func cancelDeadline() {
        deadline?.cancel()
        deadline = nil
    }

    private func closeLocked(_ error: Error?, notify: Bool) {
        guard !closed else { return }
        closed = true
        ready = false
        cancelDeadline()
        controlConnection?.stateUpdateHandler = nil
        controlConnection?.cancel()
        controlConnection = nil
        udpConnection?.stateUpdateHandler = nil
        udpConnection?.cancel()
        udpConnection = nil
        pendingSends.removeAll(keepingCapacity: false)
        if notify {
            onClose(error)
        }
    }
}
