# Restore live Bridge generation status

## Goal

Restore immediate, visible generation progress in the PixAI workbench when image generation is initiated through Codex Bridge. The matching project conversation should become the active workspace as soon as a persisted running generation exists, without waiting for the provider request to finish.

## Background

- Bridge `/generate` currently awaits `api.image.generate(...)` before emitting `pixai://codex-bridge/changed`, so the UI only refreshes after generation completes (`src/services/codex-bridge.ts:272`, `src/services/codex-bridge.ts:277`).
- Bridge `/images/:id/reedit` has the same completion-only notification behavior (`src/services/codex-bridge.ts:294`, `src/services/codex-bridge.ts:315`).
- `ImageService.generate` persists a `GenerationRun` with `status: 'running'` only after provider, conversation, and capability preflight checks succeed (`src/services/image-service.ts:20`, `src/services/image-service.ts:42`). This is the authoritative lifecycle start point.
- `App` currently handles every Bridge change with a general reload and does not receive generation lifecycle metadata (`src/App.tsx:38`).
- Local Composer generation already marks its conversation as generating immediately and `CanvasArea` polls running runs every two seconds while that state is active (`src/store/app-store.ts:56`, `src/components/workspace/CanvasArea.tsx:104`).
- Project-scoped Bridge conversation routing and explicit `conversationId` precedence introduced by `5786060` must remain unchanged.

## Requirements

- **R1 - Authoritative start signal:** Expose a generation-start lifecycle hook from the image service and invoke it after the running run is persisted but before any provider image request is awaited.
- **R2 - Structured Bridge lifecycle:** `/generate` and `/images/:id/reedit` must emit generation change events for both `started` and `finished` phases. Generation events must identify the conversation and run; existing non-generation change consumers must remain compatible.
- **R3 - Immediate workspace visibility:** On a `started` event, the app must synchronously mark the target conversation as generating, start the generation clock, switch to the workspace and activate that conversation, then load its persisted running run.
- **R4 - Stable completion:** On a `finished` event, the app must clear exactly one matching Bridge generation state and refresh the target conversation's runs and history. Success, provider failure, and cancellation must all settle the visible state.
- **R5 - Race resistance:** Concurrent Bridge generations and out-of-order asynchronous refresh completion must not leave a false running indicator or replace newer run data with an older refresh result.
- **R6 - Preflight correctness:** Validation, configuration, or capability failures before `insertRun` must not emit a start lifecycle event and must not create a running tile.
- **R7 - Compatibility:** Preserve local Composer generation behavior, project-path isolation, explicit `conversationId` precedence, legacy no-project fallback, and existing Bridge response shapes.

## Out Of Scope

- Provider-specific percentage progress, partial image streaming, or changes to provider adapters.
- Rust Bridge transport or HTTP route changes.
- A new global/background generation center outside the existing workspace UI.
- Database schema changes or persistence of UI-only generation counters.

## Acceptance Criteria

- [x] With a deferred provider response, Bridge `/generate` activates the resolved conversation and shows a running placeholder before the Bridge HTTP response completes. (R1, R2, R3)
- [x] `/images/:id/reedit` provides the same live running behavior before its response completes. (R1, R2, R3)
- [x] A `projectPath` generation activates the corresponding project-scoped conversation; an explicit `conversationId` still takes precedence. (R3, R7)
- [x] Successful, failed, and canceled runs remove the active generation state and display refreshed final run/history data. (R4)
- [x] Two overlapping Bridge generations do not clear each other's state, and stale refreshes cannot overwrite the latest lifecycle refresh. (R4, R5)
- [x] A preflight error creates no run, emits no started state, and leaves no placeholder or timer behind. (R6)
- [x] Existing local Composer immediate-progress tests and Bridge routing tests continue to pass. (R7)
- [x] Focused automated tests cover lifecycle callback ordering, deferred generation visibility, completion cleanup, and preflight behavior.
