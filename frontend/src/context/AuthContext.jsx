import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [token, setToken]     = useState(() => localStorage.getItem('jwt'))
  const [loading, setLoading] = useState(true)

  // Validate token and fetch user profile on mount
  useEffect(() => {
    const init = async () => {
      const stored = localStorage.getItem('jwt')
      if (stored) {
        try {
          api.defaults.headers.common['Authorization'] = `Bearer ${stored}`
          const { data } = await api.get('/api/v1/auth/me')
          setUser(data)
          setToken(stored)
        } catch {
          localStorage.removeItem('jwt')
          delete api.defaults.headers.common['Authorization']
        }
      }
      setLoading(false)
    }
    init()
  }, [])

  // Called after Google OAuth returns a credential
  const loginWithGoogle = useCallback(async (googleCredential) => {
    const { data } = await api.post('/api/v1/auth/google', { credential: googleCredential })
    const { token: jwt, user: profile } = data
    localStorage.setItem('jwt', jwt)
    api.defaults.headers.common['Authorization'] = `Bearer ${jwt}`
    setToken(jwt)
    setUser(profile)
    return profile
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('jwt')
    delete api.defaults.headers.common['Authorization']
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, loading, loginWithGoogle, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
