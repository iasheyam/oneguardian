export const mockMembers = [
  { id: 'm1', name: 'Sarah Harrington', email: 'sarah@oneguardian.io',  role: 'Owner',     twoFactor: true,  status: 'online',  lastActive: 'Now' },
  { id: 'm2', name: 'James Cole',       email: 'james@oneguardian.io',  role: 'Admin',     twoFactor: true,  status: 'away',    lastActive: '4m ago' },
  { id: 'm3', name: 'Marcus Webb',      email: 'marcus@oneguardian.io', role: 'Operator',  twoFactor: true,  status: 'online',  lastActive: 'Now' },
  { id: 'm4', name: 'Diana Reyes',      email: 'diana@oneguardian.io',  role: 'Operator',  twoFactor: false, status: 'online',  lastActive: '1m ago' },
  { id: 'm5', name: 'Tyler Nash',       email: 'tyler@oneguardian.io',  role: 'Agent',     twoFactor: true,  status: 'offline', lastActive: '2h ago' },
  { id: 'm6', name: 'Emma Park',        email: 'emma@oneguardian.io',   role: 'Read-only', twoFactor: false, status: 'away',    lastActive: '18m ago' },
]

export const mockDevices = [
  { id: 'SP-01', imei: '352099001761481', assignedTo: 'A. Voss · Escalade ESV',  firmware: '4.2.1', gpsOnline: true,  cameras: '2/2', lastCheckin: '2s' },
  { id: 'SP-02', imei: '352099001849231', assignedTo: 'M. Reyes · Suburban',     firmware: '4.2.0', gpsOnline: true,  cameras: '2/2', lastCheckin: '5s' },
  { id: 'SP-03', imei: '352099001934512', assignedTo: 'L. Chen · Sprinter',      firmware: '4.2.1', gpsOnline: true,  cameras: '2/2', lastCheckin: '1s' },
  { id: 'SP-04', imei: '352099002018743', assignedTo: '— Advance · BMW 540i',    firmware: '4.1.9', gpsOnline: true,  cameras: '1/2', lastCheckin: '1s' },
  { id: 'SP-05', imei: '352099002103874', assignedTo: 'K. Osei · Range Rover',   firmware: '4.2.1', gpsOnline: false, cameras: '0/2', lastCheckin: '6m' },
  { id: 'P-01',  imei: '352099002188905', assignedTo: 'C. Addo · On foot',       firmware: '3.1.4', gpsOnline: true,  cameras: '—',   lastCheckin: '4s' },
  { id: 'P-02',  imei: '352099002274036', assignedTo: 'B. Obi · On foot',        firmware: '3.1.4', gpsOnline: true,  cameras: '—',   lastCheckin: '2s' },
]

export const mockVehicles = [
  { id: 'SP-01', callsign: 'FALCON',  vehicle: 'Cadillac Escalade ESV', plate: '7XPD418', armor: 'B6 Armored', vin: '1GYS4HKJ8NR101294', status: 'normal'  },
  { id: 'SP-02', callsign: 'OSPREY',  vehicle: 'Chevrolet Suburban',    plate: '4KLM903', armor: 'B4 Armored', vin: '1GNSKCKC4PR106821', status: 'normal'  },
  { id: 'SP-03', callsign: 'KITE',    vehicle: 'Mercedes Sprinter',     plate: '9RTX255', armor: 'Soft skin',  vin: 'WD3PE8CD3GP236147', status: 'normal'  },
  { id: 'SP-04', callsign: 'HARRIER', vehicle: 'BMW 540i',              plate: '2BCV770', armor: 'Soft skin',  vin: 'WBA5A5C57FG120138', status: 'warning' },
  { id: 'SP-05', callsign: 'MERLIN',  vehicle: 'Range Rover',           plate: '6NHJ512', armor: 'B4 Armored', vin: 'SALRR2RFXHA096712', status: 'offline' },
]

export const mockGeofences = [
  { id: 'g1', name: 'Residence — Highland Park',   type: 'SAFE ZONE', size: '400 m radius',   linkedUnits: 'All units',    active: true  },
  { id: 'g2', name: 'Downtown Office Tower',        type: 'SAFE ZONE', size: '150 m radius',   linkedUnits: 'SP-01, SP-02', active: true  },
  { id: 'g3', name: 'I-35W North Corridor',         type: 'CORRIDOR',  size: '2.4 km × 80 m', linkedUnits: 'All units',    active: true  },
  { id: 'g4', name: 'DFW Airport Route',            type: 'CORRIDOR',  size: '1.8 km × 60 m', linkedUnits: 'SP-01, SP-03', active: true  },
  { id: 'g5', name: 'Red Zone — Fair Park',         type: 'EXCLUSION', size: '800 m radius',   linkedUnits: 'All units',    active: true  },
  { id: 'g6', name: 'State Fairgrounds Perimeter',  type: 'EXCLUSION', size: '1.2 km radius',  linkedUnits: 'All units',    active: false },
  { id: 'g7', name: 'Checkpoint Alpha — Reunion',   type: 'WAYPOINT',  size: '50 m radius',    linkedUnits: 'SP-02, SP-05', active: true  },
  { id: 'g8', name: 'Checkpoint Bravo — Commerce',  type: 'WAYPOINT',  size: '50 m radius',    linkedUnits: 'P-01, P-02',   active: true  },
]

export const mockRoles = [
  {
    id: 'r1', name: 'Owner',     color: '#37C2B8', memberCount: 1,
    description: 'Full control including org configuration and deletion.',
    permissions: ['Billing', 'Members', 'Devices', 'Geofences', 'Live ops', 'Export footage'],
  },
  {
    id: 'r2', name: 'Admin',     color: '#37C2B8', memberCount: 1,
    description: 'Full operational and configuration access, excluding billing.',
    permissions: ['Members', 'Devices', 'Geofences', 'Live ops', 'Export footage'],
  },
  {
    id: 'r3', name: 'Operator',  color: '#66727A', memberCount: 2,
    description: 'Monitor live operations, acknowledge alerts, and export footage.',
    permissions: ['Live ops', 'Acknowledge', 'Escalate', 'Export footage'],
  },
  {
    id: 'r4', name: 'Agent',     color: '#66727A', memberCount: 1,
    description: 'Access own unit telemetry and trigger duress alert.',
    permissions: ['Own unit', 'Trigger duress'],
  },
  {
    id: 'r5', name: 'Read-only', color: '#66727A', memberCount: 1,
    description: 'View live operations and access reports only. No write access.',
    permissions: ['Live ops (view)', 'Reports'],
  },
]
