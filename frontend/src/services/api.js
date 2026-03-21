import axios from 'axios'

const api = axios.create({
  baseURL: '',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' }
})

// Attach JWT on every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('jwt')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle 401 globally
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('jwt')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ── Auth ──────────────────────────────────────────────────
export const authApi = {
  googleLogin: (credential) => api.post('/api/v1/auth/google', { credential }),
  me:          ()           => api.get('/api/v1/auth/me'),
}

// ── Accounts ──────────────────────────────────────────────
export const accountApi = {
  list:         ()           => api.get('/api/v1/accounts'),
  getById:      (id)         => api.get(`/api/v1/accounts/${id}`),
  create:       (data)       => api.post('/api/v1/accounts', data),
  uploadAvatar: (formData)   => api.post('/api/v1/accounts/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
}

// ── Transactions ──────────────────────────────────────────
export const transactionApi = {
  transfer: (data)       => api.post('/api/v1/transactions/transfer', data),
  deposit:  (data)       => api.post('/api/v1/transactions/deposit', data),
  history:  (accountId, page = 0) =>
    api.get(`/api/v1/transactions/history/${accountId}?page=${page}&size=20`),
}

export default api
