# parity contract

`codex` must never pretend to be Codex before the relevant source surface is ported.

## statuses

- `ported`: Cheng implementation exists, has parity tests, and passes its source oracle.
- `non-runtime asset`: source file is documentation, fixture, generated schema, or static oracle consumed by tests.
- `explicitly_blocked`: real dependency or subsystem not yet ported; any product entry touching it must hard-fail with a concrete reason.

## current status

Current member status is tracked by `src/core/module_map.cheng`, `progress.md`,
and the current smoke gate. Product surfaces that are not yet closed must stay
`explicitly_blocked` and return a concrete non-zero failure.

## hard-fail rule

Product entries return a non-zero exit code and print:

```text
codex blocked: full Codex parity is not implemented
```

No mock responses, no fake model output, no empty success, no fallback to Rust binaries.
