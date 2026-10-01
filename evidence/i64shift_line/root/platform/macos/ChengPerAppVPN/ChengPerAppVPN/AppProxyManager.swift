import Foundation
import AppKit
import NetworkExtension
import Security
import SystemExtensions

struct AppTargetSelection: Codable {
    var defaultBrowser: Bool
    var chrome: Bool
    var codex: Bool
    var cursor: Bool
    var claudeCode: Bool
    var terminalCli: Bool
    var snapshots: [String: AppTargetSnapshot]

    enum CodingKeys: String, CodingKey {
        case defaultBrowser
        case chrome
        case codex
        case cursor
        case claudeCode
        case terminalCli
        case snapshots
    }

    static let productionDefault = AppTargetSelection(
        defaultBrowser: false,
        chrome: false,
        codex: true,
        cursor: false,
        claudeCode: false,
        terminalCli: false,
        snapshots: [:]
    )

    init(defaultBrowser: Bool,
         chrome: Bool,
         codex: Bool,
         cursor: Bool,
         claudeCode: Bool,
         terminalCli: Bool = false,
         snapshots: [String: AppTargetSnapshot] = [:]) {
        self.defaultBrowser = defaultBrowser
        self.chrome = chrome
        self.codex = codex
        self.cursor = cursor
        self.claudeCode = claudeCode
        self.terminalCli = terminalCli
        self.snapshots = snapshots
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        defaultBrowser = try container.decodeIfPresent(Bool.self, forKey: .defaultBrowser) ?? false
        chrome = try container.decodeIfPresent(Bool.self, forKey: .chrome) ?? false
        codex = try container.decodeIfPresent(Bool.self, forKey: .codex) ?? true
        cursor = try container.decodeIfPresent(Bool.self, forKey: .cursor) ?? false
        claudeCode = try container.decodeIfPresent(Bool.self, forKey: .claudeCode) ?? false
        terminalCli = try container.decodeIfPresent(Bool.self, forKey: .terminalCli) ?? false
        snapshots = try container.decodeIfPresent([String: AppTargetSnapshot].self, forKey: .snapshots) ?? [:]
    }
}

struct AppTargetSnapshot: Codable, Equatable {
    var path: String
    var bundleIdentifier: String
    var bundleVersion: String
    var bundleBuild: String
    var signingIdentifier: String
    var helperCount: Int
}

final class AppProxyManager {
    static let defaultBridgeHost = "127.0.0.1"
    static let defaultBridgePort = 17897

    private static let localizedDescription = ProcessInfo.processInfo.environment["CHENG_PER_APP_VPN_LOCALIZED_DESCRIPTION"]
        ?? "Cheng Cursor/Codex Per-App VPN"
    private static let cursorAppPath = ProcessInfo.processInfo.environment["CHENG_CURSOR_APP"] ?? "/Applications/Cursor.app"
    private static let codexAppPath = ProcessInfo.processInfo.environment["CHENG_CODEX_APP"] ?? "/Applications/Codex.app"
    private static let cursorPath = "\(cursorAppPath)/Contents/MacOS/Cursor"
    private static let codexPath = "\(codexAppPath)/Contents/MacOS/Codex"
    private static let codexBareModifierMonitorPath = "\(codexAppPath)/Contents/Resources/native/bare-modifier-monitor"
    private static let codexFrameworksPath = "\(codexAppPath)/Contents/Frameworks"
    private static let probePath = "/Applications/ChengPerAppProbe.app/Contents/MacOS/ChengPerAppProbe"
    private static let bridgeListen = "\(defaultBridgeHost):\(defaultBridgePort)"
    private static let targetConfigURL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".config/cheng-per-app-vpn/targets.json")

    private var cachedManager: NEAppProxyProviderManager?

    func installOrUpdate(completion: @escaping (Result<String, Error>) -> Void) {
        removeStaleTunnelManagers(appProxyRemoved: 0) { staleResult in
            switch staleResult {
            case .failure(let error):
                completion(.failure(error))
            case .success:
                self.installOrUpdateAppProxy(completion: completion)
            }
        }
    }

    private func installOrUpdateAppProxy(completion: @escaping (Result<String, Error>) -> Void) {
        Self.activateSystemExtension { activationResult in
            switch activationResult {
            case .failure(let error):
                completion(.failure(error))
                return
            case .success:
                break
            }
            self.loadOrCreateManager { result in
            switch result {
            case .failure(let error):
                completion(.failure(error))
            case .success(let manager):
                let providerProtocol = NETunnelProviderProtocol()
                let udpRelayMode: String
                do {
                    udpRelayMode = try Self.udpRelayMode()
                } catch {
                    completion(.failure(error))
                    return
                }
                var providerConfiguration: [String: Any] = [
                    "bridgeHost": Self.defaultBridgeHost,
                    "bridgePort": Self.defaultBridgePort,
                    "udpRelayMode": udpRelayMode,
                    "captureMode": "per-app-app-proxy-flow-relay",
                    "systemProxyRequired": false,
                ]
                if udpRelayMode == "socks5-udp-associate" {
                    do {
                        let udpSocks = try Self.udpSocksUpstream()
                        providerConfiguration["udpSocksHost"] = udpSocks.host
                        providerConfiguration["udpSocksPort"] = udpSocks.port
                    } catch {
                        completion(.failure(error))
                        return
                    }
                }
                providerProtocol.providerBundleIdentifier = Self.providerBundleIdentifier()
                providerProtocol.providerConfiguration = providerConfiguration
                providerProtocol.serverAddress = "\(Self.defaultBridgeHost):\(Self.defaultBridgePort)"
                var selection = Self.loadTargetSelection()
                let appRules: [NEAppRule]
                do {
                    appRules = try Self.appRules(selection: selection)
                    selection.snapshots = try Self.currentSnapshots(selection: selection)
                } catch {
                    completion(.failure(error))
                    return
                }

                manager.localizedDescription = Self.localizedDescription
                manager.protocolConfiguration = providerProtocol
                manager.appRules = appRules
                manager.isEnabled = true
                manager.saveToPreferences { error in
                    if let error {
                        completion(.failure(error))
                        return
                    }
                    do {
                        try Self.saveTargetSelection(selection)
                    } catch {
                        completion(.failure(error))
                        return
                    }
                    self.cachedManager = manager
                    completion(.success("activated system extension and saved app proxy manager for \(Self.providerBundleIdentifier())"))
                }
            }
        }
        }
    }

    func start(completion: @escaping (Result<String, Error>) -> Void) {
        loadExistingManager { result in
            switch result {
            case .failure(let error):
                completion(.failure(error))
            case .success(let manager):
                manager.loadFromPreferences { error in
                    if let error {
                        completion(.failure(error))
                        return
                    }
                    switch manager.connection.status {
                    case .connected:
                        completion(.success("already connected"))
                        return
                    case .connecting:
                        completion(.success("already connecting"))
                        return
                    default:
                        break
                    }
                    self.startLoadedManager(manager, completion: completion)
                }
            }
        }
    }

    func refreshRulesAndStart(completion: @escaping (Result<String, Error>) -> Void) {
        applyTargetsLive { applyResult in
            switch applyResult {
            case .failure(let error):
                completion(.failure(error))
            case .success:
                self.start(completion: completion)
            }
        }
    }

    func repairChromeSystemProxyIfNeeded(completion: @escaping (Result<String, Error>) -> Void) {
        let selection = Self.loadTargetSelection()
        guard Self.chromeSystemProxyRepairNeeded(selection: selection) else {
            completion(.success("Chrome managed policy is clean"))
            return
        }
        let scriptPath: String
        do {
            scriptPath = try Self.chromeSystemProxyRepairScriptPath()
        } catch {
            completion(.failure(error))
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            let repairCommand = "/usr/bin/env CHENG_PER_APP_VPN_TARGET_USER=\(Self.shellQuoted(NSUserName())) /bin/bash \(Self.shellQuoted(scriptPath))"
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
            process.arguments = [
                "-e",
                "do shell script \(Self.appleScriptString(repairCommand)) with administrator privileges",
            ]
            let stdout = Pipe()
            let stderr = Pipe()
            process.standardOutput = stdout
            process.standardError = stderr
            do {
                try process.run()
                process.waitUntilExit()
            } catch {
                DispatchQueue.main.async { completion(.failure(error)) }
                return
            }
            let out = String(data: stdout.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            let err = String(data: stderr.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            guard process.terminationStatus == 0 else {
                let message = (err.isEmpty ? out : err).trimmingCharacters(in: .whitespacesAndNewlines)
                DispatchQueue.main.async {
                    completion(.failure(AppProxyManagerError.privilegedRepairFailed(message.isEmpty ? "osascript exited \(process.terminationStatus)" : message)))
                }
                return
            }
            if Self.chromeSystemProxyRepairNeeded(selection: selection) {
                DispatchQueue.main.async {
                    completion(.failure(AppProxyManagerError.privilegedRepairFailed("Chrome policy still forces \(Self.bridgeListen) after repair")))
                }
                return
            }
            let summary = out
                .split(separator: "\n")
                .map(String.init)
                .filter { !$0.isEmpty }
                .joined(separator: "; ")
            DispatchQueue.main.async {
                completion(.success(summary.isEmpty ? "Chrome managed policy repaired" : summary))
            }
        }
    }

    func applyTargetsLive(completion: @escaping (Result<String, Error>) -> Void) {
        let selection = Self.loadTargetSelection()
        loadExistingManager { result in
            switch result {
            case .failure:
                self.installOrUpdate(completion: completion)
            case .success(let manager):
                manager.loadFromPreferences { error in
                    if let error {
                        completion(.failure(error))
                        return
                    }
                    let wasConnected = manager.connection.status == .connected ||
                        manager.connection.status == .connecting ||
                        manager.connection.status == .reasserting
                    self.installOrUpdate { installResult in
                        switch installResult {
                        case .failure(let error):
                            completion(.failure(error))
                        case .success:
                            guard wasConnected else {
                                completion(.success("target rules saved; VPN was not connected"))
                                return
                            }
                            self.restartActiveTunnelAfterRulesChange { restartResult in
                                switch restartResult {
                                case .success:
                                    completion(.success("target rules saved and VPN reloaded: \(Self.selectionSummary(selection))"))
                                case .failure(let error):
                                    completion(.failure(error))
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private func restartActiveTunnelAfterRulesChange(completion: @escaping (Result<String, Error>) -> Void) {
        loadExistingManager { result in
            switch result {
            case .failure(let error):
                completion(.failure(error))
            case .success(let manager):
                manager.loadFromPreferences { error in
                    if let error {
                        completion(.failure(error))
                        return
                    }
                    switch manager.connection.status {
                    case .invalid, .disconnected:
                        self.startLoadedManager(manager, completion: completion)
                    case .disconnecting:
                        self.startWhenTunnelStops(manager, completion: completion)
                    default:
                        self.startWhenTunnelStops(manager, completion: completion)
                        manager.connection.stopVPNTunnel()
                    }
                }
            }
        }
    }

    private func startWhenTunnelStops(_ manager: NEAppProxyProviderManager,
                                      completion: @escaping (Result<String, Error>) -> Void) {
        let lock = NSLock()
        var finished = false
        var observer: NSObjectProtocol?
        var timeout: DispatchWorkItem?

        func finish(_ result: Result<String, Error>) {
            lock.lock()
            if finished {
                lock.unlock()
                return
            }
            finished = true
            let removeObserver = observer
            observer = nil
            let cancelTimeout = timeout
            timeout = nil
            lock.unlock()

            if let removeObserver {
                NotificationCenter.default.removeObserver(removeObserver)
            }
            cancelTimeout?.cancel()
            completion(result)
        }

        func startStoppedTunnel() {
            self.startLoadedManager(manager) { result in
                finish(result)
            }
        }

        observer = NotificationCenter.default.addObserver(
            forName: .NEVPNStatusDidChange,
            object: manager.connection,
            queue: .main
        ) { _ in
            switch manager.connection.status {
            case .invalid, .disconnected:
                startStoppedTunnel()
            default:
                break
            }
        }

        let timeoutWork = DispatchWorkItem {
            finish(.failure(AppProxyManagerError.reloadTimedOut(manager.connection.status.rawValue)))
        }
        timeout = timeoutWork
        DispatchQueue.main.asyncAfter(deadline: .now() + 12, execute: timeoutWork)

        switch manager.connection.status {
        case .invalid, .disconnected:
            startStoppedTunnel()
        default:
            break
        }
    }

    private func startLoadedManager(_ manager: NEAppProxyProviderManager,
                                    completion: @escaping (Result<String, Error>) -> Void) {
        let runStart: () -> Void = {
            do {
                try manager.connection.startVPNTunnel()
                completion(.success("start requested"))
            } catch {
                completion(.failure(error))
            }
        }
        if manager.isEnabled {
            runStart()
            return
        }
        manager.isEnabled = true
        manager.saveToPreferences { error in
            if let error {
                completion(.failure(error))
                return
            }
            manager.loadFromPreferences { loadError in
                if let loadError {
                    completion(.failure(loadError))
                    return
                }
                runStart()
            }
        }
    }

    func stop(completion: @escaping (Result<String, Error>) -> Void) {
        loadExistingManager { result in
            switch result {
            case .failure(let error):
                completion(.failure(error))
            case .success(let manager):
                manager.connection.stopVPNTunnel()
                completion(.success("stop requested"))
            }
        }
    }

    func status(completion: @escaping (Result<String, Error>) -> Void) {
        loadExistingManager { result in
            switch result {
            case .failure(let error):
                completion(.failure(error))
            case .success(let manager):
                manager.loadFromPreferences { error in
                    if let error {
                        completion(.failure(error))
                        return
                    }
                    let rules = manager.copyAppRules() ?? []
                    let ruleText = rules.enumerated().map { idx, rule in
                        let path = rule.matchPath ?? "<any path>"
                        let tools = rule.matchTools ?? []
                        let toolText = tools.enumerated().map { toolIdx, tool in
                            let toolPath = tool.matchPath ?? "<any path>"
                            return "    tool \(toolIdx + 1). \(tool.matchSigningIdentifier) path=\(toolPath)"
                        }.joined(separator: "\n")
                        let line = "  \(idx + 1). \(rule.matchSigningIdentifier) path=\(path) tools=\(tools.count)"
                        return toolText.isEmpty ? line : "\(line)\n\(toolText)"
                    }.joined(separator: "\n")
                    let managerName = manager.localizedDescription ?? "<nil>"
                    let protocolText = (manager.protocolConfiguration as? NETunnelProviderProtocol)
                        .map { "provider=\($0.providerBundleIdentifier ?? "<nil>") server=\($0.serverAddress ?? "<nil>") config=\($0.providerConfiguration ?? [:])" }
                        ?? "provider=<invalid protocol>"
                    let targetText = Self.targetStatusLines(
                        selection: Self.loadTargetSelection(),
                        installedRules: rules
                    ).map { "[target] \($0)" }.joined(separator: "\n")
                    completion(.success("""
                    [status] name=\(managerName) enabled=\(manager.isEnabled) status=\(manager.connection.status.rawValue) routingMethod=\(manager.routingMethod.rawValue)
                    [status] \(protocolText)
                    [status] appRules=\(rules.count)
                    \(targetText)
                    \(ruleText)
                    """))
                }
            }
        }
    }

    func remove(completion: @escaping (Result<String, Error>) -> Void) {
        NEAppProxyProviderManager.loadAllFromPreferences { managers, error in
            if let error {
                completion(.failure(error))
                return
            }
            let appProxyMatches: [NETunnelProviderManager] = (managers ?? [])
                .filter { Self.managerMatches($0) }
                .map { $0 as NETunnelProviderManager }
            self.removeManagers(appProxyMatches, index: 0, removed: 0) { appProxyResult in
                switch appProxyResult {
                case .failure(let error):
                    completion(.failure(error))
                case .success(let appProxyRemoved):
                    self.removeStaleTunnelManagers(appProxyRemoved: appProxyRemoved, completion: completion)
                }
            }
        }
    }

    private func loadExistingManager(completion: @escaping (Result<NEAppProxyProviderManager, Error>) -> Void) {
        if let cachedManager {
            completion(.success(cachedManager))
            return
        }
        loadOrCreateManager(createIfMissing: false, completion: completion)
    }

    private func loadOrCreateManager(
        createIfMissing: Bool = true,
        completion: @escaping (Result<NEAppProxyProviderManager, Error>) -> Void
    ) {
        NEAppProxyProviderManager.loadAllFromPreferences { managers, error in
            if let error {
                completion(.failure(error))
                return
            }
            let matches = Self.uniqueMatchingManagers(from: managers ?? [])
            if matches.count > 1 {
                completion(.failure(AppProxyManagerError.multipleManagers(matches.map { Self.managerSummary($0) })))
                return
            }
            if let existing = matches.first {
                completion(.success(existing))
                return
            }
            guard createIfMissing else {
                completion(.failure(AppProxyManagerError.managerNotInstalled))
                return
            }
            completion(.success(NEAppProxyProviderManager.forPerAppVPN()))
        }
    }

    private func removeManagers(
        _ managers: [NETunnelProviderManager],
        index: Int,
        removed: Int,
        completion: @escaping (Result<Int, Error>) -> Void
    ) {
        if index >= managers.count {
            cachedManager = nil
            completion(.success(removed))
            return
        }
        managers[index].removeFromPreferences { error in
            if let error {
                completion(.failure(error))
                return
            }
            self.removeManagers(managers, index: index + 1, removed: removed + 1, completion: completion)
        }
    }

    private func removeStaleTunnelManagers(
        appProxyRemoved: Int,
        completion: @escaping (Result<String, Error>) -> Void
    ) {
        NETunnelProviderManager.loadAllFromPreferences { managers, error in
            if let error {
                completion(.failure(error))
                return
            }
            let tunnelMatches = (managers ?? [])
                .filter { Self.managerMatches($0) && !($0 is NEAppProxyProviderManager) }
            self.removeManagers(tunnelMatches, index: 0, removed: 0) { tunnelResult in
                switch tunnelResult {
                case .failure(let error):
                    completion(.failure(error))
                case .success(let tunnelRemoved):
                    let total = appProxyRemoved + tunnelRemoved
                    if total == 0 {
                        completion(.success("no saved app proxy manager"))
                    } else {
                        completion(.success("removed \(total) saved app proxy manager(s)"))
                    }
                }
            }
        }
    }

    static func loadTargetSelection() -> AppTargetSelection {
        guard let data = try? Data(contentsOf: targetConfigURL),
              let selection = try? JSONDecoder().decode(AppTargetSelection.self, from: data) else {
            return .productionDefault
        }
        return selection
    }

    static func saveTargetSelection(_ selection: AppTargetSelection) throws {
        let dir = targetConfigURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(selection)
        try data.write(to: targetConfigURL, options: [.atomic])
    }

    static func selectionSummary(_ selection: AppTargetSelection = loadTargetSelection()) -> String {
        var items: [String] = []
        if selection.defaultBrowser { items.append("default-browser") }
        if selection.chrome { items.append("chrome") }
        if selection.codex { items.append("codex") }
        if selection.cursor { items.append("cursor") }
        if selection.claudeCode { items.append("claude-code") }
        if selection.terminalCli { items.append("terminal-cli") }
        return items.isEmpty ? "<none>" : items.joined(separator: ",")
    }

    static func targetInventoryLines() -> [String] {
        return targetStatusLines(selection: loadTargetSelection(), installedRules: nil)
    }

    static func claudeCodeAvailable() -> Bool {
        return (try? claudeCodeExecutablePath()) != nil
    }

    static func chromeSystemProxyRepairNeeded(selection: AppTargetSelection = loadTargetSelection()) -> Bool {
        guard !selection.chrome else { return false }
        return chromeManagedPolicyPaths().contains { policyForcesBridge($0) }
    }

    private struct ResolvedTarget {
        let key: String
        let label: String
        let path: String
        let bundleIdentifier: String
        let bundleVersion: String
        let bundleBuild: String
        let signingIdentifier: String
        let helperCount: Int
        let requiredRulePaths: [String]

        var snapshot: AppTargetSnapshot {
            AppTargetSnapshot(
                path: path,
                bundleIdentifier: bundleIdentifier,
                bundleVersion: bundleVersion,
                bundleBuild: bundleBuild,
                signingIdentifier: signingIdentifier,
                helperCount: helperCount
            )
        }
    }

    private static func targetStatusLines(
        selection: AppTargetSelection,
        installedRules: [NEAppRule]?
    ) -> [String] {
        var lines = ["targets=\(selectionSummary(selection))"]
        let installedPaths = installedRulePaths(from: installedRules)
        let targets: [(String, String, Bool, () throws -> ResolvedTarget)] = [
            ("defaultBrowser", "Default browser", selection.defaultBrowser, { try resolveDefaultBrowserTarget() }),
            ("chrome", "Chrome", selection.chrome, { try resolveChromeTarget() }),
            ("codex", "Codex", selection.codex, { try resolveCodexTarget() }),
            ("cursor", "Cursor", selection.cursor, { try resolveCursorTarget() }),
            ("claudeCode", "Claude Code", selection.claudeCode, { try resolveClaudeCodeTarget() }),
            ("terminalCli", "Terminal / CLI", selection.terminalCli, { try resolveTerminalCliTarget() }),
        ]

        for (key, label, selected, resolver) in targets {
            guard selected else {
                lines.append("target \(key) selected=0 matched=0 installed=0 changed=0 label=\"\(label)\"")
                continue
            }
            do {
                let resolved = try resolver()
                let installedText: String
                var missingRulePaths: [String] = []
                if let installedPaths {
                    missingRulePaths = resolved.requiredRulePaths.filter { !installedPaths.contains($0) }
                    installedText = missingRulePaths.isEmpty ? "1" : "0"
                } else {
                    installedText = "unknown"
                }
                let oldSnapshot = selection.snapshots[key]
                let changed = oldSnapshot.map { $0 != resolved.snapshot } ?? false
                lines.append("target \(key) selected=1 matched=1 installed=\(installedText) changed=\(changed ? 1 : 0) label=\"\(label)\" path=\"\(resolved.path)\" signing=\"\(resolved.signingIdentifier)\" bundle=\"\(resolved.bundleIdentifier)\" version=\"\(resolved.bundleVersion)\" build=\"\(resolved.bundleBuild)\" helpers=\(resolved.helperCount)")
                if !missingRulePaths.isEmpty {
                    lines.append("target \(key) missing_rule_paths=\(missingRulePaths.joined(separator: "|"))")
                }
            } catch {
                lines.append("target \(key) selected=1 matched=0 installed=0 changed=0 label=\"\(label)\" error=\"\(error.localizedDescription)\"")
            }
        }
        return lines
    }

    private static func installedRulePaths(from rules: [NEAppRule]?) -> Set<String>? {
        guard let rules else { return nil }
        var paths = Set<String>()
        for rule in rules {
            if let path = rule.matchPath {
                paths.insert(path)
            }
            for tool in rule.matchTools ?? [] {
                if let path = tool.matchPath {
                    paths.insert(path)
                }
            }
        }
        return paths
    }

    private static func chromeManagedPolicyPaths() -> [String] {
        let user = NSUserName()
        return [
            "/Library/Managed Preferences/\(user)/com.google.Chrome.plist",
            "/Library/Managed Preferences/com.google.Chrome.plist",
        ]
    }

    private static func policyForcesBridge(_ path: String) -> Bool {
        guard let data = NSDictionary(contentsOfFile: path) as? [String: Any] else {
            return false
        }
        let proxyMode = data["ProxyMode"] as? String
        let proxyServer = data["ProxyServer"] as? String
        return proxyMode == "fixed_servers" && (proxyServer?.contains(bridgeListen) ?? false)
    }

    private static func chromeSystemProxyRepairScriptPath() throws -> String {
        var candidates: [String] = []
        if let resourcePath = Bundle.main.resourceURL?
            .appendingPathComponent("repair_chrome_system_proxy.sh")
            .path {
            candidates.append(resourcePath)
        }
        if let explicit = ProcessInfo.processInfo.environment["CHENG_PER_APP_VPN_REPAIR_CHROME_SCRIPT"],
           !explicit.isEmpty {
            candidates.append(explicit)
        }
        for path in candidates {
            if FileManager.default.isExecutableFile(atPath: path) {
                return path
            }
        }
        throw AppProxyManagerError.executableMissing("repair_chrome_system_proxy.sh")
    }

    private static func shellQuoted(_ text: String) -> String {
        return "'" + text.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }

    private static func appleScriptString(_ text: String) -> String {
        let escaped = text
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        return "\"\(escaped)\""
    }

    private static func currentSnapshots(selection: AppTargetSelection) throws -> [String: AppTargetSnapshot] {
        var snapshots: [String: AppTargetSnapshot] = [:]
        if selection.defaultBrowser {
            let target = try resolveDefaultBrowserTarget()
            snapshots[target.key] = target.snapshot
        }
        if selection.chrome {
            let target = try resolveChromeTarget()
            snapshots[target.key] = target.snapshot
        }
        if selection.codex {
            let target = try resolveCodexTarget()
            snapshots[target.key] = target.snapshot
        }
        if selection.cursor {
            let target = try resolveCursorTarget()
            snapshots[target.key] = target.snapshot
        }
        if selection.claudeCode {
            let target = try resolveClaudeCodeTarget()
            snapshots[target.key] = target.snapshot
        }
        if selection.terminalCli {
            let target = try resolveTerminalCliTarget()
            snapshots[target.key] = target.snapshot
        }
        return snapshots
    }

    private static func appRules(selection: AppTargetSelection) throws -> [NEAppRule] {
        var rules: [NEAppRule] = []
        var appBundleRulePaths = Set<String>()

        func appendUniqueAppBundleRule(appPath: String) throws {
            let realPath = URL(fileURLWithPath: appPath).resolvingSymlinksInPath().path
            guard appBundleRulePaths.insert(realPath).inserted else {
                return
            }
            try appendAppBundleRule(appPath: appPath, into: &rules)
        }

        if selection.defaultBrowser {
            try appendUniqueAppBundleRule(appPath: try defaultBrowserAppPath())
        }
        if selection.chrome {
            try appendUniqueAppBundleRule(appPath: try chromeAppPath())
        }
        if selection.cursor {
            try appendUniqueAppBundleRule(appPath: cursorAppPath)
        }
        if selection.terminalCli {
            try appendTerminalCliRules(into: &rules, appBundleRulePaths: &appBundleRulePaths)
        }
        if selection.codex {
            let codexHelpers = try findCodexHelperExecutablePaths()
            let codexBinPath = try firstExistingExecutable(paths: [
                "\(codexAppPath)/Contents/Resources/codex",
                "\(codexAppPath)/Contents/Resources/codex.bin",
            ], label: "Codex CLI")
            let codexNodeReplPath = try firstExistingExecutable(paths: [
                "\(codexAppPath)/Contents/Resources/cua_node/bin/node_repl",
                "\(codexAppPath)/Contents/Resources/node_repl",
                "\(codexAppPath)/Contents/Resources/node_repl.bin",
            ], label: "Codex node_repl")
            try appendSignedRule(
                path: codexPath,
                constrainPath: true,
                matchToolPaths: [
                    codexBinPath,
                    codexNodeReplPath,
                    codexBareModifierMonitorPath,
                ] + codexHelpers,
                into: &rules
            )
            try appendSignedRule(path: codexBinPath, constrainPath: true, into: &rules)
            try appendSignedRule(path: codexNodeReplPath, constrainPath: true, into: &rules)
            try appendSignedRule(path: codexBareModifierMonitorPath, constrainPath: true, into: &rules)
            for helperPath in codexHelpers {
                try appendSignedRule(path: helperPath, constrainPath: true, into: &rules)
            }
        }
        if selection.claudeCode {
            let claudePath = try claudeCodeExecutablePath()
            try appendSignedRule(path: claudePath, constrainPath: true, into: &rules)
            try appendOptionalToolHostRule(appPath: "/System/Applications/Utilities/Terminal.app", toolPath: claudePath, into: &rules)
            try appendOptionalToolHostRule(appPath: "/Applications/iTerm.app", toolPath: claudePath, into: &rules)
        }
        try appendOptionalSignedRule(path: probePath, constrainPath: true, into: &rules)
        if rules.isEmpty {
            throw AppProxyManagerError.noUsableAppRules
        }
        return rules
    }

    private static func firstExistingExecutable(paths: [String], label: String) throws -> String {
        for path in paths {
            if FileManager.default.isExecutableFile(atPath: path) {
                return path
            }
        }
        throw AppProxyManagerError.executableMissing("\(label): \(paths.joined(separator: ", "))")
    }

    private static func udpSocksUpstream() throws -> (host: String, port: Int) {
        let raw = ProcessInfo.processInfo.environment["CHENG_PER_APP_VPN_UDP_SOCKS_UPSTREAM"] ?? ""
        if raw.isEmpty {
            throw AppProxyManagerError.invalidConfiguration("CHENG_PER_APP_VPN_UDP_SOCKS_UPSTREAM is required when UDP relay is enabled")
        }
        guard let separator = raw.lastIndex(of: ":") else {
            throw AppProxyManagerError.invalidConfiguration("CHENG_PER_APP_VPN_UDP_SOCKS_UPSTREAM=\(raw)")
        }
        let host = String(raw[..<separator])
        let portText = String(raw[raw.index(after: separator)...])
        guard let port = Int(portText), port > 0, port <= Int(UInt16.max) else {
            throw AppProxyManagerError.invalidConfiguration("CHENG_PER_APP_VPN_UDP_SOCKS_UPSTREAM=\(raw)")
        }
        if host.isEmpty {
            throw AppProxyManagerError.invalidConfiguration("CHENG_PER_APP_VPN_UDP_SOCKS_UPSTREAM=\(raw)")
        }
        return (host, port)
    }

    private static func udpRelayMode() throws -> String {
        let raw = ProcessInfo.processInfo.environment["CHENG_PER_APP_VPN_UDP_RELAY_MODE"] ?? "disabled"
        if raw == "disabled" || raw == "socks5-udp-associate" {
            return raw
        }
        throw AppProxyManagerError.invalidConfiguration("CHENG_PER_APP_VPN_UDP_RELAY_MODE=\(raw)")
    }

    private static func resolveDefaultBrowserTarget() throws -> ResolvedTarget {
        return try resolveAppBundleTarget(
            key: "defaultBrowser",
            label: "Default browser",
            appPath: defaultBrowserAppPath()
        )
    }

    private static func resolveChromeTarget() throws -> ResolvedTarget {
        return try resolveAppBundleTarget(
            key: "chrome",
            label: "Chrome",
            appPath: chromeAppPath()
        )
    }

    private static func resolveCursorTarget() throws -> ResolvedTarget {
        return try resolveAppBundleTarget(
            key: "cursor",
            label: "Cursor",
            appPath: cursorAppPath
        )
    }

    private static func resolveCodexTarget() throws -> ResolvedTarget {
        let codexHelpers = try findCodexHelperExecutablePaths()
        let codexBinPath = try firstExistingExecutable(paths: [
            "\(codexAppPath)/Contents/Resources/codex",
            "\(codexAppPath)/Contents/Resources/codex.bin",
        ], label: "Codex CLI")
        let codexNodeReplPath = try firstExistingExecutable(paths: [
            "\(codexAppPath)/Contents/Resources/cua_node/bin/node_repl",
            "\(codexAppPath)/Contents/Resources/node_repl",
            "\(codexAppPath)/Contents/Resources/node_repl.bin",
        ], label: "Codex node_repl")
        let required = [
            codexPath,
            codexBinPath,
            codexNodeReplPath,
            codexBareModifierMonitorPath,
        ] + codexHelpers
        return try resolveExecutableTarget(
            key: "codex",
            label: "Codex",
            executablePath: codexPath,
            bundlePath: codexAppPath,
            helperCount: codexHelpers.count + 3,
            requiredRulePaths: required
        )
    }

    private static func resolveClaudeCodeTarget() throws -> ResolvedTarget {
        let claudePath = try claudeCodeExecutablePath()
        return try resolveExecutableTarget(
            key: "claudeCode",
            label: "Claude Code",
            executablePath: claudePath,
            bundlePath: nil,
            helperCount: 0,
            requiredRulePaths: [claudePath]
        )
    }

    private static func resolveTerminalCliTarget() throws -> ResolvedTarget {
        let hostPaths = try terminalCliExecutablePaths(requireAtLeastOne: true)
        let primaryPath = hostPaths[0]
        return try resolveExecutableTarget(
            key: "terminalCli",
            label: "Terminal / CLI",
            executablePath: primaryPath,
            bundlePath: terminalAppPath(),
            helperCount: max(0, hostPaths.count - 1),
            requiredRulePaths: hostPaths
        )
    }

    private static func resolveAppBundleTarget(
        key: String,
        label: String,
        appPath: String
    ) throws -> ResolvedTarget {
        let executable = try executablePathForAppBundle(appPath)
        let helpers = findHelperExecutablePaths(appPath: appPath)
        return try resolveExecutableTarget(
            key: key,
            label: label,
            executablePath: executable,
            bundlePath: appPath,
            helperCount: helpers.count,
            requiredRulePaths: [executable] + helpers
        )
    }

    private static func resolveExecutableTarget(
        key: String,
        label: String,
        executablePath: String,
        bundlePath: String?,
        helperCount: Int,
        requiredRulePaths: [String]
    ) throws -> ResolvedTarget {
        let signature = try codeSignature(path: executablePath)
        let metadata = try executableMetadata(executablePath: executablePath, bundlePath: bundlePath)
        return ResolvedTarget(
            key: key,
            label: label,
            path: executablePath,
            bundleIdentifier: metadata.bundleIdentifier,
            bundleVersion: metadata.bundleVersion,
            bundleBuild: metadata.bundleBuild,
            signingIdentifier: signature.identifier,
            helperCount: helperCount,
            requiredRulePaths: requiredRulePaths
        )
    }

    private static func appendAppBundleRule(appPath: String, into rules: inout [NEAppRule]) throws {
        let executable = try executablePathForAppBundle(appPath)
        let helpers = findHelperExecutablePaths(appPath: appPath)
        try appendSignedRule(path: executable, constrainPath: true, matchToolPaths: helpers, into: &rules)
        for helper in helpers {
            try appendSignedRule(path: helper, constrainPath: true, into: &rules)
        }
    }

    private static func appendOptionalToolHostRule(appPath: String, toolPath: String, into rules: inout [NEAppRule]) throws {
        guard FileManager.default.fileExists(atPath: appPath) else {
            return
        }
        let executable = try executablePathForAppBundle(appPath)
        try appendSignedRule(path: executable, constrainPath: true, matchToolPaths: [toolPath], into: &rules)
    }

    private static func appendTerminalCliRules(into rules: inout [NEAppRule],
                                               appBundleRulePaths: inout Set<String>) throws {
        for appPath in terminalCliAppPaths() {
            guard FileManager.default.fileExists(atPath: appPath) else {
                continue
            }
            let realPath = URL(fileURLWithPath: appPath).resolvingSymlinksInPath().path
            guard appBundleRulePaths.insert(realPath).inserted else {
                continue
            }
            try appendAppBundleRule(appPath: appPath, into: &rules)
        }
    }

    private static func appendSignedRule(
        path: String,
        constrainPath: Bool,
        matchToolPaths: [String] = [],
        into rules: inout [NEAppRule]
    ) throws {
        let rule = try signedRule(path: path, constrainPath: constrainPath)
        if !matchToolPaths.isEmpty {
            rule.matchTools = try matchToolPaths.map { try signedRule(path: $0, constrainPath: true) }
        }
        rules.append(rule)
    }

    private static func appendOptionalSignedRule(
        path: String,
        constrainPath: Bool,
        into rules: inout [NEAppRule]
    ) throws {
        guard FileManager.default.isExecutableFile(atPath: path) else {
            return
        }
        try appendSignedRule(path: path, constrainPath: constrainPath, into: &rules)
    }

    private static func signedRule(path: String, constrainPath: Bool) throws -> NEAppRule {
        let signature = try codeSignature(path: path)
        let rule = NEAppRule(
            signingIdentifier: signature.identifier,
            designatedRequirement: signature.designatedRequirement
        )
        if constrainPath {
            rule.matchPath = path
        }
        return rule
    }

    private static func findCodexHelperExecutablePaths() throws -> [String] {
        let root = URL(fileURLWithPath: codexFrameworksPath)
        guard let enumerator = FileManager.default.enumerator(
            at: root,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ) else {
            throw AppProxyManagerError.executableMissing(codexFrameworksPath)
        }
        var matchesByRealPath: [String: String] = [:]
        for case let url as URL in enumerator {
            let path = url.path
            var isDirectory = ObjCBool(false)
            guard path.contains("/Helpers/"),
                  FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory),
                  !isDirectory.boolValue,
                  FileManager.default.isExecutableFile(atPath: path) else {
                continue
            }
            if path.contains(".app/") && !path.contains(".app/Contents/MacOS/") {
                continue
            }
            let realPath = url.resolvingSymlinksInPath().path
            if matchesByRealPath[realPath] == nil || path.contains("/Versions/Current/") {
                matchesByRealPath[realPath] = path
            }
        }
        let paths = Array(matchesByRealPath.values).sorted()
        if !paths.isEmpty {
            return paths
        }
        throw AppProxyManagerError.executableMissing("Codex helpers under \(codexFrameworksPath)")
    }

    private static func defaultBrowserAppPath() throws -> String {
        guard let url = URL(string: "https://www.example.com"),
              let appURL = NSWorkspace.shared.urlForApplication(toOpen: url) else {
            throw AppProxyManagerError.executableMissing("default browser for https URL")
        }
        return appURL.path
    }

    private static func chromeAppPath() throws -> String {
        if let explicit = ProcessInfo.processInfo.environment["CHENG_CHROME_APP"], !explicit.isEmpty {
            guard FileManager.default.fileExists(atPath: explicit) else {
                throw AppProxyManagerError.executableMissing(explicit)
            }
            return explicit
        }
        return try appPathForBundleIdentifier(
            "com.google.Chrome",
            knownPaths: ["/Applications/Google Chrome.app"]
        )
    }

    private static func terminalAppPath() -> String {
        let systemPath = "/System/Applications/Utilities/Terminal.app"
        if FileManager.default.fileExists(atPath: systemPath) {
            return systemPath
        }
        return "/Applications/Utilities/Terminal.app"
    }

    private static func terminalCliAppPaths() -> [String] {
        return [
            terminalAppPath(),
            "/Applications/iTerm.app",
        ]
    }

    private static func terminalCliExecutablePaths(requireAtLeastOne: Bool) throws -> [String] {
        var paths: [String] = []
        for appPath in terminalCliAppPaths() {
            guard FileManager.default.fileExists(atPath: appPath) else {
                continue
            }
            paths.append(try executablePathForAppBundle(appPath))
        }
        if requireAtLeastOne && paths.isEmpty {
            throw AppProxyManagerError.executableMissing("Terminal.app or iTerm.app")
        }
        return paths
    }

    private static func appPathForBundleIdentifier(
        _ bundleIdentifier: String,
        knownPaths: [String]
    ) throws -> String {
        if let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleIdentifier) {
            return url.path
        }
        for path in knownPaths where FileManager.default.fileExists(atPath: path) {
            return path
        }
        throw AppProxyManagerError.executableMissing("application bundle \(bundleIdentifier)")
    }

    private static func defaultBrowserExecutablePath() throws -> String {
        return try executablePathForAppBundle(defaultBrowserAppPath())
    }

    private static func executableMetadata(
        executablePath: String,
        bundlePath: String?
    ) throws -> (bundleIdentifier: String, bundleVersion: String, bundleBuild: String) {
        if let bundlePath {
            let infoURL = URL(fileURLWithPath: bundlePath).appendingPathComponent("Contents/Info.plist")
            guard let info = NSDictionary(contentsOf: infoURL) else {
                throw AppProxyManagerError.executableMissing("\(bundlePath)/Contents/Info.plist")
            }
            let bundleIdentifier = info["CFBundleIdentifier"] as? String ?? "<missing>"
            let bundleVersion = info["CFBundleShortVersionString"] as? String ?? "<missing>"
            let bundleBuild = info["CFBundleVersion"] as? String ?? "<missing>"
            return (bundleIdentifier, bundleVersion, bundleBuild)
        }

        let attrs = try FileManager.default.attributesOfItem(atPath: executablePath)
        let modified = attrs[.modificationDate] as? Date
        let size = attrs[.size] as? NSNumber
        let modifiedSeconds = modified.map { String(Int($0.timeIntervalSince1970)) } ?? "<missing>"
        let byteSize = size.map { $0.stringValue } ?? "<missing>"
        return ("cli", "mtime:\(modifiedSeconds)", "size:\(byteSize)")
    }

    private static func executablePathForAppBundle(_ appPath: String) throws -> String {
        let infoURL = URL(fileURLWithPath: appPath)
            .appendingPathComponent("Contents/Info.plist")
        guard let info = NSDictionary(contentsOf: infoURL),
              let executable = info["CFBundleExecutable"] as? String,
              !executable.isEmpty else {
            throw AppProxyManagerError.executableMissing("\(appPath)/Contents/Info.plist CFBundleExecutable")
        }
        let executablePath = URL(fileURLWithPath: appPath)
            .appendingPathComponent("Contents/MacOS")
            .appendingPathComponent(executable)
            .path
        guard FileManager.default.isExecutableFile(atPath: executablePath) else {
            throw AppProxyManagerError.executableMissing(executablePath)
        }
        return executablePath
    }

    private static func findHelperExecutablePaths(appPath: String) -> [String] {
        let root = URL(fileURLWithPath: appPath).appendingPathComponent("Contents")
        guard let enumerator = FileManager.default.enumerator(
            at: root,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ) else {
            return []
        }
        var matchesByRealPath: [String: String] = [:]
        for case let url as URL in enumerator {
            let path = url.path
            guard isProxyHelperExecutablePath(path),
                  FileManager.default.isExecutableFile(atPath: path) else {
                continue
            }
            if isInactiveFrameworkVersion(url) {
                continue
            }
            let realPath = url.resolvingSymlinksInPath().path
            if matchesByRealPath[realPath] == nil || path.contains("/Versions/Current/") {
                matchesByRealPath[realPath] = path
            }
        }
        return Array(matchesByRealPath.values).sorted()
    }

    private static func isProxyHelperExecutablePath(_ path: String) -> Bool {
        if path.contains(".app/Contents/MacOS/") {
            if path.contains("/Helpers/") {
                return true
            }
            return path.contains("/Contents/Frameworks/") && path.contains("Helper")
        }
        return path.contains("/Contents/Frameworks/")
            && path.contains("/Helpers/")
            && !path.contains(".app/")
    }

    private static func isInactiveFrameworkVersion(_ url: URL) -> Bool {
        let components = url.pathComponents
        guard let versionsIndex = components.firstIndex(of: "Versions"),
              versionsIndex + 1 < components.count else {
            return false
        }
        let version = components[versionsIndex + 1]
        if version == "Current" {
            return false
        }
        let versionsPath = NSString.path(withComponents: Array(components[0...versionsIndex]))
        let versionURL = URL(fileURLWithPath: versionsPath).appendingPathComponent(version)
        let currentURL = URL(fileURLWithPath: versionsPath).appendingPathComponent("Current")
        guard FileManager.default.fileExists(atPath: currentURL.path) else {
            return false
        }
        return versionURL.resolvingSymlinksInPath().path != currentURL.resolvingSymlinksInPath().path
    }

    private static func claudeCodeExecutablePath() throws -> String {
        var candidates: [String] = []
        if let explicit = ProcessInfo.processInfo.environment["CHENG_CLAUDE_CODE_PATH"], !explicit.isEmpty {
            candidates.append(explicit)
        }
        candidates += [
            "\(FileManager.default.homeDirectoryForCurrentUser.path)/.local/bin/claude",
            "\(FileManager.default.homeDirectoryForCurrentUser.path)/.claude/local/claude",
            "/opt/homebrew/bin/claude",
            "/usr/local/bin/claude",
        ]
        let pathDirs = (ProcessInfo.processInfo.environment["PATH"] ?? "")
            .split(separator: ":")
            .map(String.init)
        for dir in pathDirs {
            candidates.append("\(dir)/claude")
        }
        var seen = Set<String>()
        for candidate in candidates {
            let url = URL(fileURLWithPath: candidate).resolvingSymlinksInPath()
            let path = url.path
            guard seen.insert(path).inserted else { continue }
            if FileManager.default.isExecutableFile(atPath: path) {
                return path
            }
        }
        throw AppProxyManagerError.executableMissing("Claude Code executable; set CHENG_CLAUDE_CODE_PATH or install claude")
    }

    private struct CodeSignature {
        let identifier: String
        let designatedRequirement: String
    }

    private static func codeSignature(path: String) throws -> CodeSignature {
        guard FileManager.default.isExecutableFile(atPath: path) else {
            throw AppProxyManagerError.executableMissing(path)
        }
        var staticCode: SecStaticCode?
        let createStatus = SecStaticCodeCreateWithPath(URL(fileURLWithPath: path) as CFURL,
                                                       SecCSFlags(),
                                                       &staticCode)
        guard createStatus == errSecSuccess, let code = staticCode else {
            throw AppProxyManagerError.signatureUnavailable(path, createStatus)
        }

        var infoRef: CFDictionary?
        let infoStatus = SecCodeCopySigningInformation(
            code,
            SecCSFlags(rawValue: kSecCSSigningInformation),
            &infoRef
        )
        guard infoStatus == errSecSuccess,
              let info = infoRef as? [String: Any],
              let identifier = info[kSecCodeInfoIdentifier as String] as? String,
              !identifier.isEmpty else {
            throw AppProxyManagerError.signatureUnavailable(path, infoStatus)
        }

        var requirement: SecRequirement?
        let reqStatus = SecCodeCopyDesignatedRequirement(code, SecCSFlags(), &requirement)
        guard reqStatus == errSecSuccess, let requirement else {
            throw AppProxyManagerError.signatureUnavailable(path, reqStatus)
        }
        var requirementText: CFString?
        let textStatus = SecRequirementCopyString(requirement, SecCSFlags(), &requirementText)
        guard textStatus == errSecSuccess,
              let designatedRequirement = requirementText as String?,
              !designatedRequirement.isEmpty else {
            throw AppProxyManagerError.signatureUnavailable(path, textStatus)
        }

        return CodeSignature(identifier: identifier, designatedRequirement: designatedRequirement)
    }

    private static func providerBundleIdentifier() -> String {
        if let value = Bundle.main.object(forInfoDictionaryKey: "ChengProviderBundleIdentifier") as? String,
           !value.isEmpty {
            return value
        }
        return "\(Bundle.main.bundleIdentifier ?? "local.cheng.ChengPerAppVPN").ProxyExtension"
    }

    private static func uniqueMatchingManagers(from managers: [NEAppProxyProviderManager]) -> [NEAppProxyProviderManager] {
        var seen = Set<ObjectIdentifier>()
        var out: [NEAppProxyProviderManager] = []
        for manager in managers where managerMatches(manager) {
            let id = ObjectIdentifier(manager)
            if seen.insert(id).inserted {
                out.append(manager)
            }
        }
        return out
    }

    private static func managerMatches(_ manager: NETunnelProviderManager) -> Bool {
        if manager.localizedDescription == localizedDescription {
            return true
        }
        guard let provider = manager.protocolConfiguration as? NETunnelProviderProtocol else {
            return false
        }
        return provider.providerBundleIdentifier == providerBundleIdentifier()
    }

    private static func managerSummary(_ manager: NETunnelProviderManager) -> String {
        let name = manager.localizedDescription ?? "<nil>"
        let provider = (manager.protocolConfiguration as? NETunnelProviderProtocol)?.providerBundleIdentifier ?? "<nil>"
        return "name=\(name) provider=\(provider) enabled=\(manager.isEnabled)"
    }

    private static func activateSystemExtension(completion: @escaping (Result<String, Error>) -> Void) {
        SystemExtensionActivator.activate(identifier: providerBundleIdentifier(), completion: completion)
    }
}

enum AppProxyManagerError: LocalizedError {
    case managerNotInstalled
    case executableMissing(String)
    case multipleExecutables(String, [String])
    case multipleManagers([String])
    case noUsableAppRules
    case invalidConfiguration(String)
    case reloadTimedOut(Int)
    case signatureUnavailable(String, OSStatus)
    case privilegedRepairFailed(String)
    case systemExtensionApprovalRequired(String)
    case systemExtensionActivationFailed(String, String, Int, String)

    var errorDescription: String? {
        switch self {
        case .managerNotInstalled:
            return "Cheng per-app VPN manager is not installed. Run Install / Update first."
        case .executableMissing(let path):
            return "Required executable is missing or not executable: \(path)"
        case .multipleExecutables(let label, let paths):
            return "Multiple \(label) executables found; remove stale versions first: \(paths.joined(separator: ", "))"
        case .multipleManagers(let managers):
            return "Multiple Cheng per-app VPN managers found; remove stale profiles/managers first: \(managers.joined(separator: " | "))"
        case .noUsableAppRules:
            return "No usable selected-app VPN rules could be created."
        case .invalidConfiguration(let key):
            return "Invalid Cheng per-app VPN configuration: \(key)."
        case .reloadTimedOut(let status):
            return "Timed out waiting for per-app VPN tunnel to stop before reload, status=\(status)."
        case .signatureUnavailable(let path, let status):
            return "Cannot read code signature for \(path), OSStatus=\(status)."
        case .privilegedRepairFailed(let message):
            return "Privileged Chrome policy repair failed: \(message)"
        case .systemExtensionApprovalRequired(let identifier):
            return "System Extension requires user approval before VPN can start: \(identifier). Open System Settings and approve ChengPerAppVPN."
        case .systemExtensionActivationFailed(let identifier, let domain, let code, let detail):
            return "System Extension activation failed for \(identifier): \(domain) code=\(code) \(detail)"
        }
    }
}

private final class SystemExtensionActivator: NSObject, OSSystemExtensionRequestDelegate {
    private static var active: [SystemExtensionActivator] = []
    private static let lock = NSLock()

    private let identifier: String
    private let completion: (Result<String, Error>) -> Void
    private var completed = false
    private var userApprovalRequired = false

    static func activate(identifier: String, completion: @escaping (Result<String, Error>) -> Void) {
        let activator = SystemExtensionActivator(identifier: identifier, completion: completion)
        lock.lock()
        active.append(activator)
        lock.unlock()
        activator.submit()
    }

    private init(identifier: String, completion: @escaping (Result<String, Error>) -> Void) {
        self.identifier = identifier
        self.completion = completion
        super.init()
    }

    private func submit() {
        let request = OSSystemExtensionRequest.activationRequest(
            forExtensionWithIdentifier: identifier,
            queue: .main
        )
        request.delegate = self
        OSSystemExtensionManager.shared.submitRequest(request)
    }

    private func finish(_ result: Result<String, Error>) {
        guard !completed else { return }
        completed = true
        Self.lock.lock()
        Self.active.removeAll { $0 === self }
        Self.lock.unlock()
        completion(result)
    }

    func requestNeedsUserApproval(_ request: OSSystemExtensionRequest) {
        userApprovalRequired = true
    }

    func request(_ request: OSSystemExtensionRequest,
                 actionForReplacingExtension existing: OSSystemExtensionProperties,
                 withExtension replacement: OSSystemExtensionProperties) -> OSSystemExtensionRequest.ReplacementAction {
        return .replace
    }

    func request(_ request: OSSystemExtensionRequest,
                 didFinishWithResult result: OSSystemExtensionRequest.Result) {
        let suffix: String
        switch result {
        case .completed:
            suffix = "active"
        case .willCompleteAfterReboot:
            suffix = "active after reboot"
        @unknown default:
            suffix = "active with unknown result"
        }
        finish(.success("system extension \(identifier) \(suffix)"))
    }

    func request(_ request: OSSystemExtensionRequest, didFailWithError error: Error) {
        if userApprovalRequired {
            finish(.failure(AppProxyManagerError.systemExtensionApprovalRequired(identifier)))
            return
        }
        let nsError = error as NSError
        var details: [String] = []
        if let reason = nsError.localizedFailureReason, !reason.isEmpty {
            details.append("reason=\(reason)")
        }
        if let recovery = nsError.localizedRecoverySuggestion, !recovery.isEmpty {
            details.append("recovery=\(recovery)")
        }
        if let underlying = nsError.userInfo[NSUnderlyingErrorKey] as? NSError {
            details.append("underlying=\(underlying.domain) code=\(underlying.code) \(underlying.localizedDescription)")
        }
        if details.isEmpty {
            details.append(nsError.localizedDescription)
        }
        finish(.failure(AppProxyManagerError.systemExtensionActivationFailed(
            identifier,
            nsError.domain,
            nsError.code,
            details.joined(separator: " | ")
        )))
    }
}
