import AppKit
import Foundation
import Network

let logURL = URL(fileURLWithPath: NSHomeDirectory())
    .appendingPathComponent("Library/Logs/ChengPerAppProbe.log")

func appendLog(_ message: String) {
    let line = "\(Date()) \(message)\n"
    guard let data = line.data(using: .utf8) else { return }
    if FileManager.default.fileExists(atPath: logURL.path),
       let handle = try? FileHandle(forWritingTo: logURL) {
        defer { try? handle.close() }
        try? handle.seekToEnd()
        try? handle.write(contentsOf: data)
    } else {
        try? data.write(to: logURL)
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let targetHost = ProcessInfo.processInfo.environment["CHENG_PER_APP_PROBE_HOST"] ?? "205.186.67.165"
let targetPort = UInt16(ProcessInfo.processInfo.environment["CHENG_PER_APP_PROBE_PORT"] ?? "22") ?? 22
let host = NWEndpoint.Host(targetHost)
let port = NWEndpoint.Port(rawValue: targetPort)!
let connection = NWConnection(host: host, port: port, using: .tcp)
let startedAt = Date()

appendLog("probe start target=\(targetHost):\(targetPort)")
connection.stateUpdateHandler = { state in
    switch state {
    case .ready:
        appendLog("probe ready elapsed_ms=\(Int(Date().timeIntervalSince(startedAt) * 1000))")
        connection.cancel()
        NSApp.terminate(nil)
    case .failed(let error):
        appendLog("probe failed elapsed_ms=\(Int(Date().timeIntervalSince(startedAt) * 1000)) error=\(error)")
        connection.cancel()
        NSApp.terminate(nil)
    case .cancelled:
        break
    default:
        break
    }
}
connection.start(queue: DispatchQueue.global(qos: .userInitiated))

DispatchQueue.main.asyncAfter(deadline: .now() + 8) {
    appendLog("probe timeout elapsed_ms=\(Int(Date().timeIntervalSince(startedAt) * 1000))")
    connection.cancel()
    NSApp.terminate(nil)
}

app.run()
