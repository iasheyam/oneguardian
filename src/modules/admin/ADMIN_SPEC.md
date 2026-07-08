# TelematicsGuardian Admin Panel — Feature Specification

> **Status**: Design reference phase. This document translates the Sparta Ops design sketch
> into a buildable spec. Implement one module at a time. The design is directional — we adapt
> it to TelematicsGuardian's brand and backend (Traccar + Supabase), not copy it pixel-for-pixel.

---

## Table of Contents

1. [Overview](#overview)
2. [Design System](#design-system)
3. [App Shell](#app-shell)
4. [Module 1 — Operations Dashboard](#module-1--operations-dashboard)
5. [Module 2 — Unit Detail](#module-2--unit-detail)
6. [Module 3 — Fleet & Devices](#module-3--fleet--devices)
7. [Module 4 — Video & Audio Review](#module-4--video--audio-review)
8. [Module 5 — Organization Settings](#module-5--organization-settings)
9. [Module 6 — Duress Alert System](#module-6--duress-alert-system)
10. [Module 7 — Modal / Provisioning](#module-7--modal--provisioning)
11. [Data Models](#data-models)
12. [Backend Integration Notes](#backend-integration-notes)

---

## Overview

The admin panel is used by two primary audiences:

| Role | What they do |
|---|---|
| **Operator** | Monitor the live map, watch for alerts, acknowledge duress, drill into vehicle telemetry |
| **Admin / Owner** | Configure the org — add members, provision devices, manage vehicles, geofences, roles, billing |

The panel lives at `/admin/*` inside the single React app. All routes are protected (authentication required). Field agents access a separate client portal (`/portal/*`) not covered here.

### Screens

| Route | Module | Label |
|---|---|---|
| `/admin` | Operations Dashboard | OPS |
| `/admin/unit/:id` | Unit Detail | UNIT |
| `/admin/media` | Video & Audio Review | MEDIA |
| `/admin/fleet` | Fleet & Devices | FLEET |
| `/admin/settings` | Organization Settings | ADMIN |

---

## Design System

> TelematicsGuardian admin uses a **separate design system** from the landing page. The landing page uses a warm gold palette. The admin panel uses a cool tactical dark palette. They are independent CSS scopes.

### Color Tokens

```css
/* Admin-specific tokens (scoped to .admin-shell or :root in admin CSS) */
--adm-bg-base:    #0A0E10;   /* deepest background */
--adm-bg-panel:   #0F1519;   /* sidebar, card backgrounds */
--adm-bg-raised:  #141F24;   /* selected states, hovered cards */
--adm-border:     #1E2830;   /* default borders */
--adm-border-sub: #151E23;   /* table row dividers */

--adm-text:       #DFE4E6;   /* primary text */
--adm-text-muted: #7D8990;   /* secondary/muted text */
--adm-text-dim:   #5D676C;   /* disabled, very muted */

/* Status colors — used consistently across all modules */
--adm-secure:     #37C2B8;   /* normal / all-clear / online */
--adm-warning:    #E0A63C;   /* geofence exit, fault, low fuel */
--adm-duress:     #F2495B;   /* ONLY for active panic/duress events */
--adm-offline:    #66727A;   /* no signal / device offline */
```

**Color usage rules:**
- `--adm-duress` is reserved strictly for active duress/panic states. Never use it decoratively.
- `--adm-warning` covers all attention-needed states (not emergencies).
- `--adm-secure` is the accent color (equivalent to gold on the landing page, but teal here).

### Typography

```
UI text:        Archivo (Google Fonts) — weights 400, 500, 600, 700
Telemetry data: IBM Plex Mono — weights 400, 500, 600
```

- Archivo for all labels, headings, body, nav
- IBM Plex Mono for: data values (speed, GPS coords, times, IMEIs, firmware versions, hash strings, status chips, numeric readouts)

### Status Chip Pattern

Used across all modules for unit status, device health, member presence, etc.

```
Shape: border-radius 4–5px, padding 3px 8px
Font: IBM Plex Mono, 9px, weight 600, letter-spacing 0.05em
```

| Status | Text color | Background | Border |
|---|---|---|---|
| SECURE / ONLINE | `#37C2B8` | `rgba(55,194,184,0.10)` | `rgba(55,194,184,0.30)` |
| WARNING | `#E0A63C` | `rgba(224,166,60,0.12)` | `rgba(224,166,60,0.35)` |
| DURESS | `#F2495B` | `rgba(242,73,91,0.12)` | `rgba(242,73,91,0.35)` |
| OFFLINE | `#66727A` | `rgba(102,114,122,0.12)` | `rgba(102,114,122,0.30)` |

### Layout

- Full viewport height, no scrolling on the outer shell
- Left nav rail: **56px wide**, fixed
- Top bar: **52px tall**, fixed
- Content area: fills remaining space, scrolls independently per module
- Map views: fill their container 100%

---

## App Shell

The persistent frame around all admin screens.

### Left Navigation Rail

A narrow vertical sidebar with 5 primary nav items plus a system button at the bottom.

**Nav items (top → bottom):**

| Label | Route | Icon concept |
|---|---|---|
| OPS | `/admin` | 2×2 grid of squares |
| UNIT | `/admin/unit/:id` | Crosshair target circle |
| MEDIA | `/admin/media` | Play triangle |
| FLEET | `/admin/fleet` | 3 horizontal bars |
| ADMIN | `/admin/settings` | Gear circle |

**Item anatomy:**
- Icon (18px area)
- Label (IBM Plex Mono, 8.5px, weight 600, letter-spacing 0.08em)
- Active state: teal background tint + teal border + teal icon/label
- Inactive state: gray icon + gray label, no background
- Width: 48px per item, centered

**Active item styles:**
```
background: rgba(55,194,184,0.10)
border: 1px solid rgba(55,194,184,0.35)
border-radius: 9px
color: #37C2B8
```

### Top Bar

Fixed header across the top, always visible.

**Left side — breadcrumb:**
- Title (e.g. "Live Operations", "Vehicle Detail")
- Subtitle (e.g. "Dallas · TX Sector · 5 units deployed")

**Center (optional):**
- Nothing on most screens

**Right side:**
- Status pill: shows fleet-wide state (`ALL SECURE` / `N WARNING` / `1 DURESS ACTIVE`)
  - Pill has colored border + background tint matching status color
  - Animated pulsing dot on the left
  - Text in IBM Plex Mono
- Zulu time + local time (IBM Plex Mono, updating every second)
- User avatar / initials (links to profile/logout)

**Status pill priority:** duress > warning > secure. If any unit is in duress, the whole pill goes red.

---

## Module 1 — Operations Dashboard

**Route:** `/admin`  
**Label:** OPS  
**Purpose:** The primary screen operators spend most of their time on. Real-time map of all active units, unit list panel for quick triage.

### Layout

Two-column split:
- **Left column (320px fixed):** Unit filter + search + scrollable unit list
- **Right column (flex):** Live map, fills remaining space

### Left Panel — Unit List

**Filter tabs** (above the list):

```
ALL   |   DURESS (red)   |   WARN (amber)   |   SECURE (teal)   |   OFFLINE (gray)
```

Each tab shows a count badge. Active tab is filled with its status color (dark text on colored background). Only show DURESS tab when at least one unit is in duress.

**Search input:** text field, searches across unit ID, callsign, principal name, agent name.

**Unit card** (one per unit, stacked vertically):

```
[3px colored accent bar on left edge]
[status dot (8px, colored, glowing)]  SP-01 · FALCON         [SECURE chip]
                                       R. Harrington · CEO
                                       I-35W N · Exit 21      64 MPH
                                       Updated 2s ago
```

- Click anywhere on card: selects the unit, highlights its marker on map
- When selected: card background goes to `#141F24`, border becomes teal-tinted, a small "OPEN DETAIL →" link appears in a collapsible bottom row
- Click "OPEN DETAIL →": navigates to `/admin/unit/:id`

**Sorting:** default order = alert first, warning second, secure third, offline last

### Right Panel — Live Map

A map rendering (real: Leaflet or Mapbox; sketch: SVG placeholder) filling the entire area.

**Map features:**
- Dark tile style (matches admin dark theme)
- Animated radar sweep from map center (subtle, low-opacity, branded teal)
- Unit markers for each active unit

**Unit marker anatomy:**

```
[pulsing ring, status color, low opacity]
[filled dot, 11–15px, status color, dark border, colored glow]
[label below: "SP-01 · 64MPH" — IBM Plex Mono, 9.5px]
```

- Normal units: small dot, subtle pulse only when selected
- Warning units: larger dot, moderate pulse
- Duress units: largest dot, rapid pulse, elevated z-index
- Offline units: gray dot, no pulse, no glow

- Click marker: selects the unit (syncs with left panel list)
- Selected marker label: brighter text + colored border on label chip

### User Actions

| Action | Result |
|---|---|
| Click filter tab | Filters unit list (does not filter map markers) |
| Type in search | Filters unit list |
| Click unit card | Selects unit, highlights map marker |
| Click "OPEN DETAIL" | Navigates to unit detail screen |
| Click map marker | Selects unit, scrolls unit card into view |

---

## Module 2 — Unit Detail

**Route:** `/admin/unit/:id`  
**Label:** UNIT  
**Purpose:** Deep-dive on a single unit. Full telemetry, route history, live video access, event log.

### Unit Header

Top section, full-width:

```
[status dot]  SP-01 FALCON   [SECURE chip]

Principal: A. Voss · CEO          Agent: R. Cole
Vehicle:   Cadillac Escalade ESV   Armor: B6 Armored    Plate: 7XPD418
```

### Map Section

Tabs above the map: **LIVE** | **ROUTE HISTORY**

**LIVE tab:**
- Shows real-time position of the unit on map
- Marker pulses, shows current speed and heading

**ROUTE HISTORY tab:**
- Shows the route taken today as a polyline on the map
- A scrubber bar below the map (like a video timeline):
  - Click / drag to seek to a point in the route
  - A playhead dot animates along the polyline as you scrub
  - Current position is highlighted
- Route line: drawn in two colors — completed (teal, solid) and future (teal, dimmer/dashed)

### Diagnostics Grid

8 tiles in a 4×2 or 2×4 grid (responsive). Each tile:

```
[label — IBM Plex Mono, small, gray]
[value — IBM Plex Mono, large, colored]
[sub-label — small, muted]
```

| Tile | Value source | Color logic |
|---|---|---|
| ENGINE | RUNNING / OFF | Teal if running, gray if off |
| SPEED | N MPH + heading | White |
| FUEL | N% + estimated range | Amber if below 35% |
| BATTERY | N% + voltage | White if present, gray if unavailable |
| COOLANT | Temperature | Amber if fault codes present |
| ODOMETER | Miles | White |
| FAULT CODES | OBD codes or NONE | Amber if any, teal if clear |
| DOORS / LOCKS | SECURED / UNLOCKED | Teal if secured |

### Video / Audio Section

Below diagnostics, a two-column row:

**Left: Camera feeds**
- Camera toggle pills: `CAM 1 · CABIN` | `CAM 2 · FWD`
- Dark placeholder area with camera label overlay (live RTSP stream when available)
- "LIVE" indicator badge in top-right corner of feed
- If camera offline: gray placeholder with "NO SIGNAL" label

**Right: Audio**
- Animated waveform visualization (vertical bars, varying heights, IBM Plex Mono font)
- "LIVE AUDIO" label
- Audio stream active/inactive indicator

### Recent Events Log

Below video section. Scrollable list of the last 10–20 events for this unit:

```
[colored dot] 14:22:07  Geofence exit — departed Route A corridor
[colored dot] 14:18:44  Harsh braking event cleared
[colored dot] 14:05:12  Stop — 3m 20s — Elm St & Akard
```

- Dot color = event severity (amber for warning, teal for resolved/normal, gray for info)
- Timestamp in IBM Plex Mono
- Clicking an event could eventually deep-link to the relevant footage (future feature)

---

## Module 3 — Fleet & Devices

**Route:** `/admin/fleet`  
**Label:** FLEET  
**Purpose:** Fleet-wide overview. Operators and admins check this for device health, camera status, and firmware currency at a glance.

### Stats Bar

6 summary stats across the top of the content area:

| Stat | Color |
|---|---|
| FLEET SIZE | White |
| SECURE | Teal |
| WARNING | Amber (if > 0) or white |
| OFFLINE | Offline gray (if > 0) or white |
| CAMERAS LIVE (e.g. "8 / 10") | Teal if all live, amber if some offline |
| DEVICES ONLINE (e.g. "4 / 5") | Teal if all online, amber if some offline |

Each stat: label (IBM Plex Mono, small, muted) + value (IBM Plex Mono, 20px, colored).

### Filter & Search

Same filter tabs and search input as the dashboard (shared component). Filters the table below.

### Fleet Table

Column headers, then one row per unit:

| Column | Content |
|---|---|
| UNIT | Status dot + unit ID + callsign |
| PRINCIPAL | Principal name |
| AGENT | Agent name |
| VEHICLE | Make / model |
| STATUS | Status chip |
| GPS | ONLINE / OFFLINE chip |
| CAMERAS | "2/2" or "1/2" chip (teal if full, amber if partial) |
| FIRMWARE | Version string (IBM Plex Mono) |
| LAST CHECK-IN | Time ago (e.g. "2s", "6m") |

- Row is clickable: navigates to `/admin/unit/:id`
- Row hover: subtle background highlight
- Firmware column: amber if version is behind latest

---

## Module 4 — Video & Audio Review

**Route:** `/admin/media`  
**Label:** MEDIA  
**Purpose:** Review recorded clips tied to events. Export footage. Verify chain of custody.

### Layout

Two-column split:
- **Left (260px fixed):** Clip library list
- **Right (flex):** Player + metadata

### Clip Library (left panel)

Scrollable list of clips. Each clip card:

```
[TYPE chip]  SP-02 OSPREY
             Duress drill — cabin + forward
             Today 14:02:11  ·  2:14
```

- TYPE chip colors: DRILL (teal), ALERT (amber), EVENT (teal), SYSTEM (duress), MANUAL (teal)
- Selected clip: teal-tinted border + slightly lighter background
- Clicking a clip: loads it in the player, resets scrubber to 0

**Clip types:**
- `DRILL` — simulated duress drill footage
- `ALERT` — footage auto-clipped around an alert event (geofence, harsh braking, etc.)
- `EVENT` — manually tagged event
- `SYSTEM` — system-generated (signal loss, device restart)
- `MANUAL` — full session export or manual clip

### Video Player (right — top half)

**Camera / track selector pills:** `CAM 1 · CABIN` | `CAM 2 · FWD` | `AUDIO`

**Player area:**
- Dark 16:9 area with unit ID + clip title overlay at top-left
- Camera label badge at top-right
- When AUDIO selected: show waveform visualization instead of video frame

**Scrubber bar:**
- Timeline with fill (teal gradient) and drag handle
- Current time display: `MM:SS` in IBM Plex Mono
- Total duration at right end

### Chain of Custody Panel (right — bottom half)

Read-only metadata panel. Two columns of key-value pairs:

| Field | Example |
|---|---|
| CLIP ID | SPX-2607-1041 |
| SOURCE DEVICE | 35-820144-771903-2 (IMEI) |
| CAMERAS | 2 × 1080p / 30fps |
| RECORDED | 2026-07-01 · 14:02:11 |
| DURATION | 2:14 |
| SHA-256 | a3f9…c1e21c (truncated, teal color) |
| EXPORTED BY | — not exported |
| RETENTION | Locked · 7 years (teal) |

Values in IBM Plex Mono. SHA-256 and Retention shown in teal to indicate verification.

**Export button**: "EXPORT CLIP" — disabled if user lacks export permission.

---

## Module 5 — Organization Settings

**Route:** `/admin/settings`  
**Label:** ADMIN  
**Purpose:** Configuration hub. Members, devices, vehicles, geofences, roles, and billing.

### Layout

Two-column split:
- **Left (200px fixed):** Sub-navigation with section labels and count badges
- **Right (flex):** Active section content

### Sub-Navigation

Vertical list of sections (Billing is excluded — admin panel is for admins and operators, not billing owners):

| Section | Badge |
|---|---|
| Members | Count (e.g. "6") |
| Devices | Count (e.g. "7") |
| Vehicles | Count (e.g. "5") |
| Geofences | Count (e.g. "8") |
| Roles & access | (none) |

Active item: teal background tint + teal border + bolder text.

---

### Settings: Members

**Header row:**
- Left: "6 members · 4 with two-factor enabled" (muted text)
- Right: "+ Invite member" button (teal) → opens member invite modal

**Members table:**

| Column | Content |
|---|---|
| NAME / EMAIL | Avatar circle (initials) + name + email address |
| ROLE | Role chip |
| 2FA | ON (teal chip) / OFF (amber chip) |
| LAST ACTIVE | Time string |
| STATUS | Online / Away / Offline chip |

**Role chips:** Owner + Admin get teal chips; Operator, Agent, Read-only get gray chips.

---

### Settings: Devices

**Header row:**
- Left: "5 devices · 5 online · telemetry + dual camera" (muted text)
- Right: "+ Provision device" button → opens device provision modal

**Devices table:**

| Column | Content |
|---|---|
| UNIT ID | e.g. SP-01 (IBM Plex Mono) |
| IMEI | Full IMEI string (IBM Plex Mono) |
| ASSIGNED TO | "Principal · vehicle" string |
| FIRMWARE | Version string (IBM Plex Mono) |
| STATUS | ONLINE (teal) / OFFLINE (gray) chip |

---

### Settings: Vehicles

**Header row:**
- Left: "5 vehicles in the protective fleet" (muted text)
- Right: "+ Add vehicle" button → opens vehicle modal

**Vehicles table:**

| Column | Content |
|---|---|
| UNIT ID | e.g. SP-01 |
| VEHICLE | Make / model |
| PLATE | License plate |
| ARMOR | Protection level (B6 Armored, B4 Armored, Soft skin) |
| VIN | 17-character VIN (IBM Plex Mono, small) |
| STATUS | Current unit status chip |

---

### Settings: Geofences

**Header row:**
- Left: "8 zones · safe zones, corridors and exclusion areas" (muted text)
- Right: "+ New geofence" button → opens geofence modal

**Geofences table:**

| Column | Content |
|---|---|
| NAME | Zone name |
| TYPE | Type chip (colored) |
| SIZE | Radius description |
| LINKED UNITS | Unit IDs or "All units" |
| STATUS | ACTIVE (teal) / PAUSED (gray) chip |

**Geofence type colors:**

| Type | Color |
|---|---|
| SAFE ZONE | Teal (`#37C2B8`) |
| CORRIDOR | Blue-teal (`#5AA9C2`) |
| EXCLUSION | Amber (`#E0A63C`) |
| WAYPOINT | Gray (`#66727A`) |

---

### Settings: Roles & Access

**Header row:**
- Left: "5 roles · least-privilege by default" (muted text)
- Right: "+ Custom role" button → opens role modal

**Role cards** (stacked vertically, not a table):

```
[colored dot]  Owner                           1 member
               Full control including billing, org configuration, and deletion.
               [Billing] [Members] [Devices] [Geofences] [Live ops] [Export footage]
```

Each permission is a pill chip (gray background, gray text, IBM Plex Mono).

**Default roles and their permissions:**

| Role | Permissions |
|---|---|
| Owner | Billing, Members, Devices, Geofences, Live ops, Export footage |
| Admin | Members, Devices, Geofences, Live ops, Export footage |
| Operator | Live ops, Acknowledge, Escalate, Export footage |
| Agent | Own unit, Trigger duress |
| Read-only | Live ops (view), Reports |

Owner and Admin roles: dot and role name shown in teal. Others in gray.

---

### Settings: Billing

**Plan overview card:**
```
Enterprise Plan
$4,200 / per month · billed annually
Renews Jan 14, 2027
6 of 25 operator seats in use
```

**Usage meters** (4 items, each with a label, value, and horizontal progress bar):

| Meter | Example |
|---|---|
| UNITS TRACKED | 5 / 10 |
| DEVICES | 5 / 25 |
| FOOTAGE STORAGE | 1.2 / 5 TB |
| OPERATOR SEATS | 6 / 25 |

Progress bar: teal gradient fill, gray track.

**Invoice history table:**

| Column | Content |
|---|---|
| DATE | Billing date |
| INVOICE # | Invoice ID (IBM Plex Mono) |
| AMOUNT | Dollar amount |
| ACTION | "DOWNLOAD" link |

---

## Module 6 — Duress Alert System

**Trigger:** When any unit presses the panic/duress button (hardware button on device).  
**Purpose:** Full-screen takeover that immediately commands operator attention and provides all needed info to respond.

### Trigger Behavior

- When duress fires: the entire screen is replaced by the duress overlay (regardless of which screen the operator is on)
- An audible alarm plays (browser Web Audio — four alternating tones)
- The top bar status pill changes to "1 DURESS ACTIVE" in red
- On the dashboard, the unit marker switches to red with rapid blinking pulse

### Duress Overlay Layout

Full-screen red-tinted dark overlay. Two columns:

**Left column — Unit info + video:**
- Red "DURESS ACTIVE" header with elapsed timer (`MM:SS`) in IBM Plex Mono
- Unit card summary: ID, callsign, principal, agent, vehicle, armor, plate
- Current position: speed + heading + GPS coordinates
- Last known location string
- Live video feed placeholder (CAM 1 or CAM 2)
- Audio waveform (animated, red-tinted)

**Right column — Actions + response log:**

**Action buttons (top):**

```
[ACKNOWLEDGE]   — red button initially, teal with checkmark once confirmed
[ESCALATE]      — dark outlined button, turns amber once escalated
[CALL AGENT]    — future feature, shown as placeholder
[DISPATCH]      — future feature, shown as placeholder
```

On acknowledge click: button turns teal with "✓ ACKNOWLEDGED" text. An entry is added to the response log.

On escalate click: button turns amber with "▲ ESCALATED TO TIER-2" text. An entry is added to the response log. Text says "regional response notified."

**Response log (scrollable):**

Timestamped log of what's happened since the alert fired:

```
[red dot]   +0s elapsed · now    Panic button pressed by agent — duress declared
[red dot]   +0s             GPS lock acquired · live video streaming
[teal dot]  live            Operator R. Marsh acknowledged the alert
[amber dot] live            Escalated to Tier-2 · regional response notified
```

Entries are added in real time as actions are taken.

**Dismiss button:**
- Small "DISMISS" button (bottom, muted, requires acknowledgment first)
- Dismissing clears the overlay and returns to normal dashboard

### State Transitions

```
Normal → [panic button pressed] → DURESS OVERLAY
DURESS OVERLAY → [acknowledge] → ack=true (button turns teal, log entry added)
DURESS OVERLAY → [escalate] → escalated=true (button turns amber, log entry added)
DURESS OVERLAY → [dismiss] → back to normal (overlay clears)
```

---

## Module 7 — Modal / Provisioning

A shared modal component used for all "add" / "invite" / "create" actions in the settings panel.

### Modal Shell

- Centered overlay with dark scrim behind
- Click outside scrim → close modal
- Modal card: `border-radius: 10px`, `background: #0F1519`, `border: 1px solid #1E2830`
- Header: title (e.g. "Invite member"), X close button
- Body: form fields
- Footer: cancel link + submit button

### Submit Button States

```
Inactive (first required field empty):
  background: #161D22, color: #5D676C, border: #1E2830

Active (first required field filled):
  background: #37C2B8, color: #0A0E10, border: #37C2B8, box-shadow: glow
```

### Modal Types and Fields

**Invite Member**

| Field | Type | Options |
|---|---|---|
| FULL NAME | Text | — |
| EMAIL | Text | — |
| ROLE | Choice | Owner, Admin, Operator, Agent, Read-only |
| TWO-FACTOR | Choice | Required, Optional |

Submit label: "Send invite"  
First required field: FULL NAME

---

**Provision Device**

| Field | Type | Options |
|---|---|---|
| DEVICE / UNIT ID | Text | e.g. SP-06 |
| IMEI | Text | 15-digit format |
| ASSIGNED TO | Text | "Principal · vehicle" |
| FIRMWARE | Text | e.g. 4.2.1 |
| STATUS | Choice | ONLINE, OFFLINE |

Submit label: "Provision"  
First required field: DEVICE / UNIT ID

---

**Add Vehicle**

| Field | Type | Options |
|---|---|---|
| UNIT ID | Text | e.g. SP-06 |
| MAKE / MODEL | Text | e.g. Cadillac Escalade ESV |
| PLATE | Text | license plate |
| PROTECTION | Choice | B6 Armored, B4 Armored, Soft skin |
| VIN | Text | 17-character VIN |

Submit label: "Add vehicle"  
First required field: UNIT ID

---

**New Geofence**

| Field | Type | Options |
|---|---|---|
| ZONE NAME | Text | e.g. Residence — Highland Park |
| TYPE | Choice | SAFE ZONE, CORRIDOR, EXCLUSION, WAYPOINT |
| SIZE | Text | e.g. 300 m radius |
| LINKED UNITS | Text | e.g. SP-02 or All units |

Submit label: "Create zone"  
First required field: ZONE NAME

---

**Custom Role**

| Field | Type | Options |
|---|---|---|
| ROLE NAME | Text | e.g. Supervisor |
| DESCRIPTION | Text | what this role can do |
| PERMISSIONS | Text | comma-separated list |

Submit label: "Create role"  
First required field: ROLE NAME

---

### Choice Field Pattern

When a field has a `choice` type, render it as a row of pill toggles:

```
[Owner]  [Admin]  [Operator]  [Agent]  [Read-only]
```

- Active pill: teal background (`#37C2B8`), dark text (`#0A0E10`)
- Inactive pill: panel background, gray text, gray border
- Font: IBM Plex Mono, 10px, 600

---

## Data Models

### Unit (live, from Traccar)

```typescript
interface Unit {
  id: string;           // 'SP-01'
  callsign: string;     // 'FALCON'
  principal: string;    // 'A. Voss'
  principalRole: string;// 'Principal · CEO'
  agent: string;        // 'R. Cole'
  vehicle: string;      // 'Cadillac Escalade ESV'
  armorLevel: string;   // 'B6 Armored' | 'B4 Armored' | 'Soft skin'
  plate: string;        // '7XPD418'
  status: 'normal' | 'warning' | 'offline' | 'duress';
  speed: number;        // mph
  heading: number;      // degrees
  ignition: boolean;
  fuel: number;         // percent
  battery: number | null;
  coolantTemp: string;  // e.g. '201°F'
  odometer: number;     // miles
  faultCodes: string[]; // OBD codes
  lat: number;
  lng: number;
  location: string;     // human-readable last location
  lastUpdated: string;  // '2s', '5m' etc.
  mapX: number;         // percent for SVG/relative map
  mapY: number;
}
```

### Device (admin, from Supabase)

```typescript
interface Device {
  unitId: string;       // 'SP-01'
  imei: string;         // Teltonika IMEI
  assignedTo: string;   // 'Principal · vehicle'
  firmware: string;     // '4.2.1'
  gpsOnline: boolean;
  cameras: string;      // '2/2', '1/2', '0/2'
  lastCheckin: string;  // '2s'
}
```

### Member (admin, from Supabase)

```typescript
interface Member {
  name: string;
  email: string;
  role: 'Owner' | 'Admin' | 'Operator' | 'Agent' | 'Read-only';
  twoFactorEnabled: boolean;
  status: 'Online' | 'Away' | 'Offline';
  lastActive: string;
}
```

### Geofence (admin, from Supabase → synced to Traccar)

```typescript
interface Geofence {
  name: string;
  type: 'SAFE ZONE' | 'CORRIDOR' | 'EXCLUSION' | 'WAYPOINT';
  radiusDescription: string;
  linkedUnits: string;  // 'SP-02' or 'All units'
  active: boolean;
}
```

### MediaClip (from storage/Supabase)

```typescript
interface MediaClip {
  id: string;           // 'SPX-2607-1041'
  type: 'DRILL' | 'ALERT' | 'EVENT' | 'SYSTEM' | 'MANUAL';
  unitId: string;
  callsign: string;
  title: string;
  duration: string;     // 'MM:SS'
  timestamp: string;
  recordedDate: string;
  sourceImei: string;
  sha256: string;
  exportedBy: string | null;
  retention: string;
}
```

---

## Backend Integration Notes

### Traccar (GPS/telemetry)

All live unit data comes from the Traccar instance running on EC2.

Key endpoints:
- `GET /api/devices` — list of registered devices
- `GET /api/positions` — latest position for all or one device
- `GET /api/reports/route?deviceId=&from=&to=` — route history for playback
- `GET /api/events?deviceId=` — event log (geofence, alerts)
- `WebSocket /api/socket` — real-time position + event stream

**Polling fallback:** If WebSocket is unavailable, poll `/api/positions` every 5 seconds.

### Supabase (business data + auth)

All non-telemetry data lives in Supabase:
- `members` table — org users and roles
- `vehicles` table — vehicle registry
- `devices` table — device-to-vehicle assignments
- `geofences` table — geofence definitions (also replicated to Traccar via API)
- `media_clips` table — metadata for video/audio recordings
- Auth: Supabase Auth with row-level security per org

### Video / Audio (future)

The design shows live camera feeds and audio waveforms. For MVP:
- **Live feeds:** Show placeholder ("LIVE FEED — COMING SOON") with the feed UI chrome
- **Recorded clips:** Show placeholder video player with real metadata from Supabase
- Actual RTSP/WebRTC streaming is a post-MVP feature

### Real-time Updates

The dashboard should feel live. Priority order:
1. WebSocket from Traccar (preferred) — receive position updates and events as they happen
2. Polling every 5s as fallback
3. React state update → re-render map markers + unit cards automatically

---

## Implementation Order (Suggested)

| Phase | Module | Why first |
|---|---|---|
| 1 | App Shell | Nav rail + top bar — needed before any screen |
| 2 | Operations Dashboard | Core value; operators need this immediately |
| 3 | Duress Alert System | Safety-critical; must work before going live |
| 4 | Unit Detail | Second most-used screen by operators |
| 5 | Fleet & Devices | Admin use, less urgent |
| 6 | Org Settings (Members + Devices) | Needed to manage users |
| 7 | Org Settings (Vehicles + Geofences) | Config work |
| 8 | Org Settings (Roles + Billing) | Lower urgency |
| 9 | Video & Audio Review | Depends on media infrastructure |
| 10 | Modal / Provisioning | Needed before Settings is usable |

Start with **Module 1 (App Shell)** and **Module 2 (Operations Dashboard)** together, since the shell is needed to render anything.
