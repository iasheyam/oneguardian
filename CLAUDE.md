# Telematics Guardian — Web Dashboard

## What this is

Telematics Guardian is a **technology-powered virtual security company**. Instead of physical security guards, operators monitor clients 24/7 from a control room using this dashboard. When something happens — a panic alert, a speed breach, a geofence violation — operators respond and dispatch.

This web dashboard is the **operator tool only**. Clients never log in here.

## Business model

B2B. Clients are onboarded by internal Telematics Guardian staff — not self-service. Current client profile: high net worth individuals and their families. The internal team sets up accounts, creates principals, assigns devices, and configures triggers. The client just uses the mobile app.

## Three-product vision

| Product | Audience | Status |
|---------|----------|--------|
| Web dashboard (this) | Security operators only | Active |
| Mobile app | Clients (individuals + families) | In development |
| Employer/manager dashboard | Business clients managing their own staff | Future |

## Tech stack

- **Frontend**: React 18 + Vite SPA, plain CSS with `--adm-*` CSS variables, React Router v6. Required env: `VITE_API_URL` (backend base URL — `http://localhost:3001` locally, EC2 public URL in production). This var is missing from `.env` and must be added manually.
- **Backend**: Express 5, Node.js ESM
- **Database**: PostgreSQL on AWS RDS, Drizzle ORM
- **Auth**: AWS Cognito (invite-only, no self-signup), JWT via Authorization header
- **Tracking**: Traccar server (self-hosted), WebSocket feed → position cache → trigger engine
- **Maps**: Mapbox (`react-map-gl/mapbox`, dark-v11 style), token at `VITE_MAPBOX_TOKEN`. Used in live map, unit detail, and place/plan forms. **Google Places API (New)** (`VITE_GOOGLE_MAPS_API_KEY`) for all location search — Mapbox renders, Google searches. `searchGoogle`/`retrieveGoogle` power the place/plan forms (`PlaceForm`, `LocationPicker` in `Accounts.jsx`). `reverseGeocode`/`getTimezoneId` drive the unit detail live tab. All functions in `src/shared/utils/googlePlaces.js`. Mapbox Searchbox API is no longer used.
- **Real-time**: SSE via `/api/live` endpoint, shared `server/sse.js` broadcast module
- **Storage**: AWS S3 (photos, logos)
- **Migrations**: Direct SQL via Node.js scripts (drizzle-kit has TTY issues in this env)

## Database schema

### accounts
Client engagements. No owner field yet — pending design decision on account access management.
- `type`: Corporate | Family | Government
- `status`: active | inactive | suspended
- Contact fields (name, email, phone) — primary contact info only, not linked to a user

### principals
People being protected/tracked.
- Belongs to an `account`
- `userId` — optional link to a Telematics Guardian user (for mobile app login). **UNIQUE** — one user can only be linked to one principal. Enforced at the DB level (`principals_user_id_unique` constraint). Send `userId: null` via PATCH to unlink.
- `primaryDeviceId` — the active tracking device
- Has medical info, emergency contacts, status
- `status`: normal | warning | duress | offline

### vehicles
Vehicles being tracked.
- Belongs to an `account`
- `primaryDeviceId` — the active tracking device
- `callsign` is the display name (NOT `name`)

### devices
Physical or software tracking devices (GPS trackers, phones running the mobile app, cameras, etc.)
- Belongs to either a `principal` OR a `vehicle` (not both)
- `traccarDeviceId` — the integer ID in Traccar. This is the critical link between Telematics Guardian and Traccar.
- When a principal uses the mobile app, their phone is a device of type `phone`

### groups
Named groupings of principals and vehicles within an account. Used for organizing large accounts.

### triggers
Alert rules evaluated against incoming position data.
- `isUniversal`: applies to all units of matching `unitType` without explicit assignment
- `isSystem`: system-managed triggers — not editable by operators. 8 pre-seeded zone triggers keyed by `(triggerType, riskLevel)`: `zone_entry` / `zone_exit` × `low` | `medium` | `high` | `critical`
- `unitType`: vehicle | principal | both
- `enabled`: only enabled triggers are evaluated (enforced in trigger engine)
- `cooldownSeconds`: null = system default (15 min), 0 = always fire
- `conditions`: JSONB — operator/value pairs for comparison triggers; `{ riskLevel: "high" }` for zone triggers

### triggerUnits
Explicit trigger-to-unit assignments (for non-universal triggers).

### alerts
Fired alert records.
- `isSimulation`: true when fired from the Testing page, false for real events
- `status`: active | acknowledged | resolved | false_alarm
- `position`: JSONB snapshot of speed/lat/lng/attributes at fire time
- `acknowledgedBy` / `resolvedBy` — user UUIDs

### userScopeAssignments
Controls which principals/vehicles an operator user can see. Operators are scoped to specific units within an account rather than seeing everything.

### activity_logs
Audit trail for all database mutations.
- `event` — dot-namespaced key (e.g. `account.created`, `alert.fired`, `trigger.unit_assigned`)
- `actorId` — FK to `users.id` (operator or client user who acted; null for system events)
- `subjectId` — free UUID (no FK) pointing to any entity: account, principal, vehicle, group, device, place, plan, zone, marker, trigger, or alert. **FK to `users` was intentionally dropped** so non-user entities can be referenced.
- `description` — human-readable past-tense sentence
- `metadata` — JSONB; `{ from, to }` for renames/role changes; `{ fields }` for bulk updates

### places
Account-level named locations with geofences. Used as reusable origins/destinations in plan legs.
- Belongs to an `account`
- `latitude` / `longitude` — resolved via Google Places API (New) on the client
- `mapboxId` — stored from Google Places for potential future re-resolution
- `radius` — geofence radius in metres (default 150)
- `color` — hex display color
- `traccarGeofenceId` — integer Traccar geofence ID. Set after Traccar sync. Exposed as `synced` boolean in API responses.

### zones
Global geofenced risk areas applied to all devices (not account-scoped).
- `geometry`: JSONB GeoJSON (Polygon or MultiPolygon), drawn in Map Studio
- `riskLevel`: `low` | `medium` | `high` | `critical` — drives alert severity symmetrically for entry and exit
- `enabled`: only enabled zones fire alerts
- `traccarGeofenceId`: integer Traccar geofence ID. Set after Traccar sync. Exposed as `synced` boolean in API responses.

### plans
Expected schedules or trips for units within an account.
- Belongs to an `account`
- `type`: `recurring` | `one_time`
- `enabled`: only enabled plans are evaluated by the plan engine
- Units assigned via `plan_units` (many-to-many)

### plan_units
Join table linking plans to units. Many-to-many.
- `unitId` / `unitType` — polymorphic, no direct FK; `unitType`: `principal` | `vehicle`
- Same-account constraint enforced at the API level (not DB level)

### plan_legs
Ordered waypoints within a plan.
- `legOrder` — ordering within the plan
- `originPlaceId` / `destinationPlaceId` — FK to `places`, both nullable
- Recurring: `daysOfWeek` JSONB (e.g. `[1,2,3,4,5]`, 0 = Sun), `windowStart` / `windowEnd` TEXT `'HH:MM'`
- One-time: `arrivalAt` / `departureAt` TIMESTAMPTZ

## Architecture

### Tracking pipeline
```
Traccar Server
  → WebSocket (traccar.js) → position cache
  → evaluatePositionTriggers (triggerEngine.js) → fireAlert → persistAlert → broadcast (sse.js)
  → geofenceEnter/Exit events → handleGeofenceEvent (geofenceAlerts.js) → persistAlert → broadcast (sse.js)
  → SSE clients (web dashboard + mobile app)
```

### Geofence alert pipeline (`server/geofenceAlerts.js`)
Handles Traccar WebSocket geofence crossing events for zones.
- `zoneTriggerCache`: Map(`${triggerType}|${riskLevel}` → trigger) — 8 system triggers loaded on startup
- `zoneGeofenceCache`: Map(traccarGeofenceId → { id, name, riskLevel, enabled }) — loaded from zones table
- `handleGeofenceEvent(event, pos)` — looks up zone → trigger → device entry → checks cooldown → persists alert → broadcasts
- `refreshZoneInCache(zone)` / `removeZoneFromCache(id)` — called from zone CRUD routes to keep cache hot
- `loadZoneTriggerCache()` — called on startup alongside `loadTriggerCache()`

### Traccar geofence sync (`server/traccarGeofence.js`)
Keeps Traccar geofences in sync with our zones and places.
- **WKT coordinate order**: Traccar uses `lat lng` order (NOT standard GIS `lng lat`). `server/utils/geo.js` converts GeoJSON → WKT in Traccar's expected format.
- **Zone sync**: `upsertGeofenceForZone` — POLYGON/MULTIPOLYGON WKT. On create, `linkGeofenceToAllDevices` links to every device in Traccar.
- **Place sync**: `upsertGeofenceForPlace` — `CIRCLE (lat lng, radius)` format. On create, `linkGeofenceToAccountDevices` links to account devices only.
- **New device registration**: `linkDeviceToAllGeofences(traccarDeviceId, accountId)` — links to all zones + account places. Called on both operator and mobile device creation routes.
- **Traccar notification requirement**: `geofenceEnter` and `geofenceExit` notifications with `notificators: "web"` must exist in Traccar for WebSocket events to be pushed. Without them, events appear in Traccar Reports but never reach our server. Create once via `POST /api/notifications` with `always: true`.

### Trigger engine
- `triggerCache`: Map(traccarDeviceId → { unitId, unitType, accountId, triggers[] }) — loaded on startup, refreshed after any trigger/device change
- `unitAccountCache`: Map(unitId → accountId) — reverse lookup used when broadcasting alerts to account SSE clients
- `cooldownMap`: Map(`${triggerId}:${unitId}` → lastFiredAt ms)
- `evaluatePositionTriggers(positions, collector?, isSimulation?)` — single function for both real and simulation paths
- `collector` array: when provided, captures per-position results (used by Testing page)

### Plan engine (`server/planEngine.js`) — implementation pending
Evaluates whether units are adhering to their assigned plans.
- **Position handler** (`handlePositionUpdate`): called alongside the trigger engine on every Traccar position. Checks unit against geofenced places, updates `unitPresence` map (Map<unitId → Set<placeId>>).
- **Window checker** (`checkPlanWindows`): `setInterval` every minute. For each enabled plan leg, checks if the window is currently active (right day + time). If active and unit hasn't reached `destinationPlaceId`, fires alert at `windowEnd`.
- **Alert strategy (v1)**: one alert per leg per window occurrence, fired at window close.
- **Cache**: `planCache` Map<unitId → [{ plan, legs, placeGeofences }]> — loaded on startup, refreshed when plans or places mutate.

### SSE
Two separate channels in `server/sse.js`. Avoids circular dependency between `traccar.js` and `triggerEngine.js`.
- `operatorClients` (Set) — `/api/live`, receives all positions + all alerts
- `clientsByAccount` (Map of accountId → Set) — `/api/client/live`, receives positions and alerts scoped to that account only
- Message types: `snapshot`, `positions`, `alert`

### Audit logging (`server/trackEvent.js`)
Fire-and-forget audit writer. Errors are caught silently — a failed log never blocks the main operation.
- Called after every database mutation across all pages: Accounts, Triggers, Map Studio, Admin, and Client API
- `alert.fired` is logged in both `triggerEngine.js` and `geofenceAlerts.js` — simulations (`isSimulation: true`) are skipped
- `subjectId` accepts any entity UUID; the FK constraint on `activity_logs.subject_id` was dropped so non-user entities can be referenced
- Event naming: dot-namespaced lowercase — `resource.verb` (e.g. `account.created`, `group.renamed`, `trigger.unit_assigned`)

### Map controls (`src/modules/admin/components/MapControls.jsx`)
Centralized overlay rendered inside every `<Map>` as a child. Uses `useMap()` hook — no `mapRef` prop needed.
- Groups: MAP/SAT style toggle · +/− zoom · Police/Hospital POI overlays (Overpass API, 6km radius around current center)
- Exports: `MAP_STYLES` (the two Mapbox style URLs), `UpuRow` (popup row helper also used by Dashboard unit popup)
- POI state is entirely internal; parents only hold `[mapStyle, setMapStyle]` and pass `mapStyle={MAP_STYLES[mapStyle]}` to `<Map>` and `<MapControls mapStyle={mapStyle} onStyleChange={setMapStyle} />` inside it
- Used in: Dashboard, MapStudio, PrincipalDetail, VehicleDetail

### Client API (`/api/client/` prefix)
For the mobile app. All routes require a valid JWT **and** a principal linked to the caller (`principals.userId = caller.id`). Returns `403` if not linked. All principals within an account share equal authority — any principal can read and update any other principal or vehicle in the same account. No intra-account role hierarchy at this time.
- `GET /api/client/account` — account info + flat unit roster
- `GET /api/client/principals/:id` — full principal detail (must be in caller's account); includes `medical` and `emergencyContact` nested objects
- `PATCH /api/client/principals/:id` — update principal; same whitelist as own-principal PATCH
- `GET /api/client/vehicles/:id` — full vehicle detail (must be in caller's account)
- `PATCH /api/client/vehicles/:id` — update vehicle; whitelist: `callsign`, `make`, `model`, `plate`, `armorLevel`
- `GET /api/client/live?token=<jwt>` — account-scoped SSE
- `GET /api/client/principal` — caller's own full principal record (profile + medical + emergency contact)
- `PATCH /api/client/principal` — update own profile; whitelist: `name`, `phone`, `email`, medical fields, `emergContact*`; `status`/`primaryDeviceId`/`photoKey` not editable here
- `GET /api/client/principal/devices` — list devices on caller's own principal
- `POST /api/client/principal/devices` — register a device; `type` defaults to `"phone"` if omitted, auto-sets as `primaryDeviceId` if principal has none
- `PATCH /api/client/principal/devices/:deviceId` — edit `name` / `model` only
- `PATCH /api/client/principal/primary-device` — set or clear `primaryDeviceId`; device must belong to caller's principal
- Places CRUD: `GET/POST /api/client/places`, `PATCH/DELETE /api/client/places/:placeId` — full Traccar geofence sync mirrored from operator routes
- Plans CRUD: `GET/POST /api/client/plans`, `PATCH/DELETE /api/client/plans/:planId` — GET inlines `originPlaceName`/`destinationPlaceName` in each leg to avoid N+1 on the client
- Groups CRUD: `GET/POST /api/client/groups`, `PATCH/DELETE /api/client/groups/:groupId`, `POST/DELETE /api/client/groups/:groupId/members` — account-scoped; returns `{ id, name, unitIds[] }`

### Auth
- `authenticate` middleware: validates Cognito JWT, attaches `req.caller`
- `requirePermission(perm)`: checks caller's role permissions
- `requireClientPrincipal`: async middleware, looks up `principals.userId = caller.id`, attaches `req.clientPrincipal { id, accountId }`
- Permission keys (one per nav item): `ops`, `units`, `feed`, `accounts`, `logs`, `alerts`, `triggers`, `testing`, `mapstudio`, `admin`
- System roles: **Admin** has all 10; **Operator** has `ops`, `units`, `feed`, `alerts`
- Route-level: alert routes require `alerts`; trigger routes require `triggers`; dev/sim routes require `testing`; zone/marker mutations require `mapstudio` (reads stay at `ops`)

## Key pages

- **OPS** (`ops`) — live map, fleet status; auto-centers on live unit concentration at load
- **UNIT** (`units`) — principal/vehicle detail; live tab: reverse-geocoded address, local time, speed, motion, battery (left) + position data grid (right)
- **FEED** (`feed`) — live camera feeds
- **ACCTS** (`accounts`) — account management (principals, vehicles, groups, devices, places, plans)
- **LOGS** (`logs`) — activity audit log
- **ALRT** (`alerts`) — alert management (acknowledge, resolve, filter simulation vs real)
- **TRIG** (`triggers`) — trigger configuration (CRUD, enable/disable, edit conditions)
- **TEST** (`testing`) — simulation testing (fake positions through real pipeline, `isSimulation: true`)
- **MAP** (`mapstudio`) — Map Studio: draw/manage global risk zones and account markers
- **ADMIN** (`admin`) — org settings, members, roles

## Pending design decisions

### Account access management (not yet designed)
Accounts currently have no owner field. Need to decide:
- How the primary client contact links to an account as "account manager"
- What permissions an account manager has (mobile app side, not dashboard side)
- Whether this requires a new `account_members` table or a field on `accounts`

This is needed before the mobile app's family management features can be built.

## Running locally

```bash
# Backend
node server/index.js

# Frontend
npm run dev

# Database studio
NODE_TLS_REJECT_UNAUTHORIZED=0 npx drizzle-kit studio

# Migrations (run SQL directly — drizzle-kit migrate has TTY issues)
node -e "import('./db/index.js').then(async ({db}) => { /* SQL here */ })"
```
