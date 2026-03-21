import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { Building2, Shield, Zap, Globe } from 'lucide-react'

const features = [
  { icon: Shield,  label: 'Bank-grade security',    desc: 'JWT + Google OAuth 2.0' },
  { icon: Zap,     label: 'Real-time transfers',    desc: 'ACID-compliant transactions' },
  { icon: Globe,   label: 'Cloud-native',           desc: 'AWS ECS · auto-scaling' },
]

export default function LoginPage() {
  const { loginWithGoogle, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated) navigate('/')
  }, [isAuthenticated, navigate])

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      await loginWithGoogle(credentialResponse.credential)
      toast.success('Welcome to CloudBank!')
      navigate('/')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed. Please try again.')
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-700 to-blue-900 flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <Building2 className="text-white" size={32} />
          <span className="text-2xl font-bold text-white">CloudBank</span>
        </div>

        <div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Modern banking for the cloud era
          </h1>
          <p className="text-blue-200 text-lg mb-12">
            Secure, scalable, and always available — built on AWS.
          </p>
          <div className="space-y-6">
            {features.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="text-white" size={20} />
                </div>
                <div>
                  <p className="text-white font-medium">{label}</p>
                  <p className="text-blue-300 text-sm">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-blue-400 text-sm">
          University of Ruhuna · EC7205 Cloud Computing · 2025
        </p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <Building2 className="text-blue-600" size={28} />
            <span className="text-2xl font-bold text-gray-900">CloudBank</span>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">Sign in</h2>
          <p className="text-gray-500 mb-8">Use your Google account to continue</p>

          <div className="card mb-6">
            <div className="flex justify-center">
             <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => toast.error('Google login failed')}
                  shape="rectangular"
                  size="large"
                  text="signin_with_google"
                  width="280"
                  use_fedcm_for_prompt={false}
                  cancel_on_tap_outside={false}
                />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Shield size={12} className="text-green-500" />
              <span>Secured with HTTPS and JWT authentication</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Zap size={12} className="text-blue-500" />
              <span>Session cached in Redis for fast access</span>
            </div>
          </div>

          {/* Demo note */}
          <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-700 font-medium mb-1">Demo mode</p>
            <p className="text-xs text-amber-600">
              Sign in with any Google account. Demo data is pre-loaded.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
