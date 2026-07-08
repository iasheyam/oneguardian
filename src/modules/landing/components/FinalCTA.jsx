import './FinalCTA.css'
import ctaImg from '../../../assets/images/trust_section.jpg'

export default function FinalCTA() {
  return (
    <section className="final-cta">
      <div className="final-cta__image-wrap">
        <img src={ctaImg} alt="" className="final-cta__img" aria-hidden="true" />
        <div className="final-cta__overlay" />
      </div>

      <div className="container final-cta__content">
        <h2 className="final-cta__headline">
          Protection that responds,<br />not just reports.
        </h2>
        <p className="final-cta__sub">
          Talk to our team about coverage for your family, your trip, or your fleet.
        </p>
        <a href="#contact" className="btn-primary">
          Contact Sales
        </a>
      </div>
    </section>
  )
}
