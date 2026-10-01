package org.cheng.libp2pbrowser

object ChengSnapshotJs {
    const val SOURCE: String = """
(function(){
function argb(c){
  if(!c||c==='transparent')return 0;
  var m=c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/);
  if(!m)return 0;
  var r=+m[1]|0,g=+m[2]|0,b=+m[3]|0,a=m[4]==null?1:+m[4];
  var ai=Math.round(a*255);
  if(ai<=0)return 0;
  if(ai>255)ai=255;
  var u=((ai<<24)|(r<<16)|(g<<8)|b)>>>0;
  return u>2147483647?u-4294967296:u;
}
function px(s){var n=parseFloat(s);return isFinite(n)?Math.round(n):0;}
function rad(st,w,h){
  var s=st.borderTopLeftRadius||'0';
  var n=parseFloat(s);
  if(!isFinite(n)||n<=0)return 0;
  if(String(s).indexOf('%')>=0){var m=w<h?w:h;return Math.round(m*n/100);}
  return Math.round(n);
}
function skipTag(t){
  return t==='script'||t==='style'||t==='meta'||t==='link'||t==='head'||t==='noscript'||t==='template'||t==='br'||t==='wbr';
}
function esc(s){
  s=String(s||'');
  var o='';
  for(var i=0;i<s.length;i++){
    var ch=s.charAt(i);
    if(ch==='%')o+='%25';
    else if(ch==='\n')o+='%0A';
    else if(ch==='\r')o+='%0D';
    else o+=ch;
  }
  return o;
}
function capture(){
  var t0=performance.now();
  var vw=Math.round(document.documentElement.clientWidth||innerWidth||0);
  var vh=Math.round(document.documentElement.clientHeight||innerHeight||0);
  if(vw<1)vw=1;
  if(vh<1)vh=1;
  var boxes=[];
  function walk(el){
    if(!el||el.nodeType!==1)return;
    var tag=el.tagName.toLowerCase();
    if(skipTag(tag))return;
    var st=getComputedStyle(el);
    if(!st||st.display==='none'||st.visibility==='hidden')return;
    if(parseFloat(st.opacity)===0)return;
    var r=el.getBoundingClientRect();
    var x=Math.round(r.left),y=Math.round(r.top),w=Math.round(r.width),h=Math.round(r.height);
    var kind=0;
    if(tag==='input')kind=1;
    else if(tag==='textarea')kind=2;
    else if(tag==='a')kind=3;
    else if(tag==='button'||tag==='select')kind=4;
    else if(tag==='img'||tag==='svg'||tag==='canvas'||tag==='video'||tag==='iframe')kind=5;
    else if(el.getAttribute('role')==='button'||el.getAttribute('onclick'))kind=4;
    else if(el.getAttribute('role')==='combobox'||el.getAttribute('role')==='listbox'||el.getAttribute('role')==='option'||el.getAttribute('role')==='menuitem')kind=4;
    var bg=argb(st.backgroundColor);
    var fg=argb(st.color);
    var fs=px(st.fontSize); if(fs<=0)fs=14;
    var bw=px(st.borderTopWidth);
    var bc=argb(st.borderTopColor);
    var rr=rad(st,w,h);
    var href=kind===3?String(el.getAttribute('href')||''):'';
    var typ='';
    if(kind===1||kind===2||kind===4) typ=String(el.getAttribute('type')||el.type||'');
    var id=String(el.id||el.getAttribute('name')||'');
    var val='';
    if(kind===1||kind===2) val=String(el.value||'');
    var txt='';
    if(kind===1||kind===2){
      if(val) txt=val;
      else if(el.placeholder){ txt=String(el.placeholder); fg=argb('rgb(156,163,175)'); }
    }
    var vis=w>0&&h>0&&x<vw&&y<vh&&(x+w)>0&&(y+h)>0;
    var paint=vis&&(bg!==0||kind>0||bw>0);
    if(paint){
      boxes.push({k:kind,t:tag,x:x,y:y,w:w,h:h,bg:bg,fg:fg,fs:fs,bw:bw,bc:bc,rr:rr,href:href,typ:typ,id:id,val:val,txt:txt});
    }
    var ch=el.childNodes;
    for(var i=0;i<ch.length;i++){
      var n=ch[i];
      if(n.nodeType===3){
        var raw=n.nodeValue; if(!raw)continue;
        var text=raw.replace(/[\t\r\n\f ]+/g,' ').trim();
        if(!text)continue;
        var rg=document.createRange();
        rg.selectNodeContents(n);
        var tr=rg.getBoundingClientRect();
        var tx=Math.round(tr.left),ty=Math.round(tr.top),tw=Math.round(tr.width),th=Math.round(tr.height);
        if(tw<=0||th<=0)continue;
        if(tx>=vw||ty>=vh||tx+tw<=0||ty+th<=0)continue;
        boxes.push({k:0,t:'#text',x:tx,y:ty,w:tw,h:th,bg:0,fg:fg,fs:fs,bw:0,bc:0,rr:0,href:'',typ:'',id:'',val:'',txt:text});
      } else if(n.nodeType===1){
        walk(n);
      }
    }
  }
  walk(document.documentElement);
  var ms=Math.round(performance.now()-t0);
  var out='CLB2\n'+vw+' '+vh+' '+boxes.length+' '+ms+'\n';
  for(var i=0;i<boxes.length;i++){
    var b=boxes[i];
    out+=[b.k,b.x,b.y,b.w,b.h,b.bg,b.fg,b.fs,b.bw,b.bc,b.rr].join(' ')+'\n';
    out+=esc(b.t)+'\n'+esc(b.href)+'\n'+esc(b.typ)+'\n'+esc(b.id)+'\n'+esc(b.val)+'\n'+esc(b.txt)+'\n';
  }
  return out;
}
return capture();
})();
"""

    const val LIVE: String = """
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
"""
}
