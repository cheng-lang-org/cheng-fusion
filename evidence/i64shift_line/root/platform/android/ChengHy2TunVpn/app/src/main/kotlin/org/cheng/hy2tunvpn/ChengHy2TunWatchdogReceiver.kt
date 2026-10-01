package org.cheng.hy2tunvpn

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

// Alarm-driven resurrection. Huawei EMUI silently kills background VPN
// processes without a sticky-service restart; the in-process watchdog dies
// with them. This receiver runs in a fresh process started by AlarmManager,
// sees processAlive == false while the desired-running flag survives in
// SharedPreferences, and brings the foreground service back.
class ChengHy2TunWatchdogReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ChengHy2TunVpnService.ACTION_WATCHDOG_TICK) {
            return
        }
        // Self-perpetuating tick: setAndAllowWhileIdle has no repeat mode and
        // SCHEDULE_EXACT_ALARM is not granted by default on API 31+.
        wdLog(context, "tick received alive=${ChengHy2TunVpnService.serviceProcessAlive}")
        ChengHy2TunVpnService.scheduleWatchdogAlarmFor(context)
        val configPath = ChengHy2TunVpnService.desiredConfigPathForContext(context) ?: run {
            wdLog(context, "tick skip: no desired config")
            return
        }
        if (!ChengHy2TunVpnService.desiredRunningForContext(context)) {
            wdLog(context, "tick skip: desired flag false")
            return
        }
        if (ChengHy2TunVpnService.serviceProcessAlive) {
            wdLog(context, "tick skip: process alive")
            return
        }
        wdLog(context, "tick RESURRECT path=$configPath")
        val start = ChengHy2TunVpnService.startIntent(context, configPath)
        if (Build.VERSION.SDK_INT >= 26) {
            context.startForegroundService(start)
        } else {
            context.startService(start)
        }
    }

    private fun wdLog(context: Context, text: String) {
        try {
            java.io.File(context.filesDir, "wd.log")
                .appendText("${System.currentTimeMillis()} WD $text\n")
        } catch (_: Throwable) {
        }
    }
}
