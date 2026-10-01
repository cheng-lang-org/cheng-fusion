# LifetimeLedger 生产调用 census

`tools/lifetime_ledger_storage_receipt_static_gate.sh` 运行唯一当前
`LifetimeLedger` 的生产调用 census。census 从当前 `src/core` 自动读取函数、导入和调用边，
不维护人工填写的 PASS 清单。

生产根固定为：

- `BuildSystemLinkExecPlanWithWorldAndChannelInto`
- `BackendDriverDispatchMinExecuteFormalRequestInto`

门禁从两个根计算可达闭包，并核对 CompilerCSG、lowering、primary、backend2 的真实调用。
直接写账本的生产模块必须且只能是：

- `compiler_payload_lifecycle`
- `compiler_csg_build_fragment_lifetime`
- `body_ir_lifecycle`
- `system_link_plan`
- `lowering_plan`
- `backend2_fragment_lifecycle`
- `backend2_assembler_lifecycle`

census 自动统计 `ReserveObject/Own`、move、borrow/return、read、release、closed
assertion、metrics 和 storage release。生产释放还必须包含真实的 Arena/Seq/BodyIR
物理释放调用，以及 `allocatedBytes/releasedBytes/liveBytes` 和账本存储释放字节列。
清空字段不能替代 free，手写 `storageReleased=true` 不能替代物理释放回执。

自测在内存中删除每类 producer、每个生产 consumer、40 项物理释放证明和两个入口的阶段调用，
并注入模块全局账本、8 类仅清空字段、伪造 release。任一变异未使验证器失败，门禁立即失败。测试不改源码，
不生成版本化平行实现，也不运行冻结全树或正式发布门。

独立执行：

```sh
tools/lifetime_ledger_production_census_test.sh
```

该 census 只证明生产调用闭包和物理释放调用形状，不冒充运行态。真实 5000 次
success/failure、alloc/free/live 对拍、mutation fail-stop 与当前 ORC `HARD_RED`
见 `docs/lifetime-ledger-production-dynamic-mutation.md`。
