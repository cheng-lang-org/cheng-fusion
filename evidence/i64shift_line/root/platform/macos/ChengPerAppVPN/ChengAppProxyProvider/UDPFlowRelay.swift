import Foundation
import NetworkExtension

final class UDPFlowRelay {
    private let flow: NEAppProxyUDPFlow
    private let initialTarget: ProxyTarget
    private let bridgeHost: String
    private let bridgePort: UInt16
    private let udpSocksHost: String
    private let udpSocksPort: UInt16
    private let udpRelayEnabled: Bool
    private let queue = DispatchQueue(label: "cheng.app.proxy.udp.relay")
    private let onClose: (UDPFlowRelay, Error?) -> Void

    private var closed = false
    private var activeDNSQuery: DNSOverTCPQuery?
    private var udpAssociation: Socks5UDPAssociation?

    init(
        flow: NEAppProxyUDPFlow,
        initialTarget: ProxyTarget,
        bridgeHost: String,
        bridgePort: UInt16,
        udpSocksHost: String,
        udpSocksPort: UInt16,
        udpRelayEnabled: Bool,
        onClose: @escaping (UDPFlowRelay, Error?) -> Void
    ) {
        self.flow = flow
        self.initialTarget = initialTarget
        self.bridgeHost = bridgeHost
        self.bridgePort = bridgePort
        self.udpSocksHost = udpSocksHost
        self.udpSocksPort = udpSocksPort
        self.udpRelayEnabled = udpRelayEnabled
        self.onClose = onClose
    }

    func start() {
        queue.async {
            self.flow.open(withLocalEndpoint: nil) { [weak self] error in
                guard let self else { return }
                self.queue.async {
                    if let error {
                        self.closeNow(error)
                        return
                    }
                    self.readDatagrams()
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

    private func readDatagrams() {
        guard !closed else { return }
        flow.readDatagrams { [weak self] datagrams, endpoints, error in
            guard let self else { return }
            self.queue.async {
                self.handleDatagramRead(datagrams: datagrams, endpoints: endpoints, error: error)
            }
        }
    }

    private func handleDatagramRead(datagrams: [Data]?, endpoints: [NWEndpoint]?, error: Error?) {
        guard !closed else { return }
        if let error {
            closeNow(error)
            return
        }
        guard let datagrams, let endpoints, !datagrams.isEmpty else {
            closeNow(nil)
            return
        }
        if datagrams.count != endpoints.count {
            closeNow(ChengProxyError.unsupportedUDP("udp_endpoint_count_mismatch"))
            return
        }
        let paired = zip(datagrams, endpoints).map { ($0.0, $0.1) }
        handle(datagrams: paired)
    }

    private func handle(datagrams: [(Data, NWEndpoint)]) {
        guard !closed else { return }
        relay(datagrams: datagrams, index: 0)
    }

    private func relay(datagrams: [(Data, NWEndpoint)], index: Int) {
        guard !closed else { return }
        if index >= datagrams.count {
            readDatagrams()
            return
        }

        let datagram = datagrams[index].0
        let endpoint = datagrams[index].1
        guard let target = ProxyTarget(endpoint: endpoint) else {
            closeNow(ChengProxyError.invalidRemoteEndpoint)
            return
        }
        if target.port == 53 {
            resolveDNS(query: datagram, endpoint: endpoint) { [weak self] success in
                guard let self else { return }
                self.queue.async {
                    guard success else { return }
                    self.relay(datagrams: datagrams, index: index + 1)
                }
            }
            return
        }
        guard udpRelayEnabled else {
            closeNow(ChengProxyError.unsupportedUDP("udp_relay_disabled"))
            return
        }
        relayUDP(datagram: datagram, target: target)
        relay(datagrams: datagrams, index: index + 1)
    }

    private func resolveDNS(query: Data, endpoint: NWEndpoint, completion: @escaping (Bool) -> Void) {
        let dnsQuery = DNSOverTCPQuery(
            query: query,
            target: ProxyTarget(endpoint: endpoint) ?? initialTarget,
            bridgeHost: bridgeHost,
            bridgePort: bridgePort,
            queue: queue
        ) { [weak self] result in
            guard let self else { return }
            self.queue.async {
                self.activeDNSQuery = nil
                switch result {
                case .failure(let error):
                    if let response = DNSOverTCPQuery.servfailResponse(for: query) {
                        self.flow.writeDatagrams([response], sentBy: [endpoint]) { writeError in
                            self.queue.async {
                                if let writeError {
                                    self.closeNow(writeError)
                                    completion(false)
                                    return
                                }
                                NSLog("cheng_app_proxy dns_servfail target=\((ProxyTarget(endpoint: endpoint) ?? self.initialTarget).connectAuthority) error=\((error as? ChengProxyError)?.statusCode ?? "dns_query_failed")")
                                completion(true)
                            }
                        }
                    } else {
                        NSLog("cheng_app_proxy dns_drop_invalid_query error=\((error as? ChengProxyError)?.statusCode ?? "dns_query_failed")")
                        completion(true)
                    }
                case .success(let response):
                    self.flow.writeDatagrams([response], sentBy: [endpoint]) { error in
                        self.queue.async {
                            if let error {
                                self.closeNow(error)
                                completion(false)
                                return
                            }
                            completion(true)
                        }
                    }
                }
            }
        }
        activeDNSQuery = dnsQuery
        dnsQuery.start()
    }

    private func relayUDP(datagram: Data, target: ProxyTarget) {
        guard !closed else { return }
        let association = udpAssociation ?? makeUDPAssociation()
        udpAssociation = association
        association.send(datagram: datagram, target: target)
    }

    private func makeUDPAssociation() -> Socks5UDPAssociation {
        let association = Socks5UDPAssociation(
            socksHost: udpSocksHost,
            socksPort: udpSocksPort,
            queue: queue,
            onDatagram: { [weak self] response in
                guard let self else { return }
                self.queue.async {
                    guard !self.closed else { return }
                    let endpoint = NWHostEndpoint(
                        hostname: response.target.host,
                        port: String(response.target.port)
                    )
                    self.flow.writeDatagrams([response.payload], sentBy: [endpoint]) { error in
                        self.queue.async {
                            if let error {
                                self.closeNow(error)
                            }
                        }
                    }
                }
            },
            onClose: { [weak self] error in
                guard let self else { return }
                self.queue.async {
                    self.udpAssociation = nil
                    if let error {
                        self.closeNow(error)
                    }
                }
            }
        )
        association.start()
        return association
    }

    private func close(_ error: Error?) {
        queue.async {
            self.closeNow(error)
        }
    }

    private func closeNow(_ error: Error?) {
        guard !closed else { return }
        closed = true
        activeDNSQuery?.cancel()
        activeDNSQuery = nil
        udpAssociation?.cancel()
        udpAssociation = nil
        flow.closeReadWithError(error)
        flow.closeWriteWithError(error)
        onClose(self, error)
    }
}
