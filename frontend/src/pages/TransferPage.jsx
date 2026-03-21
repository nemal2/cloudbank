import { useState, useEffect } from 'react'
import { accountApi, transactionApi } from '../services/api'
import toast from 'react-hot-toast'
import { ArrowLeftRight, CheckCircle, AlertCircle, Loader } from 'lucide-react'

const STEPS = { FORM: 'form', CONFIRM: 'confirm', DONE: 'done', ERROR: 'error' }

export default function TransferPage() {
  const [accounts, setAccounts]         = useState([])
  const [step, setStep]                 = useState(STEPS.FORM)
  const [submitting, setSubmitting]     = useState(false)
  const [result, setResult]             = useState(null)

  const [form, setForm] = useState({
    fromAccountId: '',
    toAccountId: '',
    amount: '',
    description: '',
  })

  useEffect(() => {
    accountApi.list().then(({ data }) => {
      setAccounts(data)
      if (data.length > 0) setForm(f => ({ ...f, fromAccountId: data[0].id }))
    })
  }, [])

  const selectedFrom = accounts.find(a => a.id === form.fromAccountId)
  const amountNum    = parseFloat(form.amount) || 0

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmitForm = e => {
    e.preventDefault()
    if (!form.fromAccountId || !form.toAccountId) return toast.error('Select both accounts')
    if (form.fromAccountId === form.toAccountId) return toast.error('Cannot transfer to same account')
    if (amountNum <= 0) return toast.error('Enter a valid amount')
    if (selectedFrom && amountNum > Number(selectedFrom.balance)) return toast.error('Insufficient funds')
    setStep(STEPS.CONFIRM)
  }

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      const { data } = await transactionApi.transfer({
        fromAccountId: form.fromAccountId,
        toAccountId:   form.toAccountId,
        amount:        amountNum,
        description:   form.description,
      })
      setResult(data)
      setStep(STEPS.DONE)
      toast.success('Transfer completed!')
    } catch (err) {
      setResult({ error: err.response?.data?.error || 'Transfer failed' })
      setStep(STEPS.ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    setStep(STEPS.FORM)
    setForm(f => ({ ...f, toAccountId: '', amount: '', description: '' }))
    setResult(null)
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Send Money</h1>
      <p className="text-gray-500 mb-6">Funds transfer between accounts — processed instantly.</p>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {['Details', 'Confirm', 'Done'].map((label, i) => {
          const stepIdx = [STEPS.FORM, STEPS.CONFIRM, STEPS.DONE].indexOf(step)
          const active  = i === stepIdx
          const done    = i < stepIdx
          return (
            <div key={label} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium
                ${done   ? 'bg-green-500 text-white' :
                  active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-sm ${active ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>{label}</span>
              {i < 2 && <div className="w-8 h-px bg-gray-200 mx-1" />}
            </div>
          )
        })}
      </div>

      {/* FORM */}
      {step === STEPS.FORM && (
        <form onSubmit={handleSubmitForm} className="card space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From account</label>
            <select name="fromAccountId" value={form.fromAccountId} onChange={handleChange} className="input-field" required>
              <option value="">Select account</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.accountNumber} — ${Number(a.balance).toFixed(2)} ({a.currency})
                </option>
              ))}
            </select>
            {selectedFrom && (
              <p className="text-xs text-gray-400 mt-1">
                Available: ${Number(selectedFrom.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To account number / ID</label>
            <input
              name="toAccountId"
              value={form.toAccountId}
              onChange={handleChange}
              className="input-field"
              placeholder="e.g. 10000000-0000-0000-0000-000000000002"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (USD)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={handleChange}
                className="input-field pl-7"
                placeholder="0.00"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <input
              name="description"
              value={form.description}
              onChange={handleChange}
              className="input-field"
              placeholder="Rent, groceries, etc."
            />
          </div>

          <button type="submit" className="btn-primary w-full">
            Review Transfer
          </button>
        </form>
      )}

      {/* CONFIRM */}
      {step === STEPS.CONFIRM && (
        <div className="card space-y-5">
          <h2 className="text-lg font-semibold text-gray-900">Confirm transfer</h2>
          <div className="bg-gray-50 rounded-lg p-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">From</span>
              <span className="font-medium">{selectedFrom?.accountNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">To</span>
              <span className="font-medium font-mono text-xs">{form.toAccountId}</span>
            </div>
            <div className="flex justify-between border-t pt-3 mt-1">
              <span className="text-gray-500 font-medium">Amount</span>
              <span className="text-xl font-bold text-blue-700">${amountNum.toFixed(2)}</span>
            </div>
            {form.description && (
              <div className="flex justify-between">
                <span className="text-gray-500">Note</span>
                <span>{form.description}</span>
              </div>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-700">
              This transfer is processed immediately using ACID transactions. It cannot be undone without a reversal.
            </p>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(STEPS.FORM)} className="btn-secondary flex-1" disabled={submitting}>
              Back
            </button>
            <button onClick={handleConfirm} className="btn-primary flex-1 flex items-center justify-center gap-2" disabled={submitting}>
              {submitting ? <><Loader size={16} className="animate-spin" /> Processing…</> : <>Confirm Transfer</>}
            </button>
          </div>
        </div>
      )}

      {/* SUCCESS */}
      {step === STEPS.DONE && result && (
        <div className="card text-center space-y-4">
          <div className="flex justify-center">
            <CheckCircle size={52} className="text-green-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Transfer successful!</h2>
          <div className="bg-green-50 rounded-lg p-4 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500">Reference</span>
              <span className="font-mono font-medium">{result.reference}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Amount</span>
              <span className="font-bold">${Number(result.amount).toFixed(2)} {result.currency}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <span className="badge-success">{result.status}</span>
            </div>
          </div>
          <p className="text-sm text-gray-500">A confirmation email has been sent via our notification service.</p>
          <button onClick={reset} className="btn-primary w-full">Make another transfer</button>
        </div>
      )}

      {/* ERROR */}
      {step === STEPS.ERROR && (
        <div className="card text-center space-y-4">
          <AlertCircle size={52} className="text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-gray-900">Transfer failed</h2>
          <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{result?.error}</p>
          <p className="text-sm text-gray-500">No funds have been deducted from your account.</p>
          <button onClick={reset} className="btn-primary w-full">Try again</button>
        </div>
      )}
    </div>
  )
}
