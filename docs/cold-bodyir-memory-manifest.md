# Cold BodyIR memory manifest

`cheng_regalloc_preflight` accepts one current packed-row contract:

| Family | Bytes per row |
| --- | ---: |
| op | 44 |
| slot | 52 |
| call_arg | 24 |

The validator uses these same constants for header admission, slab
replacement arithmetic, body-release totals, and the independently
recomputed retained-memory peak. A manifest declaring predecessor row widths
or emitting byte totals inconsistent with the current widths fails closed.

For the focused initial-capacity fixture, exact owned slab bytes are
`64×44 + 32×52 + 8×24 = 4672`; with `1024` arena bytes the exact retained
peak is `5696`.
