// player_proto.swift — 「存量视频→CSG 世界」战役播放器原型
// 用途：实测 AVFoundation 播放四控制（play / pause / setRate / seek）的时序行为，产出协议设计数字。
// 纯度定位：本文件属宿主边界层（平台 AVFoundation/VideoToolbox 解码），
//          纯 Cheng 核心将来只通过 task_player_shell.md 定义的控制协议驱动本层，纯度=提交侧（对齐 gpuros 先例）。
// 编译：swiftc player_proto.swift -o player_proto
// 用法：./player_proto <本地mp4路径>
// headless：无窗口无 layer；首帧证据用 AVPlayerItemVideoOutput 的解码像素缓冲 + 100ms periodic time observer。
//          （若 AVPlayer headless 不可用，任务要求退化 AVAssetReader 测吞吐并文档记录——本版本实测 AVPlayer 正常，未触发退化。）

import AVFoundation
import Foundation

// MARK: - 时间基与日志（wall = 进程内单调相对秒）

let kStart = ProcessInfo.processInfo.systemUptime
func wall() -> Double { ProcessInfo.processInfo.systemUptime - kStart }
func logLine(_ s: String) { print(String(format: "[%8.3fs] ", wall()) + s); fflush(stdout) }

final class Probe {
    let path: String
    let asset: AVURLAsset
    let item: AVPlayerItem
    let player: AVPlayer
    let videoOutput: AVPlayerItemVideoOutput

    var timeObserver: Any?
    var statusObs: NSKeyValueObservation?
    var ncToken: NSObjectProtocol?

    // 测量状态
    let t0 = wall()              // 进程内资产构造基准（open 口径起点）
    var tReady: Double?          // item status == .readyToPlay 时刻
    var playStartWall: Double?   // 最近一次 play() 调用时刻
    var firstFrameLogged = false // 首块解码像素缓冲已记录
    var eofWall: Double?         // AVPlayerItemDidPlayToEndTime 时刻
    var lastPTS = Double.nan     // 上一 tick 的 PTS（斜率用）
    var lastTickWall = Double.nan
    var results: [String] = []   // 汇总用

    init(path: String) {
        self.path = path
        asset = AVURLAsset(url: URL(fileURLWithPath: path))
        item = AVPlayerItem(asset: asset)
        player = AVPlayer(playerItem: item)
        player.actionAtItemEnd = .pause
        videoOutput = AVPlayerItemVideoOutput(pixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
        ])
        item.add(videoOutput)
    }

    // MARK: 小工具

    func result(_ s: String) {
        logLine("RESULT " + s)
        results.append(s)
    }

    /// 驱动 main RunLoop 直到条件成立或超时（headless 脚本化执行的核心等待原语）
    @discardableResult
    func waitUntil(timeout: Double, _ cond: @escaping () -> Bool) -> Bool {
        let deadline = wall() + timeout
        while !cond() {
            let remain = deadline - wall()
            if remain <= 0 { return false }
            _ = RunLoop.main.run(mode: .default, before: Date(timeIntervalSinceNow: min(0.05, max(0.001, remain))))
        }
        return true
    }

    /// 驱动 main RunLoop 固定 wall 时长
    func waitWall(_ d: Double) {
        let deadline = wall() + d
        while wall() < deadline {
            _ = RunLoop.main.run(mode: .default, before: Date(timeIntervalSinceNow: min(0.05, max(0.001, deadline - wall()))))
        }
    }

    /// 暂停态下拉一帧解码像素缓冲（seek 后出帧证据）
    func pullFrame() -> Bool {
        videoOutput.copyPixelBuffer(forItemTime: player.currentTime(), itemTimeForDisplay: nil) != nil
    }

    // MARK: 阶段 0：资产信息 + 音频变速算法

    func loadDuration() -> Double {
        let sem = DispatchSemaphore(value: 0)
        var d = 0.0
        Task.detached {
            if let t = try? await self.asset.load(.duration) { d = CMTimeGetSeconds(t) }
            sem.signal()
        }
        sem.wait()
        return d
    }

    func printPitchInfo() {
        print("---- AVAudioTimePitchAlgorithm 可选值 ----")
        // 注：iOS 独有的 .lowQualityZeroLatency（已 iOS15 弃用）在 macOS 标记 API_UNAVAILABLE，仅列出字符串供对照。
        print("  lowQualityZeroLatency = \"lowQualityZeroLatency\" (iOS-only, macOS 不可用)")
        let algos: [(String, AVAudioTimePitchAlgorithm)] = [
            ("varispeed", .varispeed),
            ("timeDomain", .timeDomain),
            ("spectral", .spectral),
        ]
        for (name, a) in algos { print("  \(name) = \"\(a.rawValue)\"") }
        print("  系统默认 = \"\(item.audioTimePitchAlgorithm.rawValue)\"")
        // 选型（quality 默认）：.timeDomain 是 Apple 指定的质量档默认——0.5x~2.0x 范围内变速不变调、
        // 质量/开销均衡，覆盖本战役 setRate(2.0) 场景；.spectral 质量最高但开销大，仅 >2x 或音乐
        // 保真场景才值得；.varispeed（系统默认）不做音高校正，rate≈1.0 时最省；.lowQualityZeroLatency 只适合语音。
        item.audioTimePitchAlgorithm = .timeDomain
        print("  本原型选择 = \"\(item.audioTimePitchAlgorithm.rawValue)\" (timeDomain)")
    }

    // MARK: 常驻观察器

    func installObservers() {
        // item 状态 → readyToPlay（秒开基线口径之一）
        statusObs = item.observe(\.status, options: [.initial, .new]) { [weak self] it, _ in
            DispatchQueue.main.async {
                guard let self, self.tReady == nil else { return }
                if it.status == .readyToPlay {
                    self.tReady = wall()
                    logLine(String(format: "EVENT readyToPlay (open→ready=%.1fms)", (self.tReady! - 0.0) * 1000))
                } else if it.status == .failed {
                    logLine("EVENT itemFailed \(String(describing: it.error))")
                }
            }
        }
        // 100ms periodic time observer（真实 PTS 时间线 + 有效倍速斜率）
        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(value: 1, timescale: 10), queue: .main) { [weak self] time in
            guard let self else { return }
            let pts = CMTimeGetSeconds(time)
            let w = wall()
            var slope = 0.0
            if !self.lastPTS.isNaN, w - self.lastTickWall > 0.001 {
                slope = (pts - self.lastPTS) / (w - self.lastTickWall)
            }
            print(String(format: "[%8.3fs] tick pts=%.4f effRate=%.2f", w, pts, slope))
            self.lastPTS = pts
            self.lastTickWall = w
            // 首块解码像素缓冲 = headless 首帧证据
            if !self.firstFrameLogged,
               self.videoOutput.copyPixelBuffer(forItemTime: time, itemTimeForDisplay: nil) != nil {
                self.firstFrameLogged = true
                let relOpen = (w - self.t0) * 1000
                let relPlay = self.playStartWall.map { String(format: "%.1fms", (w - $0) * 1000) } ?? "尚未play(帧先于play就绪)"
                logLine(String(format: "EVENT firstDecodedFrame pts=%.4f relOpen=%.1fms relPlay=%@", pts, relOpen, relPlay))
            }
        }
        // EOF 通知
        ncToken = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            guard let self else { return }
            self.eofWall = wall()
            logLine("EVENT AVPlayerItemDidPlayToEndTime")
        }
    }

    // MARK: 阶段 1：play 2s

    func phasePlay2s() {
        playStartWall = wall()
        logLine("CMD play() rate=1.0")
        player.play()
        let got = waitUntil(timeout: 5) { self.firstFrameLogged }
        if got, let ps = playStartWall {
            result(String(format: "首帧: open→首块解码帧=%.1fms（play→帧=%@）",
                          (wall() - t0) * 1000,
                          wall() >= ps ? String(format: "%.1fms", (wall() - ps) * 1000) : "帧先于play就绪"))
        } else {
            result("首帧: play 后 5s 内未取到解码像素缓冲（headless 证据缺失，如实报告）")
        }
        waitWall(2.0)
        logLine("CMD pause() 前 pts=" + String(format: "%.4f", CMTimeGetSeconds(player.currentTime())))
    }

    // MARK: 阶段 2：pause + 20ms 采样测延迟

    func phasePause() {
        let tCmd = wall()
        logLine("CMD pause()")
        player.pause()
        var samples: [(Double, Double, Double)] = [] // (wall-tCmd, rate, pts)
        let timer = Timer.scheduledTimer(withTimeInterval: 0.02, repeats: true) { [weak self] _ in
            guard let self else { return }
            samples.append((wall() - tCmd, Double(self.player.rate), CMTimeGetSeconds(self.player.currentTime())))
        }
        waitWall(0.5)
        timer.invalidate()
        let ack = samples.first { $0.1 == 0 }?.0
        var ptsStop: Double?
        if samples.count > 1 {
            for i in (1 ..< samples.count).reversed() where samples[i].2 != samples[i - 1].2 {
                ptsStop = samples[i].0
                break
            }
        }
        let ptsStopStr = ptsStop.map { String(format: "%.1fms", $0 * 1000) } ?? "<20ms(采样窗内PTS已无变化,冻结早于首采样)"
        result(String(format: "pause延迟: rate==0确认=%.1fms, PTS停走=%@ (20ms采样)",
                      (ack ?? -1) * 1000, ptsStopStr))
        waitWall(0.2)
    }

    // MARK: 阶段 3：setRate(2.0) + 采样测生效延迟

    func phaseRate2() {
        let tCmd = wall()
        logLine("CMD setRate(2.0)（暂停态直接置 rate，等效 setRate+play）")
        player.rate = 2.0
        var samples: [(Double, Double)] = [] // (wall-tCmd, pts)
        let timer = Timer.scheduledTimer(withTimeInterval: 0.02, repeats: true) { [weak self] _ in
            guard let self else { return }
            samples.append((wall() - tCmd, CMTimeGetSeconds(self.player.currentTime())))
        }
        waitWall(0.8)
        timer.invalidate()
        // 生效判定：连续两个采样间隔（40ms 滑窗）内 PTS 斜率首次 ≥1.85 即认为 2x 生效
        // （24fps 下 2x 的 PTS 步进约 20.8ms，20ms 单步斜率噪声大，40ms 窗稳定）
        var actLat: Double?
        if samples.count >= 3 {
            for j in 2 ..< samples.count {
                let dt = samples[j].0 - samples[j - 2].0
                if dt > 0.01, (samples[j].1 - samples[j - 2].1) / dt >= 1.85 {
                    actLat = samples[j].0
                    break
                }
            }
        }
        let actStr = actLat.map { String(format: "%.1fms", $0 * 1000) } ?? "0.8s 采样窗内未达 1.85 斜率"
        result(String(format: "倍速切换延迟: setRate(2.0)→40ms窗PTS斜率≥1.85 = %@ (20ms采样)", actStr))
        waitWall(2.0 - 0.8 + 0.5) // 2x 状态总驻留 ~2s wall（PTS 前进 ~4s）
        logLine("CMD pause()（seek 前归零状态）")
        player.pause()
        waitWall(0.3)
    }

    // MARK: 阶段 4：seek 电量组（暂停态， completion 计时 + 出帧计时）

    func phaseSeeks(duration: Double) {
        let kfBefore = 24.0 * (1208.333 / 1000.0) // 29.0s：中点前最近关键帧（GOP≈1.2083s，ffprobe 实测）
        let midGOP = duration / 2.0               // 30.005s：GOP 中部任意点（关键帧后 ~20 帧）
        func runSeek(_ name: String, target: Double, tolB: CMTime, tolA: CMTime) {
            let tCmd = wall()
            var doneW = Double.nan, landed = Double.nan
            let tb = tolB.isNumeric ? String(format: "%.0fms", CMTimeGetSeconds(tolB) * 1000) : "∞"
            let ta = tolA.isNumeric ? String(format: "%.0fms", CMTimeGetSeconds(tolA) * 1000) : "∞"
            logLine(String(format: "CMD seek(%@, target=%.4f, tolB=%@, tolA=%@)", name, target, tb, ta))
            player.seek(to: CMTime(seconds: target, preferredTimescale: 600),
                       toleranceBefore: tolB, toleranceAfter: tolA) { _ in
                DispatchQueue.main.async {
                    doneW = wall()
                    landed = CMTimeGetSeconds(self.player.currentTime())
                }
            }
            let ok = waitUntil(timeout: 10) { !doneW.isNaN }
            guard ok else {
                result("seek \(name): 10s 未完成（超时，如实报告）")
                return
            }
            result(String(format: "seek[%@] target=%.3f: completion=%.1fms landedPts=%.4f(偏差=%+.1fms)",
                          name, target, (doneW - tCmd) * 1000, landed, (landed - target) * 1000))
            let got = waitUntil(timeout: 3) { self.pullFrame() }
            if got {
                result(String(format: "seek[%@] 出帧(含completion后首块解码缓冲)=%.1fms", name, (wall() - tCmd) * 1000))
            } else {
                result(String(format: "seek[%@] 暂停态3s内未交付像素缓冲，以 completion 为延迟口径", name))
            }
            waitWall(0.2)
        }
        // 关键帧 vs 任意点：各测两次（首测≈冷，复测≈暖缓存）
        runSeek("exactKeyframe#1", target: kfBefore, tolB: .zero, tolA: .zero)
        runSeek("exactKeyframe#2", target: kfBefore, tolB: .zero, tolA: .zero)
        runSeek("exactMidGOP#1", target: midGOP, tolB: .zero, tolA: .zero)
        runSeek("exactMidGOP#2", target: midGOP, tolB: .zero, tolA: .zero)
        runSeek("snapKeyframe#1", target: duration / 2.0, tolB: .positiveInfinity, tolA: .positiveInfinity)
        runSeek("snapKeyframe#2", target: duration / 2.0, tolB: .positiveInfinity, tolA: .positiveInfinity)
    }

    // MARK: 阶段 5：play → EOF（近末端点，1s 内可达）

    func phaseEof(duration: Double) {
        let near = max(0, duration - 1.0)
        // 协议脚本口径：seek 中点后 play 1s→EOF；60s 资产无法 1s 播完，
        // 故 seek 到 duration-1.0 处 play，EOF 链路（通知/终态）时序等价可测，文档注明口径差异。
        phasePlayTail(target: near, name: "nearEnd")
        let tPlay0 = wall()
        logLine("CMD play() → 等待 EOF")
        player.play()
        waitUntil(timeout: 10) { self.eofWall != nil }
        if let e = eofWall {
            result(String(format: "EOF: play→didPlayToEnd=%.3fs 终态pts=%.4f(duration=%.4f) timeControlStatus=%d(0=paused)",
                          e - tPlay0, CMTimeGetSeconds(player.currentTime()), duration, player.timeControlStatus.rawValue))
        } else {
            result("EOF: play 后 10s 未收到 AVPlayerItemDidPlayToEndTime（如实报告）")
        }
    }

    func phasePlayTail(target: Double, name: String) {
        let tCmd = wall()
        var doneW = Double.nan
        player.seek(to: CMTime(seconds: target, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) { _ in
            DispatchQueue.main.async { doneW = wall() }
        }
        _ = waitUntil(timeout: 10) { !doneW.isNaN }
        result(String(format: "seek[%@] target=%.3f: completion=%.1fms", name, target, (doneW - tCmd) * 1000))
    }

    // MARK: 收尾

    func teardown() {
        player.pause()
        if let to = timeObserver { player.removeTimeObserver(to) }
        statusObs?.invalidate()
        if let n = ncToken { NotificationCenter.default.removeObserver(n) }
        print("\n---- 汇总（本轮实测数字） ----")
        for (i, r) in results.enumerated() { print(String(format: "%2d. %@", i + 1, r)) }
        logLine("=== teardown 完成 ===")
    }

    // MARK: 主脚本

    func run() {
        print("=== player_proto: \(path) ===")
        print("平台: macOS \(ProcessInfo.processInfo.operatingSystemVersionString), arm64, headless(无窗口)")
        printPitchInfo()
        let duration = loadDuration()
        guard duration > 0 else {
            logLine("FATAL: 资产 duration 加载失败（\(path)）")
            exit(3)
        }
        logLine(String(format: "INFO duration=%.4fs", duration))
        installObservers()

        // 阶段 0：open（口径：进程启动资产构造 → item readyToPlay）
        let ready = waitUntil(timeout: 10) { self.tReady != nil }
        if ready, let r = tReady {
            result(String(format: "秒开基线: open→readyToPlay=%.1fms", (r - t0) * 1000))
        } else {
            result("秒开基线: 10s 内未 readyToPlay（失败，如实报告）")
        }

        // 阶段 1：play 2s
        phasePlay2s()
        // 阶段 2：pause
        phasePause()
        // 阶段 3：setRate(2.0) 播 2s
        phaseRate2()
        // 阶段 4：seek 组（关键帧 vs GOP 中部 vs 关键帧吸附，各冷/热两次）
        phaseSeeks(duration: duration)
        // 阶段 5：近末端 seek → play → EOF
        phaseEof(duration: duration)

        teardown()
    }
}

// MARK: - 入口

let args = CommandLine.arguments
guard args.count >= 2 else {
    print("usage: player_proto <本地mp4路径>")
    exit(2)
}
Probe(path: args[1]).run()
