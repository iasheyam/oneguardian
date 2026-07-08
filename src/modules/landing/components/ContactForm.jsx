import { useState } from 'react'
import './ContactForm.css'

const interests = [
  { value: 'vip', label: 'VIP protection' },
  { value: 'travel', label: 'Travel security (Central/South America)' },
  { value: 'fleet', label: 'Fleet management' },
  { value: 'multiple', label: 'More than one' },
]

const initialState = {
  fullName: '',
  company: '',
  email: '',
  phone: '',
  interest: '',
  fleetSize: '',
  tripDates: '',
  tripDestination: '',
  message: '',
}

export default function ContactForm() {
  const [form, setForm] = useState(initialState)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const isTravelInterest = form.interest === 'travel' || form.interest === 'multiple'
  const isFleetInterest = form.interest === 'fleet' || form.interest === 'multiple'

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    setError('')
  }

  function handleSubmit(e) {
    e.preventDefault()

    if (!form.fullName || !form.email || !form.interest) {
      setError('Please fill in your name, email, and area of interest.')
      return
    }

    // TODO: Wire to a real endpoint before launch.
    // Currently logs to console as a placeholder.
    console.log('Contact form submission:', form)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <section className="contact-form" id="contact">
        <div className="container">
          <div className="contact-form__success">
            <div className="contact-form__success-icon" aria-hidden="true">
              <CheckIcon />
            </div>
            <h2 className="contact-form__success-title">Message received</h2>
            <p className="contact-form__success-sub">
              Our team will be in touch shortly. If you have an urgent need,
              please note it in your message and we'll prioritize accordingly.
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="contact-form" id="contact">
      <div className="container">
        <div className="contact-form__layout">
          <div className="contact-form__sidebar">
            <span className="section-label">Contact Sales</span>
            <h2 className="contact-form__title">Talk to our team</h2>
            <p className="contact-form__desc">
              All three focus areas are relationship-driven. Tell us what you need
              and we'll follow up to understand your situation before recommending
              a coverage plan.
            </p>
            <div className="contact-form__note">
              <LockIcon />
              <span>All inquiries are handled with full discretion.</span>
            </div>
          </div>

          <form className="contact-form__form" onSubmit={handleSubmit} noValidate>
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="fullName" className="form-label">Full name <span aria-hidden="true">*</span></label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  className="form-input"
                  value={form.fullName}
                  onChange={handleChange}
                  autoComplete="name"
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="company" className="form-label">Company / firm name <span className="form-label--optional">(optional)</span></label>
                <input
                  id="company"
                  name="company"
                  type="text"
                  className="form-input"
                  value={form.company}
                  onChange={handleChange}
                  autoComplete="organization"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label htmlFor="email" className="form-label">Email <span aria-hidden="true">*</span></label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className="form-input"
                  value={form.email}
                  onChange={handleChange}
                  autoComplete="email"
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="phone" className="form-label">Phone</label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  className="form-input"
                  value={form.phone}
                  onChange={handleChange}
                  autoComplete="tel"
                />
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="interest" className="form-label">What are you interested in <span aria-hidden="true">*</span></label>
              <select
                id="interest"
                name="interest"
                className="form-input form-select"
                value={form.interest}
                onChange={handleChange}
                required
              >
                <option value="" disabled>Select an option</option>
                {interests.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {isFleetInterest && (
              <div className="form-field">
                <label htmlFor="fleetSize" className="form-label">
                  Estimated fleet / personnel size <span className="form-label--optional">(if applicable)</span>
                </label>
                <input
                  id="fleetSize"
                  name="fleetSize"
                  type="text"
                  className="form-input"
                  value={form.fleetSize}
                  onChange={handleChange}
                  placeholder="e.g. 12 vehicles, 50 personnel"
                />
              </div>
            )}

            {isTravelInterest && (
              <div className="form-row">
                <div className="form-field">
                  <label htmlFor="tripDates" className="form-label">
                    Trip dates <span className="form-label--optional">(optional)</span>
                  </label>
                  <input
                    id="tripDates"
                    name="tripDates"
                    type="text"
                    className="form-input"
                    value={form.tripDates}
                    onChange={handleChange}
                    placeholder="e.g. Aug 15 – Aug 22"
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="tripDestination" className="form-label">
                    Destination <span className="form-label--optional">(optional)</span>
                  </label>
                  <input
                    id="tripDestination"
                    name="tripDestination"
                    type="text"
                    className="form-input"
                    value={form.tripDestination}
                    onChange={handleChange}
                    placeholder="Country or city"
                  />
                </div>
              </div>
            )}

            <div className="form-field">
              <label htmlFor="message" className="form-label">
                Message <span className="form-label--optional">(optional)</span>
              </label>
              <textarea
                id="message"
                name="message"
                className="form-input form-textarea"
                value={form.message}
                onChange={handleChange}
                rows={4}
                placeholder="Tell us about your situation or any specifics we should know."
              />
            </div>

            {error && (
              <p className="form-error" role="alert">{error}</p>
            )}

            <button type="submit" className="btn-primary form-submit">
              Talk to our team
            </button>
          </form>
        </div>
      </div>
    </section>
  )
}

function CheckIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <path d="M6 14l6 6L22 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="3" y="7" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 7V5a2 2 0 1 1 4 0v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
