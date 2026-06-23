import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import {
  PRODUCTS,
  mixesToCakes,
  mixesToCrates,
  flourSacksForMixes,
  getWorkerId,
  getWorkerDisplayName,
  setWorkerDisplayName,
  adjustInventoryQty,
} from '../lib/bakery'
import { useToast } from '../contexts/ToastContext'
import './WorkerView.css'

const WorkerView = () => {
  const [selectedProduct, setSelectedProduct] = useState('Coconut Cake')
  const [mixes, setMixes] = useState('')
  const [note, setNote] = useState('')
  const [workerNameInput, setWorkerNameInput] = useState(getWorkerDisplayName)
  const [submissions, setSubmissions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const { showToast } = useToast()

  const products = PRODUCTS.map((p) => p.label)

  const today = format(new Date(), 'EEEE, MMMM d, yyyy')

  // Auto-detect shift: 6AM-6PM = day, 6PM-6AM = night
  const currentShift = (() => {
    const hour = new Date().getHours()
    return hour >= 6 && hour < 18 ? 'day' : 'night'
  })()

  const cakesProduced = mixesToCakes(mixes, selectedProduct)
  const { cratesFull, cratesPartial } = mixesToCrates(mixes, selectedProduct)

  useEffect(() => {
    fetchTodaySubmissions()
  }, [])

  const persistWorkerName = () => {
    setWorkerDisplayName(workerNameInput)
    showToast('Name saved for production logs', 'success')
  }

  const fetchTodaySubmissions = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const workerId = getWorkerId()

      const { data, error: qErr } = await supabase
        .from('production_logs')
        .select('*')
        .gte('submitted_at', todayStart.toISOString())
        .eq('worker_id', workerId)
        .order('submitted_at', { ascending: false })

      if (qErr) throw qErr
      setSubmissions(data || [])
    } catch (err) {
      console.error('Fetch error:', err)
      const msg = err.message?.includes('does not exist')
        ? 'Database table missing. Please run migrations.'
        : 'Failed to load submissions'
      setError(msg)
      showToast(msg, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const bumpStoreInventory = async (product, cakesAdded) => {
    if (!cakesAdded) return
    const { data: rows, error: selErr } = await supabase
      .from('inventory')
      .select('*')
      .eq('product', product)
      .eq('location', 'store')
      .limit(1)

    if (selErr) throw selErr
    const row = rows?.[0]

    if (row) {
      await adjustInventoryQty(product, 'store', cakesAdded)
    } else {
      const { error: iErr } = await supabase
        .from('inventory')
        .insert({ product, quantity: cakesAdded, location: 'store' })
      if (iErr) throw iErr
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!mixes || parseInt(mixes, 10) <= 0) return
    const name = getWorkerDisplayName()
    if (!name) {
      showToast('Please enter your name above (only the owner sees it)', 'error')
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      const m = parseInt(mixes, 10)
      const flourSacks = flourSacksForMixes(m, selectedProduct)

      const { error: insErr } = await supabase.from('production_logs').insert({
        product: selectedProduct,
        mixes: m,
        cakes_produced: cakesProduced,
        crates_full: cratesFull,
        crates_partial: cratesPartial,
        flour_sacks_used: flourSacks,
        worker_id: getWorkerId(),
        worker_name: name,
        shift: currentShift,
        note: note || null,
        submitted_at: new Date().toISOString(),
      })

      if (insErr) throw insErr

      await bumpStoreInventory(selectedProduct, cakesProduced)

      showToast('Batch submitted successfully!', 'success')
      setMixes('')
      setNote('')
      fetchTodaySubmissions()
    } catch (err) {
      setError('Failed to submit batch')
      showToast('Failed to submit batch', 'error')
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="worker-view page-with-nav">
      <div className="worker-header">
        <h1 className="page-title">Production Log</h1>
        <p className="date-display">{today}</p>
        <p className="shift-indicator">
          Shift: <span className={`shift-badge shift-${currentShift}`}>{currentShift.toUpperCase()}</span>
        </p>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="form-card worker-identity-card">
        <label className="input-label" htmlFor="worker-name">
          Your name (for the owner dashboard)
        </label>
        <div className="worker-name-row">
          <input
            id="worker-name"
            type="text"
            value={workerNameInput}
            onChange={(e) => setWorkerNameInput(e.target.value)}
            placeholder="e.g. Mary"
            className="worker-name-input"
            style={{ minHeight: '48px' }}
          />
          <button
            type="button"
            className="submit-btn worker-save-name"
            onClick={persistWorkerName}
            style={{ minHeight: '48px' }}
          >
            Save
          </button>
        </div>
      </div>

      <div className="product-selector">
        {products.map((product) => (
          <button
            key={product}
            type="button"
            className={`product-pill ${selectedProduct === product ? 'selected' : ''}`}
            onClick={() => setSelectedProduct(product)}
            style={{ minHeight: '48px' }}
          >
            {product}
          </button>
        ))}
      </div>

      <form className="production-form form-card" onSubmit={handleSubmit}>
        <div className="input-group">
          <label className="input-label">Number of mixes made</label>
          <input
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            value={mixes}
            onChange={(e) => setMixes(e.target.value)}
            placeholder="0"
            className="mixes-input"
            min="0"
            style={{ minHeight: '48px' }}
          />
        </div>

        {mixes && parseInt(mixes, 10) > 0 && (
          <div className="results-card">
            <div className="result-row">
              <span className="result-label">Cakes produced:</span>
              <span className="result-value">{cakesProduced}</span>
            </div>
            <div className="result-row">
              <span className="result-label">Crates:</span>
              <span className="result-value">
                {cratesFull} full, {cratesPartial} partial
              </span>
            </div>
          </div>
        )}

        <div className="input-group">
          <label className="input-label">Note (optional)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Batch 1, Morning run"
            className="note-input"
            style={{ minHeight: '48px' }}
          />
        </div>

        <button
          type="submit"
          className="submit-btn"
          disabled={!mixes || parseInt(mixes, 10) <= 0 || isSubmitting}
          style={{ minHeight: '48px' }}
        >
          {isSubmitting && <span className="loading-spinner"></span>}
          {isSubmitting ? 'Submitting...' : 'Submit Batch'}
        </button>
      </form>

      <div className="submissions-list">
        <h2 className="list-title">{"Today's Submissions"}</h2>
        {isLoading ? (
          <div className="skeleton" style={{ height: '100px', marginBottom: '12px' }} />
        ) : submissions.length === 0 ? (
          <p className="empty-state">No submissions yet today</p>
        ) : (
          <div className="submissions">
            {submissions.map((sub) => (
              <div key={sub.id} className="submission-item">
                <div className="submission-main">
                  <span className="submission-product">{sub.product}</span>
                  <span className="submission-time">
                    {format(new Date(sub.submitted_at), 'HH:mm')}
                  </span>
                </div>
                <div className="submission-details">
                  <span>{sub.mixes} mixes</span>
                  <span>•</span>
                  <span>{sub.cakes_produced} cakes</span>
                  {sub.worker_name && (
                    <>
                      <span>•</span>
                      <span>{sub.worker_name}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default WorkerView
