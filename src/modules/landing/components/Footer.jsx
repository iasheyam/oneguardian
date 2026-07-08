import './Footer.css'

const navGroups = [
  {
    heading: 'Platform',
    links: [
      { label: 'How It Works', href: '#how-it-works' },
      { label: 'Capabilities', href: '#capabilities' },
    ],
  },
  {
    heading: 'Coverage',
    links: [
      { label: 'VIP Protection', href: '#who-its-for' },
      { label: 'Travel Security', href: '#who-its-for' },
      { label: 'Fleet Management', href: '#who-its-for' },
    ],
  },
  {
    heading: 'Contact',
    links: [
      { label: 'Contact Sales', href: '#contact' },
    ],
  },
]

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__top">
          <div className="footer__brand">
            <div className="footer__logo">
              <LogoMark />
              <span>TelematicsGuardian</span>
            </div>
            <p className="footer__tagline">
              Live remote security monitoring for individuals,
              travelers, and fleets.
            </p>
          </div>

          <nav className="footer__nav" aria-label="Footer navigation">
            {navGroups.map(group => (
              <div key={group.heading} className="footer__nav-group">
                <h3 className="footer__nav-heading">{group.heading}</h3>
                <ul className="footer__nav-list">
                  {group.links.map(link => (
                    <li key={link.label}>
                      <a href={link.href} className="footer__nav-link">{link.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="footer__bottom">
          <p className="footer__copy">
            &copy; {new Date().getFullYear()} TelematicsGuardian. All rights reserved.
          </p>
          <div className="footer__legal">
            {/* Placeholder links — policies not yet written */}
            <a href="#" className="footer__legal-link">Privacy Policy</a>
            <a href="#" className="footer__legal-link">Terms</a>
          </div>
        </div>
      </div>
    </footer>
  )
}

function LogoMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6L12 2z"
        stroke="#2d6af6"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="12" cy="12" r="2.5" fill="#2d6af6" />
      <path d="M12 9.5V7" stroke="#2d6af6" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
