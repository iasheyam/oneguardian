import './Capabilities.css'

const items = [
  {
    title: 'Constant monitoring',
    description: 'A live security team on watch — not an automated system.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M1 10s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    title: 'Route security',
    description: 'Real-time path awareness with instant deviation alerts.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="15" cy="15" r="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M5 7v4a4 4 0 0 0 4 4h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Emergency response',
    description: 'One signal connects you directly to a live operator.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2.5L3 16h14L10 2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M10 9v3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="10" cy="14.5" r="0.8" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: 'Family-wide coverage',
    description: 'VIP — principals and family under one account.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="7" cy="5" r="2" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="13" cy="5" r="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M3 17c0-3.31 1.79-5.5 4-5.5s4 2.19 4 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M11 17c0-2 .9-3.5 2-3.5s2 1.5 2 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Live video & audio',
    description: 'VIP — on-demand and event-triggered footage, reviewed in real time.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="1.5" y="5.5" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M12.5 9l6-2.5v7l-6-2.5V9z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Trip-based monitoring',
    description: 'Travel — coverage set up for the duration of your trip.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2a5.5 5.5 0 0 1 5.5 5.5c0 4.5-5.5 10.5-5.5 10.5S4.5 12 4.5 7.5A5.5 5.5 0 0 1 10 2z" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="10" cy="7.5" r="1.8" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    title: 'Local coordination',
    description: 'Travel — support connecting to local resources and emergency services.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2.5 10h15M10 2.5a13 13 0 0 1 0 15M10 2.5a13 13 0 0 0 0 15" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    title: 'Vehicle tracking',
    description: 'Fleet — live location for every vehicle, always current.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 10.5h11M3 10.5V8l2.5-4h7L15 8v2.5M3 10.5v3h12v-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="6" cy="15.5" r="1.5" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="14" cy="15.5" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    title: 'Vehicle health',
    description: 'Fleet — diagnostics and fault detection so a mechanical issue never becomes a security gap.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M1.5 10h3.5l2-5.5 3.5 9 2.5-5 2 3.5H18.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
]

export default function Capabilities() {
  return (
    <section className="capabilities" id="capabilities">
      <div className="container">
        <div className="capabilities__header">
          <span className="section-label">Capabilities</span>
          <h2 className="capabilities__title">Our Solutions</h2>
        </div>

        <div className="capabilities__grid">
          {items.map(item => (
            <div key={item.title} className="cap-item">
              <div className="cap-item__icon">{item.icon}</div>
              <h3 className="cap-item__title">{item.title}</h3>
              <p className="cap-item__desc">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
