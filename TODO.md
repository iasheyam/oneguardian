# Telematics Guardian — TODO

## Frontend cleanup — before rebrand (Option C — Slate palette) ✓ DONE

All 4 steps complete. Build is clean.

### ✓ 1. Consolidate CSS tokens into one file
`src/modules/admin/components/tokens.css` created — single `:root` source with dark defaults, light overrides, and `[data-theme]` explicit overrides. Imported only from `AdminShell.css`.

### ✓ 2. Replace all hardcoded hex values with tokens
All old palette hex values (`#37C2B8`, `#F2495B`, `#E0A63C`) replaced with `var(--adm-*)` tokens across all CSS and JSX files. RGB channel tokens (`--adm-*-rgb`) added for alpha patterns.

### ✓ 3. Extract shared CSS utilities and components
- `utilities.css` — `@keyframes adm-spin`, `@keyframes markerPulse`, `.adm-chip`, `.adm-chip--sm`
- `src/shared/components/StatusChip.jsx` — shared status chip using `color-mix`
- `src/shared/components/BackButton.jsx` — shared back navigation button
- `src/shared/constants/status.js` — single `UNIT_STATUS` definition, replaces 6 local copies

### ✓ 4. Apply Option C — Slate palette rebrand
`tokens.css` carries the full Slate palette. All remaining hardcoded legacy overlay/text colors updated to token equivalents. NavRail logout hover uses `var(--adm-duress)`.

## Design system updates ✓ DONE

### ✓ High-contrast token refresh (LCD/LED operator monitors)
All `--adm-*` tokens in `tokens.css` updated for wider luminance steps:
- Primary text → `#FFFFFF`, muted → `#B2C8D8` (8.6:1 on panel), dim → `#8AA4BC` (5.7:1 on panel, was 3.07:1)
- Background hierarchy — base `#060C18` → panel `#162840` → raised `#233C56` (wider, more distinct steps)
- Status colors pushed brighter: cyan `#26DEFF`, amber `#FF9830`, red `#FF3D66`, green `#2EECAA`
- Light mode: muted text `#1E3C58` (11:1 on panel, was 5.9:1), dim `#425E74` (6.5:1)

### ✓ Theme toggle (NavRail)
Theme button above logout: SunIcon/MoonIcon, persists to `localStorage`, sets `data-theme` on `<html>`. `useTheme()` hook in `src/shared/hooks/useTheme.js` watches via MutationObserver.

### ✓ Light-mode map support
- `MAP_STYLES.light` = `mapbox://styles/mapbox/streets-v12` (Google Maps–style: blue water, green parks)
- All 6 map instances (Dashboard, VehicleDetail, PrincipalDetail, MapStudio, 2× in Accounts) sync to app theme via `useTheme()`; switching to SAT overrides, MAP button restores theme style
- `MapControls.jsx` accepts `baseStyle` prop; MAP button active for both `'dark'` and `'light'`

### ✓ Map overlay theming (popups, controls, search, markers)
All map-overlay elements adapt to light/dark theme:
- `MapControls.css` — `--mc-*` token set (overlay bg, borders, button text, popup bg, shadow), full dark/light/`[data-theme]` overrides
- `MapSearch.css` — rewritten to use `--mc-*` tokens; search bar, results dropdown, input text/placeholder all theme-aware
- `Dashboard.css` — `.marker-label` background and `.marker-dot` border use `--mc-overlay-bg` / `--mc-popup-tip`

### ✓ Accounts page — account names all-caps
`text-transform: uppercase` on `.ac-account-card__name` (list cards) and `.ac-hero__name` (detail header); `letter-spacing` adjusted for all-caps readability.

## Pending validation

### Traccar geocoding outside the US
Traccar is configured to use Google Maps geocoding (`geocoder.type=google` in `/opt/traccar/conf/traccar.xml`).
This was verified to work accurately in the US (Valley Stream, NY).

**Action required:** Test with a device in Guatemala (or any non-US location). If the address returned by Traccar is inaccurate or missing, fall back to calling Google's Geocoding API directly from the backend at alert-fire time and store the result in `alerts.position.address`.

The reverse geocode function was removed from `src/shared/utils/googlePlaces.js` — restore it if the fallback is needed.
