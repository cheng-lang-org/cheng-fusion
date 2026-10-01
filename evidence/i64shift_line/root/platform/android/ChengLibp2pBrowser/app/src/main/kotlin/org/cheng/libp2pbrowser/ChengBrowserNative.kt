package org.cheng.libp2pbrowser

object ChengBrowserNative {
    init {
        System.loadLibrary("cheng_libp2p_browser")
    }

    external fun init(selfPeer: String, viewportW: Int, viewportH: Int): Int
    external fun beginLoad(url: String): Int
    external fun onLoadComplete(html: String): Int
    external fun onPageLoaded(url: String, html: String): Int
    external fun onUrlLoaded(url: String): Int
    external fun onPageSnapshot(url: String, snapshot: String): Int
    external fun refreshSnapshot(url: String, snapshot: String): Int
    external fun rightOpen(): Boolean
    external fun click(x: Int, y: Int): Int
    external fun key(code: Int): Int
    external fun attachPeer(peer: String): Int
    external fun selectPeer(peer: String): Int
    external fun paintCount(): Int
    external fun paintKind(index: Int): Int
    external fun paintX(index: Int): Int
    external fun paintY(index: Int): Int
    external fun paintW(index: Int): Int
    external fun paintH(index: Int): Int
    external fun paintColor(index: Int): Int
    external fun currentUrl(): String
}
