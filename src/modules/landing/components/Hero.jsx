import './Hero.css'
import heroImg from '../../../assets/images/hero_image.jpg'

export default function Hero() {
  return (
    <section className="hero" id="hero">
      <div className="container hero__inner">
        <div className="hero__content">
          <p className="hero__eyebrow">Live Remote Security</p>
          <h1 className="hero__headline">
            Security that<br />travels with you.
          </h1>
          <p className="hero__sub">
            A live team watching over you — not a passive tracker.
          </p>
          <a href="#contact" className="btn-primary">
            Contact Sales
          </a>
        </div>

        <div className="hero__image">
          <img src={heroImg} alt="TelematicsGuardian security operations" className="hero__img" />
        </div>
      </div>
    </section>
  )
}
