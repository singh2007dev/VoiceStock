// VoiceStock API Client
// Connects to FastAPI backend via Vite proxy or direct fallback

const API_BASE = '/api'
const FALLBACK_BASE = 'http://127.0.0.1:8000'

// Default to mock mode for credit protection. Set to false when ready for live backend STT.
export const DEFAULT_MOCK_STT = true

async function request(endpoint, options = {}) {
  let url = `${API_BASE}${endpoint}`
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  }

  try {
    let res = await fetch(url, config)
    if (!res.ok && res.status >= 500) {
      res = await fetch(`${FALLBACK_BASE}${endpoint}`, config)
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      const message = errorData.detail || errorData.message || `Request failed with status ${res.status}`
      throw new Error(message)
    }

    return await res.json()
  } catch (err) {
    if (url.startsWith('/api')) {
      try {
        const fallbackRes = await fetch(`${FALLBACK_BASE}${endpoint}`, config)
        if (!fallbackRes.ok) {
          const errorData = await fallbackRes.json().catch(() => ({}))
          throw new Error(errorData.detail || `Request failed with status ${fallbackRes.status}`)
        }
        return await fallbackRes.json()
      } catch (fallbackErr) {
        throw new Error(fallbackErr.message || 'Unable to connect to VoiceStock backend. Make sure FastAPI server is running.')
      }
    }
    throw err
  }
}

export const api = {
  getProducts: () => request('/products'),
  getLowStock: () => request('/products/low-stock'),
  addProduct: (productData) =>
    request('/products', {
      method: 'POST',
      body: JSON.stringify(productData),
    }),
  updateQuantity: (id, quantity) =>
    request(`/products/${id}/quantity`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    }),
  deleteProduct: (id) =>
    request(`/products/${id}`, {
      method: 'DELETE',
    }),

  // Voice STT integration with local mock mode for credit protection
  transcribeAudio: async (audioBlob, filename = 'recording.webm', useMock = false) => {
    // Credit Protection: If mock mode is active, simulate realistic network latency
    // and return sample response without calling Gnani API
    if (useMock) {
      await new Promise((resolve) => setTimeout(resolve, 700))
      return {
        transcript: 'Add 20 packets of Maggi',
        language: 'en',
      }
    }

    // Real backend STT call
    const formData = new FormData()
    formData.append('audio_file', audioBlob, filename)

    let url = `${API_BASE}/voice/transcribe`
    try {
      let res = await fetch(url, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok && res.status >= 500) {
        res = await fetch(`${FALLBACK_BASE}/voice/transcribe`, {
          method: 'POST',
          body: formData,
        })
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        const message = errorData.detail || errorData.message || `Voice transcription failed with status ${res.status}`
        throw new Error(message)
      }

      return await res.json()
    } catch (err) {
      if (url.startsWith('/api')) {
        try {
          const fallbackRes = await fetch(`${FALLBACK_BASE}/voice/transcribe`, {
            method: 'POST',
            body: formData,
          })
          if (!fallbackRes.ok) {
            const errorData = await fallbackRes.json().catch(() => ({}))
            throw new Error(errorData.detail || `Voice transcription failed with status ${fallbackRes.status}`)
          }
          return await fallbackRes.json()
        } catch (fallbackErr) {
          throw new Error(fallbackErr.message || 'Unable to connect to VoiceStock backend for transcription.')
        }
      }
      throw err
    }
  },
}
