import AppKit

@main
enum ChengPerAppVPNApplication {
    private static var delegate: AppDelegate?
    private static let commandTimeoutSeconds = 120

    static func main() {
        if CommandLine.arguments.contains("--self-test-cli") {
            print("cheng_per_app_vpn_cli_ready=1")
            return
        }
        if CommandLine.arguments.contains("--install-start") {
            runCommandLineInstallStart()
            return
        }
        if CommandLine.arguments.contains("--repair") {
            runCommandLineRepair()
            return
        }
        if CommandLine.arguments.contains("--repair-chrome-system-proxy") {
            runCommandLineChromeSystemProxyRepair()
            return
        }
        if CommandLine.arguments.contains("--start") {
            runCommandLineStart()
            return
        }
        if CommandLine.arguments.contains("--stop") {
            runCommandLineStop()
            return
        }
        if CommandLine.arguments.contains("--status") {
            runCommandLineStatus()
            return
        }
        if CommandLine.arguments.contains("--targets") {
            runCommandLineTargets()
            return
        }
        if CommandLine.arguments.contains("--apply-targets") {
            runCommandLineApplyTargets()
            return
        }
        if CommandLine.arguments.contains("--remove") {
            runCommandLineRemove()
            return
        }

        let appDelegate = AppDelegate(
            autostart: CommandLine.arguments.contains("--gui-autostart")
        )
        delegate = appDelegate
        let app = NSApplication.shared
        app.delegate = appDelegate
        app.setActivationPolicy(.accessory)
        app.run()
    }

    private static func runCommandLineInstallStart() {
        let manager = AppProxyManager()
        runCommandLineOperation("install-start") { finish in
            manager.installOrUpdate { installResult in
                switch installResult {
                case .failure(let error):
                    print("[install] ERROR: \(error.localizedDescription)")
                    finish(1)
                case .success(let message):
                    print("[install] \(message)")
                    manager.refreshRulesAndStart { startResult in
                        switch startResult {
                        case .success(let message):
                            print("[start] \(message)")
                            finish(0)
                        case .failure(let error):
                            print("[start] ERROR: \(error.localizedDescription)")
                            finish(1)
                        }
                    }
                }
            }
        }
    }

    private static func runCommandLineRepair() {
        let manager = AppProxyManager()
        runCommandLineOperation("repair") { finish in
            manager.installOrUpdate { installResult in
                switch installResult {
                case .failure(let error):
                    print("[repair] ERROR: \(error.localizedDescription)")
                    finish(1)
                case .success(let message):
                    print("[repair] \(message)")
                    manager.refreshRulesAndStart { startResult in
                        switch startResult {
                        case .failure(let error):
                            print("[repair] ERROR: \(error.localizedDescription)")
                            finish(1)
                        case .success(let startMessage):
                            print("[repair] \(startMessage)")
                            manager.status { statusResult in
                                switch statusResult {
                                case .success(let status):
                                    print(status)
                                    finish(0)
                                case .failure(let error):
                                    print("[repair] ERROR: \(error.localizedDescription)")
                                    finish(1)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private static func runCommandLineChromeSystemProxyRepair() {
        let manager = AppProxyManager()
        runCommandLineOperation("repair-chrome-system-proxy") { finish in
            manager.repairChromeSystemProxyIfNeeded { result in
                switch result {
                case .success(let message):
                    print("[repair-chrome-system-proxy] \(message)")
                    finish(0)
                case .failure(let error):
                    print("[repair-chrome-system-proxy] ERROR: \(error.localizedDescription)")
                    finish(1)
                }
            }
        }
    }

    private static func runCommandLineStart() {
        let manager = AppProxyManager()
        runCommandLineOperation("start") { finish in
            manager.refreshRulesAndStart { startResult in
                switch startResult {
                case .success(let message):
                    print("[start] \(message)")
                    finish(0)
                case .failure(let error):
                    print("[start] ERROR: \(error.localizedDescription)")
                    finish(1)
                }
            }
        }
    }

    private static func runCommandLineStop() {
        let manager = AppProxyManager()
        runCommandLineOperation("stop") { finish in
            manager.stop { stopResult in
                switch stopResult {
                case .success(let message):
                    print("[stop] \(message)")
                    finish(0)
                case .failure(let error):
                    print("[stop] ERROR: \(error.localizedDescription)")
                    finish(1)
                }
            }
        }
    }

    private static func runCommandLineStatus() {
        let manager = AppProxyManager()
        runCommandLineOperation("status") { finish in
            manager.status { result in
                switch result {
                case .success(let message):
                    print(message)
                    finish(0)
                case .failure(let error):
                    print("[status] ERROR: \(error.localizedDescription)")
                    finish(1)
                }
            }
        }
    }

    private static func runCommandLineTargets() {
        for line in AppProxyManager.targetInventoryLines() {
            print("[targets] \(line)")
        }
        exit(0)
    }

    private static func runCommandLineApplyTargets() {
        let manager = AppProxyManager()
        runCommandLineOperation("apply-targets") { finish in
            manager.applyTargetsLive { result in
                switch result {
                case .success(let message):
                    print("[apply-targets] \(message)")
                    finish(0)
                case .failure(let error):
                    print("[apply-targets] ERROR: \(error.localizedDescription)")
                    finish(1)
                }
            }
        }
    }

    private static func runCommandLineRemove() {
        let manager = AppProxyManager()
        runCommandLineOperation("remove") { finish in
            manager.remove { result in
                switch result {
                case .success(let message):
                    print("[remove] \(message)")
                    finish(0)
                case .failure(let error):
                    print("[remove] ERROR: \(error.localizedDescription)")
                    finish(1)
                }
            }
        }
    }

    private static func runCommandLineOperation(
        _ name: String,
        operation: (@escaping (Int32) -> Void) -> Void
    ) {
        let runLoop = CFRunLoopGetCurrent()
        let lock = NSLock()
        var finished = false
        var exitCode: Int32 = 0

        func finish(_ code: Int32) {
            lock.lock()
            if !finished {
                finished = true
                exitCode = code
                CFRunLoopStop(runLoop)
                CFRunLoopWakeUp(runLoop)
            }
            lock.unlock()
        }

        let timer = CFRunLoopTimerCreateWithHandler(
            kCFAllocatorDefault,
            CFAbsoluteTimeGetCurrent() + CFTimeInterval(commandTimeoutSeconds),
            0,
            0,
            0
        ) { _ in
            print("[\(name)] ERROR: timed out after \(commandTimeoutSeconds)s")
            finish(2)
        }
        CFRunLoopAddTimer(runLoop, timer, .defaultMode)

        operation { code in
            finish(code)
        }

        var shouldExit = false
        repeat {
            lock.lock()
            shouldExit = finished
            lock.unlock()
            if !shouldExit {
                CFRunLoopRun()
            }
        } while !shouldExit

        CFRunLoopTimerInvalidate(timer)
        exit(exitCode)
    }
}
