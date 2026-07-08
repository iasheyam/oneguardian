export const mockMembers = [
  {
    id: 'm1', name: 'Sarah Harrington', email: 'sarah@telematicsguardian.io', phone: '+1 214 555 0011',
    role: 'Owner', twoFactor: true, status: 'online', lastActive: 'Now',
    assignments: [
      { accountId: 'acc-001', scope: 'account', groupIds: [], unitIds: [] },
      { accountId: 'acc-002', scope: 'account', groupIds: [], unitIds: [] },
      { accountId: 'acc-003', scope: 'account', groupIds: [], unitIds: [] },
      { accountId: 'acc-004', scope: 'account', groupIds: [], unitIds: [] },
      { accountId: 'acc-005', scope: 'account', groupIds: [], unitIds: [] },
    ],
    activity: [
      { id: 'a1', type: 'login',    desc: 'Logged in from Dallas, TX',                       time: 'Jul 8, 09:04' },
      { id: 'a2', type: 'ops',      desc: 'Viewed live operations',                           time: 'Jul 8, 09:06' },
      { id: 'a3', type: 'settings', desc: 'Updated geofence — I-35W North Corridor',          time: 'Jul 7, 15:30' },
      { id: 'a4', type: 'member',   desc: 'Invited new member — Tyler Nash',                  time: 'Jul 7, 11:20' },
      { id: 'a5', type: 'alert',    desc: 'Acknowledged alert — SP-04 HARRIER geofence exit', time: 'Jul 6, 14:22' },
      { id: 'a6', type: 'export',   desc: 'Exported footage — SP-01 FALCON (14:10–14:25)',    time: 'Jul 5, 16:05' },
      { id: 'a7', type: 'login',    desc: 'Logged in from Dallas, TX',                        time: 'Jul 5, 08:55' },
    ],
  },
  {
    id: 'm2', name: 'James Cole', email: 'james@telematicsguardian.io', phone: '+1 214 555 0022',
    role: 'Admin', twoFactor: true, status: 'away', lastActive: '4m ago',
    assignments: [
      { accountId: 'acc-001', scope: 'account', groupIds: [], unitIds: [] },
      { accountId: 'acc-002', scope: 'groups',  groupIds: ['grp-cf-01', 'grp-cf-02'], unitIds: [] },
      { accountId: 'acc-003', scope: 'account', groupIds: [], unitIds: [] },
    ],
    activity: [
      { id: 'a1', type: 'login',    desc: 'Logged in from Dallas, TX',               time: 'Jul 8, 08:48' },
      { id: 'a2', type: 'ops',      desc: 'Viewed live operations',                   time: 'Jul 8, 08:50' },
      { id: 'a3', type: 'alert',    desc: 'Escalated alert — P-02 ECHO battery low',  time: 'Jul 8, 08:55' },
      { id: 'a4', type: 'settings', desc: 'Provisioned new device — SP-06',           time: 'Jul 7, 14:10' },
      { id: 'a5', type: 'export',   desc: 'Exported footage — SP-03 KITE',            time: 'Jul 6, 11:45' },
      { id: 'a6', type: 'login',    desc: 'Logged in from Dallas, TX',                time: 'Jul 6, 08:30' },
    ],
  },
  {
    id: 'm3', name: 'Marcus Webb', email: 'marcus@telematicsguardian.io', phone: '+1 817 555 0033',
    role: 'Operator', twoFactor: true, status: 'online', lastActive: 'Now',
    assignments: [
      { accountId: 'acc-001', scope: 'account', groupIds: [], unitIds: [] },
      { accountId: 'acc-004', scope: 'units',   groupIds: [], unitIds: ['u-dt-v01', 'u-dt-v02'] },
    ],
    activity: [
      { id: 'a1', type: 'login',  desc: 'Logged in from Fort Worth, TX',              time: 'Jul 8, 07:55' },
      { id: 'a2', type: 'ops',    desc: 'Viewed live operations',                     time: 'Jul 8, 07:57' },
      { id: 'a3', type: 'alert',  desc: 'Acknowledged alert — SP-04 HARRIER',         time: 'Jul 8, 08:12' },
      { id: 'a4', type: 'ops',    desc: 'Tracked unit — SP-01 FALCON route change',   time: 'Jul 7, 16:40' },
      { id: 'a5', type: 'export', desc: 'Exported footage — SP-04 HARRIER',           time: 'Jul 7, 10:22' },
    ],
  },
  {
    id: 'm4', name: 'Diana Reyes', email: 'diana@telematicsguardian.io', phone: '+1 972 555 0044',
    role: 'Operator', twoFactor: false, status: 'online', lastActive: '1m ago',
    assignments: [
      { accountId: 'acc-002', scope: 'groups', groupIds: ['grp-cf-02'], unitIds: [] },
      { accountId: 'acc-003', scope: 'units',  groupIds: [], unitIds: ['u-oh-p01', 'u-oh-p02'] },
    ],
    activity: [
      { id: 'a1', type: 'login',  desc: 'Logged in from Plano, TX',                  time: 'Jul 8, 09:01' },
      { id: 'a2', type: 'ops',    desc: 'Viewed live operations',                     time: 'Jul 8, 09:03' },
      { id: 'a3', type: 'alert',  desc: 'Acknowledged alert — SP-05 MERLIN offline', time: 'Jul 7, 13:15' },
      { id: 'a4', type: 'ops',    desc: 'Tracked unit — SP-03 KITE',                 time: 'Jul 6, 15:50' },
    ],
  },
  {
    id: 'm5', name: 'Tyler Nash', email: 'tyler@telematicsguardian.io', phone: '+1 214 555 0055',
    role: 'Agent', twoFactor: true, status: 'offline', lastActive: '2h ago',
    assignments: [
      { accountId: 'acc-001', scope: 'units', groupIds: [], unitIds: ['u-vc-p02'] },
    ],
    activity: [
      { id: 'a1', type: 'login',  desc: 'Logged in from Dallas, TX',       time: 'Jul 8, 07:10' },
      { id: 'a2', type: 'ops',    desc: 'Viewed own unit — SP-02 OSPREY',   time: 'Jul 8, 07:12' },
      { id: 'a3', type: 'alert',  desc: 'Triggered duress test — cleared',  time: 'Jul 7, 12:00' },
      { id: 'a4', type: 'login',  desc: 'Logged in from Dallas, TX',        time: 'Jul 7, 08:05' },
    ],
  },
  {
    id: 'm6', name: 'Emma Park', email: 'emma@telematicsguardian.io', phone: '+1 469 555 0066',
    role: 'Read-only', twoFactor: false, status: 'away', lastActive: '18m ago',
    assignments: [
      { accountId: 'acc-001', scope: 'groups',  groupIds: ['grp-vc-01'], unitIds: [] },
      { accountId: 'acc-002', scope: 'account', groupIds: [], unitIds: [] },
    ],
    activity: [
      { id: 'a1', type: 'login', desc: 'Logged in from McKinney, TX',  time: 'Jul 8, 08:42' },
      { id: 'a2', type: 'ops',   desc: 'Viewed live operations',        time: 'Jul 8, 08:44' },
      { id: 'a3', type: 'login', desc: 'Logged in from McKinney, TX',  time: 'Jul 7, 09:00' },
    ],
  },
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
