import Cocoa
import Foundation

let codexAppPath = ProcessInfo.processInfo.environment["CHENG_CODEX_APP"] ?? "/Applications/Codex.app"
let codexExecutablePath = "\(codexAppPath)/Contents/MacOS/Codex"
let httpProxy = ProcessInfo.processInfo.environment["CHENG_CODEX_HTTP_PROXY"] ?? "127.0.0.1:17897"
let noProxy = ProcessInfo.processInfo.environment["CHENG_CODEX_NO_PROXY"] ?? "localhost,127.0.0.1,::1"
let proxyCliPath = ProcessInfo.processInfo.environment["CHENG_CODEX_PROXY_CLI"]
    ?? "/Applications/Codex Cheng Proxy.app/Contents/Resources/codex-proxy-cli"
let logURL = URL(fileURLWithPath: NSHomeDirectory())
    .appendingPathComponent("Library/Logs/CodexChengProxyLauncher.log")

func appendLog(_ message: String) {
    let line = "\(Date()) \(message)\n"
    if let data = line.data(using: .utf8) {
        if FileManager.default.fileExists(atPath: logURL.path),
           let handle = try? FileHandle(forWritingTo: logURL) {
            defer { try? handle.close() }
            _ = try? handle.seekToEnd()
            _ = try? handle.write(contentsOf: data)
        } else {
            try? data.write(to: logURL)
        }
    }
}

func showAlert(title: String, message: String, firstButton: String, secondButton: String? = nil) -> NSApplication.ModalResponse {
    let alert = NSAlert()
    alert.messageText = title
    alert.informativeText = message
    alert.addButton(withTitle: firstButton)
    if let secondButton {
        alert.addButton(withTitle: secondButton)
    }
    NSApp.activate(ignoringOtherApps: true)
    return alert.runModal()
}

func codexRunningApplications() -> [NSRunningApplication] {
    NSRunningApplication.runningApplications(withBundleIdentifier: "com.openai.codex")
        .filter { app in
            guard let path = app.bundleURL?.path else { return true }
            return path == codexAppPath
        }
}

func waitUntilCodexExits(timeoutSeconds: TimeInterval) -> Bool {
    let deadline = Date().addingTimeInterval(timeoutSeconds)
    while Date() < deadline {
        if codexRunningApplications().isEmpty {
            return true
        }
        RunLoop.current.run(until: Date().addingTimeInterval(0.2))
    }
    return codexRunningApplications().isEmpty
}

func launchCodex() {
    guard FileManager.default.isExecutableFile(atPath: codexExecutablePath) else {
        appendLog("missing Codex executable: \(codexExecutablePath)")
        _ = showAlert(
            title: "Codex 不存在",
            message: "找不到可执行文件：\(codexExecutablePath)",
            firstButton: "好"
        )
        NSApp.terminate(nil)
        return
    }

    var environment = ProcessInfo.processInfo.environment
    environment["ALL_PROXY"] = "http://\(httpProxy)"
    environment["all_proxy"] = "http://\(httpProxy)"
    environment["HTTPS_PROXY"] = "http://\(httpProxy)"
    environment["https_proxy"] = "http://\(httpProxy)"
    environment["HTTP_PROXY"] = "http://\(httpProxy)"
    environment["http_proxy"] = "http://\(httpProxy)"
    environment["NO_PROXY"] = noProxy
    environment["no_proxy"] = noProxy
    environment["CODEX_CLI_PATH"] = proxyCliPath
    environment["NODE_REPL_UNTRUSTED_ENV_ALLOWLIST"] =
        "ALL_PROXY,all_proxy,HTTPS_PROXY,https_proxy,HTTP_PROXY,http_proxy,NO_PROXY,no_proxy,CODEX_CLI_PATH"

    let process = Process()
    process.executableURL = URL(fileURLWithPath: codexExecutablePath)
    process.arguments = [
        "--proxy-server=http://\(httpProxy)",
        "--proxy-bypass-list=\(noProxy)",
    ]
    process.environment = environment

    do {
        try process.run()
        appendLog("launched Codex pid=\(process.processIdentifier) httpProxy=\(httpProxy)")
    } catch {
        appendLog("launch failed: \(error.localizedDescription)")
        _ = showAlert(
            title: "Codex 启动失败",
            message: error.localizedDescription,
            firstButton: "好"
        )
    }
    NSApp.terminate(nil)
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
appendLog("launcher start codexAppPath=\(codexAppPath) httpProxy=\(httpProxy)")

let running = codexRunningApplications()
appendLog("running Codex count=\(running.count)")
if !running.isEmpty {
    appendLog("Codex already running count=\(running.count)")
    let response = showAlert(
        title: "Codex 已在运行",
        message: "需要先退出当前 Codex，才能用 Cheng 专用代理重新启动。",
        firstButton: "退出并重启",
        secondButton: "取消"
    )
    if response != .alertFirstButtonReturn {
        appendLog("user cancelled relaunch")
        NSApp.terminate(nil)
    }
    for app in running {
        app.terminate()
    }
    if !waitUntilCodexExits(timeoutSeconds: 8) {
        appendLog("Codex did not terminate gracefully; forcing")
        for app in codexRunningApplications() {
            app.forceTerminate()
        }
        _ = waitUntilCodexExits(timeoutSeconds: 4)
    }
}

launchCodex()
