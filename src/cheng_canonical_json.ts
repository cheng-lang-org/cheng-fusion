// @ts-nocheck
// canonicalJson 的单一权威副本(2026-08-27): 原先只有 cheng_semantic_matrix_m9023.ts 导出它,
// 而热路径模块(如 cheng_fusion_mcp_runtime_identity.ts)只为这一个纯函数就被迫静态拖入 60KB+
// 的语义矩阵模块图。此处为可独立加载的最小实现; 语义矩阵从本模块 re-export, 全部旧导入方零改动。
// 实现与语义矩阵原版逐字等价: 对象键排序后递归规范化, 再 JSON.stringify。

function canonicalize(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const record = value;
  const out = {};
  for (const key of Object.keys(record).sort()) out[key] = canonicalize(record[key]);
  return out;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}
