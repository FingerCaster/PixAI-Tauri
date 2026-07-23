# Bug Analysis: Bridge generation appeared only after completion

## 1. Root Cause Category

- **Category:** B - Cross-Layer Contract, with a D - Test Coverage Gap.
- **Specific Cause:** The database persisted a `running` run before provider I/O, but Codex Bridge exposed only one completion-time change event. The UI therefore had no contract for observing the persisted intermediate state. Existing tests asserted final responses and final history, not behavior while the provider promise was pending.

## 2. Why Earlier Behavior Was Fragile

1. A general `load()` after completion refreshed correct final data but could never expose the running interval.
2. Starting a refresh immediately after launching the generation promise would race with asynchronous preflight and `insertRun`.
3. Project-scoped conversations made the missing contract more visible because the target conversation could be absent from the current Store snapshot.

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | Architecture | Emit lifecycle from the service immediately after the authoritative `insertRun` boundary | DONE |
| P0 | Typed contract | Use structured `started`/`finished` events keyed by `runId` | DONE |
| P0 | Test coverage | Hold provider completion and assert running state before the Bridge response settles | DONE |
| P1 | Race protection | Version run, conversation-list, and global-history refreshes by their owning slice | DONE |
| P1 | Documentation | Record lifecycle, error, readiness, and test contracts in Trellis specs | DONE |

## 4. Systematic Expansion

- Other long-running Bridge mutations should expose an authoritative start point rather than completion-only invalidation.
- Lifecycle consumers must register before producers advertise readiness.
- Async refresh versions must match state ownership: runs per conversation, conversations/history globally.

## 5. Knowledge Capture

- [x] Updated backend Codex Bridge code-spec.
- [x] Updated frontend state-management conventions.
- [x] Updated the cross-layer thinking checklist.
