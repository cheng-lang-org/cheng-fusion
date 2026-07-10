// @ts-nocheck
// Verbatim copy of the 12-line self-contained runtime shim from the source repo
// (claude-code-ts/runtime.ts). Only `b` (lazy once-only module initializer) is
// actually used by the cheng-fusion modules; the rest is kept as-is since the
// file is already minimal and self-contained.
var XTf=Object.create;
var{getPrototypeOf:QTf,defineProperty:pft,getOwnPropertyNames:a9o,getOwnPropertyDescriptor:ZTf}=Object,Zpn=Object.prototype.hasOwnProperty;
function efn(e){return this[e]}
var hi=(e,t,r)=>{var n=a9o(t);for(let o of n)if(!Zpn.call(e,o)&&o!=="default")pft(e,o,{get:efn.bind(t,o),enumerable:!0});if(r){for(let o of n)if(!Zpn.call(r,o)&&o!=="default")pft(r,o,{get:efn.bind(t,o),enumerable:!0});return r}},eSf,tSf,w=(e,t,r)=>{var n=e!=null&&typeof e==="object";if(n){var o=t?eSf??=new WeakMap:tSf??=new WeakMap,i=o.get(e);if(i)return i}r=e!=null?XTf(QTf(e)):{};let s=t||!e||!e.__esModule?pft(r,"default",{value:e,enumerable:!0}):r;for(let a of a9o(e))if(!Zpn.call(s,a))pft(s,a,{get:efn.bind(e,a),enumerable:!0});if(n)o.set(e,s);return s},ro=(e)=>{var t=(BPa??=new WeakMap).get(e),r;if(t)return t;if(t=pft({},"__esModule",{value:!0}),e&&typeof e==="object"||typeof e==="function"){for(var n of a9o(e))if(!Zpn.call(t,n))pft(t,n,{get:efn.bind(e,n),enumerable:!(r=ZTf(e,n))||r.enumerable})}return BPa.set(e,t),t},BPa,K=(e,t)=>()=>(t||e((t={exports:{}}).exports,t),t.exports);
var rSf=(e)=>e;
function nSf(e,t){this[e]=rSf.bind(null,t)}
var ct=(e,t)=>{for(var r in t)pft(e,r,{get:t[r],enumerable:!0,configurable:!0,set:nSf.bind(t,r)})};
var b=(e,t)=>()=>(e&&(t=e(e=0)),t);
var z=Symbol.for("react.memo_cache_sentinel"),ra=Symbol.for("react.early_return_sentinel");
globalThis.__ocNative=(n)=>{let p="";try{p=new URL("./native/"+n,import.meta.url).pathname}catch{}try{if(p&&require("fs").existsSync(p))return p}catch{}return require("path").join(require("path").dirname(process.execPath),"native",n)};
export {XTf,QTf,pft,a9o,ZTf,Zpn,efn,hi,eSf,tSf,w,ro,BPa,K,rSf,nSf,ct,b,z,ra};
