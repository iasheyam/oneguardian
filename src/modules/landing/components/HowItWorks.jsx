import './HowItWorks.css'
import howItWorksImg from '../../../assets/images/how_it_works.jpg'

const steps = [
  {
    number: '01',
    label: 'Connect',
    description: 'Onboard yourself, your family, your trip, or your fleet.',
  },
  {
    number: '02',
    label: 'Monitor',
    description: 'A live team watches location, route, and status around the clock.',
  },
  {
    number: '03',
    label: 'Detect',
    description: 'The moment something deviates from plan, the team is alerted instantly.',
  },
  {
    number: '04',
    label: 'Respond',
    description: 'Operators guide you in real time or coordinate emergency response.',
  },
]

export default function HowItWorks() {
  return (
    <section className="how-it-works" id="how-it-works">
      <div className="container">
        <div className="how-it-works__header">
          <span className="section-label">Process</span>
          <h2 className="how-it-works__title">How it works</h2>
        </div>

        <div className="how-it-works__grid">
          <div className="how-it-works__image">
            <img src={howItWorksImg} alt="Security operations monitoring" className="how-it-works__img" />
          </div>

          <div className="how-it-works__steps">
            {steps.map((step, i) => (
              <div key={step.number} className="step">
                <span className="step__number">{step.number}</span>
                <div className="step__body">
                  <h3 className="step__label">{step.label}</h3>
                  <p className="step__desc">{step.description}</p>
                </div>
                {i < steps.length - 1 && <span className="step__divider" aria-hidden="true" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
