import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import PositioningStatement from '../components/PositioningStatement'
import HowItWorks from '../components/HowItWorks'
import Capabilities from '../components/Capabilities'
import WhoItsFor from '../components/WhoItsFor'
import Trust from '../components/Trust'
import FinalCTA from '../components/FinalCTA'
import ContactForm from '../components/ContactForm'
import Footer from '../components/Footer'

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <PositioningStatement />
        <HowItWorks />
        <Capabilities />
        <WhoItsFor />
        <Trust />
        <FinalCTA />
        <ContactForm />
      </main>
      <Footer />
    </>
  )
}
