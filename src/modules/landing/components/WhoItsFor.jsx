import './WhoItsFor.css'
import vipImg from '../../../assets/images/who_its_for_vip_protection.jpg'
import travelImg from '../../../assets/images/who_its_for_vip_travel.jpg'
import fleetImg from '../../../assets/images/who_its_for_vip_fleet.jpg'

const segments = [
  {
    id: 'vip',
    label: 'VIP Protection',
    headline: 'High-profile individuals and families',
    description: 'Dedicated monitoring and protection, with live video and route security layered in.',
    img: vipImg,
    alt: 'VIP protection — executive security',
  },
  {
    id: 'travel',
    label: 'Travel Security',
    headline: 'Travelers in Central and South America',
    description: "Real-time support for the duration of your trip, so you're never navigating unfamiliar territory alone.",
    img: travelImg,
    alt: 'Travel security — traveler with support',
  },
  {
    id: 'fleet',
    label: 'Fleet Management',
    headline: 'Security firms and fleet operators',
    description: 'A remote layer that never sleeps, covering every vehicle and every route.',
    img: fleetImg,
    alt: 'Fleet management — vehicles in operation',
  },
]

export default function WhoItsFor() {
  return (
    <section className="who-its-for" id="who-its-for">
      <div className="container">
        <div className="who-its-for__header">
          <span className="section-label">Coverage Areas</span>
          <h2 className="who-its-for__title">Who it's for</h2>
        </div>
      </div>

      <div className="who-its-for__segments">
        {segments.map(segment => (
          <div key={segment.id} className="segment">
            <div className="segment__image">
              <img src={segment.img} alt={segment.alt} className="segment__img" />
            </div>
            <div className="segment__body">
              <span className="segment__label">{segment.label}</span>
              <h3 className="segment__headline">{segment.headline}</h3>
              <p className="segment__desc">{segment.description}</p>
              <a href="#contact" className="segment__cta">
                Contact Sales <ArrowRight />
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function ArrowRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
