# StreamKit dashboard design system

## Principles

- Preserve the existing Aurora Night identity; do not replace the app architecture or introduce a new UI library.
- Keep primary actions obvious and destructive actions explicit.
- Use sentence case for headings and action labels except established brand/protocol labels such as OBS, KHR, USD, TTS, and VoiceStudio.
- Every interactive control needs a visible focus state and an accessible name.
- Every asynchronous surface needs loading, empty, success, and error states.
- Motion is progressive: short, purposeful, and disabled under `prefers-reduced-motion: reduce`.

## Color tokens

Defined in `src/app/dashboard/dashboard-theme.css` under `.dashboard-shell`.

| Token | Value | Use |
| --- | --- | --- |
| `--aurora-bg` | `#0B1220` | Dashboard page background |
| `--aurora-panel` | `#0F172A` | Cards and panels |
| `--aurora-surface` | `#13203A` | Raised controls, subtle surfaces |
| `--aurora-mint` | `#10B981` | Positive status, primary confirmation |
| `--aurora-mint-deep` | `#0E5844` | Mint hover/active depth |
| `--aurora-sky` | `#0EA5E9` | Secondary accent, links |
| `--aurora-violet` | `#8B5CF6` | Creative/control accents |
| `--aurora-amber` | `#F59E0B` | Warnings, pending states |
| `--aurora-text` | `#F8FAFC` | Primary text |
| `--aurora-muted` | `#94A3B8` | Secondary text |
| `--aurora-border` | `#1E3350` | Borders and dividers |

Do not rely on color alone for status. Pair color with text or icons.

## Typography

- Display/control-room font: `Rajdhani`, sans-serif fallback.
- Body font: `Inter`, sans-serif fallback.
- Numeric amounts use tabular figures where available.
- Khmer copy must use an explicit Khmer-capable font such as `Noto Sans Khmer`; do not rely on browser fallback.
- Minimum body text: `14px`; minimum touch target: `44px` on mobile.

## Layout

- Desktop sidebar width: `288px`.
- Dashboard content uses `margin-left: 288px`; at `max-width: 900px` the sidebar becomes a drawer and content becomes full width.
- Cards use `12px`–`16px` radius, `1px --aurora-border`, and layered panel/surface backgrounds.
- Keep dense data tables horizontally scrollable on mobile instead of truncating critical values.
- Use `PageHeader` for secondary pages; the overview hero may remain custom.

## Components

### Buttons

- Primary: mint fill, strong text contrast, used for the single most important action in a region.
- Secondary: outlined or surface fill, used for alternate actions.
- Ghost: icon-only or low-emphasis actions; always include `aria-label`.
- Danger: red text/border and explicit confirmation for delete/reset actions.
- Disabled controls must explain why when the reason is not obvious.

### Cards and panels

- One clear heading, optional supporting copy, then content.
- Empty states must say what is missing and what action to take.
- Error states must say what failed and offer a retry/reset path when possible.

### Status and toasts

- Success and failure must differ by copy, tone, and icon.
- Never label a failed operation as `Success`.
- Toasts use a timer but must clear previous timers to avoid stale dismissal.

### Forms

- Label every input.
- Preserve a user's previous selection when a save fails.
- Local-only controls must be labeled as unavailable or removed until persisted behavior exists.
- Confirm destructive actions with the specific item name.

## Motion

- Use Framer Motion only for micro-interactions: panel entrance, subtle hover/focus, and state transitions.
- Keep durations short (`150ms`–`250ms`) and avoid parallax or large transforms in dense admin tables.
- Respect `prefers-reduced-motion: reduce`; disable nonessential transforms and loops.
- OBS overlays must preserve transparency and must not inherit dashboard shell backgrounds.

## Accessibility

- Keep the dashboard skip link and `main#main-content`.
- Maintain visible `:focus-visible` rings using sky/mint tokens.
- Use semantic headings in order; do not use styled `div`s as headings or buttons.
- Keep alerts live regions for toasts and async result messages.
- Icon buttons require `aria-label`.
- Mobile drawer close must return focus to the toggle when a route is selected.

## Server/client boundary

- Server components may load Supabase/admin data and pass serializable props down.
- Client components own state, event handlers, timers, modals, and browser APIs.
- Do not import `src/lib/supabase/admin.ts` or other `server-only` modules into client components.
- Keep API routes as the only mutation path for client-created UI actions.

## Verification checklist

- `npm test`
- `npm run lint` with zero errors
- `npx tsc --noEmit`
- `npm run verify:migrations`
- Confirm no visible mojibake in touched copy.
- Confirm every visible navigation destination has a page.
- Confirm all new client components compile under the server/client boundary.
- Confirm reduced-motion and OBS transparency are unchanged.
