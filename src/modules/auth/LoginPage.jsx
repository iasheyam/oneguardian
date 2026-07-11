import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import './LoginPage.css'

export default function LoginPage() {
  const { isAuthenticated, loading, signIn, completeNewPassword } = useAuth()
  const navigate = useNavigate()

  const [step,            setStep]           = useState('login') // 'login' | 'newPassword'
  const [email,           setEmail]          = useState('')
  const [password,        setPassword]       = useState('')
  const [newPassword,     setNewPassword]    = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error,           setError]          = useState('')
  const [busy,            setBusy]           = useState(false)
  const [pendingUser,     setPendingUser]    = useState(null)

  useEffect(() => {
    if (!loading && isAuthenticated) navigate('/admin', { replace: true })
  }, [loading, isAuthenticated, navigate])

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await signIn(email, password)
      if (result.type === 'success') {
        navigate('/admin', { replace: true })
      } else if (result.type === 'newPasswordRequired') {
        setPendingUser(result.cognitoUser)
        setStep('newPassword')
      }
    } catch (err) {
      console.error('Cognito signIn error:', err)
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleNewPassword(e) {
    e.preventDefault()
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return }
    setError('')
    setBusy(true)
    try {
      await completeNewPassword(pendingUser, newPassword)
      navigate('/admin', { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="login-page" />

  return (
    <div className="login-page">
      <div className="login-card">

        {/* Brand */}
        <div className="login-brand">
          <span className="login-brand__dot" />
          <span className="login-brand__name">TelematicsGuardian</span>
        </div>

        {step === 'login' ? (
          <>
            <h1 className="login-title">Sign in</h1>
            <p className="login-sub">Access is restricted to authorized personnel only.</p>

            <form className="login-form" onSubmit={handleLogin} noValidate>
              <div className="login-field">
                <label className="login-label" htmlFor="email">EMAIL</label>
                <input
                  id="email"
                  className="login-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="operator@example.com"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="login-field">
                <label className="login-label" htmlFor="password">PASSWORD</label>
                <input
                  id="password"
                  className="login-input"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>

              {error && <p className="login-error" role="alert">{error}</p>}

              <button className="login-btn" type="submit" disabled={busy}>
                {busy ? <span className="login-btn__spinner" /> : null}
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="login-title">Set new password</h1>
            <p className="login-sub">
              Your account requires a new password before continuing.
              Must be 8+ characters with uppercase, lowercase, and a number.
            </p>

            <form className="login-form" onSubmit={handleNewPassword} noValidate>
              <div className="login-field">
                <label className="login-label" htmlFor="newPassword">NEW PASSWORD</label>
                <input
                  id="newPassword"
                  className="login-input"
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="login-field">
                <label className="login-label" htmlFor="confirmPassword">CONFIRM PASSWORD</label>
                <input
                  id="confirmPassword"
                  className="login-input"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="new-password"
                  required
                />
              </div>

              {error && <p className="login-error" role="alert">{error}</p>}

              <button className="login-btn" type="submit" disabled={busy}>
                {busy ? <span className="login-btn__spinner" /> : null}
                {busy ? 'Setting password…' : 'Set password & continue'}
              </button>
            </form>
          </>
        )}

        <p className="login-footer">
          Contact your administrator if you need access.
        </p>
      </div>
    </div>
  )
}

function friendlyError(err) {
  const code = err?.code || ''
  if (code === 'NotAuthorizedException')    return 'Incorrect email or password.'
  if (code === 'UserNotFoundException')     return 'No account found with that email.'
  if (code === 'UserNotConfirmedException') return 'Account not confirmed. Contact your administrator.'
  if (code === 'PasswordResetRequiredException') return 'Password reset required. Contact your administrator.'
  if (code === 'InvalidPasswordException')  return err.message
  return err?.message || 'Something went wrong. Please try again.'
}
