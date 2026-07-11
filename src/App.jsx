import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './modules/auth/AuthContext'
import LoginPage from './modules/auth/LoginPage'
import LandingPage from './modules/landing/pages/LandingPage'
import AdminShell from './modules/admin/components/AdminShell'
import { AccountsProvider } from './modules/admin/contexts/AccountsContext'
import './App.css'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/"        element={<LandingPage />} />
          <Route path="/login"   element={<LoginPage />} />
          <Route path="/admin/*" element={
            <ProtectedRoute>
              <AccountsProvider>
                <AdminShell />
              </AccountsProvider>
            </ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <div style={{ minHeight: '100vh', background: '#0D1518' }} />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}
