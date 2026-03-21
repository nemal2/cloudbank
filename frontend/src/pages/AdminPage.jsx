import { useState, useEffect } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'
import { ShieldCheck, UserX, UserCheck } from 'lucide-react'

export default function AdminPage() {
  const [users, setUsers]   = useState([])
  const [loading, setLoad]  = useState(true)

  const load = () => {
    setLoad(true)
    api.get('/api/v1/admin/users').then(({ data }) => setUsers(data)).finally(() => setLoad(false))
  }

  useEffect(load, [])

  const toggleFreeze = async (accountId, freeze) => {
    try {
      await api.put(`/api/v1/admin/accounts/${accountId}/${freeze ? 'freeze' : 'unfreeze'}`)
      toast.success(`Account ${freeze ? 'frozen' : 'unfrozen'}`)
      load()
    } catch {
      toast.error('Action failed')
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
          <ShieldCheck size={20} className="text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
          <p className="text-gray-500 text-sm">Role-based access — ADMIN only</p>
        </div>
      </div>

      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-purple-700">
          <strong>RBAC enforced:</strong> This page is protected at both the API Gateway (JWT role check) and the React router layer. Regular users are redirected to the dashboard.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['User', 'Email', 'Role', 'Accounts', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {u.avatarUrl
                        ? <img src={u.avatarUrl} className="w-7 h-7 rounded-full" alt="" />
                        : <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-600">
                            {u.fullName?.[0]}
                          </div>
                      }
                      <span className="font-medium text-gray-900">{u.fullName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
                      ${u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{u.accountCount ?? 0}</td>
                  <td className="px-4 py-3">
                    {u.accounts?.map(acc => (
                      <button
                        key={acc.id}
                        onClick={() => toggleFreeze(acc.id, acc.status === 'ACTIVE')}
                        className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded mr-1 mb-1
                          ${acc.status === 'ACTIVE'
                            ? 'bg-red-50 text-red-600 hover:bg-red-100'
                            : 'bg-green-50 text-green-600 hover:bg-green-100'}`}
                      >
                        {acc.status === 'ACTIVE'
                          ? <><UserX size={12} /> Freeze</>
                          : <><UserCheck size={12} /> Unfreeze</>}
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
