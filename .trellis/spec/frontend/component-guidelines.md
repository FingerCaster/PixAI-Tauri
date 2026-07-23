# Frontend Component Guidelines

## Component Shape

- Use named function components. Keep top-level page/shell components focused
  on selection and composition; move pure transformations into nearby `.ts`
  modules when they need independent tests. `Workspace.tsx` delegates grid
  slot construction to `workspace-placeholders.ts` and summaries to
  `workspace-summary.ts`.
- Use local state for ephemeral presentation state such as the active settings
  tab, modal visibility, pagination, and pending button state. Use Zustand for
  state shared across surfaces or tied to application workflows.
- Define short, one-use prop shapes inline, as in `MainLayout` and
  `GlobalSettingsModal`. Export a named type when another module consumes the
  contract, such as `GlobalSettingsTab` and `GallerySelectOption`.
- Keep async event handlers explicit with `void` at the JSX boundary. The
  owning store/service must surface or intentionally absorb failures.

## UI Foundation

- Prefer project-owned shadcn/Radix primitives from `@/components/ui/*` for
  buttons, dialogs, tabs, selects, scroll areas, switches, tooltips, and
  feedback. Use Lucide icons rather than handwritten SVGs.
- Compose appearance with semantic Tailwind tokens (`bg-background`,
  `text-muted-foreground`, `border-border`). Do not add large groups of raw
  light/dark colors in feature components.
- Use `cn(...)` for conditional class sets. Preserve the `components.json`
  aliases and the `src/index.css` CSS-variable theme model; the app does not
  use `next-themes`.
- This is a fixed desktop workbench, not a mobile web layout. The shell and
  global CSS deliberately enforce a minimum viewport. Maintain scan-friendly,
  compact controls rather than adding marketing-page composition.

## Layout Invariants

- Every scrollable child inside a flex/grid desktop pane needs a bounded chain:
  ancestors use `min-h-0`, the scrolling child uses `flex-1` plus
  `overflow-auto` or `ScrollArea`, and fixed headers/footers use `shrink-0`.
  See `MainLayout.tsx`, `Workspace.tsx`, and `CanvasArea.tsx`.
- Result grids use `auto-rows-max content-start items-start`. Do not use
  `auto-rows-fr`; sparse final rows must not stretch image cards vertically.
- Fixed-format tool rows must keep stable widths and prevent text wrapping from
  resizing the layout. The compact workspace pagination in `CanvasArea.tsx`
  is the reference.
- Keep current-conversation controls one level away in
  `WorkspaceConfigPanel`. Do not move provider management, notifications,
  updates, or extensions back into that panel; those belong to the global
  settings modal.

## Interaction And Accessibility

- Use native/shadcn interactive elements whenever possible and provide
  `type="button"`, labels, disabled states, and dialog titles/descriptions.
- Icon-only controls require an accessible label or descriptive `title`.
- When a secondary action lives inside a clickable row/tile, prevent event
  propagation and preserve keyboard activation. The session delete affordance
  in `MainLayout.tsx` demonstrates the existing compatibility pattern.
- Closing a nested modal or backdrop must not reopen its parent tile. Preserve
  the propagation tests in `ErrorDetailsModal.test.tsx` and
  `ImageTile.test.tsx` when editing previews.
- Hidden file inputs may remain when the browser file picker requires a real
  input element; the visible trigger and preview/removal actions must remain
  separate, as tested in `Composer.test.tsx`.
- Route every destructive UI action through `confirmDestructiveAction` from
  `src/lib/confirm.ts`. Tauri uses its native warning dialog; browser tests and
  fallback use `window.confirm`. A declined dialog or dialog error must return
  before the store/service mutation. This applies to deleting sessions,
  providers, templates, history items, references, and batch operations.

## Common Mistakes

- Importing `useAppStore` into `components/ui/` primitives.
- Adding a second global stylesheet or bypassing theme tokens.
- Nesting page sections in decorative cards; reserve cards for actual settings
  groups, repeated items, and framed tools.
- Omitting `min-h-0` anywhere in a nested scroll chain.
- Combining high-frequency conversation parameters with application settings.
- Letting an icon click bubble into the preview/open action underneath it.
- Calling `window.confirm` directly from product UI instead of the shared
  desktop-aware confirmation boundary.
