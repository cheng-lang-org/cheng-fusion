# Wave-A T4 实测报告

日期: 2026-07-09  
driver: artifacts/backend_driver/cheng  
  mtime 2026-07-09 09:18  
  sha256 39817d4f192d651150c468a454f32bcff9e14a5e94284d930d3142ebe4c63eb9  
stage3: artifacts/bootstrap/cheng.stage3  
  sha256 58e5bdc8dd5920bbd2f3ee257152dcaed79bfe84b212ac010e6ae8c3c2d4d47c  

## 矩阵 (pure --emit:exe --link-providers)

`tools/waveA_sentinel_run.sh` 全量 4/4 MATCH:

| 夹具 | driver compile | driver run | stage3 compile | stage3 run | 判 |
|---|---|---|---|---|---|
| setlen_zero_tail_ptr_field | 0 | **0** | 0 | 0 | 绿 (T1.5: provider zeroTail hoist + arrow call-arg 臂) |
| addr_of_local_ptr_decl_g | 0 | 0 | 0 | 0 | 绿回归 (T1.6) |
| addr_of_local_ptr_decl_d | 0 | 0 | 0 | 0 | 绿回归 (T1.6) |
| bare_deref_inline_wide | 0 | **81** | 0 | 0 | 仍红 (隐式 let 定宽源已落; 可装 pure bake 后 expect→0) |

## 旁证

- setLen 同夹具 `emit:obj` + `_shared_runtime.c`: driver/stage3 均 run=0 (C stub 掩蔽, 非本族口径)
- setLen 绿不依赖 driver bake: `program_support_backend.cheng` hoist 进 pure providers 链接路径
- bare_deref return-form (`exec_diff_corpus/bare_deref_wide_return`): 现源绿
- bl-self: 无微夹具 (见 README); 源侧 roots 1–4 已落 pobj/B2 lockstep

## bake 状态 (2026-07-09 Wave-B/C)

- pure `--require-rebuild` 多次产出 `compiler_main.direct.next` (ZC=0 / full_backend), dry-compile 绿, **`system-link-exec` SEGV** (`strlen` @ 截断指针 0xe72090)
- cold 快烤 freshness 指纹不含 pobj/lower_stmt → 源改不进 14MB cold-hybrid 官位路径
- **官方 driver 未替换**; bare_deref expect=81
- 旁证: 同夹具改 `let b: int64 = *slot` 在官位 run=0 (F 线标注形已绿; 隐式形源修待 bake)

## 文件清单

```
src/tests/waveA_sentinels/
  README.md
  REPORT.md
  setlen_zero_tail_ptr_field.cheng
  addr_of_local_ptr_decl_g.cheng
  addr_of_local_ptr_decl_d.cheng
  bare_deref_inline_wide.cheng
tools/waveA_sentinel_run.sh
```
