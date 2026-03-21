import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { accountApi, transactionApi } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { ArrowUpRight, ArrowDownLeft, Plus, ArrowLeftRight, TrendingUp } from 'lucide-react'
import { format } from 'date-fns'

function StatCard({ title, value, sub, color = 'blue', icon: Icon }) {
  const colors = {
    blue:  'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple:'bg-purple-50 text-purple-600',
  }
  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [accounts, setAccounts]     = useState([])
  const [recentTxns, setRecentTxns] = useState([])
  const [chartData, setChartData]   = useState([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const { data: accs } = await accountApi.list()
        const accounts = Array.isArray(accs) ? accs : (accs?.content ?? [])
        setAccounts(accounts)

        if (accounts.length > 0) {
          const { data: txnPage } = await transactionApi.history(accounts[0].id)
          const txns = txnPage.content || []
          setRecentTxns(txns.slice(0, 5))

          // Build simple chart data (last 7 days mock)
          const today = new Date()
          const chart = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(today)
            d.setDate(d.getDate() - (6 - i))
            return {
              day: format(d, 'EEE'),
              balance: accs[0].balance - (6 - i) * Math.random() * 200
            }
          })
          chart[6].balance = accs[0].balance
          setChartData(chart)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance), 0)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'}, {user?.fullName?.split(' ')[0]} 👋
        </h1>
        <p className="text-gray-500 mt-1">Here's your financial overview</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total Balance"
          value={`$${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          sub={`${accounts.length} account${accounts.length !== 1 ? 's' : ''}`}
          icon={TrendingUp}
          color="blue"
        />
        <StatCard
          title="Transactions (today)"
          value={recentTxns.filter(t => t.createdAt?.startsWith(new Date().toISOString().slice(0, 10))).length}
          sub="Completed"
          icon={ArrowLeftRight}
          color="green"
        />
        <StatCard
          title="Active Accounts"
          value={accounts.filter(a => a.status === 'ACTIVE').length}
          sub="All healthy"
          icon={Plus}
          color="purple"
        />
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="card">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Balance (7 days)</h2>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
              <YAxis hide />
              <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Balance']} />
              <Area type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={2} fill="url(#grad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Accounts */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">My Accounts</h2>
            <Link to="/accounts" className="text-sm text-blue-600 hover:underline">Manage</Link>
          </div>
          {accounts.length === 0
            ? <p className="text-sm text-gray-500">No accounts yet. <Link to="/accounts" className="text-blue-600">Create one</Link></p>
            : <div className="space-y-3">
                {accounts.map(acc => (
                  <div key={acc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{acc.accountNumber}</p>
                      <p className="text-xs text-gray-500">{acc.accountType} · {acc.currency}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">
                        ${Number(acc.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                      <span className={acc.status === 'ACTIVE' ? 'badge-success' : 'badge-failed'}>
                        {acc.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>

        {/* Recent Transactions */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Recent Transactions</h2>
            <Link to="/history" className="text-sm text-blue-600 hover:underline">View all</Link>
          </div>
          {recentTxns.length === 0
            ? <p className="text-sm text-gray-500">No transactions yet.</p>
            : <div className="space-y-3">
                {recentTxns.map(txn => {
                  const isCredit = accounts.some(a => a.id === txn.toAccountId)
                  return (
                    <div key={txn.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isCredit ? 'bg-green-100' : 'bg-red-100'}`}>
                          {isCredit
                            ? <ArrowDownLeft size={14} className="text-green-600" />
                            : <ArrowUpRight  size={14} className="text-red-600" />
                          }
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{txn.type}</p>
                          <p className="text-xs text-gray-400">{txn.reference}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-semibold ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                          {isCredit ? '+' : '-'}${Number(txn.amount).toFixed(2)}
                        </p>
                        <span className={txn.status === 'COMPLETED' ? 'badge-success' : txn.status === 'PENDING' ? 'badge-pending' : 'badge-failed'}>
                          {txn.status}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
          }
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-4">
        <Link to="/transfer" className="card hover:border-blue-200 hover:shadow-md transition-all cursor-pointer flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
            <ArrowLeftRight size={20} className="text-blue-600" />
          </div>
          <div>
            <p className="font-medium text-gray-900">Send Money</p>
            <p className="text-xs text-gray-500">Transfer to any account</p>
          </div>
        </Link>
        <Link to="/accounts" className="card hover:border-blue-200 hover:shadow-md transition-all cursor-pointer flex items-center gap-3">
          <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
            <Plus size={20} className="text-green-600" />
          </div>
          <div>
            <p className="font-medium text-gray-900">New Account</p>
            <p className="text-xs text-gray-500">Open savings or checking</p>
          </div>
        </Link>
      </div>
    </div>
  )
}
