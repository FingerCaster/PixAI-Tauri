# Frontend State Management

## Layering

State flows through four distinct layers:

1. Components own ephemeral UI state.
2. `src/store/app-store.ts` owns cross-surface state and workflow orchestration.
3. `src/services/` owns business operations and persistence boundaries.
4. `src/adapters/` owns provider-specific protocol behavior.

`src/services/app-api.ts` composes service instances into `pixaiApi`, which is
the only API the store should orchestrate. Components call store actions rather
than constructing service graphs or provider requests.

## What Belongs Where

- Local component state: modal/tab selection, pagination, editor visibility,
  temporary input drafts, and in-flight button state that no sibling consumes.
- Zustand state: current view, active conversation, loaded settings and
  preferences, runs/history/templates, generation counters, update state,
  application feedback, and actions coordinating several services.
- Persisted service state: conversations/history (`AppDatabase`), provider
  metadata (`ProviderSettingsStore`), preferences (`AppPreferencesStore`), and
  prompt templates (`PromptTemplateStore`). These stores use
  `readJsonState`/`writeJsonState` through `lib/platform.ts`.
- Adapter state/behavior: capabilities and request/response conversion for an
  external provider. `getAdapter(profile.type)` is the dispatch point.

## Store Conventions

- Keep state and actions in the typed `AppState` contract. Use `set` for local
  transitions and `get` when an action depends on current state.
- For responsive editing, optimistically update the local conversation, then
  replace it with the normalized service result. See `updateActiveConversation`.
- Keep generation state per conversation and request index. Do not collapse it
  into a single global boolean; `generation-state.ts` and
  `removedGenerationIndexesByRunId` preserve concurrent and retry slots.
- Refresh the minimum owning slice after service mutations. For example,
  template actions reload templates and history actions reload history rather
  than rerunning the entire application load.
- Store updater progress in the dedicated `AppUpdateState` state machine.
  Persisted preferences do not own transient checking/downloading progress.

## Provider And Secret Boundaries

- Image and prompt providers have independent selected IDs. Preserve usage
  compatibility when profiles are edited or removed; `selectProfileForUsage`
  is the normalization authority.
- Persist profile metadata without raw API keys. Secrets go through
  `setProfileSecret`/`getProfileSecret`; only `apiKeyStored` and
  `insecureStorage` enter `ProviderProfile`.
- A provider adapter/profile advertises provider-level capabilities. Model-only
  restrictions use shared helpers such as `supportsImageInputFidelity`; do not
  duplicate either decision as component-local string checks.
- Normalize loaded persisted state to migrate old defaults and invalid
  selections. Corrupt local JSON falls back to explicit defaults rather than
  leaking unvalidated objects into the store.

## Notifications And Window State

The notification preference, current permission, and current window focus all
participate in the decision. `notifyGenerationFinished` sends completion or
failure notifications only when the preference is enabled, permission is
granted, and the window is unfocused. Notification failure is non-fatal and
must not change generation results.

## Anti-Patterns

- Direct file/localStorage access from components.
- Persisting the entire Zustand store as one opaque object.
- Putting raw API keys in provider settings, Bridge responses, or logs.
- Treating image and prompt provider selection as one field.
- Duplicating provider capability logic in UI branches.
- Replacing per-conversation generation maps with a global loading flag.
