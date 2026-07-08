import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './modules/landing/pages/LandingPage'
import AdminShell from './modules/admin/components/AdminShell'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"        element={<LandingPage />} />
        <Route path="/admin/*" element={<AdminShell />} />
      </Routes>
    </BrowserRouter>
  )
}
