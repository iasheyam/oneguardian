import { useState, useEffect } from 'react'
import './Navbar.css'

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const navLinks = [
    { label: 'How It Works', href: '#how-it-works' },
    { label: 'Capabilities', href: '#capabilities' },
    { label: 'VIP Protection', href: '#who-its-for' },
    { label: 'Travel Security', href: '#who-its-for' },
    { label: 'Fleet Management', href: '#who-its-for' },
    { label: 'Contact', href: '#contact' },
  ]

  return (
    <header className={`navbar${scrolled ? ' navbar--scrolled' : ''}`}>
      <div className="navbar__inner container">
        <a href="#" className="navbar__logo" aria-label="TelematicsGuardian home">
          <LogoMark />
          <span>TelematicsGuardian</span>
        </a>

        <nav className="navbar__nav" aria-label="Main navigation">
          {navLinks.map(({ label, href }) => (
            <a key={label} href={href} className="navbar__link">
              {label}
            </a>
          ))}
        </nav>

        <a href="#contact" className="btn-primary navbar__cta">
          Contact Sales
        </a>

        <button
          className="navbar__burger"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(v => !v)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {menuOpen && (
        <div className="navbar__mobile">
          {navLinks.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              className="navbar__mobile-link"
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </a>
          ))}
          <a href="#contact" className="btn-primary" onClick={() => setMenuOpen(false)}>
            Contact Sales
          </a>
        </div>
      )}
    </header>
  )
}

function LogoMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6L12 2z"
        stroke="#c8a96e"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="12" cy="12" r="2.5" fill="#c8a96e" />
      <path d="M12 9.5V7" stroke="#c8a96e" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
