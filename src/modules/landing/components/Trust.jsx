import './Trust.css'
import trustImg from '../../../assets/images/trust_section.jpg'

const stats = [
  { value: '24/7', label: 'Live monitoring' },
  { value: '149', label: 'Trained operators' },
  { value: '3', label: 'Focus areas, one team' },
]

export default function Trust() {
  return (
    <section className="trust" id="trust">
      <div className="trust__image-wrap">
        <img src={trustImg} alt="" className="trust__img" aria-hidden="true" />
        <div className="trust__image-overlay" />
      </div>

      <div className="container trust__content">
        <div className="trust__left">
          <span className="section-label">Why TelematicsGuardian</span>
          <h2 className="trust__title">
            An active team.<br />Not a location pin.
          </h2>
          <p className="trust__desc">
            Discretion and confidentiality as standard practice.
            When you need a response, a person is already watching.
          </p>
          <div className="trust__placeholders">
            <p>[Space reserved for certifications and compliance badges]</p>
            <p>[Space reserved for regional partnership details]</p>
            <p>[Space reserved for client testimonial or case study]</p>
          </div>
        </div>

        <div className="trust__stats">
          {stats.map(stat => (
            <div key={stat.label} className={`trust-stat${stat.placeholder ? ' trust-stat--placeholder' : ''}`}>
              <span className="trust-stat__value">{stat.value}</span>
              <span className="trust-stat__label">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
