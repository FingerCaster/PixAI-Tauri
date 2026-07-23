# React Hooks And Effects

## Current Pattern

The project has no shared `src/hooks/` layer today. Components use React hooks
directly and select shared behavior from `useAppStore`. Do not introduce a
custom hook merely to wrap one component or one store selector; extract one
only after repeated stateful behavior has a stable, testable contract.

There is no React Query/SWR server-state layer. PixAI talks to local services
and providers through `pixaiApi`, with Zustand coordinating refreshes.

## Effects Own External Synchronization

Use `useEffect` for lifecycle boundaries, not for ordinary derived values:

- `App.tsx` loads application data and registers Tauri bridge, focus, close,
  and notification listeners.
- `CanvasArea.tsx` polls active generation results and clears its timer.
- `GlobalSettingsModal.tsx` refreshes extension status when opened.
- `useLayoutEffect` is reserved for theme application before paint.

For async subscription APIs, use the established disposal pattern:

```ts
let disposed = false
let unlisten: (() => void) | null = null
void subscribe().then((next) => {
  if (disposed) void next()
  else unlisten = next
})
return () => {
  disposed = true
  if (unlisten) void unlisten()
}
```

This handles unmounting before the async subscription resolves. Always clean
up Tauri listeners, DOM listeners, intervals, and timeouts.

## Draft Persistence And Native Drop Events

- `Composer.tsx` persists prompt drafts on a 250 ms debounce. It uses refs for
  the current draft, last persisted draft, composition state, timer, and save
  version so an older async write cannot overwrite a newer edit or a switched
  conversation.
- Do not persist during an IME composition. Cancel the timer on composition
  start, save the final `currentTarget.value` on composition end, and flush the
  draft before generate or prompt-enrichment actions.
- Browser paste/drop can use a `FileList`, but desktop window drops arrive
  through `getCurrentWindow().onDragDropEvent`. Filter the drop to the prompt
  surface, turn native paths into payloads with `readLocalImageFile`, and use
  the async-listener disposal pattern before unmounting.
- Image display sources resolve asynchronously through `imageSourceForDisplay`.
  Guard the result with cancellation, as `Composer.tsx` does, so a stale
  reference list cannot replace the current one.

## Store Access

- Destructure several values/actions when a component truly consumes them
  together. Use selector calls for isolated values that should not rerender on
  unrelated state changes, as `GlobalSettingsModal` does.
- Inside long-lived callbacks that need the latest state, use
  `useAppStore.getState()` rather than capturing stale values. The close-to-tray
  callback in `App.tsx` is the reference.
- Zustand actions are stable effect dependencies. Include them in dependency
  arrays; do not suppress the dependency rules with comments.

## Derived Data And Memoization

- Compute cheap scalar selections directly.
- Use `useMemo` when sorting, flattening, or building identity-sensitive lists
  from persistent state. `CanvasArea` memoizes ordered runs, grid slots, and
  paged entries; `WorkspaceConfigPanel` memoizes compatible option lists.
- Do not mirror derived data into another `useState`. Reset only genuinely
  local workflow state, such as page number when the active conversation
  changes.

## Mistakes To Avoid

- Starting timers/listeners without a cleanup function.
- Making an effect `async`; create the promise inside the effect and handle
  disposal explicitly.
- Fetching provider data directly from a component instead of calling a store
  action/service.
- Adding a generic custom hook layer that only renames Zustand actions.
- Capturing preferences or active IDs in long-lived callbacks when the latest
  value is required.
- Saving draft text mid-composition or allowing an older debounced write to win.
- Treating a Tauri `onDragDropEvent` as a browser `DataTransfer` event, or
  leaving its asynchronous cleanup unresolved.
