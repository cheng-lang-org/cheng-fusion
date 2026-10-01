// mech13 独立探针: 直接实例化真实 TypeMapper, 喂真实类型字符串, 观察 map() 的真实返回值。
// 不复用/不转述 mech12_impl_verdict.md 的文字断言 —— 自建 fixture, 独立见证。
// 只读 dist/csg-cheng-transpiler.js 的真实导出 TypeMapper 类, 无 mock。
import { TypeMapper } from "../dist/csg-cheng-transpiler.js";

let fails = 0;
function check(label, input, expectOk) {
  // TypeMapper 构造需要一个 index (TranspilerFactIndex) —— 探针只测不依赖 typeDeclByName 查表的
  // 纯字符串分支(HTMLVideoElement/union/array 等原语路径), 用最小假 index 满足接口即可(非 mock
  // 业务逻辑, 只是把 map() 用到的三个只读字段准备成空表, map() 内部真实逻辑完全未替换)。
  const fakeIndex = { typeDeclByName: new Map(), constLiteralTypes: new Map() };
  const tm = new TypeMapper(fakeIndex);
  const r = tm.map(input);
  const ok = r.type !== undefined;
  const status = ok === expectOk ? "OK " : "FAIL";
  if (ok !== expectOk) fails++;
  console.log(`[${status}] map(${JSON.stringify(input)}) => ${JSON.stringify(r)} (expect ${expectOk ? "resolves" : "rejects"})`);
}

console.log("--- mech13 TypeMapper 独立探针 ---");
// 已知会通过的锚点(HTMLVideoElement 特判, 证明探针夹具本身工作正常)
check("baseline video", "HTMLVideoElement", true);
check("baseline video nullable", "HTMLVideoElement | null", true);

// 核心问题: MediaStream / RTCPeerConnection 是否被 TypeMapper 认识
check("MediaStream bare", "MediaStream", false);
check("MediaStream nullable (localStreamRef/remoteStreamRef 真实标注)", "MediaStream | null", false);
check("RTCPeerConnection nullable (peerConnectionRef 真实标注)", "RTCPeerConnection | null", false);
check("Promise<MediaStream> (ensureLocalVoiceMedia 真实返回类型)", "Promise<MediaStream>", false);

// 对照: mech12 verdict §5 提到的 RTCIceCandidateInit[] 同源问题, 交叉验证同一套代码路径
check("RTCIceCandidateInit bare", "RTCIceCandidateInit", false);
check("RTCIceCandidateInit[] (pendingIceCandidatesRef 真实标注)", "RTCIceCandidateInit[]", false);

console.log(`--- ${fails === 0 ? "全部符合预期" : `${fails} 项不符预期`} ---`);
process.exit(fails === 0 ? 0 : 1);
