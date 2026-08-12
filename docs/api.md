# Telematics Guardian — API Reference

## Overview

Base URL: `http://localhost:3001` (dev) / `https://api.telematicsguardian.com` (prod)

All authenticated requests require:
```
Authorization: Bearer <cognito-jwt>
```

The token can also be passed as a query param `?token=<jwt>` for endpoints that don't support headers (SSE).

---

## Auth & Permissions

### Permission system
Permissions are attached to **roles**. Each operator user has one role. Roles define which permissions are granted.

| Permission   | Controls access to |
|--------------|-------------------|
| `ops`        | Live operations map, zones/markers read, fleet overview |
| `units`      | Principal and vehicle detail views |
| `feed`       | Activity feed |
| `accounts`   | Account CRUD, principal/vehicle/device/place/plan management |
| `logs`       | Activity log |
| `alerts`     | View, acknowledge, and resolve fired alerts |
| `triggers`   | View and configure alert triggers and rules |
| `testing`    | Run simulation tests through the trigger pipeline |
| `mapstudio`  | Draw and manage risk zones, map markers (mutations only) |
| `admin`      | Members, roles, user scope assignments |

System roles: **Admin** has all 10. **Operator** has `ops`, `units`, `feed`, `alerts`.

---

## Auth Endpoints

### `POST /api/auth/provision`
Called by the frontend immediately after Cognito login. Creates a DB user record on first login, or updates `lastActiveAt` on subsequent logins. Links to a pending invitation if one exists for the email.

**Body**
```json
{ "cognitoSub": "string", "name": "string", "email": "string" }
```

**Response** — full user object (same shape as `GET /api/me`)

---

## Shared Endpoints

### `GET /api/me`
Returns the authenticated caller's profile.

**Auth:** any authenticated user

**Response**
```json
{
  "id": "uuid",
  "name": "string",
  "email": "string",
  "phone": "string | null",
  "type": "internal | client",
  "role": "string | null",
  "roleColor": "string | null",
  "status": "online | offline",
  "twoFactor": false,
  "permissions": ["ops", "units", "..."]
}
```

> **Mobile note:** `/api/me` returns `principalId` and `accountId` for client users. If both are `null`, the user has no linked principal.

---

## Operator API

> All routes below require an operator user (internal Telematics Guardian staff). Clients never call these.

---

### Members & Invitations

#### `GET /api/users`
**Permission:** `admin`

Returns all users with their role and employee profile.

#### `POST /api/users`
**Permission:** `admin`

Invites a new member. Creates a Cognito user and sends a temporary password email.

**Body**
```json
{
  "name": "string",
  "email": "string",
  "inviterSub": "cognito-sub-of-caller"
}
```

#### `PATCH /api/users/:id`
**Permission:** `admin`

Updates a user's profile. All fields optional.

**Body**
```json
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "roleId": "uuid",
  "twoFactor": false,
  "jobTitle": "string",
  "department": "string",
  "employeeId": "string"
}
```

#### `GET /api/users/by-email?email=`
**Permission:** `accounts`

Looks up a user by their exact email address. Used when assigning a user to a principal.

**Response**
```json
{ "id": "uuid", "name": "string", "email": "string" }
```
`404` if no user found.

#### `GET /api/invitations`
**Permission:** `admin` — lists all pending invitations.

#### `POST /api/invitations/:id/resend`
**Permission:** `admin` — resends the invite email.

---

### Roles

#### `GET /api/roles`
**Permission:** `admin` — lists all roles with their permissions.

#### `POST /api/roles`
**Permission:** `admin`

**Body**
```json
{ "name": "string", "description": "string", "color": "#hex", "permissions": ["ops", "units"] }
```

#### `PATCH /api/roles/:id`
**Permission:** `admin` — same body as POST, all fields optional.

#### `DELETE /api/roles/:id`
**Permission:** `admin` — fails with `409` if any user is assigned this role. System roles cannot be deleted.

---

### User Scope Assignments

Controls which units an operator can see. Operators without `accounts` permission are scoped to only their assigned units.

#### `GET /api/users/:userId/assignments`
**Permission:** `admin`

#### `POST /api/users/:userId/assignments`
**Permission:** `admin`

**Body**
```json
{ "accountId": "uuid", "scopeType": "principal | vehicle", "scopeId": "uuid" }
```

#### `DELETE /api/users/:userId/assignments/:assignmentId`
**Permission:** `admin`

---

### Activity Logs

#### `GET /api/logs`
**Permission:** `logs`

**Query params:** `actorId`, `subjectId`, `event`, `from`, `to`, `limit` (default 100), `offset`

**Response** — array of log entries:
```json
{
  "id": "uuid",
  "event": "string",
  "description": "string",
  "metadata": {},
  "createdAt": "iso-datetime",
  "actor": { "id": "uuid", "name": "string" } | null,
  "subject": { "id": "uuid", "name": "string" } | null
}
```

#### `GET /api/users/:id/logs`
**Permission:** `logs` — logs for a specific user.

---

### Accounts

An account is a client engagement. Contains people (principals) and vehicles.

#### `GET /api/accounts`
**Auth:** any authenticated operator

Returns all accounts the caller has access to. Users with `accounts` permission see everything. Others see only accounts containing units assigned to them via scope assignments.

**Response** — array of account objects (see full shape below)

#### `POST /api/accounts`
**Permission:** `accounts`

**Body**
```json
{
  "name": "string",
  "type": "Corporate | Family | Government",
  "industry": "string",
  "status": "active | inactive | suspended",
  "contactName": "string",
  "contactEmail": "string",
  "contactPhone": "string"
}
```

#### `PATCH /api/accounts/:id`
**Permission:** `accounts` — same body as POST, all fields optional.

#### `DELETE /api/accounts/:id`
**Permission:** `accounts` — cascades to all units and groups.

**Account object shape**
```json
{
  "id": "uuid",
  "name": "string",
  "type": "Corporate | Family | Government",
  "industry": "string | null",
  "status": "active | inactive | suspended",
  "contact": { "name": "string", "email": "string", "phone": "string" },
  "createdAt": "iso-datetime",
  "units": [ /* array of person and vehicle objects */ ],
  "groups": [ { "id": "uuid", "name": "string", "unitIds": ["uuid"] } ]
}
```

---

### Principals (People)

#### `POST /api/accounts/:accountId/principals`
**Permission:** `accounts`

**Body**
```json
{
  "name": "string",
  "role": "string",
  "phone": "string",
  "email": "string",
  "status": "normal | warning | duress | offline",
  "emergency": {
    "dob": "YYYY-MM-DD",
    "height": "string",
    "bloodGroup": "A+ | A− | B+ | ...",
    "allergies": "string",
    "conditions": "string",
    "medications": "string",
    "contactName": "string",
    "contactPhone": "string",
    "contactRelation": "string"
  }
}
```

#### `PATCH /api/accounts/:accountId/principals/:id`
**Permission:** `accounts`

Same body as POST, all fields optional. Also accepts:

```json
{ "userId": "uuid | null" }
```

`userId` links the principal to a Telematics Guardian user (gives them mobile app access). One user can only be linked to one principal — `409` if already assigned elsewhere. Send `null` to unlink.

#### `DELETE /api/accounts/:accountId/principals/:id`
**Permission:** `accounts`

**Principal object shape** (inside `account.units`)
```json
{
  "id": "uuid",
  "type": "person",
  "name": "string",
  "role": "string | null",
  "phone": "string | null",
  "email": "string | null",
  "status": "normal | warning | duress | offline",
  "primaryDeviceId": "uuid | null",
  "userId": "uuid | null",
  "userEmail": "string | null",
  "userName": "string | null",
  "devices": [ /* device objects */ ],
  "emergency": { /* same fields as POST body */ }
}
```

---

### Vehicles

#### `POST /api/accounts/:accountId/vehicles`
**Permission:** `accounts`

**Body**
```json
{
  "name": "string",
  "make": "string",
  "model": "string",
  "plate": "string",
  "armorLevel": "B6 Armored | B4 Armored | B2 Armored | Soft skin",
  "status": "normal | warning | duress | offline"
}
```

> Note: `name` in the request maps to `callsign` in the DB. The field is named `name` on the API surface for consistency with the frontend form but stored as `callsign`.

#### `PATCH /api/accounts/:accountId/vehicles/:id`
**Permission:** `accounts` — same body, all fields optional.

#### `DELETE /api/accounts/:accountId/vehicles/:id`
**Permission:** `accounts`

---

### Groups

Groups are named subsets of units within an account, used for organizing large client rosters.

#### `POST /api/accounts/:accountId/groups`
**Permission:** `accounts` — body: `{ "name": "string" }`

#### `PATCH /api/accounts/:accountId/groups/:id`
**Permission:** `accounts` — body: `{ "name": "string" }`

#### `DELETE /api/accounts/:accountId/groups/:id`
**Permission:** `accounts` — units remain in the account roster.

#### `POST /api/accounts/:accountId/groups/:groupId/members`
**Permission:** `accounts` — body: `{ "principalId": "uuid" }` or `{ "vehicleId": "uuid" }`

#### `DELETE /api/accounts/:accountId/groups/:groupId/members`
**Permission:** `accounts` — same body as POST.

---

### Places

Named, geolocated places at the account level. Used as reusable locations for plan legs and geofence triggers. Coordinates are resolved via **Google Places API (New)** on the client before sending.

Places are automatically synced to Traccar as `CIRCLE` geofences when created or updated. Devices in the same account are auto-linked to the Traccar geofence.

#### `GET /api/accounts/:accountId/places`
**Permission:** `accounts` — returns all places for the account.

**Response**
```json
[{ "id": "uuid", "name": "School", "address": "Lincoln High School, Los Angeles, CA", "mapboxId": "place.abc123", "latitude": 34.05, "longitude": -118.25, "radius": 150, "color": "#2563eb", "synced": true }]
```
`synced: true` means a Traccar geofence exists for this place.

#### `POST /api/accounts/:accountId/places`
**Permission:** `accounts`

**Body**
```json
{
  "name":      "School",                              // required
  "latitude":  34.0522,                               // required — resolved by Google Places on the client
  "longitude": -118.2437,                             // required
  "address":   "Lincoln High School, Los Angeles, CA",// optional — human-readable
  "mapboxId":  "place.abc123",                        // optional — Google Places ID (stored for reference)
  "radius":    150,                                   // optional — metres, default 150
  "color":     "#2563eb"                              // optional — default blue
}
```

**Response** — place object

#### `PATCH /api/accounts/:accountId/places/:placeId`
**Permission:** `accounts` — all fields optional, only provided fields are updated.

#### `DELETE /api/accounts/:accountId/places/:placeId`
**Permission:** `accounts`

---

---

### Zones

Global geofenced risk areas. Not account-scoped — zones apply to all tracked units. Drawn in Map Studio. Automatically synced to Traccar as POLYGON/MULTIPOLYGON geofences. All registered devices are auto-linked on zone creation; new devices are auto-linked on registration.

#### `GET /api/zones`
**Permission:** `ops` — returns all zones.

**Response**
```json
[{
  "id":          "uuid",
  "name":        "Downtown High Risk",
  "description": "string | null",
  "geometry":    { "type": "Polygon", "coordinates": [[...]] },
  "riskLevel":   "low | medium | high | critical",
  "enabled":     true,
  "synced":      true,
  "createdAt":   "iso-datetime",
  "updatedAt":   "iso-datetime"
}]
```
`synced: true` means a Traccar geofence exists for this zone.

#### `POST /api/zones`
**Permission:** `mapstudio`

**Body**
```json
{
  "name":        "Downtown High Risk",  // required
  "geometry":    { "type": "Polygon", "coordinates": [[...]] },  // required — GeoJSON Polygon or MultiPolygon
  "riskLevel":   "high",               // optional — "low" | "medium" | "high" | "critical", default "low"
  "description": "string"              // optional
}
```

**Response** — zone object as above.

#### `PATCH /api/zones/:id`
**Permission:** `mapstudio` — all fields optional. Re-syncs Traccar geofence if `name` or `geometry` changes.

Also accepts `"enabled": false` to disable the zone without deleting it.

#### `DELETE /api/zones/:id`
**Permission:** `mapstudio` — removes the Traccar geofence (which cascades device-link removal in Traccar) then deletes the DB record.

---

### Plans

Plans define expected schedules or trips for a specific unit within an account. Each plan has one or more **legs** (waypoints with timing info). Plans are managed inline — legs are sent in the body when creating or updating a plan.

- `type: "recurring"` — runs on specified days of the week within a time window
- `type: "one_time"` — a single trip with absolute timestamps

#### `GET /api/accounts/:accountId/plans`
**Permission:** `accounts` — returns all plans for the account, each with their legs.

**Response**
```json
[{
  "id":        "uuid",
  "name":      "School Run",
  "type":      "recurring",
  "enabled":   true,
  "notes":     null,
  "createdAt": "2026-01-01T00:00:00Z",
  "updatedAt": "2026-01-01T00:00:00Z",
  "units": [
    { "unitId": "uuid", "unitType": "principal" }
  ],
  "legs": [{
    "id":                  "uuid",
    "legOrder":            0,
    "originPlaceId":       "uuid",
    "destinationPlaceId":  "uuid",
    "daysOfWeek":          [1,2,3,4,5],
    "windowStart":         "07:30",
    "windowEnd":           "08:30",
    "arrivalAt":           null,
    "departureAt":         null
  }]
}]
```

#### `POST /api/accounts/:accountId/plans`
**Permission:** `accounts`

**Body**
```json
{
  "name":     "School Run",    // required
  "type":     "recurring",     // optional — "recurring" | "one_time", default "recurring"
  "enabled":  true,            // optional — default true
  "notes":    null,            // optional
  "units": [                   // required — at least one
    { "unitId": "uuid", "unitType": "principal | vehicle" }
  ],
  "legs": [{
    "legOrder":            0,       // optional — defaults to array index
    "originPlaceId":       "uuid",  // optional
    "destinationPlaceId":  "uuid",  // optional
    "daysOfWeek":          [1,2,3,4,5], // recurring only — 0=Sun, 6=Sat
    "windowStart":         "07:30", // recurring only — "HH:MM"
    "windowEnd":           "08:30", // recurring only — "HH:MM"
    "arrivalAt":           null,    // one_time only — ISO timestamp
    "departureAt":         null     // one_time only — ISO timestamp
  }]
}
```

**Response** — full plan object with legs

#### `PATCH /api/accounts/:accountId/plans/:planId`
**Permission:** `accounts` — all top-level fields optional. If `legs` is provided, all existing legs are replaced with the new set.

#### `DELETE /api/accounts/:accountId/plans/:planId`
**Permission:** `accounts` — cascades to plan legs.

---

### Devices

Devices belong to either a principal or a vehicle (not both). Creating a device auto-registers it in Traccar.

#### `POST /api/accounts/:accountId/units/:unitId/devices`
**Permission:** `accounts`

**Body**
```json
{
  "name": "string",
  "type": "gps | camera | alert | radio | phone | other",
  "model": "string",
  "serial": "string",
  "imei": "string",
  "firmware": "string",
  "status": "online | offline"
}
```

On creation, if `imei` or `serial` is provided it is used as the Traccar `uniqueId`; otherwise a UUID is generated. `traccarDeviceId` (integer from Traccar) is stored automatically.

#### `PATCH /api/accounts/:accountId/units/:unitId/devices/:deviceId`
**Permission:** `accounts` — same fields, all optional. Also accepts `traccarDeviceId` directly.

#### `DELETE /api/accounts/:accountId/units/:unitId/devices/:deviceId`
**Permission:** `accounts` — also removes the device from Traccar.

#### `PATCH /api/accounts/:accountId/units/:unitId/primary-device`
**Permission:** `accounts`

**Body:** `{ "deviceId": "uuid | null" }` — sets or clears the primary tracking device.

**Device object shape**
```json
{
  "id": "uuid",
  "name": "string",
  "type": "gps | camera | alert | radio | phone | other",
  "model": "string | null",
  "serial": "string | null",
  "imei": "string | null",
  "firmware": "string | null",
  "status": "online | offline",
  "traccarDeviceId": "string | null"
}
```

---

### Live Feed (SSE)

#### `GET /api/live`
**Auth:** any authenticated operator

Server-Sent Events stream. Broadcasts to all connected operator clients. Pass the JWT as a query param since browser `EventSource` doesn't support custom headers.

```
GET /api/live?token=<jwt>
```

**Message types**

`snapshot` — sent immediately on connect with the full current position cache:
```json
{ "type": "snapshot", "positions": { "<traccarDeviceId>": { "deviceId": 1, "speed": 0, "latitude": 0, "longitude": 0, "attributes": {} } } }
```

`positions` — sent on every Traccar position update:
```json
{ "type": "positions", "positions": [ { "deviceId": 1, "speed": 42.5, "latitude": 25.1234, "longitude": 55.5678, "attributes": { "alarm": "sos" } } ] }
```

`alert` — sent when a trigger fires:
```json
{
  "type": "alert",
  "alert": {
    "id": "uuid",
    "triggerId": "uuid",
    "triggerName": "High Risk Zone Entry",
    "triggerType": "zone_entry | zone_exit | speed | panic_button | ...",
    "unitId": "uuid",
    "unitType": "vehicle | principal",
    "unitName": "string | null",
    "severity": "red_alert | warning | advisory",
    "status": "active",
    "position": { "speed": 120, "latitude": 25.1, "longitude": 55.5, "attributes": {} },
    "isSimulation": false,
    "firedAt": "iso-datetime",
    "zoneName": "Downtown High Risk",
    "zoneRiskLevel": "high"
  }
}
```
`zoneName` and `zoneRiskLevel` are only present on `zone_entry`/`zone_exit` alerts. `unitName` is included in geofence alerts; may be `null` on position-trigger alerts fired via SSE.

> **Note:** This endpoint currently broadcasts all positions to all connected clients with no account filtering. Account-scoped filtering is planned as part of the `/api/client/live` endpoint.

---

### Triggers

#### `GET /api/triggers`
**Permission:** `triggers` — all triggers.

#### `PATCH /api/triggers/:id`
**Permission:** `triggers`

**Body**
```json
{
  "name": "string",
  "severity": "red_alert | warning | advisory",
  "unitType": "vehicle | principal | both",
  "enabled": true,
  "cooldownSeconds": 900,
  "conditions": { "operator": ">", "value": 120 }
}
```

`cooldownSeconds: null` uses the system default (15 min). `cooldownSeconds: 0` fires every time with no cooldown.

#### `GET /api/triggers/for-unit?unitId=&unitType=`
**Permission:** `triggers` — returns triggers assigned to a specific unit (universal + explicit assignments).

#### `POST /api/trigger-units`
**Permission:** `triggers` — assigns a trigger to a specific unit.

**Body:** `{ "triggerId": "uuid", "unitId": "uuid" }`

#### `DELETE /api/trigger-units`
**Permission:** `triggers` — same body as POST.

---

### Alerts

#### `GET /api/alerts/active`
**Permission:** `alerts`

Returns all alerts with `status: active`. Used to seed the alert popup on dashboard load.

**Response** — array of alert objects with `unitName`, `triggerName`, `triggerType` joined in.

#### `GET /api/alerts`
**Permission:** `alerts`

**Query params**

| Param | Values | Description |
|-------|--------|-------------|
| `status` | `active \| acknowledged \| resolved \| false_alarm` | Filter by status |
| `severity` | `red_alert \| warning \| advisory` | Filter by severity |
| `unitType` | `vehicle \| principal` | Filter by unit type |
| `simulation` | `true \| false` | Filter real vs simulation |
| `from` | ISO datetime | Fired after |
| `to` | ISO datetime | Fired before |
| `limit` | number (default 200) | |
| `offset` | number (default 0) | |

**Alert object shape**
```json
{
  "id": "uuid",
  "triggerId": "uuid",
  "triggerName": "string",
  "triggerType": "speed | panic_button | ...",
  "unitId": "uuid",
  "unitType": "vehicle | principal",
  "unitName": "string | null",
  "severity": "red_alert | warning | advisory",
  "status": "active | acknowledged | resolved | false_alarm",
  "position": { "speed": 0, "latitude": 0, "longitude": 0, "attributes": {} },
  "isSimulation": false,
  "notes": "string | null",
  "acknowledgedBy": "uuid | null",
  "acknowledgedAt": "iso-datetime | null",
  "resolvedBy": "uuid | null",
  "resolvedAt": "iso-datetime | null",
  "firedAt": "iso-datetime"
}
```

#### `PATCH /api/alerts/:id`
**Permission:** `alerts`

**Body:** `{ "status": "acknowledged | resolved | false_alarm", "notes": "string" }`

Sets `acknowledgedBy`/`resolvedBy` to the caller's ID automatically.

---

### Traccar (Internal)

#### `GET /api/traccar/devices`
Raw device list from the Traccar server. No auth required (internal use only).

#### `GET /api/traccar/positions/:deviceId?from=&to=`
Historical position track for a device. No auth required. `from`/`to` are ISO datetimes.

---

### Dev / Simulation

#### `GET /api/dev/simulatable-units`
**Permission:** `testing` — returns all units that have a Traccar device ID assigned (can be simulated).

**Response**
```json
[{ "traccarDeviceId": 1, "unitId": "uuid", "unitType": "vehicle | principal", "name": "string" }]
```

#### `POST /api/dev/simulate-positions`
**Permission:** `testing`

Runs the trigger engine against synthetic positions, marks any fired alerts as `isSimulation: true`.

**Body**
```json
{
  "positions": [
    { "deviceId": 1, "speed": 150, "latitude": 25.1, "longitude": 55.5, "attributes": { "alarm": "sos" } }
  ]
}
```

**Response**
```json
{
  "ok": true,
  "results": [
    {
      "deviceId": 1,
      "unitId": "uuid",
      "unitType": "vehicle",
      "fired": [{ "id": "uuid", "name": "Speed Limit", "severity": "red_alert", "triggerType": "speed" }],
      "cooldown": []
    }
  ]
}
```

---

## Client API

> For the mobile app. All routes use `/api/client/` prefix. Auth is the same Cognito JWT, but the caller must have a linked principal (`principals.userId = caller.id`). Returns `403` if no principal is linked.
>
> **Account-level authority:** All principals within an account share equal authority. Any principal can read and update any other principal or vehicle in the same account. There is no intra-account role hierarchy at this time.

### Auth note — `GET /api/me`
`/api/me` now returns two additional fields for client users:
```json
{
  "principalId": "uuid | null",
  "accountId":   "uuid | null"
}
```
If both are `null`, the user has no linked principal and cannot access the client API.

---

### `GET /api/client/account`
**Auth:** authenticated + linked principal

Returns the account the caller's principal belongs to. Includes all units in the account (id, type, name, status — no full detail). Use `/api/client/principals/:id` or `/api/client/vehicles/:id` for full detail.

**Response**
```json
{
  "id": "uuid",
  "name": "string",
  "type": "Corporate | Family | Government",
  "units": [
    { "id": "uuid", "type": "person | vehicle", "name": "string", "status": "normal | warning | duress | offline" }
  ]
}
```

---

### `GET /api/client/principals/:id`
**Auth:** authenticated + linked principal

Full detail for a principal in the caller's account. Returns `404` if the principal does not belong to the account.

**Response**
```json
{
  "id": "uuid",
  "accountId": "uuid",
  "userId": "uuid | null",
  "name": "string",
  "role": "string | null",
  "phone": "string | null",
  "email": "string | null",
  "status": "normal | warning | duress | offline",
  "photoKey": "string | null",
  "primaryDeviceId": "uuid | null",
  "devices": [ /* device objects */ ],
  "medical": {
    "dob": "YYYY-MM-DD | null",
    "height": "string | null",
    "bloodGroup": "string | null",
    "allergies": "string | null",
    "conditions": "string | null",
    "medications": "string | null"
  },
  "emergencyContact": {
    "name": "string | null",
    "phone": "string | null",
    "relation": "string | null"
  }
}
```

---

### `PATCH /api/client/principals/:id`
**Auth:** authenticated + linked principal

Update a principal in the caller's account. Same editable field whitelist as `PATCH /api/client/principal`.

**Editable fields:** `name`, `phone`, `email`, `dob`, `height`, `bloodGroup`, `allergies`, `conditions`, `medications`, `emergContactName`, `emergContactPhone`, `emergContactRelation`

**Response** — updated principal row (raw DB columns, same as `GET`).

`400` if no valid fields. `404` if not in account.

---

### `GET /api/client/vehicles/:id`
**Auth:** authenticated + linked principal

Full detail for a vehicle in the caller's account. Returns `404` if the vehicle does not belong to the account.

**Response**
```json
{
  "id": "uuid",
  "accountId": "uuid",
  "callsign": "string",
  "make": "string | null",
  "model": "string | null",
  "plate": "string | null",
  "armorLevel": "string | null",
  "status": "normal | warning | duress | offline",
  "photoKey": "string | null",
  "primaryDeviceId": "uuid | null",
  "devices": [ /* device objects */ ]
}
```

---

### `PATCH /api/client/vehicles/:id`
**Auth:** authenticated + linked principal

Update a vehicle in the caller's account.

**Editable fields:** `callsign`, `make`, `model`, `plate`, `armorLevel`

> `status` and `primaryDeviceId` are not editable — status is system-managed, device assignment is operator-managed.

**Body**
```json
{ "callsign": "Alpha-1", "plate": "ABC-1234" }
```

**Response** — updated vehicle row (raw DB columns).

`400` if no valid fields. `404` if not in account.

---

### `GET /api/client/live`
**Auth:** authenticated + linked principal

SSE stream scoped to the caller's account. Separate from `/api/live` (operator feed). Pass JWT as query param.

```
GET /api/client/live?token=<jwt>
```

**Message types**

`snapshot` — sent on connect with current positions for this account's devices only:
```json
{ "type": "snapshot", "positions": { "<traccarDeviceId>": { ... } } }
```

`positions` — position updates for units in this account:
```json
{ "type": "positions", "positions": [ { "deviceId": 1, "speed": 0, "latitude": 0, "longitude": 0 } ] }
```

`alert` — alert fired for a unit in this account (same shape as operator alert SSE message).

---

### `GET /api/client/principal`
**Auth:** authenticated + linked principal

Returns the caller's own full principal record — profile, medical info, and emergency contact.

**Response**
```json
{
  "id": "uuid",
  "accountId": "uuid",
  "userId": "uuid",
  "name": "string",
  "role": "string | null",
  "phone": "string | null",
  "email": "string | null",
  "status": "normal | warning | duress | offline",
  "photoKey": "string | null",
  "primaryDeviceId": "uuid | null",
  "dob": "YYYY-MM-DD | null",
  "height": "string | null",
  "bloodGroup": "string | null",
  "allergies": "string | null",
  "conditions": "string | null",
  "medications": "string | null",
  "emergContactName": "string | null",
  "emergContactPhone": "string | null",
  "emergContactRelation": "string | null",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

---

### `PATCH /api/client/principal`
**Auth:** authenticated + linked principal

Update the caller's own principal profile. Only the fields listed below are accepted — any other keys are silently ignored.

**Editable fields**
| Field | Description |
|-------|-------------|
| `name` | Display name |
| `phone` | Contact phone |
| `email` | Contact email |
| `dob` | Date of birth (`YYYY-MM-DD`) |
| `height` | Height (free text, e.g. `"5'11"`) |
| `bloodGroup` | Blood group (free text) |
| `allergies` | Allergies (free text) |
| `conditions` | Medical conditions (free text) |
| `medications` | Current medications (free text) |
| `emergContactName` | Emergency contact name |
| `emergContactPhone` | Emergency contact phone |
| `emergContactRelation` | Emergency contact relation |

> **Not editable by the client:** `status`, `primaryDeviceId`, `photoKey`, `accountId`, `userId`. Status is operator-managed. Use `PATCH /api/client/principal/primary-device` for device promotion.

**Body** — send only the fields to update:
```json
{
  "emergContactName": "Maria Hernández",
  "emergContactPhone": "+502 5555 1234",
  "emergContactRelation": "Spouse"
}
```

**Response** — updated principal row (same shape as `GET /api/client/principal`).

`400` if no valid fields are provided.

---

### `GET /api/client/principal/devices`
**Auth:** authenticated + linked principal

Returns all devices on the caller's own principal, plus which one is currently primary. The mobile app uses this on startup to check whether the current phone is registered and whether it's the active tracking device.

**Response**
```json
{
  "primaryDeviceId": "uuid | null",
  "devices": [
    {
      "id": "uuid",
      "name": "My iPhone 15",
      "type": "phone",
      "model": "iPhone 15 Pro",
      "serial": null,
      "imei": "123456789012345",
      "firmware": null,
      "status": "online",
      "traccarDeviceId": "42"
    }
  ]
}
```

> **How to detect your own device:** After a successful `POST /api/client/principal/devices`, persist the returned `traccarDeviceId` in local app storage. On subsequent launches, call this `GET` endpoint and check if any device in `devices` matches that stored `traccarDeviceId`. Compare its `id` against `primaryDeviceId` to know if it's currently primary — no second call needed.

---

### `POST /api/client/principal/devices`
**Auth:** authenticated + linked principal

Registers a device on the caller's principal. If the principal has no `primaryDeviceId` yet, the new device is automatically set as primary.

**Body**
```json
{
  "name":     "My iPhone 15",   // required — user-editable display name
  "uniqueId": "abc123xyz",      // required — Traccar SDK device identifier (used to link position updates)
  "type":     "phone",          // optional — defaults to "phone" if omitted
  "model":    "iPhone 15 Pro",  // optional
  "imei":     "123456789012345" // optional
}
```

**Response** — device object (same shape as above)

**Errors**
- `400` — `name` or `uniqueId` missing
- `403` — caller has no linked principal

> **Primary device:** The Traccar `uniqueId` is what the Traccar SDK sends with every position update. Get it from the SDK (e.g. `Traccar.getDeviceId()`) and send it here so positions can be attributed to this principal. The server stores the Traccar-assigned integer `traccarDeviceId` (returned in the response) — this is what you persist locally to detect future re-registration.

---

### `PATCH /api/client/principal/devices/:deviceId`
**Auth:** authenticated + linked principal

Edits the name or model of a device belonging to the caller's principal. Only `name` and `model` can be changed — `type`, `status`, `traccarDeviceId`, and other fields are immutable from the client side.

**Body**
```json
{
  "name":  "Work Phone",     // optional
  "model": "iPhone 16 Plus"  // optional
}
```

**Response** — updated device object

**Errors**
- `404` — device not found or belongs to a different principal

---

### `PATCH /api/client/principal/primary-device`
**Auth:** authenticated + linked principal

Sets or clears the primary tracking device on the caller's principal. The device must already be registered on this principal — you cannot set a device from a different principal as primary.

**Body**
```json
{ "deviceId": "uuid | null" }
```
Pass `null` to clear the primary device.

**Response**
```json
{ "primaryDeviceId": "uuid | null" }
```

**Errors**
- `404` — device not found or belongs to a different principal

> **When to call this:** `POST /api/client/principal/devices` auto-promotes the new device if no primary exists yet. If the principal already has a primary device (e.g. a hardware GPS tracker), call this endpoint explicitly after registration to switch.

---

### Places

Named, geolocated places scoped to the caller's account. The caller's account is resolved from their linked principal — no account ID in the URL. All place mutations trigger Traccar geofence sync automatically.

**Place object shape**
```json
{
  "id":        "uuid",
  "name":      "Home",
  "address":   "123 Main St, Dubai, UAE",
  "mapboxId":  "place.abc123",
  "latitude":  25.197,
  "longitude": 55.274,
  "radius":    150,
  "color":     "#2563eb",
  "synced":    true
}
```
`synced: true` means a Traccar circular geofence exists for this place.

#### `GET /api/client/places`
**Auth:** authenticated + linked principal

Returns all places in the caller's account.

#### `POST /api/client/places`
**Auth:** authenticated + linked principal

**Body**
```json
{
  "name":      "School",     // required
  "latitude":  25.197,       // required — resolved by Google Places on the client
  "longitude": 55.274,       // required
  "address":   "string",     // optional — human-readable address
  "mapboxId":  "string",     // optional — Google Places ID
  "radius":    150,          // optional — metres, default 150
  "color":     "#2563eb"     // optional — default blue
}
```

**Response** — place object

**Errors**
- `400` — `name`, `latitude`, or `longitude` missing

#### `PATCH /api/client/places/:placeId`
**Auth:** authenticated + linked principal

All fields optional. Only updates provided fields. Re-syncs the Traccar geofence if `name`, `latitude`, `longitude`, or `radius` changes.

`404` if the place does not belong to the caller's account.

#### `DELETE /api/client/places/:placeId`
**Auth:** authenticated + linked principal

Removes the Traccar geofence then deletes the place. `404` if not in caller's account.

---

### Plans

Plans define expected schedules or trips for units within the caller's account. The caller can view and manage all plans in their account (e.g. a family member managing the household schedule).

Units specified in `units[]` must belong to the caller's account — `400` otherwise.

**Plan object shape (GET)**
```json
{
  "id":        "uuid",
  "name":      "School Run",
  "type":      "recurring",
  "enabled":   true,
  "notes":     null,
  "createdAt": "iso-datetime",
  "updatedAt": "iso-datetime",
  "units": [
    { "unitId": "uuid", "unitType": "principal" }
  ],
  "legs": [{
    "id":                   "uuid",
    "legOrder":             0,
    "originPlaceId":        "uuid | null",
    "destinationPlaceId":   "uuid | null",
    "originPlaceName":      "Home",
    "destinationPlaceName": "School",
    "daysOfWeek":           [1, 2, 3, 4, 5],
    "windowStart":          "07:30",
    "windowEnd":            "08:30",
    "arrivalAt":            null,
    "departureAt":          null
  }]
}
```

> **Place names in legs:** `originPlaceName` and `destinationPlaceName` are resolved and inlined by the server. This saves the mobile app a separate places lookup just to render leg labels.

#### `GET /api/client/plans`
**Auth:** authenticated + linked principal

Returns all plans in the caller's account, with place names inlined in each leg.

#### `POST /api/client/plans`
**Auth:** authenticated + linked principal

**Body**
```json
{
  "name":    "School Run",  // required
  "type":    "recurring",   // optional — "recurring" | "one_time", default "recurring"
  "enabled": true,          // optional — default true
  "notes":   null,          // optional
  "units": [                // required — at least one; all must belong to caller's account
    { "unitId": "uuid", "unitType": "principal | vehicle" }
  ],
  "legs": [{
    "legOrder":            0,
    "originPlaceId":       "uuid",
    "destinationPlaceId":  "uuid",
    "daysOfWeek":          [1,2,3,4,5],
    "windowStart":         "07:30",
    "windowEnd":           "08:30",
    "arrivalAt":           null,
    "departureAt":         null
  }]
}
```

**Response** — plan object (same shape as GET, without inlined place names)

**Errors**
- `400` — `name` missing, no units provided, or a unit doesn't belong to the account

#### `PATCH /api/client/plans/:planId`
**Auth:** authenticated + linked principal

All top-level fields optional. If `units` or `legs` is provided, the existing set is **replaced entirely** with the new array. Omit them to leave them unchanged.

`404` if the plan does not belong to the caller's account.

#### `DELETE /api/client/plans/:planId`
**Auth:** authenticated + linked principal

Cascades to plan legs and unit assignments. `404` if not in caller's account.

---

### Groups

Account-scoped group management. Groups are named collections of principals and vehicles within an account.

**Group object**
```json
{
  "id": "uuid",
  "name": "string",
  "unitIds": ["uuid", "uuid"]
}
```
`unitIds` contains both principal and vehicle UUIDs — no type distinction in the array.

#### `GET /api/client/groups`
**Auth:** authenticated + linked principal

Returns all groups for the caller's account.

#### `POST /api/client/groups`
**Auth:** authenticated + linked principal

**Body**
```json
{ "name": "string" }
```

**Response** — group object with empty `unitIds`.

#### `PATCH /api/client/groups/:groupId`
**Auth:** authenticated + linked principal

**Body**
```json
{ "name": "string" }
```

`404` if group does not belong to caller's account.

#### `DELETE /api/client/groups/:groupId`
**Auth:** authenticated + linked principal

`404` if group does not belong to caller's account.

#### `POST /api/client/groups/:groupId/members`
**Auth:** authenticated + linked principal

**Body** — pass one of:
```json
{ "principalId": "uuid" }
{ "vehicleId": "uuid" }
```

`404` if group does not belong to caller's account.

#### `DELETE /api/client/groups/:groupId/members`
**Auth:** authenticated + linked principal

**Body** — pass one of:
```json
{ "principalId": "uuid" }
{ "vehicleId": "uuid" }
```

`404` if group does not belong to caller's account.
