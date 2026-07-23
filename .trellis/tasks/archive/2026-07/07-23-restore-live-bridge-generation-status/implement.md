# Implementation Plan: Restore live Bridge generation status

## Ordered Steps

- [x] Define the optional image-generation lifecycle callback type and thread it through `ImageService.generate` and `createPixaiApi().image.generate`.
- [x] Invoke `onRunStarted` only after the running run and cancellation controllers exist, before provider requests begin.
- [x] Add focused image-service tests for callback ordering and absence on preflight failure.
- [x] Define/export the structured Codex Bridge change payload and centralize generation lifecycle notification logic shared by `/generate` and `/reedit`.
- [x] Emit best-effort `started` and `finished` generation events with `conversationId` and `runId`, preserving legacy event fields and Bridge response behavior.
- [x] Add store state/action support for active Bridge run IDs, synchronous workspace activation, generation counters, versioned data refresh, and completion cleanup.
- [x] Update `App.tsx` to route structured Bridge changes to the store action while retaining general reload behavior for other change types.
- [x] Add deferred and concurrent lifecycle tests covering `/generate`, `/reedit`, project conversation activation, duplicate events, stale refreshes, terminal cleanup, and preflight errors.
- [x] Run focused Vitest files and resolve failures.
- [x] Run the full project quality gate, inspect the diff for scope/compatibility, and perform the Trellis spec-update step.

## Validation Commands

```powershell
corepack pnpm test -- src/services/image-service.test.ts src/services/codex-bridge.test.ts src/store/app-store.test.ts
corepack pnpm check
corepack pnpm build
git diff --check
```

## Risky Files And Rollback Points

- `src/services/image-service.ts`: callback placement defines the authoritative lifecycle boundary. Roll back if it can fire before persistence/preflight or after provider work starts.
- `src/services/codex-bridge.ts`: both generation routes must share lifecycle handling; preserve all response status/body semantics.
- `src/store/app-store.ts`: counters, timers, active conversation navigation, and async refresh ordering are coupled. Keep changes isolated behind one Bridge event action.
- `src/App.tsx`: retain cleanup of the Tauri listener and legacy handling for non-generation notifications.

## Review Gates

- [x] Planning artifacts contain no unresolved product questions.
- [x] User explicitly approves task activation after reviewing this plan.
- [x] Focused lifecycle tests pass before the full suite.
- [x] Full `check` and `build` pass.
- [x] No database or Bridge response compatibility changes appear in the final diff.
