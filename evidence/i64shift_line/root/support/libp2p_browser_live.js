(function(){
  if (window.__chengLive) return;
  window.__chengLive = 1;
  var pending = false;
  function ask(){
    if (pending) return;
    pending = true;
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        pending = false;
        try {
          if (window.webkit && webkit.messageHandlers && webkit.messageHandlers.chengSnap) {
            webkit.messageHandlers.chengSnap.postMessage('1');
          } else if (window.chengHost && chengHost.snap) {
            chengHost.snap();
          }
        } catch (e) {}
      });
    });
  }
  window.chengAskSnap = ask;
  window.chengReplayPointer = function(x, y){
    var el = document.elementFromPoint(x, y);
    if (!el) { ask(); return; }
    var opts = {bubbles:true, cancelable:true, composed:true, view:window, clientX:x, clientY:y, screenX:x, screenY:y, button:0, buttons:1, detail:1};
    try {
      if (window.PointerEvent) el.dispatchEvent(new PointerEvent('pointerdown', opts));
    } catch (e1) {}
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    if (el.focus) try { el.focus(); } catch (e2) {}
    opts.buttons = 0;
    try {
      if (window.PointerEvent) el.dispatchEvent(new PointerEvent('pointerup', opts));
    } catch (e3) {}
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
    ask();
  };
  window.chengReplayKey = function(code){
    var el = document.activeElement || document.body;
    var isBack = code === 8;
    var key = isBack ? 'Backspace' : String.fromCharCode(code);
    var init = {key:key, code:isBack ? 'Backspace' : key, keyCode:code, which:code, bubbles:true, cancelable:true, composed:true};
    el.dispatchEvent(new KeyboardEvent('keydown', init));
    var tag = el && el.tagName ? el.tagName : '';
    if ((tag === 'INPUT' || tag === 'TEXTAREA') && !el.readOnly && !el.disabled) {
      var proto = tag === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      var desc = Object.getOwnPropertyDescriptor(proto, 'value');
      var cur = el.value || '';
      var next = cur;
      if (isBack) next = cur.length ? cur.slice(0, -1) : cur;
      else if (code >= 32 && code < 127) next = cur + String.fromCharCode(code);
      if (desc && desc.set) desc.set.call(el, next);
      else el.value = next;
      el.dispatchEvent(new Event('input', {bubbles:true, composed:true}));
    }
    el.dispatchEvent(new KeyboardEvent('keyup', init));
    if (code === 13) el.dispatchEvent(new Event('change', {bubbles:true, composed:true}));
    ask();
  };
  document.addEventListener('click', ask, true);
  document.addEventListener('input', ask, true);
  document.addEventListener('change', ask, true);
  var mo = new MutationObserver(ask);
  var root = document.documentElement || document;
  mo.observe(root, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['class','style','open','hidden','value','aria-expanded','aria-hidden']});
})();
