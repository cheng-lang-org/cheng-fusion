(function(){
function signed(u){u=u>>>0;return u>2147483647?u-4294967296:u;}
function argb(c){
  if(!c||c==='transparent')return 0;
  var m=c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/);
  if(!m)return 0;
  var r=+m[1]|0,g=+m[2]|0,b=+m[3]|0,a=m[4]==null?1:+m[4];
  var ai=Math.round(a*255);
  if(ai<=0)return 0;
  if(ai>255)ai=255;
  return signed((ai<<24)|(r<<16)|(g<<8)|b);
}
function mulA(color,op){
  if(!color||op>=0.999)return color;
  if(op<=0)return 0;
  var u=color>>>0;
  var a=Math.round(((u>>>24)&255)*op);
  if(a<=0)return 0;
  return signed((a<<24)|(u&0xffffff));
}
function px(s){var n=parseFloat(s);return isFinite(n)?Math.round(n):0;}
function rad(st,w,h){
  var s=st.borderTopLeftRadius||'0';
  var n=parseFloat(s);
  if(!isFinite(n)||n<=0)return 0;
  if(String(s).indexOf('%')>=0){var m=w<h?w:h;return Math.round(m*n/100);}
  return Math.round(n);
}
function weightOf(st){
  var w=st.fontWeight;
  if(w==='bold')return 700;
  if(w==='normal')return 400;
  var n=parseInt(w,10);
  return isFinite(n)&&n>0?n:400;
}
var bgCache={};
var bgFetches=0;
var bgBytes=0;
// 单轮抓图预算: 视口内渲染够用即可。大预算会让每轮 CLB/ops 随之膨胀,
// 而 cheng ABI 当前零归还(每轮全量滞留), 预算即滞留速率的直接杠杆。
var BG_MAX_BYTES=6*1024*1024;
var BG_MAX_ITEM=2*1024*1024;
function bgImageData(el,st){
  var bi=st&&st.backgroundImage;
  if(!bi||bi==='none') return '';
  var m=bi.match(/url\\?\((['"]?)([^')"]+)\1\)/);
  if(!m) return '';
  var url=m[2];
  if(bgCache[url]!==undefined) return bgCache[url];
  var out='';
  if(url.indexOf('data:')===0){
    out=url;
  } else if(bgFetches<64){
    bgFetches+=1;
    try{
      var x=new XMLHttpRequest();
      x.open('GET',url,false);
      x.responseType='arraybuffer';
      x.send(null);
      if(x.status===200||x.status===0){
        if(bgBytes>BG_MAX_BYTES){ out=''; }
        else{
          var raw=new Uint8Array(x.response);
          // 分块 join 而非 += 拼接(+= 为 O(n²), 单张 2MB 图产生数百 MB 临时串)
          var nChunks=(raw.length+8191)>>13;
          var parts=new Array(nChunks);
          for(var i=0,ci=0;i<raw.length;i+=8192,ci++) parts[ci]=String.fromCharCode.apply(null,raw.subarray(i,Math.min(i+8192,raw.length)));
          var bin=parts.join('');
          bgBytes+=raw.length;
          var mime=x.getResponseHeader('Content-Type')||'image/png';
          out='data:'+mime+';base64,'+btoa(bin);
        }
      }
    }catch(e){ out=''; }
  }
  bgCache[url]=out;
  return out;
}
function familyOf(st){
  // 全字体列表按序回传(host 逐个做 CoreText 命中匹配, 首个真实命中的生效),
  // 波单抓第一项会让不命中项静默退到系统默认而非 CSS 回落链。
  var f=st.fontFamily||'';
  if(!f) return '';
  var parts=f.split(',');
  var out=[];
  for(var i=0;i<parts.length&&out.length<6;i++){
    var t=parts[i].replace(/["']/g,'').replace(/ /g,' ').trim();
    if(!t) continue;
    if(t==='inherit'||t==='initial'||t==='unset') continue;
    out.push(t);
  }
  return out.join('|');
}
function skipTag(t){
  return t==='script'||t==='style'||t==='meta'||t==='link'||t==='head'||t==='noscript'||t==='template'||t==='br'||t==='wbr'||t==='option'||t==='optgroup';
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
// 控件语义注册表: 交互元素分配单调 captureId(存在元素 JS 属性上, 跨抓取稳定),
// els[] 提供 id→元素反查, 语义动作通道按 id 寻址而非坐标。断连元素每次抓取
// 剪除; 重挂时凭元素上的旧 id 原样重注册, captureId 永不复用。
function ctlEsc(s){
  s=String(s||'');
  var o='';
  for(var i=0;i<s.length;i++){
    var ch=s.charAt(i);
    if(ch==='%')o+='%25';
    else if(ch==='\n')o+='%0A';
    else if(ch==='\r')o+='%0D';
    else if(ch==='|')o+='%7C';
    else if(ch==='\t')o+='%09';
    else o+=ch;
  }
  return o;
}
function ctlRegister(el){
  var c=window.__chengCtl;
  if(!c){ c=window.__chengCtl={seq:0,els:[]}; }
  var id=el.__chengCtlId;
  if(!id){ c.seq=c.seq+1; id=c.seq; el.__chengCtlId=id; }
  if(c.els[id]!==el) c.els[id]=el;
  return id;
}
window.__chengCtlById=function(id){
  var c=window.__chengCtl;
  var e=c?c.els[id]:null;
  return e||null;
};
function ctlRoleOf(el){
  return String(el.getAttribute('role')||'');
}
// accessible name 求解链: aria-label > aria-labelledby(逐 id 聚合) >
// label[for]/包裹 label > placeholder > title > alt > 自身聚合文本 > value。
function ctlNameOf(el){
  var doc=el.ownerDocument||document;
  var v=String(el.getAttribute('aria-label')||'').replace(/\s+/g,' ').trim();
  if(v) return v.slice(0,200);
  var lb=el.getAttribute('aria-labelledby');
  if(lb){
    var parts=[];
    var ids=lb.split(/\s+/);
    for(var i=0;i<ids.length;i++){
      if(!ids[i])continue;
      var n=doc.getElementById(ids[i]);
      if(n){ var t=String(n.textContent||'').replace(/\s+/g,' ').trim(); if(t)parts.push(t); }
    }
    v=parts.join(' ').trim();
    if(v) return v.slice(0,200);
  }
  var lab=null;
  try{ lab=el.id?doc.querySelector('label[for="'+el.id.replace(/"/g,'')+'"]'):null; }catch(e){ lab=null; }
  if(!lab&&el.closest) lab=el.closest('label');
  if(lab){ v=String(lab.textContent||'').replace(/\s+/g,' ').trim(); if(v) return v.slice(0,200); }
  v=String(el.getAttribute('placeholder')||'').replace(/\s+/g,' ').trim();
  if(v) return v.slice(0,200);
  v=String(el.getAttribute('title')||'').replace(/\s+/g,' ').trim();
  if(v) return v.slice(0,200);
  v=String(el.getAttribute('alt')||'').replace(/\s+/g,' ').trim();
  if(v) return v.slice(0,200);
  v=String(el.textContent||'').replace(/\s+/g,' ').trim();
  if(v) return v.slice(0,200);
  try{ v=String(el.value||'').replace(/\s+/g,' ').trim(); }catch(e){ v=''; }
  return v.slice(0,200);
}
// flags 位模型: 1=disabled(含 aria-disabled), 2=readonly, 4=checked。
function ctlFlagsOf(el){
  var f=0;
  try{ if(el.disabled||el.getAttribute('aria-disabled')==='true') f|=1; }catch(e){}
  try{ if(el.readOnly) f|=2; }catch(e){}
  try{ if(el.checked) f|=4; }catch(e){}
  return f;
}
function intersect(a,b){
  var x=Math.max(a.x,b.x), y=Math.max(a.y,b.y);
  var r=Math.min(a.x+a.w,b.x+b.w), btm=Math.min(a.y+a.h,b.y+b.h);
  return {x:x,y:y,w:Math.max(0,r-x),h:Math.max(0,btm-y)};
}
function isBlockingOverlay(st,r,vw,vh){
  if(!st||!r) return false;
  if(st.position!=='fixed') return false;
  if(r.width<vw*0.8||r.height<vh*0.8) return false;
  var z=parseInt(st.zIndex,10);
  if(!isFinite(z)) z=0;
  return z>=10;
}
function visClip(b,clip,vw,vh){
  if(b.w<=0||b.h<=0)return false;
  if(b.x>=vw||b.y>=vh||b.x+b.w<=0||b.y+b.h<=0)return false;
  if(clip.w<=0||clip.h<=0)return false;
  var i=intersect(b,clip);
  return i.w>0&&i.h>0;
}
function parseShadow(s){
  var out={x:0,y:0,blur:0,spread:0,c:0};
  if(!s||s==='none')return out;
  var col=s.match(/rgba?\([^)]+\)/);
  if(col) out.c=argb(col[0]);
  var nums=s.match(/-?[\d.]+px/g)||[];
  if(nums.length>=1) out.x=px(nums[0]);
  if(nums.length>=2) out.y=px(nums[1]);
  if(nums.length>=3) out.blur=px(nums[2]);
  if(nums.length>=4) out.spread=px(nums[3]);
  return out;
}
function gradientFill(st){
  var bi=st.backgroundImage||'';
  if(bi==='none'||bi.indexOf('gradient')<0)return 0;
  var m=bi.match(/rgba?\(\s*[\d.]+(?:\s*,\s*[\d.]+){2,3}\s*\)/);
  return m?argb(m[0]):0;
}
function cssContent(raw){
  if(!raw||raw==='none'||raw==='normal'||raw==='open-quote'||raw==='close-quote')return '';
  var m=String(raw).match(/^['"]([\s\S]*)['"]$/);
  var t=m?m[1]:'';
  t=t.replace(/\\([0-9a-fA-F]{1,6})[ \t]?/g,function(_,h){return String.fromCharCode(parseInt(h,16));});
  return t;
}
var srcCache={};
var srcFetches=0;
var srcBytes=0;
var SRC_MAX_BYTES=6*1024*1024;
var SRC_MAX_ITEM=2*1024*1024;
function fetchSrcDataURI(el){
  var src=el.getAttribute&&el.getAttribute('src')||'';
  if(!src) return '';
  if(src.indexOf('data:')===0) return src;
  if(srcCache[src]!==undefined) return srcCache[src];
  var out='';
  if(bgFetches<64){
    srcFetches+=1;
    try{
      var abs=src;
      if(src.indexOf('/')===0&&src.indexOf('//')!==0) abs=location.origin+src;
      else if(src.indexOf('http')!==0) abs=location.origin+location.pathname.replace(/[^/]*$/,'')+src;
      var x=new XMLHttpRequest();
      x.open('GET',abs,false);
      x.responseType='arraybuffer';
      x.send(null);
      if(x.status===200||x.status===0){
        if(srcBytes>SRC_MAX_BYTES){ out=''; }
        else{
          var raw=new Uint8Array(x.response);
          var nChunks2=(raw.length+8191)>>13;
          var parts2=new Array(nChunks2);
          for(var i=0,ci=0;i<raw.length;i+=8192,ci++) parts2[ci]=String.fromCharCode.apply(null,raw.subarray(i,Math.min(i+8192,raw.length)));
          var bin=parts2.join('');
          srcBytes+=raw.length;
          var mime=x.getResponseHeader('Content-Type')||'image/svg+xml';
          out='data:'+mime+';base64,'+btoa(bin);
        }
      }
    }catch(e){ out=''; }
  }
  srcCache[src]=out;
  return out;
}
function imgData(el){
  try{
    var tag=el.tagName?el.tagName.toLowerCase():'';
    if(tag==='img'&&(!el.complete||el.naturalWidth===0)){
      var f=fetchSrcDataURI(el);
      if(f) return f;
    }
    if(tag==='img'&&el.complete&&el.naturalWidth>0&&el.naturalHeight>0){
      var c=document.createElement('canvas');
      var iw=el.naturalWidth, ih=el.naturalHeight;
      var max=2048, sc=Math.max(iw,ih);
      if(sc>max){var k=max/sc; iw=Math.round(iw*k); ih=Math.round(ih*k);}
      c.width=iw; c.height=ih;
      c.getContext('2d').drawImage(el,0,0,iw,ih);
      return c.toDataURL('image/png');
    }
    if(tag==='svg'||(el.namespaceURI&&String(el.namespaceURI).indexOf('svg')>=0)){
      var ser=new XMLSerializer().serializeToString(el);
      if(ser.indexOf('xmlns')<0) ser=ser.replace('<svg','<svg xmlns="http://www.w3.org/2000/svg"');
      return 'data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(ser)));
    }
    if(tag==='canvas'&&el.width>0&&el.height>0){
      // canvas 像素回放: 2D 直接 toDataURL; WebGL 依赖 preserveDrawingBuffer
      // (未设则合成后帧已清空, 返回空如实跳过——不伪造像素)。
      var kw=el.width, kh=el.height;
      var cmax=1024, ksc=Math.max(kw,kh);
      if(ksc>cmax){var kk=cmax/ksc; kw=Math.round(kw*kk); kh=Math.round(kh*kk);}
      var cc=document.createElement('canvas');
      cc.width=kw; cc.height=kh;
      cc.getContext('2d').drawImage(el,0,0,kw,kh);
      var curl=cc.toDataURL('image/png');
      if(curl.length<=600000) return curl;
    }
    if(tag==='video'&&el.readyState>=2&&el.videoWidth>0&&el.videoHeight>0){
      // 视频当前帧回放: drawImage 抓帧缩到 640, JPEG 0.6(photographic);
      // 跨域视频会污染 canvas 抛异常, catch 后如实跳过。
      var vw2=el.videoWidth, vh2=el.videoHeight;
      var vmax=640, vsc=Math.max(vw2,vh2);
      if(vsc>vmax){var vk=vmax/vsc; vw2=Math.round(vw2*vk); vh2=Math.round(vh2*vk);}
      var vc=document.createElement('canvas');
      vc.width=vw2; vc.height=vh2;
      vc.getContext('2d').drawImage(el,0,0,vw2,vh2);
      return vc.toDataURL('image/jpeg',0.6);
    }
  }catch(e){}
  return '';
}
function isPuaText(s){
  s=String(s||'');
  for(var i=0;i<s.length;i++){
    var c=s.charCodeAt(i);
    if(c>=0xE000&&c<=0xF8FF) return true;
  }
  return false;
}
function shouldRasterGlyph(st,txt){
  txt=String(txt||'');
  if(!txt||txt.length>8) return false;
  if(isPuaText(txt)) return true;
  var ff=String(st&&st.fontFamily||'');
  if(/icon|awesome|glyph|icomoon|fontello|material icons/i.test(ff)) return true;
  if(txt.length<=2){
    for(var i=0;i<txt.length;i++){ if(txt.charCodeAt(i)>255) return true; }
  }
  return false;
}
function rasterText(st,txt,w,h){
  try{
    w=Math.max(1,Math.round(w||0)); h=Math.max(1,Math.round(h||0));
    var c=document.createElement('canvas');
    var dpr=2;
    c.width=w*dpr; c.height=h*dpr;
    var ctx=c.getContext('2d');
    ctx.scale(dpr,dpr);
    ctx.font=st.font||((st.fontSize||'14px')+' '+(st.fontFamily||'sans-serif'));
    ctx.fillStyle=st.color||'#111';
    ctx.textBaseline='middle';
    ctx.textAlign='left';
    ctx.fillText(txt,0,h/2);
    return c.toDataURL('image/png');
  }catch(e){ return ''; }
}
function makeBox(k,t,x,y,w,h,bg,fg,fs,bw,bc,rr,href,typ,id,val,txt,fw,ff,img,sh,clip,z,opts,depth,paintPath){
  return {k:k,t:t,x:x,y:y,w:w,h:h,bg:bg,fg:fg,fs:fs,bw:bw,bc:bc,rr:rr,href:href||'',typ:typ||'',id:id||'',val:val||'',txt:txt||'',fw:fw||400,ff:ff||'',img:img||'',sx:sh?sh.x:0,sy:sh?sh.y:0,sblur:sh?sh.blur:0,sspread:sh?sh.spread:0,sc:sh?sh.c:0,cx:clip.x,cy:clip.y,cw:clip.w,ch:clip.h,z:z||0,opts:opts||'',depth:depth||0,paintPath:paintPath||null};
}
function encOpts(opts){
  var parts=[];
  for(var i=0;i<opts.length;i++){
    var v=String(opts[i].v||'').replace(/\t/g,' ');
    var t=String(opts[i].t||'').replace(/\t/g,' ');
    parts.push((opts[i].s?1:0)+'\t'+v+'\t'+t);
  }
  return parts.join('\n');
}
function optionsOf(el){
  var out=[], seen={};
  function add(v,t,s){
    v=String(v||'').replace(/\s+/g,' ').trim();
    t=String(t||'').replace(/\s+/g,' ').trim();
    if(!t) return;
    if(!v) v=t;
    var key=v+'|'+t;
    if(seen[key]) return;
    seen[key]=1;
    out.push({v:v,t:t,s:s?1:0});
  }
  if(!el) return out;
  if(el.tagName==='SELECT'){
    for(var i=0;i<el.options.length;i++) add(el.options[i].value, el.options[i].text, el.options[i].selected);
    return out;
  }
  var roots=[el];
  var cid=el.getAttribute('aria-controls')||el.getAttribute('aria-owns');
  if(cid){
    var doc=el.ownerDocument||document;
    var t=doc.getElementById(cid);
    if(t) roots.push(t);
  }
  for(var n=0;n<roots.length;n++){
    var root=roots[n];
    if(!root || !root.querySelectorAll) continue;
    if(root.tagName==='SELECT'){
      for(var i=0;i<root.options.length;i++) add(root.options[i].value, root.options[i].text, root.options[i].selected);
      continue;
    }
    var opts=root.querySelectorAll('[role=option], [role=listbox] [role=option], [role=listbox] li');
    for(var i=0;i<opts.length;i++){
      var o=opts[i];
      var lab=(o.getAttribute('aria-label')||o.textContent||'').replace(/\s+/g,' ').trim();
      if(!lab) continue;
      var v=o.getAttribute('data-value')||o.getAttribute('value')||lab;
      var s=o.getAttribute('aria-selected')==='true'||(' '+o.className+' ').indexOf(' selected ')>=0;
      add(v,lab,s);
    }
  }
  return out;
}
function capture(){
  window.__chengCaptureActive=1;
  var t0=performance.now();
  // 单次抓取图片字节预算计数(此前 bgBytes/srcBytes 未声明, 32MB 上限恒不
  // 触发, 淘宝级页面数百张图全量抓取是 phys_footprint 爆炸主因之一)
  bgBytes=0;
  srcBytes=0;
  var cc0=window.__chengCtl;
  if(cc0){
    for(var pi=1;pi<cc0.els.length;pi++){
      var pe=cc0.els[pi];
      if(pe&&!pe.isConnected) delete cc0.els[pi];
    }
  }
  var vw=Math.round(document.documentElement.clientWidth||innerWidth||0);
  var vh=Math.round(document.documentElement.clientHeight||innerHeight||0);
  if(vw<1)vw=1;
  if(vh<1)vh=1;
  var boxes=[];
  var view={x:0,y:0,w:vw,h:vh};
  function pushTextNode(node,st,clip,op,z,ox,oy,depth,ctxPath,scaleK){
    var raw=node.nodeValue; if(!raw)return;
    var fg=mulA(argb(st.color),op);
    var fs=px(st.fontSize); if(fs<=0)fs=14;
    var sk=(typeof scaleK==='number'&&scaleK>0.05&&scaleK<20)?scaleK:1;
    if(Math.abs(sk-1)>0.01) fs=Math.max(6,Math.round(fs*sk));
    var fw=weightOf(st);
    var ff=familyOf(st);
    var range=(node.ownerDocument||document).createRange();
    var n=raw.length;
    if(n>8000) n=8000;
    var run=null;
    for(var i=0;i<n;i++){
      range.setStart(node,i);
      range.setEnd(node,i+1);
      var r=range.getBoundingClientRect();
      if(r.width<=0||r.height<=0) continue;
      var ch=raw.charAt(i);
      var x=r.left+ox, y=r.top+oy;
      var bx={x:x,y:y,w:r.width,h:r.height};
      if(!visClip(bx,clip,vw,vh)) continue;
      if(run && Math.abs(y-run.y)<1 && Math.abs(x-(run.x+run.w))<1.6 && Math.abs(r.height-run.h)<1){
        run.txt+=ch;
        run.w=Math.round(x+r.width-run.x);
      } else {
        if(run){
          if(shouldRasterGlyph(st,run.txt)){
            run.img=rasterText(st,run.txt,run.w,run.h);
            run.txt='';
          }
          boxes.push(run);
        }
        run=makeBox(0,'#text',Math.round(x),Math.round(y),Math.round(r.width),Math.round(r.height),0,fg,fs,0,0,0,'','','','',ch,fw,ff,'',null,clip,z,depth+1,ctxPath);
      }
    }
    if(run){
      if(shouldRasterGlyph(st,run.txt)){
        run.img=rasterText(st,run.txt,run.w,run.h);
        run.txt='';
      }
      boxes.push(run);
    }
  }
  function addPseudo(el,which,clip,op,z,ox,oy,depth,ctxPath){
    var st=getComputedStyle(el,which);
    if(!st||st.display==='none'||st.visibility==='hidden')return;
    var txt=cssContent(st.content);
    var bg=mulA(argb(st.backgroundColor),op);
    var g=mulA(gradientFill(st),op);
    if(g&&!bg) bg=g;
    var bw=px(st.borderTopWidth);
    var ow=px(st.outlineWidth);
    if(bw<=0&&ow>0&&st.outlineStyle&&st.outlineStyle!=='none'){bw=ow;}
    var er=el.getBoundingClientRect();
    var w=px(st.width), h=px(st.height);
    if(w<=0) w=px(st.fontSize)||px(er.width);
    if(h<=0) h=px(st.lineHeight)||px(st.fontSize)||px(er.height);
    if(w<=0||h<=0){ if(!txt) return; w=w||px(st.fontSize)||12; h=h||px(st.fontSize)||12; }
    var x=Math.round(er.left+ox+px(st.left));
    var y=Math.round(er.top+oy+px(st.top));
    if(st.position==='static'){ x=Math.round(er.left+ox); y=Math.round(er.top+oy); }
    var box={x:x,y:y,w:Math.round(w),h:Math.round(h)};
    if(!visClip(box,clip,vw,vh)) return;
    var fg=mulA(argb(st.color),op);
    var fs=px(st.fontSize); if(fs<=0)fs=14;
    var sh=parseShadow(st.boxShadow);
    sh.c=mulA(sh.c,op);
    var img='';
    if(shouldRasterGlyph(st,txt)){
      img=rasterText(st,txt,box.w,box.h);
      txt='';
    }
    var b=makeBox(0,'#'+which.replace(':',''),box.x,box.y,box.w,box.h,bg,fg,fs,bw,mulA(argb(st.borderTopColor||st.outlineColor),op),rad(st,box.w,box.h),'','','','',txt,weightOf(st),familyOf(st),img,sh,clip,z,depth+1,ctxPath);
    boxes.push(b);
    // 底边独占边框(eServices 导航蓝条型): CLB 统一 bw 模型只取 border-top,
    // 底边专属的边框以等价填充条发射(同层同序, 视觉等价)。
    var bbw=px(st.borderBottomWidth);
    var bbc=mulA(argb(st.borderBottomColor),op);
    if(bbw>0&&bbc&&bbc!==0){
      boxes.push(makeBox(0,'#bborder',box.x,box.y+box.h-bbw,box.w,bbw,bbc,fg,fs,0,0,0,'','','','','',weightOf(st),familyOf(st),'',null,clip,z,'',depth+1,ctxPath));
    }
  }
  function paintSelectList(el,clip,ox,oy,z,st0){
    if(!el||!el.options||el.options.length<=0) return;
    var n=el.options.length;
    var vis=[];
    for(var i=0;i<n;i++){
      var o=el.options[i];
      var r=o.getBoundingClientRect();
      if(r.width>0&&r.height>0) vis.push({i:i,x:r.left+ox,y:r.top+oy,w:r.width,h:r.height});
    }
    var open=!!el.__chengOpen;
    try{ if(el.matches(':open')) open=true; }catch(e){}
    if(el.size>1||el.multiple) open=true;
    if(vis.length===0&&!open) return;
    var sr=el.getBoundingClientRect();
    var cx=Math.round(sr.left+ox), cy=Math.round(sr.top+oy), cw=Math.round(sr.width), ch=Math.round(sr.height);
    var rowH=ch>0?ch:28;
    if(rowH<24) rowH=28;
    if(vis.length===0){
      var total=rowH*n;
      var openUp=cy>=(vh-(cy+ch));
      var y0=openUp?cy-total:cy+ch;
      for(var i=0;i<n;i++) vis.push({i:i,x:cx,y:y0+i*rowH,w:cw,h:rowH});
    }
    if(vis.length===0) return;
    var minx=vis[0].x, miny=vis[0].y, maxr=vis[0].x+vis[0].w, maxb=vis[0].y+vis[0].h;
    for(var i=1;i<vis.length;i++){
      if(vis[i].x<minx) minx=vis[i].x;
      if(vis[i].y<miny) miny=vis[i].y;
      if(vis[i].x+vis[i].w>maxr) maxr=vis[i].x+vis[i].w;
      if(vis[i].y+vis[i].h>maxb) maxb=vis[i].y+vis[i].h;
    }
    var panel={x:Math.round(minx),y:Math.round(miny),w:Math.round(maxr-minx),h:Math.round(maxb-miny)};
    if(visClip(panel,clip,vw,vh)){
      var psh={x:0,y:8,blur:24,spread:0,c:signed((0x33<<24))};
      boxes.push(makeBox(0,'#list',panel.x,panel.y,panel.w,panel.h,-1,0,14,1,signed((255<<24)|(229<<16)|(231<<8)|235),8,'','','','','',400,'','',psh,clip,z+20));
    }
    var fs=st0?px(st0.fontSize):14; if(fs<=0)fs=14;
    var ff=st0?familyOf(st0):'';
    for(var i=0;i<vis.length;i++){
      var it=vis[i];
      var o=el.options[it.i];
      var lab=String(o.text||o.label||o.value||'');
      var sel=!!o.selected;
      var bg=0;
      var fg=signed((255<<24)|(17<<16)|(24<<8)|39);
      try{
        var os=getComputedStyle(o);
        if(os){
          bg=argb(os.backgroundColor);
          var cf=argb(os.color);
          if(cf) fg=cf;
        }
      }catch(e){}
      if(sel){
        if(!bg) bg=signed((255<<24)|(59<<16)|(130<<8)|246);
        fg=signed((255<<24)|(255<<16)|(255<<8)|255);
      } else if(!bg){
        bg=-1;
      }
      var ob={x:Math.round(it.x),y:Math.round(it.y),w:Math.round(it.w),h:Math.round(it.h)};
      if(!visClip(ob,clip,vw,vh)) continue;
      boxes.push(makeBox(0,'option',ob.x,ob.y,ob.w,ob.h,bg,fg,fs,0,0,0,'','option','',String(o.value||''),lab,400,ff,'',null,clip,z+21));
    }
  }
  function walk(el,clip,opMul,ox,oy,depth,ctxPath){
    if(!el||el.nodeType!==1)return;
    var tag=el.tagName.toLowerCase();
    if(skipTag(tag))return;
    if(el.hidden||el.getAttribute('aria-hidden')==='true')return;
    var st=getComputedStyle(el);
    if(!st||st.display==='none'||st.visibility==='hidden')return;
    var cl=String(st.clip||'');
    if(cl.indexOf('rect(0px')===0||cl.indexOf('rect(0,')===0||cl.indexOf('rect(0 ')===0) return;
    var op=opMul*(parseFloat(st.opacity)||1);
    if(op<=0)return;
    if(tag==='input' && String(el.type||'').toLowerCase()==='hidden') return;
    var r=el.getBoundingClientRect();
    var x=Math.round(r.left+ox),y=Math.round(r.top+oy),w=Math.round(r.width),h=Math.round(r.height);
    if(tag==='iframe'){
      var idoc=null;
      try{ idoc=el.contentDocument||(el.contentWindow&&el.contentWindow.document); }catch(e){ idoc=null; }
      if(idoc&&idoc.documentElement){
        walk(idoc.documentElement, intersect(clip,{x:x,y:y,w:w,h:h}), op, x, y, 0, ctxPath||[]);
        return;
      }
    }
    if(isBlockingOverlay(st,r,vw,vh)) return;
    var kind=0;
    if(tag==='input')kind=1;
    else if(tag==='textarea')kind=2;
    else if(tag==='a')kind=3;
    else if(tag==='select')kind=6;
    else if(tag==='button')kind=4;
    else if(tag==='img'||tag==='svg'||tag==='canvas'||tag==='video'||tag==='iframe')kind=5;
    else if(el.getAttribute('role')==='button'||el.getAttribute('onclick'))kind=4;
    var harvested=[];
    if(tag==='select'){
      harvested=optionsOf(el);
    } else if(tag!=='input' && tag!=='textarea' && tag!=='button'){
      var role=el.getAttribute('role')||'';
      var popup=el.getAttribute('aria-haspopup')||'';
      if(role==='combobox'||role==='listbox'||popup==='listbox'||popup==='true'){
        harvested=optionsOf(el);
        if(harvested.length>0) kind=6;
      }
    }
    var ctlId=0, ctlRole='', ctlName='', ctlFlags=0;
    if(kind===1||kind===2||kind===3||kind===4||kind===6){
      ctlId=ctlRegister(el);
      ctlRole=ctlRoleOf(el);
      ctlName=ctlNameOf(el);
      ctlFlags=ctlFlagsOf(el);
    }
    var bg=mulA(argb(st.backgroundColor),op);
    var g=mulA(gradientFill(st),op);
    if(g&&!bg) bg=g;
    var fg=mulA(argb(st.color),op);
    var fs=px(st.fontSize); if(fs<=0)fs=14;
    if(kind===1){ try{ var pst=el.parentElement?getComputedStyle(el.parentElement):null; if(pst&&st.fontSize===pst.fontSize) fs=13; }catch(e){} }
    // 祖先 transform scale 折算: getBoundingClientRect 是缩放后矩形而 fontSize
    // 仍是未缩放值(WebKit 按 scale 后尺寸渲染文本), 不折算则右栏文本放大溢出
    // (巴林反馈条 20px*0.8=16px 实测案例)。
    try{
      var ow2=el.offsetWidth||0;
      if(ow2>0&&w>0){
        var kx=w/ow2;
        if(kx>0.05&&kx<20&&Math.abs(kx-1)>0.01) fs=Math.max(6,Math.round(fs*kx));
      }
    }catch(e){}
    var bw=px(st.borderTopWidth);
    var ow=px(st.outlineWidth);
    if(bw<=0&&ow>0&&st.outlineStyle&&st.outlineStyle!=='none'){bw=ow;}
    var bc=mulA(argb(st.borderTopColor||st.outlineColor),op);
    var rr=rad(st,w,h);
    var href=kind===3?String(el.getAttribute('href')||''):'';
    var typ='';
    if(kind===1||kind===2||kind===4||kind===6) typ=String(el.getAttribute('type')||el.type||'');
    var id=String(el.id||el.getAttribute('name')||'');
    var val='';
    if(kind===1||kind===2||kind===6) val=String(el.value||'');
    // 凭据脱敏: password 真值不出捕获端(CLBJ不携带), 渲染按长度画圆点
    if(kind===1&&String(el.type||'').toLowerCase()==='password'&&val) val='\u2022'.repeat(val.length);
    var txt='';
    if(kind===6){
      var lab='';
      for(var oi=0;oi<harvested.length;oi++){ if(harvested[oi].s){ lab=harvested[oi].t; if(!val) val=harvested[oi].v; break; } }
      if(!lab && tag==='select' && el.selectedIndex>=0 && el.options[el.selectedIndex]){
        lab=String(el.options[el.selectedIndex].text||'');
        if(!val) val=String(el.options[el.selectedIndex].value||lab);
      }
      txt=lab;
    } else if(kind===1||kind===2){
      if(val) txt=val;
      else if(el.placeholder){ txt=String(el.placeholder); fg=mulA(argb('rgb(156,163,175)'),op); }
    }
    if(val&&val.length>400) val=val.slice(0,400);
    if(txt&&txt.length>400) txt=txt.slice(0,400);
    var sh=parseShadow(st.boxShadow);
    sh.c=mulA(sh.c,op);
    var z=parseInt(st.zIndex,10); if(!isFinite(z)) z=0;
    // CSS 层叠层模型: 定位元素(z≠0)自成层叠上下文, 整棵子树按该层绘制(原子);
    // 定位元素(z=auto)其后代保持原层, 元素自身盒画在定位层(1000);
    // static 的 z 不生效(CSS 规范)按层 0 走树序。层内稳定排序=DOM 树序=绘制序。
    var isPos=!!(st.position&&st.position!=='static');
    var childPath=ctxPath;
    if(isPos&&z!==0) childPath=ctxPath.concat([1000+z]);
    var nextClip=clip;
    if(st.overflow==='hidden'||st.overflow==='auto'||st.overflow==='scroll'||st.overflowX==='hidden'||st.overflowY==='hidden'||st.position==='fixed'||st.position==='sticky'){
      nextClip=intersect(clip,{x:x,y:y,w:w,h:h});
    }
    // 视口内才抓图(对称 R1): 渲染不需要视口外的图, 语义不需要任何图——
    // 淘宝级长页全量抓图会把单轮 CLB/ops 推到几十 MB, 高频重放下驻留爆炸
    // 视口内才抓图(对称 R1): 渲染不需要视口外的图, 语义不需要任何图。
    // 此处 box 尚未定义(img 行先于 var box), 用 x/y/w/h 直接判定视口交集
    var img='';
    if(x+w>0&&y+h>0&&x<vw&&y<vh){
      img=kind===5?imgData(el):bgImageData(el,st);
    }
    var optsStr=encOpts(harvested);
    var box={x:x,y:y,w:w,h:h};
    // R1 滚动寻址: 交互控件在文档流中但视口外(与视口也无交集)仍入快照——
    // 语义寻址需全量控件, 离屏盒渲染端天然裁剪无害; 视口内被 overflow 容器
    // 裁剪的仍丢弃(物理不可见, scrollIntoView 也救不了容器外隐藏)。
    var r1Offscreen=(kind===1||kind===2||kind===3||kind===4||kind===6)&&!visClip(box,view,vw,vh);
    var paint=(visClip(box,clip,vw,vh)&&(bg!==0||kind>0||bw>0||sh.c!==0||img||optsStr||txt||(st.backgroundImage&&st.backgroundImage!=='none')))||r1Offscreen;
    if(paint){
      var pushed=makeBox(kind,tag,x,y,w,h,bg,fg,fs,bw,bc,rr,href,typ,id,val,txt,weightOf(st),familyOf(st),img,sh,nextClip,z,optsStr,depth,isPos?1:0,childPath);
      boxes.push(pushed);
      if(ctlId>0){ pushed.ctlId=ctlId; pushed.ctlRole=ctlRole; pushed.ctlName=ctlName; pushed.ctlFlags=ctlFlags; }
      if(kind===6){
        var cw=Math.max(10,Math.min(18,h));
        boxes.push(makeBox(0,'#chev',x+w-cw-4,y,cw,h,0,fg,Math.max(10,fs-2),0,0,0,'','','','','\u25BE',400,familyOf(st),'',null,nextClip,z,depth+1));
      }
    }
    if(tag==='select'){
      paintSelectList(el, nextClip, ox, oy, z, st);
      return;
    }
    addPseudo(el,'::before',nextClip,op,z,ox,oy,depth+1,childPath);
    // R3 shadow DOM 穿透: open shadowRoot 的子树并入快照(closed 无法穿透=
    // 语言边界如实排除); light DOM slot 子节点照常由下方 childNodes 遍历,
    // slot 重布局双画风险留档 v1 不做 slot 解析。
    try{
      if(el.shadowRoot){
        var srKids=el.shadowRoot.childNodes;
        for(var sk=0;sk<srKids.length;sk++){
          var sn=srKids[sk];
          if(sn.nodeType===3) pushTextNode(sn,st,nextClip,op,z,ox,oy,depth+1,childPath,1);
          else if(sn.nodeType===1) walk(sn,nextClip,op,ox,oy,depth+1,childPath);
        }
      }
    }catch(e){}
    var liChildBase=-1;
    if(tag==='li') liChildBase=boxes.length;
    var ch=el.childNodes;
    for(var i=0;i<ch.length;i++){
      var n=ch[i];
      if(n.nodeType===3){
          var scK=1;
          try{
            var ow2=el.offsetWidth||0;
            if(ow2>0&&w>0){
              scK=w/ow2;
              if(!(scK>0.05&&scK<20)) scK=1;
              if(Math.abs(scK-1)<=0.01) scK=1;
            }
          }catch(e){ scK=1; }
          pushTextNode(n,st,nextClip,op,z,ox,oy,depth+1,childPath,scK);
        }
      else if(n.nodeType===1) walk(n,nextClip,op,ox,oy,depth+1,childPath);
    }
    // ::marker 合成: li(display:list-item) 的列表符号不是 DOM 节点, TreeWalker
    // 看不见; 按首个后裔文本盒定位(符号在文本左侧 fs*1.4 处), 字形按
    // list-style-type 映射(disc •/circle ○/square ▪/decimal N.)。
    if(tag==='li'&&String(st.display||'').indexOf('list-item')>=0&&(st.listStyleType||'').toLowerCase()!=='none'){
      var liBase=liChildBase>=0?liChildBase:-1;
      var firstText=null;
      for(var bi=liBase;bi<boxes.length;bi++){
        if(boxes[bi].t&&boxes[bi].t.length>0&&boxes[bi].x>=x-1){ firstText=boxes[bi]; break; }
      }
      if(firstText){
        var lst=(st.listStyleType||'').toLowerCase();
        var ord2=1, sb=el.previousElementSibling;
        while(sb){ if(sb.tagName&&String(sb.tagName).toLowerCase()==='li') ord2++; sb=sb.previousElementSibling; }
        var mk='•';
        if(lst==='circle') mk='○';
        else if(lst==='square') mk='■';
        else if(lst.indexOf('decimal')>=0||lst.indexOf('arabic')>=0) mk=ord2+'.';
        var mfs=Math.max(9,fs);
        var mx=firstText.x-Math.round(mfs*1.4);
        var my=firstText.y;
        boxes.push(makeBox(0,'#marker',mx,my,Math.round(mfs*1.2),firstText.h,0,fg,mfs,0,0,0,'','','','',mk,weightOf(st),familyOf(st),'',null,nextClip,z,depth+1,childPath));
      }
    }
    var liChildBase=-1;
    addPseudo(el,'::after',nextClip,op,z,ox,oy,depth+1,childPath);
  }
  walk(document.documentElement,view,1,0,0,0,[]);
  boxes.forEach(function(b,i){b.ord=i;});
  boxes.sort(function(a,b){
      var pa=a.paintPath||[], pb=b.paintPath||[];
      var n=Math.min(pa.length,pb.length);
      for(var i=0;i<n;i++){ if(pa[i]!==pb[i]) return pa[i]-pb[i]; }
      return (pa.length-pb.length)||(a.ord-b.ord);
    });
  var ms=Math.round(performance.now()-t0);
  // CLB4: 盒区与 CLB3 逐字节同布局(连续 10 行×count, 不得插入其他行); 交互
  // 语义以 CTL|boxOrd|captureId|flags|role|name 行统一附在盒区之后(parser 只
  // 读 count 个盒, 未知行跳过——沿 FONT| 先例)。boxOrd 是排序后文件盒下标,
  // cheng 端控件表按它对齐盒/控件。
  var out='CLB4\n'+vw+' '+vh+' '+boxes.length+' '+ms+'\n';
  var ctlOut='';
  for(var i=0;i<boxes.length;i++){
    var b=boxes[i];
    out+=[b.k,b.x,b.y,b.w,b.h,b.bg,b.fg,b.fs,b.bw,b.bc,b.rr,b.fw,b.sx,b.sy,b.sblur,b.sspread,b.sc,b.cx,b.cy,b.cw,b.ch].join(' ')+'\n';
    out+=esc(b.t)+'\n'+esc(b.href)+'\n'+esc(b.typ)+'\n'+esc(b.id)+'\n'+esc(b.val)+'\n'+esc(b.txt)+'\n'+esc(b.ff)+'\n'+esc(b.img)+'\n'+esc(b.opts||'')+'\n';
    if(b.ctlId>0){
      ctlOut+='CTL|'+i+'|'+b.ctlId+'|'+b.ctlFlags+'|'+ctlEsc(b.ctlRole)+'|'+ctlEsc(b.ctlName)+'\n';
    }
  }
  out+=ctlOut;
  window.__chengCaptureActive=0;
  // 增量补丁字体通道: @font-face data:font/ttf 字节以 FONT|family|base64 尾行
  // 附在盒区之后(Cheng parser 只读 count 个盒, 尾行天然忽略); host 取出注册
  // CoreText 进程域, 右栏得以用页面真实网络字体渲染字形。
  try{
    var seen={};
    for(var si=0;si<document.styleSheets.length;si++){
      var rules=null;
      try{ rules=document.styleSheets[si].cssRules; }catch(e){ continue; }
      if(!rules) continue;
      for(var ri=0;ri<rules.length;ri++){
        var rule=rules[ri];
        if(!rule.style) continue;
        var src=rule.style.getPropertyValue('src')||'';
        var m=src.match(/data:font\/ttf;base64,([A-Za-z0-9+\/=]+)/);
        if(!m) continue;
        var fam=(rule.style.getPropertyValue('font-family')||'').replace(/["']/g,'').trim();
        if(!fam||seen[fam]) continue;
        seen[fam]=1;
        out+='FONT|'+esc(fam)+'|'+m[1]+'\n';
      }
    }
  }catch(e){}
  return out;
}
function postCapture(){
  try{
    if(window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.chengCapture){
      window.webkit.messageHandlers.chengCapture.postMessage('live');
    }
  }catch(e){}
}
function requestRecapture(){
  var st=window.__chengLive;
  if(!st) return;
  // webfont 就绪门控: 字体未加载完就抓盒, 度量会落在回退字体上,
  // 与左栏字体加载后的重排发散(Back/Continue 几何左右不一致实证)。
  if(document.fonts&&document.fonts.status!=='loaded'){ st.fontsWait=1; return; }
  if(st.fontsWait){ st.fontsWait=0; }
  if(st.raf) return;
  st.raf=1;
  requestAnimationFrame(function(){
    st.raf=0;
    postCapture();
  });
}
if(document.fonts){
  var onFontsReady=function(){
    window.__chengLive=window.__chengLive||{raf:0};
    if(window.__chengLive.fontsWait){ window.__chengLive.fontsWait=0; requestRecapture(); }
  };
  if(document.fonts.status==='loaded') setTimeout(onFontsReady,0);
  else if(document.fonts.ready&&document.fonts.ready.then) document.fonts.ready.then(onFontsReady).catch(function(){});
}
function armDoc(doc){
  if(!doc||doc.__chengArm) return;
  try{ doc.__chengArm=1; }catch(e){ return; }
  var root=doc.documentElement||doc;
  try{
    var mo=new MutationObserver(requestRecapture);
    mo.observe(root,{subtree:true,childList:true,attributes:true,characterData:true});
  }catch(e){}
  function onEvt(){ requestRecapture(); }
  function markSelectOpen(ev){
    var t=ev&&ev.target;
    if(!t||String(t.tagName).toLowerCase()!=='select') return;
    if(ev.type==='keydown'){
      var k=ev.key||'';
      if(k!==' '&&k!=='Enter'&&k!=='ArrowDown'&&k!=='ArrowUp'&&k!=='F4') return;
    }
    t.__chengOpen=1;
  }
  function markSelectClosed(ev){
    var t=ev&&ev.target;
    if(!t||!t.tagName) return;
    if(String(t.tagName).toLowerCase()==='select') t.__chengOpen=0;
  }
  var evts=['input','change','click','keyup','keydown','scroll','focus','blur','submit','toggle','transitionend','animationend'];
  for(var i=0;i<evts.length;i++){
    try{ doc.addEventListener(evts[i], onEvt, true); }catch(e){}
  }
  try{ doc.addEventListener('mousedown', markSelectOpen, true); }catch(e){}
  try{ doc.addEventListener('keydown', markSelectOpen, true); }catch(e){}
  try{ doc.addEventListener('change', markSelectClosed, true); }catch(e){}
  try{ doc.addEventListener('blur', markSelectClosed, true); }catch(e){}
  var win=doc.defaultView;
  if(win){
    try{ win.addEventListener('scroll', onEvt, true); }catch(e){}
    try{ win.addEventListener('resize', onEvt, true); }catch(e){}
    try{ win.addEventListener('hashchange', onEvt, true); }catch(e){}
    try{ win.addEventListener('popstate', onEvt, true); }catch(e){}
  }
  var fs=doc.getElementsByTagName?doc.getElementsByTagName('iframe'):[];
  for(var i=0;i<fs.length;i++){
    (function(fr){
      try{
        var d=fr.contentDocument||(fr.contentWindow&&fr.contentWindow.document);
        if(d) armDoc(d);
      }catch(e){}
      try{
        fr.addEventListener('load', function(){
          try{
            var d2=fr.contentDocument||(fr.contentWindow&&fr.contentWindow.document);
            if(d2) armDoc(d2);
          }catch(e){}
          requestRecapture();
        });
      }catch(e){}
    })(fs[i]);
  }
}
function armLive(){
  if(!window.__chengLive) window.__chengLive={raf:0};
  armDoc(document);
}
try{ armLive(); return capture(); }
catch(e){ return 'CLB-ERR '+String(e&&e.message?e.message:e); }
})();
