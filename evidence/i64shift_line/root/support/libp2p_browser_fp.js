// 指纹 profile 注入(JS): 按 profile JSON 的确定性种子扰动读面 API。
// 原则: 同一 profile 永远同指纹(可复现), 不同 profile 必不同; 所有覆写互洽。
// 宿主把 profile 常量以 __chengFpProfile 注入(在本文档之前执行)。
(function () {
  "use strict";
  if (window.__chengFp) return;
  var P = window.__chengFpProfile || {};
  function seedOf(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h >>> 0;
  }
  var BASE_SEED = seedOf(String(P.seed || "cheng-fp-default"));
  function rng(tag) { // 每 tag 独立确定性流
    var s = seedOf(tag + ":" + BASE_SEED) || 1;
    return function () { // mulberry32
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function def(obj, prop, val) {
    try {
      Object.defineProperty(obj, prop, { get: function () { return val; }, configurable: true });
    } catch (e) {}
  }

  // ---- navigator 面 ----
  if (P.userAgent) def(Navigator.prototype, "userAgent", P.userAgent);
  if (P.platform) def(Navigator.prototype, "platform", P.platform);
  if (P.languages) def(navigator, "languages", Object.freeze(P.languages.slice()));
  if (P.languages && P.languages.length) def(navigator, "language", P.languages[0]);
  if (P.hardwareConcurrency) def(navigator, "hardwareConcurrency", P.hardwareConcurrency);
  if (P.deviceMemory) def(navigator, "deviceMemory", P.deviceMemory);
  if (P.maxTouchPoints !== undefined) def(navigator, "maxTouchPoints", P.maxTouchPoints);

  // ---- 时区面: Date + Intl 同步 ----
  if (typeof P.tzOffsetMinutes === "number") {
    var off = P.tzOffsetMinutes;
    Date.prototype.getTimezoneOffset = function () { return off; };
    try {
      var DF = Intl.DateTimeFormat;
      var realResolved = DF.prototype.resolvedOptions;
      DF.prototype.resolvedOptions = function () {
        var o = realResolved.call(this);
        if (P.tzIana) o.timeZone = P.tzIana;
        if (P.locale) o.locale = P.locale;
        return o;
      };
    } catch (e) {}
  }
  if (P.locale) def(navigator, "language", P.locale);

  // ---- ClientRects 面: 确定性亚像素抖动(字体枚举/指纹探测的部分缓解) ----
  // 捕获脚本读矩形时置 window.__chengCaptureActive=1 → 旁路噪声(1:1 不受影响)。
  if (P.rectsNoise !== 0) {
    function jitterRect(r, el) {
      if (window.__chengCaptureActive) return r;
      try {
        var key = (el && el.id ? el.id : "") + "|" + (el && el.className ? String(el.className).slice(0, 24) : "") + "|" + Math.round(r.width * 10);
        var rand = rng("rects:" + key);
        var j = function () { return (rand() - 0.5) * 0.5; }; // ±0.25px
        return new DOMRect(r.x + j(), r.y + j(), r.width + j(), r.height + j());
      } catch (e) { return r; }
    }
    var origGBCR = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      var r = origGBCR.call(this);
      return jitterRect(r, this);
    };
    var origGCRs = Element.prototype.getClientRects;
    Element.prototype.getClientRects = function () {
      var list = origGCRs.call(this);
      try {
        if (list && list.length) {
          var j = jitterRect(list[0], this);
          if (j !== list[0]) {
            var out = [];
            for (var i = 0; i < list.length; i++) out.push(list[i]);
            out[0] = j;
            return out;
          }
        }
      } catch (e) {}
      return list;
    };
  }

  // ---- canvas 面: 读出时按种子注入确定性低位噪声 ----
  function noiseCanvas(canvas, ctx2d) {
    try {
      var w = canvas.width, h = canvas.height;
      if (w <= 0 || h <= 0 || w * h > 4000000) return;
      var img = ctx2d.getImageData(0, 0, w, h);
      var d = img.data;
      var rand = rng("canvas:" + w + "x" + h);
      var stride = 97; // 每 stride 像素扰动一个通道 ±1: 足够改变哈希, 肉眼不可见
      for (var i = 0; i < d.length; i += 4 * stride) {
        var delta = rand() < 0.5 ? -1 : 1;
        var ch = i + 4 * Math.floor(rand() * 3);
        if (ch < d.length) d[ch] = Math.max(0, Math.min(255, d[ch] + delta));
      }
      ctx2d.putImageData(img, 0, 0);
    } catch (e) {}
  }
  function wrapRead(ctx) {
    var origGet = ctx.getImageData;
    ctx.getImageData = function (sx, sy, sw, sh) {
      var img = origGet.call(this, sx, sy, sw, sh);
      try {
        var d = img.data;
        var rand = rng("gid:" + sw + "x" + sh + ":" + sx + "," + sy);
        var stride = 97;
        for (var i = 0; i < d.length; i += 4 * stride) {
          var delta = rand() < 0.5 ? -1 : 1;
          var ch = i + 4 * Math.floor(rand() * 3);
          if (ch < d.length) d[ch] = Math.max(0, Math.min(255, d[ch] + delta));
        }
      } catch (e) {}
      return img;
    };
    return ctx;
  }
  var origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type) {
    var ctx = origGetContext.apply(this, arguments);
    if (ctx && type === "2d" && !ctx.__chengFpWrapped) {
      try {
        wrapRead(ctx);
        var origDataUrl = HTMLCanvasElement.prototype.toDataURL;
        if (!origDataUrl.__chengFpPatched) {
          HTMLCanvasElement.prototype.toDataURL = function () {
            try { noiseCanvas(this, this.getContext("2d")); } catch (e) {}
            return origDataUrl.apply(this, arguments);
          };
          origDataUrl.__chengFpPatched = true;
        }
        ctx.__chengFpWrapped = true;
      } catch (e) {}
    }
    return ctx;
  };

  // ---- WebGL 面: 厂商/渲染器覆写 + readPixels 噪声 ----
  if (P.webglVendor || P.webglRenderer) {
    var origWgl = HTMLCanvasElement.prototype.getContext; // 已被上方包裹, 取原链
  }
  // getParameter 覆写放在原型上(2d/webgl 共用入口已被包裹, 这里另挂 gl 原型)
  function patchGLProto(proto) {
    if (!proto || proto.__chengFpGL) return;
    proto.__chengFpGL = true;
    var origParam = proto.getParameter;
    proto.getParameter = function (p) {
      if (P.webglVendor && (p === 37445 /* UNMASKED_VENDOR_WEBGL */ || p === 7936 /* VENDOR */)) {
        return P.webglVendor;
      }
      if (P.webglRenderer && (p === 37446 /* UNMASKED_RENDERER_WEBGL */ || p === 7937 /* RENDERER */)) {
        return P.webglRenderer;
      }
      return origParam.call(this, p);
    };
    var origRead = proto.readPixels;
    proto.readPixels = function (x, y, w, h, fmt, type, pixels) {
      origRead.call(this, x, y, w, h, fmt, type, pixels);
      try {
        if (!pixels || !pixels.length) return;
        var rand = rng("glread:" + w + "x" + h + ":" + x + "," + y);
        var stride = 61;
        for (var i = 0; i < pixels.length; i += 4 * stride) {
          var delta = rand() < 0.5 ? -1 : 1;
          var ch = i + Math.floor(rand() * 4);
          pixels[ch] = Math.max(0, Math.min(255, pixels[ch] + delta));
        }
      } catch (e) {}
    };
  }
  if (window.WebGLRenderingContext) patchGLProto(WebGLRenderingContext.prototype);
  if (window.WebGL2RenderingContext) patchGLProto(WebGL2RenderingContext.prototype);

  // ---- AudioContext 面: 确定性噪声 ----
  if (window.AnalyserNode && P.audioSeed !== 0) {
    var origGetFloat = AnalyserNode.prototype.getFloatFrequencyData;
    AnalyserNode.prototype.getFloatFrequencyData = function (arr) {
      origGetFloat.call(this, arr);
      var rand = rng("audio:" + arr.length);
      for (var i = 0; i < arr.length; i += 7) arr[i] += (rand() - 0.5) * 0.01;
    };
    var origGetByte = AnalyserNode.prototype.getByteFrequencyData;
    AnalyserNode.prototype.getByteFrequencyData = function (arr) {
      origGetByte.call(this, arr);
      var rand = rng("audiob:" + arr.length);
      for (var i = 0; i < arr.length; i += 11) arr[i] = Math.max(0, Math.min(255, arr[i] + (rand() < 0.5 ? -1 : 1)));
    };
  }

  // ---- WebRTC 面: 剥真实 ICE 候选(防本机/内网 IP 泄露) ----
  if (P.webrtcMode === "disable" && window.RTCPeerConnection) {
    window.RTCPeerConnection = function () {
      throw new Error("WebRTC disabled by profile");
    };
    window.RTCPeerConnection.prototype = RTCPeerConnection.prototype;
  }

})();
