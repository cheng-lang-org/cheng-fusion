package org.cheng.libp2pbrowser

import android.annotation.SuppressLint
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.os.Bundle
import android.view.MotionEvent
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

class MainActivity : AppCompatActivity() {
    private lateinit var urlField: EditText
    private lateinit var peerField: EditText
    private lateinit var webView: WebView
    private lateinit var rightView: GLSurfaceView
    private lateinit var stats: TextView
    private lateinit var split: LinearLayout
    private val renderer = ChengPaintRenderer()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ChengBrowserNative.init("android-peer", 640, 720)

        urlField = EditText(this).apply { hint = "https://" }
        peerField = EditText(this).apply { hint = "指定手机节点 peer id" }
        val go = Button(this).apply { text = "打开" }
        val connect = Button(this).apply { text = "连接并指定" }
        stats = TextView(this).apply { visibility = View.GONE }
        webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                if (!url.isNullOrEmpty()) ChengBrowserNative.beginLoad(url)
                applyPaneVisibility()
            }
            override fun onPageFinished(view: WebView?, url: String?) {
                val pageUrl = url ?: ""
                rightView.visibility = View.VISIBLE
                val webLp = webView.layoutParams as LinearLayout.LayoutParams
                webLp.weight = 1f
                webView.layoutParams = webLp
                split.requestLayout()
                webView.evaluateJavascript(ChengSnapshotJs.SOURCE) { raw ->
                    val snap = unescapeJsString(raw)
                    ChengBrowserNative.onPageSnapshot(pageUrl, snap)
                    if (pageUrl.isNotEmpty()) urlField.setText(pageUrl)
                    applyPaneVisibility()
                    renderer.reload()
                    rightView.requestRender()
                }
            }
        }
        rightView = GLSurfaceView(this).apply {
            setEGLContextClientVersion(2)
            setRenderer(renderer)
            renderMode = GLSurfaceView.RENDERMODE_WHEN_DIRTY
            visibility = View.GONE
            setOnTouchListener { _, ev ->
                if (ev.action == MotionEvent.ACTION_DOWN && ChengBrowserNative.rightOpen()) {
                    val x = ev.x.toInt()
                    val y = ev.y.toInt()
                    ChengBrowserNative.click(x, y)
                    renderer.reload()
                    requestRender()
                }
                true
            }
        }
        go.setOnClickListener {
            val url = urlField.text.toString()
            if (url.isNotEmpty()) {
                ChengBrowserNative.beginLoad(url)
                applyPaneVisibility()
                webView.loadUrl(url)
            }
        }
        connect.setOnClickListener {
            val peer = peerField.text.toString()
            if (peer.isNotEmpty()) {
                ChengBrowserNative.attachPeer(peer)
                ChengBrowserNative.selectPeer(peer)
            }
        }
        val chrome = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(urlField, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            addView(go)
            addView(peerField, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            addView(connect)
        }
        split = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(webView, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f))
            addView(rightView, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f))
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(chrome)
            addView(stats)
            addView(split, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        }
        setContentView(root)
        applyPaneVisibility()
    }

    private fun applyPaneVisibility() {
        val open = ChengBrowserNative.rightOpen()
        rightView.visibility = if (open) View.VISIBLE else View.GONE
        stats.visibility = if (open) View.VISIBLE else View.GONE
        if (open) stats.text = "Cheng 1:1 GPU 编译渲染已打开"
        val webLp = webView.layoutParams as LinearLayout.LayoutParams
        webLp.weight = if (open) 1f else 2f
        webView.layoutParams = webLp
    }

    private fun unescapeJsString(quoted: String?): String {
        if (quoted == null || quoted == "null") return ""
        var s = quoted
        if (s.length >= 2 && s.first() == '"' && s.last() == '"') {
            s = s.substring(1, s.length - 1)
        }
        return s.replace("\\n", "\n").replace("\\\"", "\"").replace("\\\\", "\\")
    }
}

class ChengPaintRenderer : GLSurfaceView.Renderer {
    @Volatile private var kinds: IntArray = IntArray(0)
    @Volatile private var xs: IntArray = IntArray(0)
    @Volatile private var ys: IntArray = IntArray(0)
    @Volatile private var ws: IntArray = IntArray(0)
    @Volatile private var hs: IntArray = IntArray(0)
    @Volatile private var colors: IntArray = IntArray(0)
    @Volatile private var vpW: Int = 1
    @Volatile private var vpH: Int = 1

    fun reload() {
        val n = ChengBrowserNative.paintCount()
        val k = IntArray(n)
        val x = IntArray(n)
        val y = IntArray(n)
        val w = IntArray(n)
        val h = IntArray(n)
        val c = IntArray(n)
        var i = 0
        while (i < n) {
            k[i] = ChengBrowserNative.paintKind(i)
            x[i] = ChengBrowserNative.paintX(i)
            y[i] = ChengBrowserNative.paintY(i)
            w[i] = ChengBrowserNative.paintW(i)
            h[i] = ChengBrowserNative.paintH(i)
            c[i] = ChengBrowserNative.paintColor(i)
            i += 1
        }
        kinds = k
        xs = x
        ys = y
        ws = w
        hs = h
        colors = c
    }

    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        GLES20.glClearColor(0.97f, 0.97f, 0.97f, 1f)
    }

    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        vpW = if (width > 0) width else 1
        vpH = if (height > 0) height else 1
        GLES20.glViewport(0, 0, vpW, vpH)
    }

    override fun onDrawFrame(gl: GL10?) {
        GLES20.glDisable(GLES20.GL_SCISSOR_TEST)
        GLES20.glClearColor(0.97f, 0.97f, 0.97f, 1f)
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
        GLES20.glEnable(GLES20.GL_SCISSOR_TEST)
        val n = kinds.size
        var i = 0
        while (i < n) {
            if (kinds[i] == 1 || kinds[i] == 2 || kinds[i] == 3) {
                val color = colors[i]
                val a = ((color ushr 24) and 255) / 255f
                val r = ((color ushr 16) and 255) / 255f
                val g = ((color ushr 8) and 255) / 255f
                val b = (color and 255) / 255f
                val x = xs[i]
                val y = ys[i]
                val w = ws[i]
                val h = hs[i]
                val scissorY = vpH - y - h
                if (w > 0 && h > 0) {
                    GLES20.glScissor(x, scissorY, w, h)
                    GLES20.glClearColor(r, g, b, a)
                    GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
                }
            }
            i += 1
        }
        GLES20.glDisable(GLES20.GL_SCISSOR_TEST)
    }
}
