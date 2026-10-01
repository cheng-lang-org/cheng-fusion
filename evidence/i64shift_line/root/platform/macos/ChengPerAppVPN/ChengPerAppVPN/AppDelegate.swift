import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private let manager = AppProxyManager()
    private let autostart: Bool

    // Menu-bar product UI.
    private var statusItem: NSStatusItem?
    private let menu = NSMenu()
    private var refreshTimer: Timer?
    private var isConnected = false
    private var isBusy = false
    private let exitLabel = AppDelegate.exitDisplayLabel()

    // Advanced/settings window (legacy console + raw controls), shown on demand.
    private var window: NSWindow?
    private let textView = NSTextView()
    private lazy var defaultBrowserCheck = makeCheck("Default browser")
    private lazy var chromeCheck = makeCheck("Chrome")
    private lazy var codexCheck = makeCheck("Codex")
    private lazy var cursorCheck = makeCheck("Cursor")
    private lazy var claudeCodeCheck = makeCheck("ClaudeCode")
    private lazy var terminalCliCheck = makeCheck("Terminal/CLI")
    private let logURL = URL(fileURLWithPath: ProcessInfo.processInfo.environment["CHENG_PER_APP_VPN_LOG"] ?? "/Users/lbcheng/cheng-lang/.tmp-exec/macos-per-app-vpn/host.log")
    private var loadingTargetControls = false
    private var applyingTargets = false
    private var pendingTargetApply = false

    // Per-app rows shown directly in the menu-bar dropdown.
    private struct AppRow { let title: String; let key: String }
    private let appRows: [AppRow] = [
        AppRow(title: "Codex", key: "codex"),
        AppRow(title: "Chrome", key: "chrome"),
        AppRow(title: "Cursor", key: "cursor"),
        AppRow(title: "Terminal / CLI", key: "terminalCli"),
        AppRow(title: "Default browser", key: "defaultBrowser"),
        AppRow(title: "ClaudeCode", key: "claudeCode"),
    ]

    init(autostart: Bool = false) {
        self.autostart = autostart
        super.init()
    }

    private func makeCheck(_ title: String) -> NSButton {
        NSButton(checkboxWithTitle: title, target: self, action: #selector(targetSelectionChanged))
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        installStatusItem()
        menu.delegate = self
        refreshStatus()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            self?.refreshStatus()
        }
        if autostart || ProcessInfo.processInfo.environment["CHENG_PER_APP_VPN_AUTOSTART"] == "1" {
            connect()
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return false
    }

    // MARK: - Menu bar

    private func installStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = item.button {
            button.image = statusImage(connected: false)
            button.image?.isTemplate = true
            button.imagePosition = .imageLeading
            button.title = " VPN"
            button.font = NSFont.menuBarFont(ofSize: 0)
            button.toolTip = "Cheng Per-App VPN"
        }
        item.menu = menu
        statusItem = item
    }

    private func statusImage(connected: Bool) -> NSImage? {
        let name = connected ? "lock.shield.fill" : "lock.shield"
        return NSImage(systemSymbolName: name, accessibilityDescription: "Cheng VPN")
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        rebuildMenu()
    }

    private func rebuildMenu() {
        menu.removeAllItems()

        let header = NSMenuItem(title: statusHeaderTitle(), action: nil, keyEquivalent: "")
        header.isEnabled = false
        menu.addItem(header)
        if isConnected {
            let exit = NSMenuItem(title: "出口  \(exitLabel)", action: nil, keyEquivalent: "")
            exit.isEnabled = false
            menu.addItem(exit)
        }

        menu.addItem(.separator())

        let toggleTitle = isBusy ? "处理中…" : (isConnected ? "关闭 VPN" : "开启 VPN")
        let toggle = NSMenuItem(title: toggleTitle, action: isBusy ? nil : #selector(toggleConnection), keyEquivalent: "")
        toggle.target = self
        toggle.isEnabled = !isBusy
        menu.addItem(toggle)

        menu.addItem(.separator())

        let appsHeader = NSMenuItem(title: "走 VPN 的应用", action: nil, keyEquivalent: "")
        appsHeader.isEnabled = false
        menu.addItem(appsHeader)
        let selection = AppProxyManager.loadTargetSelection()
        for (idx, row) in appRows.enumerated() {
            let it = NSMenuItem(title: row.title, action: #selector(toggleAppRow(_:)), keyEquivalent: "")
            it.target = self
            it.tag = idx
            it.state = selectionFlag(selection, row.key) ? .on : .off
            if row.key == "claudeCode" && !AppProxyManager.claudeCodeAvailable() {
                it.isEnabled = false
            }
            menu.addItem(it)
        }

        menu.addItem(.separator())

        let settings = NSMenuItem(title: "高级 / 日志…", action: #selector(openSettings), keyEquivalent: ",")
        settings.target = self
        menu.addItem(settings)

        let quit = NSMenuItem(title: "退出 Cheng VPN", action: #selector(quit), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)
    }

    private func statusHeaderTitle() -> String {
        if isBusy { return "● 处理中…" }
        return isConnected ? "● 已连接   \(exitLabel)" : "○ 未连接"
    }

    private func selectionFlag(_ s: AppTargetSelection, _ key: String) -> Bool {
        switch key {
        case "defaultBrowser": return s.defaultBrowser
        case "chrome": return s.chrome
        case "codex": return s.codex
        case "cursor": return s.cursor
        case "claudeCode": return s.claudeCode
        case "terminalCli": return s.terminalCli
        default: return false
        }
    }

    // MARK: - Actions

    @objc private func toggleConnection() {
        if isConnected { disconnect() } else { connect() }
    }

    private func connect() {
        guard !isBusy else { return }
        setBusy(true)
        try? saveTargetSelectionFromControls()
        manager.installOrUpdate { [weak self] installResult in
            guard let self else { return }
            if case .failure(let e) = installResult {
                self.finishBusy(success: false, action: "install", error: e)
                return
            }
            self.manager.refreshRulesAndStart { startResult in
                switch startResult {
                case .success(let m): self.finishBusy(success: true, action: "start", message: m)
                case .failure(let e): self.finishBusy(success: false, action: "start", error: e)
                }
            }
        }
    }

    private func disconnect() {
        guard !isBusy else { return }
        setBusy(true)
        manager.stop { [weak self] result in
            switch result {
            case .success(let m): self?.finishBusy(success: true, action: "stop", message: m)
            case .failure(let e): self?.finishBusy(success: false, action: "stop", error: e)
            }
        }
    }

    @objc private func toggleAppRow(_ sender: NSMenuItem) {
        guard sender.tag >= 0, sender.tag < appRows.count else { return }
        let key = appRows[sender.tag].key
        var s = AppProxyManager.loadTargetSelection()
        setSelectionFlag(&s, key, !selectionFlag(s, key))
        do { try AppProxyManager.saveTargetSelection(s) } catch {
            notify("应用规则保存失败", error.localizedDescription)
            return
        }
        syncControlsFromSelection(s)
        applyTargetsFromCurrentConfig()
    }

    private func setSelectionFlag(_ s: inout AppTargetSelection, _ key: String, _ value: Bool) {
        s = AppTargetSelection(
            defaultBrowser: key == "defaultBrowser" ? value : s.defaultBrowser,
            chrome: key == "chrome" ? value : s.chrome,
            codex: key == "codex" ? value : s.codex,
            cursor: key == "cursor" ? value : s.cursor,
            claudeCode: key == "claudeCode" ? value : s.claudeCode,
            terminalCli: key == "terminalCli" ? value : s.terminalCli,
            snapshots: s.snapshots
        )
    }

    @objc private func openSettings() {
        if window == nil { buildWindow() }
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }

    // MARK: - Status polling

    private func setBusy(_ busy: Bool) {
        isBusy = busy
        DispatchQueue.main.async { self.rebuildMenu() }
    }

    private func finishBusy(success: Bool, action: String, message: String? = nil, error: Error? = nil) {
        DispatchQueue.main.async {
            self.isBusy = false
            if let m = message { self.append("[\(action)] \(m)") }
            if let e = error {
                self.append("[\(action)] ERROR: \(e.localizedDescription)")
                self.notify("VPN \(action) 失败", e.localizedDescription)
            }
            self.refreshStatus()
        }
    }

    private func refreshStatus() {
        manager.status { [weak self] result in
            guard let self else { return }
            var connected = false
            if case .success(let status) = result {
                connected = status.contains("status=3") && status.contains("enabled=true")
            }
            DispatchQueue.main.async {
                if connected != self.isConnected {
                    self.isConnected = connected
                    self.statusItem?.button?.image = self.statusImage(connected: connected)
                    self.statusItem?.button?.image?.isTemplate = true
                }
                self.statusItem?.button?.toolTip = connected ? "Cheng VPN · 已连接 \(self.exitLabel)" : "Cheng VPN · 未连接"
            }
        }
    }

    private func notify(_ title: String, _ body: String) {
        let n = NSUserNotification()
        n.title = title
        n.informativeText = body
        NSUserNotificationCenter.default.deliver(n)
    }

    private static func exitDisplayLabel() -> String {
        let path = ProcessInfo.processInfo.environment["CHENG_PER_APP_VPN_CLIENT_CONFIG"]
            ?? "/Users/lbcheng/cheng-lang/artifacts/vpn-proxy-local/client-perapp-production.json"
        if let data = FileManager.default.contents(atPath: path),
           let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let exits = obj["exits"] as? [[String: Any]],
           let host = exits.first?["host"] as? String {
            return "🇺🇸 \(host)"
        }
        return "🇺🇸 美国"
    }

    // MARK: - Live target apply

    private func applyTargetsFromCurrentConfig() {
        if applyingTargets { pendingTargetApply = true; return }
        applyingTargets = true
        setBusy(true)
        manager.applyTargetsLive { [weak self] result in
            DispatchQueue.main.async {
                guard let self else { return }
                self.applyingTargets = false
                self.isBusy = false
                self.handle("targets", result)
                self.refreshStatus()
                if self.pendingTargetApply {
                    self.pendingTargetApply = false
                    self.applyTargetsFromCurrentConfig()
                }
            }
        }
    }

    @objc private func targetSelectionChanged() {
        guard !loadingTargetControls else { return }
        do { try saveTargetSelectionFromControls() } catch {
            handle("targets", .failure(error)); return
        }
        append("[targets] saved \(AppProxyManager.selectionSummary())")
        applyTargetsFromCurrentConfig()
    }

    private func syncControlsFromSelection(_ s: AppTargetSelection) {
        loadingTargetControls = true
        defaultBrowserCheck.state = s.defaultBrowser ? .on : .off
        chromeCheck.state = s.chrome ? .on : .off
        codexCheck.state = s.codex ? .on : .off
        cursorCheck.state = s.cursor ? .on : .off
        claudeCodeCheck.state = s.claudeCode ? .on : .off
        terminalCliCheck.state = s.terminalCli ? .on : .off
        loadingTargetControls = false
    }

    private func loadTargetSelectionIntoControls() {
        var selection = AppProxyManager.loadTargetSelection()
        if selection.claudeCode && !AppProxyManager.claudeCodeAvailable() {
            selection.claudeCode = false
            try? AppProxyManager.saveTargetSelection(selection)
        }
        syncControlsFromSelection(selection)
    }

    private func saveTargetSelectionFromControls() throws {
        let current = AppProxyManager.loadTargetSelection()
        try AppProxyManager.saveTargetSelection(
            AppTargetSelection(
                defaultBrowser: defaultBrowserCheck.state == .on,
                chrome: chromeCheck.state == .on,
                codex: codexCheck.state == .on,
                cursor: cursorCheck.state == .on,
                claudeCode: claudeCodeCheck.state == .on,
                terminalCli: terminalCliCheck.state == .on,
                snapshots: current.snapshots
            )
        )
    }

    // MARK: - Advanced window (legacy console + controls)

    private func buildWindow() {
        let contentRect = NSRect(x: 0, y: 0, width: 720, height: 420)
        let window = NSWindow(
            contentRect: contentRect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Cheng Per-App VPN · 高级"
        window.isReleasedWhenClosed = false

        let stack = NSStackView()
        stack.orientation = .vertical
        stack.spacing = 10
        stack.translatesAutoresizingMaskIntoConstraints = false

        let controls = NSStackView()
        controls.orientation = .horizontal
        controls.spacing = 8
        for (title, sel) in [
            ("Install / Update", #selector(installAction)),
            ("Repair", #selector(repairAction)),
            ("Start", #selector(startAction)),
            ("Stop", #selector(stopAction)),
            ("Status", #selector(statusAction)),
        ] {
            controls.addArrangedSubview(NSButton(title: title, target: self, action: sel))
        }

        let targetLabel = NSTextField(labelWithString: "Per-app targets")
        targetLabel.font = NSFont.systemFont(ofSize: 12, weight: .semibold)
        let targetControls = NSStackView()
        targetControls.orientation = .horizontal
        targetControls.spacing = 12
        for c in [defaultBrowserCheck, chromeCheck, codexCheck, cursorCheck, claudeCodeCheck, terminalCliCheck] {
            targetControls.addArrangedSubview(c)
        }
        loadTargetSelectionIntoControls()

        let scroll = NSScrollView()
        scroll.hasVerticalScroller = true
        scroll.documentView = textView
        textView.isEditable = false
        textView.font = NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)

        stack.addArrangedSubview(controls)
        stack.addArrangedSubview(targetLabel)
        stack.addArrangedSubview(targetControls)
        stack.addArrangedSubview(scroll)
        window.contentView?.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor, constant: 12),
            stack.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor, constant: -12),
            stack.topAnchor.constraint(equalTo: window.contentView!.topAnchor, constant: 12),
            stack.bottomAnchor.constraint(equalTo: window.contentView!.bottomAnchor, constant: -12),
            scroll.heightAnchor.constraint(greaterThanOrEqualToConstant: 300),
        ])

        window.center()
        self.window = window
    }

    @objc private func installAction() { connect() }
    @objc private func repairAction() {
        guard !isBusy else { return }
        setBusy(true)
        append("[repair] checking Chrome managed proxy policy")
        manager.repairChromeSystemProxyIfNeeded { [weak self] repairResult in
            guard let self else { return }
            switch repairResult {
            case .failure(let error):
                self.finishBusy(success: false, action: "repair", error: error)
            case .success(let message):
                self.append("[repair] \(message)")
                self.isBusy = false
                self.append("[repair] refreshing app rules, bridge config, and active tunnel")
                self.connect()
            }
        }
    }
    @objc private func startAction() {
        manager.refreshRulesAndStart { [weak self] r in self?.handle("start", r); self?.refreshStatus() }
    }
    @objc private func stopAction() {
        manager.stop { [weak self] r in self?.handle("stop", r); self?.refreshStatus() }
    }
    @objc private func statusAction() {
        manager.status { [weak self] r in self?.handle("status", r) }
    }

    private func handle(_ action: String, _ result: Result<String, Error>) {
        DispatchQueue.main.async {
            switch result {
            case .success(let message): self.append("[\(action)] \(message)")
            case .failure(let error): self.append("[\(action)] ERROR: \(error.localizedDescription)")
            }
        }
    }

    private func append(_ line: String) {
        if window != nil {
            let current = textView.string
            textView.string = current.isEmpty ? line : "\(current)\n\(line)"
            textView.scrollToEndOfDocument(nil)
        }
        writeLog(line)
    }

    private func writeLog(_ line: String) {
        do {
            try FileManager.default.createDirectory(
                at: logURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            let data = Data((line + "\n").utf8)
            if FileManager.default.fileExists(atPath: logURL.path) {
                let handle = try FileHandle(forWritingTo: logURL)
                try handle.seekToEnd()
                try handle.write(contentsOf: data)
                try handle.close()
            } else {
                try data.write(to: logURL)
            }
        } catch {
            NSLog("failed to write Cheng per-app VPN log: \(error.localizedDescription)")
        }
    }
}
