# Design: Restore live Bridge generation status

## Problem Boundary

The regression is a missing lifecycle boundary between the image service and Codex Bridge. The database already records a running generation before provider I/O, and the workspace already knows how to render and poll running runs. The fix should expose that existing state at the correct time rather than inventing a second generation model.

## Lifecycle Contract

Add an optional image-generation lifecycle argument at the service/API boundary:

```ts
type ImageGenerationLifecycle = {
  onRunStarted?: (run: GenerationRun) => void | Promise<void>
}
```

`ImageService.generate(input, lifecycle?)` invokes `onRunStarted` after `insertRun` returns and request controllers are registered, but before adapter/provider work begins. No callback is invoked for preflight failures because no authoritative run exists.

The observer is informational. Bridge event-delivery failure must not abort generation or leave a persisted run stranded solely because the UI notification failed.

## Bridge Event Contract

Keep the existing event name, `pixai://codex-bridge/changed`, and extend only generation payloads:

```ts
type CodexBridgeChange = {
  type: string
  createdAt: string
  phase?: 'started' | 'finished'
  conversationId?: string
  runId?: string
}
```

- `started` is emitted by the image-service lifecycle callback.
- `finished` is emitted in cleanup after a started generation settles, including success, provider failure, or cancellation.
- Settings, history, conversation, and prompt notifications retain their current `{ type, createdAt }` shape.
- A preflight rejection has no `runId`, so it emits neither generation phase.

Both `/generate` and `/images/:id/reedit` use the same helper so their lifecycle behavior cannot drift.

## UI Data Flow

```text
Bridge request
  -> prepare conversation/references
  -> ImageService persists running run
  -> onRunStarted(run)
  -> Tauri changed { phase: started, conversationId, runId }
  -> store marks generation active and switches to target workspace
  -> store loads conversation list + target runs
  -> CanvasArea renders/polls running run
  -> provider settles and run is finalized
  -> Tauri changed { phase: finished, conversationId, runId }
  -> store decrements generation state and refreshes runs/history
```

The start handler updates generation state and navigation synchronously before awaiting local database reads. This preserves an immediate pending placeholder even if the run refresh takes a moment. The fetched running run then replaces that temporary placeholder with the normal run-sized grid.

## Store Integration

Add a dedicated Bridge-change action instead of routing lifecycle events through the general `load()` path.

For `started`:

1. Deduplicate by `runId` and register the active Bridge run.
2. Call the existing generation-state helper for the target conversation.
3. Start the shared generation clock.
4. Set `view: 'workspace'` and `activeConversationId` to the event conversation, per the user's product decision.
5. Refresh conversations and the target conversation's runs.

For `finished`:

1. Remove the matching active Bridge `runId`; ignore duplicate/unknown finishes for counter purposes.
2. End one generation for its conversation and stop the clock only when no generation remains.
3. Refresh the target runs, conversations, and history without changing whatever conversation is active at finish time.

Maintain a monotonically increasing refresh version per target conversation. Async refresh results apply only when their captured version is still current, preventing a slow start refresh from overwriting a newer finish refresh.

Non-generation Bridge changes continue to use the existing general reload behavior.

## Concurrency And Compatibility

- Tracking active Bridge runs by `runId` makes lifecycle handling idempotent and allows multiple simultaneous runs in one conversation.
- Bridge counters compose with the existing local Composer counter because both use `beginConversationGeneration` and `endConversationGeneration`.
- Existing project conversation selection remains entirely in `prepareGeneration`; lifecycle code consumes its resolved `conversationId` and does not re-route.
- No database schema, persisted record, response body, route, or event name changes are required.

## Failure Handling

- Preflight error: no run, no start/finish event, existing HTTP error response remains.
- Provider error: image service finalizes the run as failed, then Bridge emits `finished`.
- Cancellation: image service finalizes the run, then Bridge emits `finished`.
- Unexpected error after start: Bridge emits `finished` in cleanup so UI state cannot remain active. Existing service behavior determines final database status.
- Event emission error: generation continues; the existing completion/reload paths and later lifecycle events remain best effort.

## Testing Strategy

- `image-service.test.ts`: defer provider completion and assert `onRunStarted` receives a persisted running run before the provider promise settles; assert preflight failures do not invoke it.
- `codex-bridge.test.ts`: verify `/generate` and `/reedit` pass through the lifecycle contract while preserving routing and response behavior.
- `app-store.test.ts`: drive structured start/finish events, verify immediate activation/generation state, final cleanup, duplicate safety, concurrency, and stale-refresh protection.
- Run the complete TypeScript build and Vitest suite after focused tests.

## Rollback

The change is code-only. Rollback removes the optional lifecycle argument, structured generation payloads, and dedicated store handler, then restores the existing general Bridge reload listener. No data migration or cleanup is needed.
