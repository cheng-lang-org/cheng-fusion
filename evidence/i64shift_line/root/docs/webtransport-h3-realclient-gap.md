# WebTransport slice-4: real-external-client gap (2026-07-14)

## What was built this pass

New, isolated files (no shared file touched):

- `src/libp2p/transports/webtransport_wire.cheng` — real (non-double-framed)
  HTTP/3 wire I/O for a single QUIC stream (varint read, frame read, raw
  write, "read whatever's available" drain). Replaces
  `src/tests/webtransport_connect_slice2_probe.cheng`'s
  `writeHeadersFrame`/`readHeadersFields`, which additionally wrap every
  frame in `libp2p/transports/quic_transport.cheng`'s `Libp2pQuicEncodeFrame`
  — a 4-byte length prefix that is **cheng-internal only**, not real HTTP/3
  wire format. That extra wrapper is invisible when both peers are this same
  codebase (every existing WT probe is client+server in one process), but
  makes the wire bytes unparseable by any independent implementation.
- `src/libp2p/transports/webtransport_h3_session.cheng` — server+client
  glue: HTTP/3 SETTINGS preamble (control + qpack encoder/decoder
  unidirectional streams) and Extended CONNECT (RFC 9220) exchange, driven
  off a real accept()ed/dial()ed connection via the wire module above.
- `src/apps/webtransport_wt_listener_main.cheng` — standalone process: real
  UDP/QUIC listener on 127.0.0.1, issues a real ECDSA P-256 self-signed leaf
  (`std/tls/x509_issue.cheng`, validity ≤ 14 days), ALPN "h3" only, prints
  `WT_LISTENER_CERTHASH=`/`WT_LISTENER_CERTDER_HEX=`/`WT_LISTENER_READY
  port=`, then serves the CONNECT+bidi-stream exchange and echoes received
  bytes.
- `src/apps/webtransport_wt_dial_client_main.cheng` — standalone process:
  dials 127.0.0.1, pins the peer cert by SHA-256 (`--certhash`) — **explicit
  loud failure on mismatch, no dial attempted** — then runs the same
  handshake and verifies the echo.

## Verified: real two-process E2E (this codebase, both ends)

`tools` none needed — direct `system-link-exec --emit:exe` + run. Two
**separate OS processes**, real loopback UDP sockets (no in-process pipe
shortcut):

```
listener: WT_LISTENER_READY port=56626 ...
client:   WT_DIAL_CERTHASH_OK=... / WT_DIAL_ALPN=h3 /
          WT_DIAL_SESSION_ESTABLISHED=1 / WT_DIAL_SENT_BYTES=27 /
          WT_DIAL_ECHO_OK bytes=27   (rc=0, ~2.7s wall)
listener: WT_LISTENER_SESSION_ESTABLISHED=1 / WT_LISTENER_BIDI_STREAM_ID=4 /
          WT_LISTENER_RECEIVED_BYTES=27 / WT_LISTENER_ECHOED_BYTES=27
```

Negative paths, both explicit/loud, no silent accept:
- certhash mismatch: client refuses to dial at all, `rc=6`,
  `WT_DIAL_CERTHASH_MISMATCH expected=... actual=...`.
- wrong `:path`: server rejects the CONNECT request
  (`webtransport: unexpected :path /wrong-path`), client sees the closed
  pipe and reports `WT_DIAL_SESSION_REJECTED=...`, `rc=7`.

This is real ECDSA cert issuance + real TLS 1.3 + real ALPN "h3" negotiation
+ real Extended CONNECT (RFC 9220 pseudo-headers over real QPACK-literal
wire bytes) + a real bidirectional QUIC stream, all across two independent
processes.

## Gap 1 (verified, isolated): native_runtime.cheng has no
unidirectional-stream discovery

`src/quic/native_runtime.cheng`'s `msquicNativeReadableAppStreamIdCurrent`
(the function behind `qconn.nativeReadableStreamId`, used by this slice to
find a peer's freshly-opened stream) hardcodes:

```
slot.streamId % 4 == 0
```

i.e. it only ever tracks **client-initiated bidirectional** streams (0, 4,
8, ...). Server-initiated bidi (%4==1), client-uni (%4==2), and
server-uni (%4==3) — every stream HTTP/3's mandatory SETTINGS preamble uses
— are invisible to it. Writes to those streams succeed
(`msquicTransportWrite` returns `Ok`, full byte count) but the peer can
never observe/read them.

Confirmed by A/B: `webtransport_h3_session.cheng`'s
`Wth3ServerHandleConnection`/`Wth3ClientHandshake` take a
`withH3SettingsPreamble: bool` (both call sites default it to `false` via
`--h3-settings-preamble`, off unless passed) specifically because turning it
on makes every session fail, every time, at
`Wth3Server/ClientValidatePeerControlStream`'s discovery step — with the
CONNECT+bidi-data path (this slice's whole proof above) working perfectly
when that step is skipped.

This is a real per-connection stream-slot bookkeeping gap, not a bug in the
new files — closing it means extending native_runtime.cheng's stream-slot
tracking to the other 3 stream classes (a native_runtime feature addition,
out of this slice's "shortest path" scope; that file is also a shared,
actively-touched core file per project lessons — needs its own
propose→apply cycle, not a drive-by fix).

## Gap 2 (verified, deeper, found via a REAL independent client): Initial
packet parser assumes every frame is CRYPTO-shaped

Installed `@fails-components/webtransport` +
`@fails-components/webtransport-transport-http3-quiche` (real npm packages,
a genuine independent QUIC/HTTP3/WebTransport implementation wrapping
Google's quiche, prebuilt native binary, no source changes) as a Node.js
WebTransport client — the first attempt at a truly independent (not
cheng-authored) "对端" per this task's requirement ②.

Dialing the listener above with real `serverCertificateHashes` pinning: the
client's own QUIC attempt genuinely reaches the server (confirmed by the
server's own log, not a client-side guess) and fails with:

```
wt_listener: accept: msquic native: initial frame data truncated
```

Root cause, `src/quic/native_runtime.cheng:4348`
(`msquicNativeProcessServerInitialDirect`): the Initial-packet frame loop
unconditionally decodes every frame as a 5-field CRYPTO-shaped tuple
(kind, stream, offset, value, length) with no dispatch on frame type. A
real independent client's Initial packet legitimately contains PADDING
frames (RFC 9000 §14.1 mandates padding Initial datagrams to 1200 bytes) —
type-`0x00` bytes with no length/offset fields at all. The parser
misinterprets padding zero-bytes as a malformed CRYPTO frame header and runs
past the buffer, producing this exact "truncated" error. This codebase's own
`webtransport_connect_slice2_probe.cheng` and this slice's own dial client
never trigger it because our own client never pads (small, minimal
ClientHello, no padding emitted) — this is a genuine "only shows up against
an independent implementation's real wire bytes" defect, invisible to every
existing cheng-vs-cheng test in this repo.

This is deeper than Gap 1 (it blocks the QUIC handshake itself, before HTTP/3
framing is even reached) and confirms the concern this slice's recon raised
at the outset: the custom QUIC stack has never been wire-tested against an
independent implementation before this pass. Real Chrome (a third, separate
QUIC implementation) is expected to hit this same class of parsing gap or
worse (Chrome's Initial ClientHello + padding + transport-parameter set
differs further still) — not something to guess away, hence the `deviceSteps`
in this slice's task output asks the orchestrator to actually try it and
report exactly what breaks, the same way this gap was found.

Fixing this is a native_runtime.cheng QUIC-frame-dispatch change (recognize
frame type before assuming shape: PADDING/PING have no length field, ACK has
its own shape, etc.) — real transport-layer work, out of this slice's scope,
and (like Gap 1) touches a shared/hot core file.

## Bottom line

- Requirement ① (real WT/QUIC listener, production code path): done, real
  UDP bind + real cert issuance + real ALPN h3, verified running.
- Requirement ② (real external dial + handshake + data frames): a real,
  independent QUIC/WebTransport client (node `@fails-components/webtransport`,
  wrapping quiche) really dialed and really reached the server over real
  loopback UDP — but the handshake does not complete yet, blocked by Gap 2
  above (found precisely because a real independent client was used, not
  guessed). The two-cheng-process CONNECT+bidi-data path (requirement ①'s
  production code, exercised end-to-end) is fully verified working.
- Requirement ③ (explicit failure, no silent fallback): verified three ways
  — certhash mismatch, `:path` mismatch, and (this session) the real
  "initial frame data truncated" rejection against the independent client —
  all loud, distinct, logged on both ends.

## Fixed (2026-07-14, d1190e1f4 + follow-up patch)

Gap 2 above (Initial frame parser assuming every frame is CRYPTO-shaped) and
Gap 1 (stream-discovery hardcoding `streamId % 4 == 0`) are both fixed by
`d1190e1f4`: four Initial/Handshake-space frame loops
(`msquicNativeProcessCryptoPayloadFrames` +
`msquicNativeProcessServerInitialDirect` / `ProcessClientHandshakeDirect` /
`ProcessServerHandshakeDirect`) now decode the frame kind first and dispatch
PADDING(0)/PING(1) to a fields-free 1-byte consume before falling into the
5-field CRYPTO-shaped decode; `msquicNativeReadableAppStreamIdCurrent` now
uses `msquicNativeStreamIdReadableBySide` (RFC 9000 §2.1: a stream is
unreadable by `side` only if it is unidirectional AND self-initiated),
covering server-bidi/client-uni/server-uni instead of only client-bidi.

That combination made `--h3-settings-preamble` progress past 100%-certain
discovery failure to a new, deeper wall (recorded as task #46/#47 below),
both now also closed:

- **Gap A (#46, fixed)**: `wth3BuildSettingsFrame()` only ever encoded
  ENABLE_CONNECT_PROTOCOL + H3_DATAGRAM. The client-side
  `Wth3ClientValidatePeerControlStream` reuses
  `webtransport_common.settingsIsWebtransportCapable`, which requires
  `maxSessions > 0` — so any real (spec-conforming) client would always
  reject the server's SETTINGS with "remote endpoint does ! accept
  WebTransport sessions". Fixed: `wth3BuildSettingsFrame` takes a
  `maxSessions: int32` parameter (0 omits the setting entirely, matching
  that a client has no reason to advertise it — see
  `wth3PeerSettingsHaveConnectAndDatagram`'s doc comment); the server side
  now advertises `wth3ServerMaxSessionsAdvertised = 1` via
  `wtcommon.http3SettingsWebtransportMaxSessionsId()` (the same identifier
  both the encode side here and the decode side
  (`Http3SettingsFromEntries`) already agreed on, so encode/decode can never
  drift apart), the client side passes 0 (unchanged real behavior).
- **Gap B (#47, fixed)**: the 1-RTT/Short packet frame loop
  (`msquicNativeHandleAppPayloadFrame`, called by
  `msquicNativeProcessShortDirect`) was the one frame-decode site d1190e1f4
  didn't reach — still unconditionally 5-field-decoded every frame, so a
  real peer's 1-RTT PING keepalive or PADDING run corrupted the cursor and
  (via `msquicNativeAppPayloadDecodeErrorIsDrop`) silently dropped the
  *entire* packet, including any real DATA frame it carried. Fixed with the
  same kind-first dispatch as d1190e1f4's four sites: PADDING(0)/PING(1)
  each consume exactly their 1-byte type and continue (PING marks the
  packet ack-eliciting; PADDING does not). Regression:
  `src/tests/quic_short_padding_ping_frame_smoke.cheng` (fails on the
  pre-fix tree — the DATA frame placed after PADDING+PING never survives;
  passes after). Also hardened the drop path itself:
  `msquicNativeProcessShortDirect`'s "drop malformed short payload" log was
  gated behind the `msquicNativeDebugTls13` debug flag (i.e. silent by
  default in production) — now writes to stderr unconditionally before
  dropping, so a genuinely corrupt/unrecognized frame is never silently
  invisible even though the packet itself is still dropped (RFC 9000 leaves
  drop-vs-close to the implementation; this codebase's existing policy is
  drop, just no longer *mute*).

## Current frontier (2026-07-14, after Gap A/B): known F07 hard-flaw family,
same-file sub-case, newly hit by a real production call
(**re-tested same day: seed lag, already fixed at HEAD — see "Resolved" below**)

Running the full `--h3-settings-preamble` flow end to end (real two-process
listener + dial client) with both fixes in place progresses past both
closed gaps and now fails one step earlier than either used to — inside
`wth3SendPreambleOn` itself, before the server ever writes its control
stream:

```
wt_listener: session rejected: quic varint: value out of range
WT_LISTENER_SESSION_REJECTED=quic varint: value out of range
...
wt_dial_client: WT_DIAL_SESSION_REJECTED=wt h3: timed out discovering peer control stream (rc=7)
```

(The client-side symptom is downstream noise: the server's preamble send
failed before it ever opened its uni-streams, so the client's own discovery
poll -- looking for a stream the server never created -- times out.)

Root cause, isolated to a minimal repro, is **not** in this file, not in
Gap A/B's own new code, and predates this session entirely
(`quic_varint.cheng`'s `quicVarIntMax` const has been unchanged since
2026-04-11, commit `7ea5ac8956`): `src/quic/core/quic_varint.cheng` declares

```
const
    quicVarIntMax: int64 = 4611686018427387903
```

Compiling and reading this const back (`Int64ToStr(quicVarIntMax)`) prints
`0`, not `4611686018427387903` — a bare integer literal above int32 range
(2^31-1) assigned to a `const NAME: int64 = <literal>` silently truncates.
Confirmed **const-only**: the identical literal assigned to a `let` (with or
without an explicit `int64(...)` cast) round-trips correctly. This
`quicVarIntMax` const gates `quicVarIntEncodedLen`'s/`quicVarIntEncode`'s
only branch above 1073741823 (`if value <= quicVarIntMax: return 8`), so
with the const silently reading as `0` that branch's condition is false for
every `value >= 2^30`, falls through to `return 0`, and
`quicVarIntEncode` returns `Err[Bytes]("quic varint: value out of range")`
for **any** value in that range — not particular to WebTransport at all.

This is not a new defect: it is the already-tracked **F07** hard flaw
(`docs/cheng-hard-flaws-refactor-plan-2026-07-12.md`, "跨模块无限定标识符解析没有
系统性 miss-must-poison 不变量") — but specifically its **same-file/same-module
bare-name sub-case**, which that doc's own 2026-07-12 entry records as still
open after the cross-module sub-case was fixed and closed the same day
(`src/tests/f07_constx64b_main.cheng` cross-module via `modA.FooK` now
RUN=2; the doc's own note: "同文件裸名臂仍 RUN=1（F07 遗留子项，另案）" — same-file
bare-name arm still reads 0). `quic_varint.cheng`'s `quicVarIntEncodedLen`
reading its own module's `quicVarIntMax` unqualified is exactly that
still-open same-file arm — this session's repro is a first concrete
production trigger for it (no dedicated `src/tests/f07_*` fixture covers the
same-file arm yet), not a fourth compiler bug.

`SETTINGS_WEBTRANSPORT_MAX_SESSIONS`'s own identifier
(`0xc671706a` = 3329323114, `draft-ietf-webtrans-http3`) is the first
production call in this codebase that ever asks `quicVarIntEncode` to take
its 8-byte branch — `webtransport_common.http3SettingsWebtransportMaxSessionsId()`
itself is unaffected (it builds the value via two in-range `int64(...)`
literals shifted/or'd together specifically to dodge a *different*,
already-documented literal-folding trap, and was independently confirmed to
return the correct `3329323114`) — so Gap A's fix is the first thing that
ever exercises this latent same-file `quicVarIntMax` arm in a real call
chain: `Http3EncodeSettingsFrame -> Http3EncodeSettingsPayload ->
qvarint.quicVarIntEncode(entries[i].id)`.

Also worth noting for whoever picks up F07's same-file arm: the fix that
closed F07's cross-module arm lives in `primary_object_plan.cheng`
(pobj-side, per that flaw's own 2026-07-12 entry) and, per this project's
bootstrap rules, only reaches a *rebuilt driver*, not the pinned
`artifacts/bootstrap/cheng.stage3` seed this session's verification used
(seed generation is still the 2026-07-05 six-fix line per this repo's
CLAUDE.md) — so this exact repro should be re-checked against a driver built
from current HEAD before concluding the same-file arm needs its own,
separate source change; it may already be covered by the same
`ScalarValueSlotForTextImpl` fix and only appear broken here because of the
seed/driver gap, not a distinct code path.

### Resolved (2026-07-14, same day): seed lag confirmed — no separate source change needed

The re-check recommended above was executed (shadow clone of HEAD
`d650f934f`, `tools/zc_fast_loop.sh --rebuild` 51s, driver_sha `be7a6d03`,
report `system_link_exec_scope=selfhost_direct` / `full_backend_codegen=1`,
i.e. the real backend, not the cold-runtime fallback path). Verdict:
**covered_by_existing_fix**. F07b commit `6dbd1e14f` (2026-07-13,
`PrimaryBodyIrGlobalDataPayloadText` I64/uint64 branches) — an ancestor of
current HEAD — already fixed the same-file bare-name arm. Three probes, two
toolchains:

| repro | pinned stage3 (2026-07-05 seed) | rebuilt driver (HEAD) |
|---|---|---|
| same-file bare-name i64 const read-back | reads `0` | `4611686018427387903` correct |
| `f07_constx64b_main.cheng` (cross-module fixture) | reads `0` | correct |
| `quicVarIntEncode(3329323114)` (the real 0xc671706a trigger) | `Err out-of-range` | 8-byte varint encodes OK |

The pinned-seed failure is uniform across cross-module *and* same-file
probes — pure seed lag (seed generation predates F07 `587c56e1a`/`97348ec3b`
and F07b `6dbd1e14f`), not a distinct open arm. Closing this frontier for
the preamble flow therefore requires a **seed swap** (regenerate the pinned
`cheng.stage3` from a lineage including F07b), or verifying the preamble
flow with a rebuilt-from-HEAD driver — not another compiler source change.

This is out of this task's scope (WebTransport/QUIC frame-dispatch gaps;
F07 is compiler-frontend/backend, tracked separately) and explicitly not
something to route around here (no fallback/workaround in
`wth3BuildSettingsFrame` — the identifier is spec-mandated and not
substitutable). `withH3SettingsPreamble` stays default-`false` at both
`webtransport_wt_listener_main.cheng` / `webtransport_wt_dial_client_main.cheng`
call sites; passing `--h3-settings-preamble` still fails loud and explicit,
just one step earlier and for a different, now precisely-attributed reason.
