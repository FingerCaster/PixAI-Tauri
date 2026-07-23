# Frontend Type Safety

## Compiler Contract

`tsconfig.json` enables `strict`, `noUnusedLocals`, `noUnusedParameters`, and
`noFallthroughCasesInSwitch`. Keep `pnpm build` and `pnpm check` clean without
loosening these options or adding broad suppression comments.

## Type Ownership

- Put domain contracts shared across components, services, adapters, and the
  Bridge in `src/shared/types.ts`.
- Put pure domain option unions/defaults in `src/shared/image-options.ts`.
- Keep adapter contracts in `src/adapters/types.ts`, store-only contracts in
  `src/store/`, and presentation-only types beside their component.
- Derive update inputs from authoritative entities with `Partial<Pick<...>>`,
  as `ConversationUpdate`, `ProviderSettingsUpdate`, and
  `AppPreferencesUpdate` do. Do not hand-maintain duplicate optional shapes.

## Prefer Closed Contracts

- Use string-literal unions for finite states: image quality/status, provider
  usage/capabilities, updater state, and generation mode.
- Use discriminated unions for variant data. `WorkspaceRunGridSlot` and
  workspace entries branch on `type`; updater installation branches on
  `action`/`installMode`.
- Model nullable persisted values explicitly. Do not replace `null` with an
  omitted field when storage and UI distinguish them.
- Use typed adapter interfaces so every provider implements connection tests,
  image generation, and prompt assistance consistently.

## Runtime Boundaries

TypeScript types do not validate JSON or bridge input. At external/persisted
boundaries:

- Parse `unknown`, narrow objects, and validate finite values before casting.
  `codex-bridge.ts` uses `readOptionalString`, allowed-value arrays, and
  `BridgeHttpError` for this purpose.
- Normalize stored settings and conversations after `JSON.parse`; do not cast
  and immediately expose raw persisted data.
- Convert Tauri/Rust snake_case response fields in `lib/platform.ts` and keep
  the public TypeScript result camelCase.
- Normalize non-`Error` failures before displaying or classifying them.
  `app-update.ts` and `PlatformHttpProxyError` preserve structured diagnostics.
- A `ReferenceImage` separates transient `dataUrl` payload data from the native
  `storagePath`. On load, normalize legacy `asset.localhost` and local-path
  values into `storagePath`; UI must resolve them through
  `imageSourceForDisplay*`, never cast a filesystem path into an image URL.
- Remote provider image URLs cross the `readRemoteImageUrl` platform boundary
  before persistence. Keep the service contract as a normalized image payload,
  not an arbitrary remote URL or unvalidated response body.

The project currently uses focused validation helpers rather than Zod or
another schema package. Reuse the owning normalizer before adding a second
validation style.

## Secret And Compatibility Types

`ProviderRuntimeProfile` is the only provider shape augmented with a raw
`apiKey`; it stays inside service/adapter execution. Public settings use
`apiKeyStored`. `LegacyProviderSettingsUpdate` exists for Bridge compatibility
and may accept legacy field spellings, but responses must remain redacted.

`ImageGenerationCallLog` is a public diagnostic shape only after adapter
sanitization: authorization values, data URLs, base64 image data, and oversized
strings must be redacted or summarized. When adding `imageGenerationEndpoint`
or another provider enum/field, update the profile normalizer, Bridge input,
adapter dispatch, workspace UI, fixtures, and tests together.

## Forbidden Patterns

- `any`, `as unknown as T`, or unchecked JSON casts at trust boundaries.
- Open-ended `string` for a value with a known finite set.
- Duplicating Rust command/event payload fields in several local component
  types.
- Returning raw caught values directly to the UI without normalization.
- Adding a capability or state variant without updating consumers and tests.
- Rendering a raw local path as `img.src`, or persisting it in `dataUrl`.
- Exposing a raw Authorization header or binary request body in a call log.
