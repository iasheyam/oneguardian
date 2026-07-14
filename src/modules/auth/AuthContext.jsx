import { createContext, useContext, useState, useEffect } from 'react'
import { CognitoUser, AuthenticationDetails } from 'amazon-cognito-identity-js'
import { userPool } from './cognito'
import { apiUrl, apiFetch, setToken, clearToken } from '../../shared/utils/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)   // Cognito attributes
  const [dbUser,  setDbUser]  = useState(null)   // DB record with permissions[]
  const [loading, setLoading] = useState(true)

  async function fetchMe() {
    try {
      const res = await apiFetch(apiUrl('/api/me'))
      if (!res.ok) return null
      return await res.json()
    } catch {
      return null
    }
  }

  // Restore session on mount
  useEffect(() => {
    const cognitoUser = userPool.getCurrentUser()
    if (!cognitoUser) { setLoading(false); return }

    cognitoUser.getSession(async (err, session) => {
      if (err || !session?.isValid()) { setLoading(false); return }

      setToken(session.getAccessToken().getJwtToken())

      cognitoUser.getUserAttributes(async (attrErr, attrs) => {
        const userObj = attrErr ? {} : attrsToObject(attrs)
        const me = await fetchMe()
        setUser(userObj)
        setDbUser(me)
        setLoading(false)
      })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function provision(attrs) {
    try {
      await apiFetch(apiUrl('/api/auth/provision'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cognitoSub: attrs['sub'],
          name:       attrs['name'],
          email:      attrs['email'],
        }),
      })
    } catch (err) {
      console.error('Provision error:', err)
    }
  }

  function signIn(email, password) {
    return new Promise((resolve, reject) => {
      const cognitoUser  = new CognitoUser({ Username: email, Pool: userPool })
      const authDetails  = new AuthenticationDetails({ Username: email, Password: password })

      cognitoUser.setAuthenticationFlowType('USER_PASSWORD_AUTH')
      cognitoUser.authenticateUser(authDetails, {
        onSuccess: async (session) => {
          setToken(session.getAccessToken().getJwtToken())

          cognitoUser.getUserAttributes(async (err, attrs) => {
            const userObj = err ? {} : attrsToObject(attrs)
            await provision(userObj)
            const me = await fetchMe()
            setUser(userObj)
            setDbUser(me)
            resolve({ type: 'success' })
          })
        },
        onFailure: reject,
        newPasswordRequired: (_userAttrs, _required) => {
          resolve({ type: 'newPasswordRequired', cognitoUser })
        },
      })
    })
  }

  function completeNewPassword(cognitoUser, newPassword) {
    return new Promise((resolve, reject) => {
      cognitoUser.completeNewPasswordChallenge(newPassword, {}, {
        onSuccess: async (session) => {
          setToken(session.getAccessToken().getJwtToken())

          cognitoUser.getUserAttributes(async (err, attrs) => {
            const userObj = err ? {} : attrsToObject(attrs)
            await provision(userObj)
            const me = await fetchMe()
            setUser(userObj)
            setDbUser(me)
            resolve()
          })
        },
        onFailure: reject,
      })
    })
  }

  function signOut() {
    userPool.getCurrentUser()?.signOut()
    clearToken()
    setUser(null)
    setDbUser(null)
  }

  function can(key) {
    return dbUser?.permissions?.includes(key) ?? false
  }

  return (
    <AuthContext.Provider value={{ user, dbUser, can, loading, isAuthenticated: !!user, signIn, completeNewPassword, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

function attrsToObject(attrs) {
  return Object.fromEntries(attrs.map(a => [a.getName(), a.getValue()]))
}
