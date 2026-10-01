package org.cheng.hy2tunvpn

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class ChengHy2TunBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) {
            return
        }
        val configPath = ChengHy2TunVpnService.desiredConfigPathForContext(context) ?: return
        val start = ChengHy2TunVpnService.startIntent(context, configPath)
        if (Build.VERSION.SDK_INT >= 26) {
            context.startForegroundService(start)
        } else {
            context.startService(start)
        }
    }
}
