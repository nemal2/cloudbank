import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage    from './pages/LoginPage'
import Dashboard    from './pages/Dashboard'
import TransferPage from './pages/TransferPage'
import HistoryPage  from './pages/HistoryPage'
import AccountsPage from './pages/AccountsPage'
import AdminPage    from './pages/AdminPage'
import Layout       from './components/Layout'

function PrivateRoute({ children, adminOnly = false }) {
  const { isAuthenticated, user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (adminOnly && user?.role !== 'ADMIN') return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index          element={<Dashboard />} />
            <Route path="transfer" element={<TransferPage />} />
            <Route path="history"  element={<HistoryPage />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="admin"    element={<PrivateRoute adminOnly><AdminPage /></PrivateRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
