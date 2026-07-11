import { createContext, useContext, useState, useEffect } from 'react'
import { CognitoUser, AuthenticationDetails } from 'amazon-cognito-identity-js'
import { userPool } from './cognito'
import { apiUrl } from '../../shared/utils/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  // Restore session on mount
  useEffect(() => {
    const cognitoUser = userPool.getCurrentUser()
    if (!cognitoUser) { setLoading(false); return }

    cognitoUser.getSession((err, session) => {
      if (err || !session?.isValid()) { setLoading(false); return }

      cognitoUser.getUserAttributes((attrErr, attrs) => {
        if (!attrErr) setUser(attrsToObject(attrs))
        setLoading(false)
      })
    })
  }, [])

  async function provision(attrs) {
    try {
      await fetch(apiUrl('/api/auth/provision'), {
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
        onSuccess: () => {
          cognitoUser.getUserAttributes((err, attrs) => {
            const userObj = err ? {} : attrsToObject(attrs)
            setUser(userObj)
            provision(userObj)
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
        onSuccess: () => {
          cognitoUser.getUserAttributes((err, attrs) => {
            const userObj = err ? {} : attrsToObject(attrs)
            setUser(userObj)
            provision(userObj)
            resolve()
          })
        },
        onFailure: reject,
      })
    })
  }

  function signOut() {
    userPool.getCurrentUser()?.signOut()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, isAuthenticated: !!user, signIn, completeNewPassword, signOut }}>
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
