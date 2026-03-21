import { useState, useEffect, useRef } from 'react'
import { accountApi } from '../services/api'
import toast from 'react-hot-toast'
import { Plus, Upload, CreditCard } from 'lucide-react'

export default function AccountsPage() {
  const [accounts, setAccounts]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [creating, setCreating]   = useState(false)
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState({ accountType: 'SAVINGS', currency: 'USD' })
  const fileRef                   = useRef()

  const load = () => {
    setLoading(true)
    accountApi.list().then(({ data }) => {
  setAccounts(Array.isArray(data) ? data : (data?.content ?? []))
}).finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleCreate = async e => {
    e.preventDefault()
    setCreating(true)
    try {
      await accountApi.create(form)
      toast.success('Account created!')
      setShowForm(false)
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create account')
    } finally {
      setCreating(false)
    }
  }

  const handleAvatarUpload = async e => {
    const file = e.target.files[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    try {
      await accountApi.uploadAvatar(fd)
      toast.success('Profile photo updated!')
    } catch {
      toast.error('Upload failed. Check S3 configuration.')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
          <p className="text-gray-500 mt-1">Manage your bank accounts</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> New Account
        </button>
      </div>

      {/* Create Account Form */}
      {showForm && (
        <form onSubmit={handleCreate} className="card mb-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Open a new account</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account type</label>
              <select
                value={form.accountType}
                onChange={e => setForm(f => ({ ...f, accountType: e.target.value }))}
                className="input-field"
              >
                <option value="SAVINGS">Savings</option>
                <option value="CHECKING">Checking</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select
                value={form.currency}
                onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                className="input-field"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={creating} className="btn-primary flex-1">
              {creating ? 'Creating…' : 'Create Account'}
            </button>
          </div>
        </form>
      )}

      {/* Avatar upload */}
      <div className="card mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Profile Photo</h2>
            <p className="text-sm text-gray-500 mt-1">Stored securely in AWS S3 (or MinIO locally)</p>
          </div>
          <button onClick={() => fileRef.current.click()} className="btn-secondary flex items-center gap-2">
            <Upload size={16} /> Upload photo
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
        </div>
      </div>

      {/* Account list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="card text-center py-12">
          <CreditCard size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No accounts yet. Create your first one above.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {accounts.map(acc => (
            <div key={acc.id} className="card hover:border-blue-100 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                    <CreditCard size={22} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{acc.accountNumber}</p>
                    <p className="text-sm text-gray-500">{acc.accountType} · {acc.currency}</p>
                    <p className="text-xs font-mono text-gray-400 mt-0.5">{acc.id}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">
                    ${Number(acc.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                  <span className={acc.status === 'ACTIVE' ? 'badge-success' : 'badge-failed'}>
                    {acc.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
