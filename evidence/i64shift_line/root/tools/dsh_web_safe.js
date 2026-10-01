#!/usr/bin/env node
// DSH web 高峰守护：DeepSeek API 高峰时段（北京时间 09:00-12:00、14:00-18:00）自动终止，
// 高峰结束后自动重新启动。空闲时段持续跑任务，循环往复。
// 用法：node tools/dsh_web_safe.js [dsh 参数...]   （默认 web）
//       node tools/dsh_web_safe.js --dry-run     只打印当前时段判断，不启动

const { spawn } = require('child_process');

const PEAK_WINDOWS = [[9, 12], [14, 18]]; // [startHour, endHour) 北京时间

function nowBeijing() {
  const d = new Date();
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60_000;
  return new Date(utcMs + 8 * 60 * 60_000);
}

function minuteOfDay() {
  const d = nowBeijing();
  return d.getHours() * 60 + d.getMinutes();
}

function isPeak() {
  const m = minuteOfDay();
  return PEAK_WINDOWS.some(([s, e]) => m >= s * 60 && m < e * 60);
}

// 处于高峰时：距当前高峰窗口结束的毫秒数
function msUntilPeakEnd() {
  const d = nowBeijing();
  const m = d.getHours() * 60 + d.getMinutes();
  for (const [s, e] of PEAK_WINDOWS) {
    if (m >= s * 60 && m < e * 60) {
      return (e * 60 - m) * 60_000 - d.getSeconds() * 1000 - d.getMilliseconds();
    }
  }
  return 0;
}

// 处于空闲时：距下次高峰开始的毫秒数
function msUntilNextPeakStart() {
  const d = nowBeijing();
  const m = d.getHours() * 60 + d.getMinutes();
  const todayStarts = PEAK_WINDOWS.map(([s]) => s * 60).filter((s) => s > m);
  const nextStart = todayStarts.length
    ? todayStarts[0]
    : PEAK_WINDOWS[0][0] * 60 + 24 * 60;
  return (nextStart - m) * 60_000 - d.getSeconds() * 1000 - d.getMilliseconds();
}

function formatTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtBeijingMsFromNow(ms) {
  return formatTime(new Date(nowBeijing().getTime() + ms));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--dry-run')) {
    const peak = isPeak();
    console.log(`[dsh-guard] 北京时间 ${formatTime(nowBeijing())}，当前${peak ? '处于' : '不在'}高峰时段。`);
    console.log(peak
      ? `[dsh-guard] 将于 ${fmtBeijingMsFromNow(msUntilPeakEnd())} 启动 dsh。`
      : `[dsh-guard] 立即启动 dsh，${fmtBeijingMsFromNow(msUntilNextPeakStart())} 自动终止。`);
    return;
  }

  const dshArgs = args.length > 0 ? args : ['web'];
  let child = null;

  function killChild() {
    return new Promise((resolve) => {
      if (!child || child.exitCode !== null || child.signalCode !== null) return resolve();
      child.once('exit', () => resolve());
      child.kill('SIGTERM');
      setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* 已退出 */ } }, 5000);
    });
  }

  process.on('SIGINT', async () => {
    await killChild();
    process.exit(130);
  });
  process.on('SIGTERM', async () => {
    await killChild();
    process.exit(143);
  });

  (async () => {
    for (;;) {
      if (isPeak()) {
        console.log(`[dsh-guard] 高峰时段，暂停运行，将于 ${fmtBeijingMsFromNow(msUntilPeakEnd())} 自动启动。`);
        await sleep(msUntilPeakEnd());
        continue;
      }

      const peakIn = msUntilNextPeakStart();
      console.log(`[dsh-guard] 启动 dsh ${dshArgs.join(' ')}，${fmtBeijingMsFromNow(peakIn)} 高峰开始自动终止。`);
      child = spawn('npx', ['@deepseek-ai/dsh', ...dshArgs], { stdio: 'inherit', shell: false });

      const result = await Promise.race([
        new Promise((resolve) => {
          child.once('exit', (code, signal) => resolve({ kind: 'exit', code, signal }));
          child.once('error', (err) => resolve({ kind: 'error', err }));
        }),
        sleep(peakIn).then(() => ({ kind: 'peak' })),
      ]);

      if (result.kind === 'peak') {
        console.log('[dsh-guard] 进入高峰时段，正在终止 dsh...');
        await killChild();
        continue; // 回到循环头部，等待高峰结束自动重启
      }
      if (result.kind === 'error') {
        console.error('[dsh-guard] 启动失败:', result.err.message);
        process.exit(1);
      }
      process.exit(result.code ?? (result.signal ? 1 : 0));
    }
  })();
}

main();
