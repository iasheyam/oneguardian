export const mockFleets = [
  {
    id: 'fl-01',
    name: 'Voss Executive Detail',
    client: 'A. Voss',
    industry: 'Finance · CEO',
    status: 'active',
    description: 'Full-time executive protection for CEO and all corporate travel, including advance car coverage.',
    subgroups: [
      { id: 'sg-01a', name: 'Motorcade',          units: ['SP-01', 'SP-04'] },
      { id: 'sg-01b', name: 'Residence Security',  units: ['SP-02'] },
    ],
  },
  {
    id: 'fl-02',
    name: 'Chen Family Protection',
    client: 'L. Chen',
    industry: 'Private · Family',
    status: 'active',
    description: 'Family detail covering daily school runs, shopping, and personal travel across the Dallas metro area.',
    subgroups: [
      { id: 'sg-02a', name: 'Primary Transport', units: ['SP-03'] },
    ],
  },
  {
    id: 'fl-03',
    name: 'Osei Protection Detail',
    client: 'K. Osei',
    industry: 'Visiting Principal',
    status: 'standby',
    description: 'Visiting principal protection. Primary vehicle offline — pending GPS reconnect before airport pickup.',
    subgroups: [],
    units: ['SP-05'],
  },
  {
    id: 'fl-04',
    name: 'DFW Transit Operations',
    client: 'Multi-client',
    industry: 'Airport · Transit',
    status: 'active',
    description: 'Ground personnel unit covering DFW terminal transfers, client arrivals, and active field reconnaissance.',
    subgroups: [
      { id: 'sg-04a', name: 'Ground Personnel', units: ['P-01', 'P-02'] },
    ],
  },
]
