import { useState, useEffect } from 'react'
import { accountApi, transactionApi } from '../services/api'
import { format } from 'date-fns'
import { ArrowUpRight, ArrowDownLeft, ChevronLeft, ChevronRight } from 'lucide-react'

const STATUS_BADGE = {
  COMPLETED: 'badge-success',
  PENDING:   'badge-pending',
  FAILED:    'badge-failed',
  REVERSED:  'badge-failed',
}

export default function HistoryPage() {
  const [accounts, setAccounts]   = useState([])
  const [selected, setSelected]   = useState('')
  const [txns, setTxns]           = useState([])
  const [page, setPage]           = useState(0)
  const [totalPages, setTotal]    = useState(0)
  const [loading, setLoading]     = useState(false)

  useEffect(() => {
    accountApi.list().then(({ data }) => {
      setAccounts(data)
      if (data.length > 0) setSelected(data[0].id)
    })
  }, [])

  useEffect(() => {
    if (!selected) return
    setLoading(true)
    transactionApi.history(selected, page).then(({ data }) => {
      setTxns(data.content || [])
      setTotal(data.totalPages || 0)
    }).finally(() => setLoading(false))
  }, [selected, page])

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Transaction History</h1>
      <p className="text-gray-500 mb-6">All transactions for your accounts.</p>

      {/* Account selector */}
      <div className="mb-6">
        <select
          value={selected}
          onChange={e => { setSelected(e.target.value); setPage(0) }}
          className="input-field max-w-xs"
        >
          {accounts.map(a => (
            <option key={a.id} value={a.id}>{a.accountNumber} ({a.accountType})</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Type', 'Reference', 'Amount', 'Description', 'Status', 'Date'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">Loading…</td></tr>
            ) : txns.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No transactions found.</td></tr>
            ) : txns.map(txn => {
              const isCredit = accounts.some(a => a.id === txn.toAccountId)
              return (
                <tr key={txn.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isCredit ? 'bg-green-100' : 'bg-red-100'}`}>
                        {isCredit
                          ? <ArrowDownLeft size={12} className="text-green-600" />
                          : <ArrowUpRight  size={12} className="text-red-600" />}
                      </div>
                      <span className="font-medium text-gray-700">{txn.type}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{txn.reference}</td>
                  <td className={`px-4 py-3 font-semibold ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                    {isCredit ? '+' : '-'}${Number(txn.amount).toFixed(2)} {txn.currency}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{txn.description || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={STATUS_BADGE[txn.status] || 'badge-pending'}>{txn.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {txn.createdAt ? format(new Date(txn.createdAt), 'MMM d, HH:mm') : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-sm text-gray-500">Page {page + 1} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn-secondary px-2 py-1"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="btn-secondary px-2 py-1"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
