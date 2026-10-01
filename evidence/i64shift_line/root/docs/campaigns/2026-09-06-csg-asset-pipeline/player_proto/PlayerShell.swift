// PlayerShell.swift — CSG 场景流「壳-核接线」演示宿主壳 (shell-core wiring v1)
// 架构: Swift 壳 spawn 纯 Cheng daemon 子进程 (ssm1_tick_daemon.exe),
//       stdin 逐行命令 / stdout 逐行应答 (task_shell_core_wire.md 协议 v1)。
//       AVPlayer 播原 mp4; 壳每 100ms 发 `tick 100` 收 STATE 行; 当核上报 fetch
//       变化时, 壳 seek AVPlayer 到该 chunk 的 startMs —— 演示「核调度驱动画面」,
//       并统计联动 seek 次数与联动延迟 (发 seek → AVPlayer time 落定)。
// 纯度定位: 本文件属宿主边界层 (AVFoundation); 纯 Cheng 核经 daemon 协议驱动本层。
// 编译: swiftc PlayerShell.swift -o PlayerShell
// 用法: PlayerShell <原视频mp4> <stream.ssm1> [daemon路径]
//       daemon路径缺省: artifacts/csg_asset_pipeline/ssm1_tick_daemon.exe

import AVFoundation
import Foundation

// MARK: - 时间基与日志 (wall = 进程内单调相对秒, 复用 player_proto 口径)

let kStart = ProcessInfo.processInfo.systemUptime
func wall() -> Double { ProcessInfo.processInfo.systemUptime - kStart }
func logLine(_ s: String) { print(String(format: "[%8.3fs] ", wall()) + s); fflush(stdout) }

// MARK: - SSM1 chunk 表 (壳侧轻解析, 只取每 chunk startMs; 布局见 manifest.cheng:
//        magic"SSM1"+ver u32+count u32 + 每条目 startMs i64|durMs i64|kf u8|
//        cidLen u32|cid|payloadLen i64|payloadOffset i64, 全小端)

struct Ssm1Table {
    let chunkCount: Int
    let startMs: [Int64]

    static func load(_ path: String) -> Ssm1Table? {
        guard let data = FileManager.default.contents(atPath: path) else { return nil }
        let b = [UInt8](data)
        guard b.count > 12 else { return nil }
        func u32(_ o: Int) -> Int {
            Int(b[o]) | (Int(b[o + 1]) << 8) | (Int(b[o + 2]) << 16) | (Int(b[o + 3]) << 24)
        }
        func i64(_ o: Int) -> Int64 {
            var v: Int64 = 0
            for k in 0..<8 { v |= Int64(b[o + k]) << (8 * k) }
            return v
        }
        guard b[0] == UInt8(ascii: "S"), b[1] == UInt8(ascii: "S"),
              b[2] == UInt8(ascii: "M"), b[3] == UInt8(ascii: "1"),
              u32(4) == 1 else { return nil }
        let count = u32(8)
        var starts: [Int64] = []
        var off = 12
        for _ in 0..<count {
            guard off + 17 <= b.count else { return nil }
            starts.append(i64(off))
            let cidLen = u32(off + 17)
            off += 17 + 4 + cidLen + 16
        }
        return Ssm1Table(chunkCount: count, startMs: starts)
    }
}

// MARK: - daemon 子进程 (stdin 命令 / stdout 逐行应答, 每命令恰一行)

final class Daemon {
    let proc: Process
    let stdin: FileHandle
    let stdout: FileHandle

    init(path: String) throws {
        proc = Process()
        proc.executableURL = URL(fileURLWithPath: path)
        let inPipe = Pipe()
        let outPipe = Pipe()
        proc.standardInput = inPipe
        proc.standardOutput = outPipe
        proc.standardError = FileHandle.nullDevice
        try proc.run()
        stdin = inPipe.fileHandleForWriting
        stdout = outPipe.fileHandleForReading
    }

    func send(_ line: String) {
        stdin.write((line + "\n").data(using: .utf8)!)
    }

    /// 读一行应答; EOF/断管回 nil
    func readReply() -> String? {
        var bytes: [UInt8] = []
        while true {
            let d = stdout.readData(ofLength: 1)
            guard d.count == 1 else { break }
            let ch = d[d.startIndex]
            if ch == 0x0A { return String(bytes: bytes, encoding: .utf8) ?? "" }
            if ch != 0x0D { bytes.append(ch) }
        }
        return bytes.isEmpty ? nil : String(bytes: bytes, encoding: .utf8)
    }

    /// 发一条命令并取回那一行应答
    func request(_ cmd: String) -> String? {
        send(cmd)
        return readReply()
    }
}

// MARK: - STATE 行解析
// STATE posMs=<p> playing=<0|1> rate=<r> eof=<0|1> fetch=<i> bufferedTo=<b> pre=<...>

struct CoreState {
    var posMs: Int64 = 0
    var playing = false
    var rate: Int64 = 10
    var eof = false
    var fetch: Int64 = -1
    var bufferedTo: Int64 = 0

    static func parse(_ line: String) -> CoreState? {
        guard line.hasPrefix("STATE") else { return nil }
        var s = CoreState()
        for tok in line.split(separator: " ") {
            let kv = tok.split(separator: "=", maxSplits: 1)
            guard kv.count == 2 else { continue }
            let v = String(kv[1])
            switch kv[0] {
            case "posMs": s.posMs = Int64(v) ?? 0
            case "playing": s.playing = (v == "1")
            case "rate": s.rate = Int64(v) ?? 0
            case "eof": s.eof = (v == "1")
            case "fetch": s.fetch = Int64(v) ?? -1
            case "bufferedTo": s.bufferedTo = Int64(v) ?? 0
            default: break
            }
        }
        return s
    }
}

// MARK: - 壳主体

final class Shell {
    let ssm1Path: String
    let table: Ssm1Table
    let daemon: Daemon
    let player: AVPlayer

    var ticks = 0
    var lastFetch: Int64 = -1
    var linkSeeks = 0
    var latenciesMs: [Double] = []
    var eofConfirmed = false

    init(mp4Path: String, ssm1Path: String, table: Ssm1Table, daemon: Daemon) {
        self.ssm1Path = ssm1Path
        self.table = table
        self.daemon = daemon
        let asset = AVURLAsset(url: URL(fileURLWithPath: mp4Path))
        let item = AVPlayerItem(asset: asset)
        player = AVPlayer(playerItem: item)
        player.actionAtItemEnd = .pause
        item.audioTimePitchAlgorithm = .timeDomain
    }

    /// 泵主 RunLoop 固定 wall 时长 (headless 驱动原语, 同 player_proto)
    func pump(_ seconds: Double) {
        let deadline = wall() + seconds
        while wall() < deadline {
            _ = RunLoop.main.run(mode: .default,
                                 before: Date(timeIntervalSinceNow: min(0.02, max(0.001, deadline - wall()))))
        }
    }

    func waitUpTo(_ timeout: Double, _ cond: () -> Bool) -> Bool {
        let deadline = wall() + timeout
        while !cond() {
            if wall() >= deadline { return false }
            _ = RunLoop.main.run(mode: .default,
                                 before: Date(timeIntervalSinceNow: 0.005))
        }
        return true
    }

    /// 联动 seek: 发 seek → AVPlayer time 落定 (completion 主线程回执) 的 wall 延迟
    func linkageSeek(chunkIndex: Int64, targetMs: Int64) {
        let tSend = wall()
        var done = false
        var landed = Double.nan
        player.seek(to: CMTime(seconds: Double(targetMs) / 1000.0, preferredTimescale: 600),
                    toleranceBefore: .zero, toleranceAfter: .zero) { _ in
            DispatchQueue.main.async {
                landed = CMTimeGetSeconds(self.player.currentTime())
                done = true
            }
        }
        let ok = waitUpTo(5.0) { done }
        linkSeeks += 1
        if ok {
            let lat = (wall() - tSend) * 1000.0
            latenciesMs.append(lat)
            logLine(String(format: "LINK seek#%d chunk=%lld -> AVPlayer target=%.3fs landedPts=%.4fs latency=%.1fms",
                           linkSeeks, chunkIndex, Double(targetMs) / 1000.0, landed, lat))
        } else {
            logLine("LINK seek#\(linkSeeks) chunk=\(chunkIndex) 5s 未完成（超时，如实报告）")
        }
    }

    func run() {
        logLine("=== PlayerShell: mp4 + \(ssm1Path) chunks=\(table.chunkCount) ===")

        // 1) daemon 握手: init(bufWindow=2000) + play
        let r1Opt = daemon.request("init \(ssm1Path) 2000")
        guard let r1 = r1Opt, r1.hasPrefix("OK init") else {
            logLine("FATAL daemon init 应答异常: \(r1Opt ?? "<nil>")")
            exit(3)
        }
        logLine("DAEMON " + r1)
        let r2Opt = daemon.request("play")
        guard let r2 = r2Opt, r2.hasPrefix("OK") else {
            logLine("FATAL daemon play 应答异常: \(r2Opt ?? "<nil>")")
            exit(3)
        }
        logLine("DAEMON " + r2)

        // 2) AVPlayer 播原 mp4 + 100ms 节拍 tick 循环
        player.play()
        logLine("CMD AVPlayer.play() + 每100ms tick 100")
        var nextTick = wall() + 0.1
        while true {
            pump(max(0, nextTick - wall()))
            nextTick += 0.1
            let repOpt = daemon.request("tick 100")
            guard let rep = repOpt, let st = CoreState.parse(rep) else {
                logLine("FATAL tick 应答异常: \(repOpt ?? "<nil>")")
                break
            }
            ticks += 1
            let valid = st.fetch >= 0 && st.fetch < Int64(table.chunkCount)
            let chunkStart: Int64 = valid ? table.startMs[Int(st.fetch)] : -1
            logLine(String(format: "SHELL t=%7.3f posMs=%5lld fetch=%2lld chunkStartMs=%5lld bufferedTo=%5lld eof=%d",
                           wall(), st.posMs, st.fetch, chunkStart, st.bufferedTo, st.eof ? 1 : 0))
            // 3) 核调度 → 画面联动: fetch 变化即 seek AVPlayer 到该 chunk 起点
            if st.fetch != lastFetch, valid {
                linkageSeek(chunkIndex: st.fetch, targetMs: chunkStart)
                lastFetch = st.fetch
            }
            if st.eof {
                eofConfirmed = true
                break
            }
        }

        // 4) 收尾: quit daemon, 等 rc
        daemon.send("quit")
        daemon.stdin.closeFile()
        let exited = waitUpTo(5.0) { !daemon.proc.isRunning }
        let rc = exited ? daemon.proc.terminationStatus : -1

        // 5) 汇总
        print("\n---- 演示汇总 (壳-核接线) ----")
        print("总 tick 数: \(ticks)")
        print("联动 seek 次数: \(linkSeeks)")
        if !latenciesMs.isEmpty {
            let sorted = latenciesMs.sorted()
            let median = sorted.count % 2 == 1
                ? sorted[sorted.count / 2]
                : (sorted[sorted.count / 2 - 1] + sorted[sorted.count / 2]) / 2.0
            print(String(format: "联动延迟中位: %.1fms (min=%.1f max=%.1f n=%d)",
                         median, sorted.first!, sorted.last!, sorted.count))
        }
        print("daemon eof=1 确认: \(eofConfirmed)")
        print("daemon 退出 rc: \(rc)")
        logLine("=== PlayerShell 完成 ===")
        if !eofConfirmed || rc != 0 { exit(1) }
    }
}

// MARK: - 入口

let args = CommandLine.arguments
guard args.count >= 3 else {
    print("usage: PlayerShell <原视频mp4> <stream.ssm1> [daemon路径]")
    exit(2)
}
let mp4Path = args[1]
let ssm1Path = args[2]
let daemonPath = args.count >= 4 ? args[3] : "artifacts/csg_asset_pipeline/ssm1_tick_daemon.exe"

guard let table = Ssm1Table.load(ssm1Path) else {
    print("FATAL: SSM1 解析失败 (\(ssm1Path))")
    exit(3)
}
do {
    let daemon = try Daemon(path: daemonPath)
    Shell(mp4Path: mp4Path, ssm1Path: ssm1Path, table: table, daemon: daemon).run()
} catch {
    print("FATAL: daemon 启动失败 (\(daemonPath)): \(error)")
    exit(3)
}
