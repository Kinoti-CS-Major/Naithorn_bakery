import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { adjustInventoryQty, CAKES_PER_CRATE, PRODUCTS } from '../lib/bakery'
import { useToast } from '../contexts/ToastContext'
import './DeliveryView.css'

const PRODUCT_LABELS = PRODUCTS.map((p) => p.label)

function cakesPerProductFromTrip(trip) {
  const breakdown = trip?.product_breakdown || {}
  const map = {}
  let total = 0
  for (const p of PRODUCT_LABELS) {
    const crates = parseInt(String(breakdown[p] ?? ''), 10) || 0
    const cakes = crates * CAKES_PER_CRATE
    map[p] = cakes
    total += cakes
  }
  if (total === 0 && trip?.total_crates) {
    const each = Math.floor(
      (parseInt(String(trip.total_crates), 10) || 0) * CAKES_PER_CRATE / PRODUCT_LABELS.length,
    )
    PRODUCT_LABELS.forEach((p) => {
      map[p] = each
    })
    total = each * PRODUCT_LABELS.length
  }
  return { map, total }
}

async function moveStoreToTransit(trip) {
  const { map } = cakesPerProductFromTrip(trip)
  for (const p of PRODUCT_LABELS) {
    const cakes = map[p]
    if (!cakes) continue
    await adjustInventoryQty(p, 'store', -cakes)
    await adjustInventoryQty(p, 'transit', cakes)
  }
}

// Transit -> market movement now happens at sales receipt confirmation.

const DeliveryView = () => {
  const [activeTrip, setActiveTrip] = useState(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [completedTrips, setCompletedTrips] = useState([])
  const [deliveryEmptyCratesConfirm, setDeliveryEmptyCratesConfirm] = useState('')
  const [brokenReturnCakes, setBrokenReturnCakes] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const { showToast } = useToast()

  const [formData, setFormData] = useState({
    totalCrates: '',
    productBreakdown: PRODUCT_LABELS.reduce((acc, p) => ({ ...acc, [p]: '' }), {}),
  })

  const saveActiveTrip = (trip) => {
    if (trip) localStorage.setItem('activeDeliveryTrip', JSON.stringify(trip))
    else localStorage.removeItem('activeDeliveryTrip')
    setActiveTrip(trip)
  }

  const clearActiveTrip = () => {
    localStorage.removeItem('activeDeliveryTrip')
    setActiveTrip(null)
    setElapsedTime(0)
    setDeliveryEmptyCratesConfirm('')
    setBrokenReturnCakes('')
  }

  const fetchOpenTrip = async () => {
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const { data, error: qErr } = await supabase
        .from('delivery_trips')
        .select('*')
        .in('status', ['collected', 'in_transit', 'arrived', 'receipt_confirmed', 'return_prepared'])
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(1)

      if (qErr) throw qErr
      const row = data?.[0]
      if (row) {
        saveActiveTrip(row)
        return row
      }
      const saved = localStorage.getItem('activeDeliveryTrip')
      if (saved) {
        const parsed = JSON.parse(saved)
        const { data: fresh } = await supabase
          .from('delivery_trips')
          .select('*')
          .eq('id', parsed.id)
          .limit(1)
        const live = fresh?.[0]
        if (live && live.status !== 'completed') {
          saveActiveTrip(live)
          return live
        }
      }
      clearActiveTrip()
      return null
    } catch (err) {
      console.error(err)
      return null
    }
  }

  const fetchCompletedTrips = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const { data, error: qErr } = await supabase
        .from('delivery_trips')
        .select('*')
        .eq('status', 'completed')
        .gte('departed_at', todayStart.toISOString())
        .order('departed_at', { ascending: false })

      if (qErr) throw qErr
      setCompletedTrips(data || [])
    } catch (err) {
      setError('Failed to load completed trips')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchOpenTrip()
    fetchCompletedTrips()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial sync only
  }, [])

  useEffect(() => {
    if (!activeTrip?.id || !['arrived', 'receipt_confirmed', 'return_prepared'].includes(activeTrip.status)) return
    const t = setInterval(() => {
      supabase
        .from('delivery_trips')
        .select('*')
        .eq('id', activeTrip.id)
        .limit(1)
        .then(({ data }) => {
          const row = data?.[0]
          if (row && row.status !== activeTrip.status) {
            saveActiveTrip(row)
            if (row.status === 'arrived') showToast('Marked arrived', 'success')
            if (row.status === 'receipt_confirmed') showToast('Sales confirmed receipt', 'success')
            if (row.status === 'return_prepared') showToast('Sales prepared return — confirm empty crates', 'success')
          }
        })
    }, 4000)
    return () => clearInterval(t)
  }, [activeTrip?.id, activeTrip?.status, showToast])

  useEffect(() => {
    let interval
    if (activeTrip && activeTrip.status === 'in_transit' && activeTrip.departed_at) {
      interval = setInterval(() => {
        setElapsedTime(
          Math.floor(
            (Date.now() - new Date(activeTrip.departed_at).getTime()) / 1000,
          ),
        )
      }, 1000)
    } else {
      setElapsedTime(0)
    }
    return () => clearInterval(interval)
  }, [activeTrip])

  const handleCratesCollected = async (e) => {
    e.preventDefault()

    setIsSubmitting(true)
    setError(null)
    try {
      const trip = {
        total_crates: parseInt(formData.totalCrates, 10),
        product_breakdown: { ...formData.productBreakdown },
        collected_at: new Date().toISOString(),
        collected_crates: parseInt(formData.totalCrates, 10),
        status: 'collected',
      }

      const { data, error: insErr } = await supabase
        .from('delivery_trips')
        .insert(trip)
        .select()
        .single()

      if (insErr) throw insErr

      saveActiveTrip(data)
      setFormData({
        totalCrates: '',
        productBreakdown: PRODUCT_LABELS.reduce((acc, p) => ({ ...acc, [p]: '' }), {}),
      })
      showToast('Crates collected — admin can see pickup', 'success')
    } catch (err) {
      setError('Failed to record crates collected')
      showToast('Failed to record crates collected', 'error')
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleStartDelivery = async () => {
    if (!activeTrip) return
    setIsSubmitting(true)
    setError(null)
    try {
      const departedAt = new Date().toISOString()
      const { error: uErr } = await supabase
        .from('delivery_trips')
        .update({
          departed_at: departedAt,
          status: 'in_transit',
        })
        .eq('id', activeTrip.id)

      if (uErr) throw uErr
      await moveStoreToTransit(activeTrip)
      const next = { ...activeTrip, departed_at: departedAt, status: 'in_transit' }
      saveActiveTrip(next)
      showToast('Delivery started — timer running', 'success')
    } catch (err) {
      setError('Failed to update trip')
      showToast('Failed to update trip', 'error')
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReachedMarket = async () => {
    if (!activeTrip) return
    setIsSubmitting(true)
    setError(null)
    try {
      const arrivedAt = new Date().toISOString()
      const { error: uErr } = await supabase
        .from('delivery_trips')
        .update({
          arrived_at: arrivedAt,
          status: 'arrived',
        })
        .eq('id', activeTrip.id)

      if (uErr) throw uErr
      saveActiveTrip({ ...activeTrip, arrived_at: arrivedAt, status: 'arrived' })
      showToast('Reached the marketplace — sales will be alerted', 'success')
    } catch (err) {
      setError('Failed to mark arrival')
      showToast('Failed to mark arrival', 'error')
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmReturn = async (e) => {
    e.preventDefault()
    if (!activeTrip) return
    const confirm = parseInt(deliveryEmptyCratesConfirm, 10) || 0
    const planned = parseInt(activeTrip.empty_crates_planned, 10) || 0
    const mismatch = confirm !== planned

    setIsSubmitting(true)
    setError(null)
    try {
      const { error: uErr } = await supabase
        .from('delivery_trips')
        .update({
          empty_crates_confirmed: confirm,
          return_confirmed_at: new Date().toISOString(),
          mismatch_flag: mismatch,
          status: 'completed',
        })
        .eq('id', activeTrip.id)
        .eq('status', 'return_prepared')

      if (uErr) throw uErr

      if (mismatch) showToast('Mismatch flagged — admin will see it', 'error')
      else showToast('Return confirmed — trip complete', 'success')

      clearActiveTrip()
      fetchCompletedTrips()
    } catch (err) {
      setError('Failed to confirm return')
      showToast('Failed to confirm return', 'error')
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLogBrokenReturn = async () => {
    const cakes = parseInt(brokenReturnCakes, 10) || 0
    if (cakes <= 0) return
    setIsSubmitting(true)
    try {
      const { error: iErr } = await supabase.from('broken_returns').insert({
        trip_id: activeTrip?.id ?? null,
        cakes,
        noted_by: 'delivery',
        noted_at: new Date().toISOString(),
      })
      if (iErr) throw iErr
      showToast('Broken cakes logged as returned to store', 'success')
      setBrokenReturnCakes('')
    } catch (err) {
      showToast('Failed to log broken cakes', 'error')
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatElapsedTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`
  }

  const handleProductChange = (product, value) => {
    setFormData((prev) => ({
      ...prev,
      productBreakdown: {
        ...prev.productBreakdown,
        [product]: value,
      },
    }))
  }

  if (activeTrip) {
    const st = activeTrip.status

    return (
      <div className="delivery-view page-with-nav">
        <div className="delivery-header">
          <h1 className="page-title">Delivery Trips</h1>
        </div>

        {error && <div className="error-message">{error}</div>}

        {st === 'collected' && (
          <div className="form-card">
            <p className="delivery-complete-intro">
              Crates collected: <strong>{activeTrip.collected_crates}</strong>. When you physically leave the store, start the delivery.
            </p>
            <button
              type="button"
              className="depart-btn"
              onClick={handleStartDelivery}
              disabled={isSubmitting}
              style={{ minHeight: '48px' }}
            >
              {isSubmitting ? 'Saving…' : 'Start Delivery'}
            </button>
          </div>
        )}

        {st === 'in_transit' && (
          <>
            <div className="trip-progress">
              <div className="timer-display">{formatElapsedTime(elapsedTime)}</div>
              <div className="status-badge in-transit">In Transit 🚚</div>
            </div>
            <button
              type="button"
              className="arrive-btn"
              onClick={handleReachedMarket}
              disabled={isSubmitting}
              style={{ minHeight: '48px' }}
            >
              {isSubmitting ? 'Saving…' : 'Mark arrived at market'}
            </button>
          </>
        )}

        {st === 'arrived' && (
          <div className="form-card delivery-wait-card">
            <p className="delivery-wait-title">Waiting for sales</p>
            <p className="delivery-wait-text">
              Sales must confirm receipt (crates received + broken cakes). Then they will prepare the return.
            </p>
            <p className="delivery-wait-hint">
              Trip #{activeTrip.id} · departed {format(new Date(activeTrip.departed_at), 'HH:mm')}
            </p>
          </div>
        )}

        {st === 'receipt_confirmed' && (
          <div className="form-card delivery-wait-card">
            <p className="delivery-wait-title">Receipt confirmed</p>
            <p className="delivery-wait-text">
              Sales has confirmed crates received. Waiting for sales to prepare return crates (empty + unsold staying at market).
            </p>
          </div>
        )}

        {st === 'return_prepared' && (
          <form className="arrival-form form-card" onSubmit={handleConfirmReturn}>
            <p className="delivery-complete-intro">
              Sales prepared return. Planned empty crates: <strong>{activeTrip.empty_crates_planned}</strong>. Count physical crates and confirm.
            </p>
            <div className="input-group">
              <label className="input-label">Empty crates you received</label>
              <input
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                value={deliveryEmptyCratesConfirm}
                onChange={(e) => setDeliveryEmptyCratesConfirm(e.target.value)}
                placeholder="0"
                className="number-input"
                min="0"
                style={{ minHeight: '48px' }}
              />
            </div>
            <button type="submit" className="complete-btn" disabled={isSubmitting} style={{ minHeight: '48px' }}>
              {isSubmitting && <span className="loading-spinner"></span>}
              {isSubmitting ? 'Confirming...' : 'Confirm return and complete trip'}
            </button>
          </form>
        )}

        <div className="form-card">
          <p className="delivery-complete-intro">
            Broken cakes returned to store (log anytime)
          </p>
          <div className="worker-name-row">
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              value={brokenReturnCakes}
              onChange={(e) => setBrokenReturnCakes(e.target.value)}
              placeholder="0"
              className="number-input"
              min="0"
              style={{ minHeight: '48px', flex: 1 }}
            />
            <button
              type="button"
              className="depart-btn"
              onClick={handleLogBrokenReturn}
              disabled={isSubmitting || (parseInt(brokenReturnCakes, 10) || 0) <= 0}
              style={{ minHeight: '48px' }}
            >
              Log
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="delivery-view page-with-nav">
      <div className="delivery-header">
        <h1 className="page-title">Delivery Trips</h1>
      </div>

      {error && <div className="error-message">{error}</div>}

      <form className="trip-form" onSubmit={handleCratesCollected}>
        <div className="form-card">
          <div className="input-group">
            <label className="input-label">Crates collected from store</label>
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              value={formData.totalCrates}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, totalCrates: e.target.value }))
              }
              placeholder="0"
              className="number-input"
              min="0"
              required
              style={{ minHeight: '48px' }}
            />
          </div>

          <div className="product-breakdown">
            <h3 className="breakdown-title">Product Breakdown (crates)</h3>
            {PRODUCT_LABELS.map((product) => (
              <div key={product} className="product-row">
                <span className="product-name">{product}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={formData.productBreakdown[product]}
                  onChange={(e) => handleProductChange(product, e.target.value)}
                  placeholder="0"
                  className="small-number-input"
                  min="0"
                  style={{ minHeight: '48px' }}
                />
              </div>
            ))}
          </div>

          <button type="submit" className="depart-btn" disabled={isSubmitting} style={{ minHeight: '48px' }}>
            {isSubmitting && <span className="loading-spinner"></span>}
            {isSubmitting ? 'Saving...' : 'Crates Collected'}
          </button>
        </div>
      </form>

      <div className="completed-trips">
        <h2 className="list-title">Completed Trips Today</h2>
        {isLoading ? (
          <div className="skeleton" style={{ height: '100px', marginBottom: '12px' }} />
        ) : completedTrips.length === 0 ? (
          <p className="empty-state">No completed trips yet today</p>
        ) : (
          <div className="trips-list">
            {completedTrips.map((trip) => (
              <div key={trip.id} className="trip-item">
                <div className="trip-main">
                  <span className="trip-crates">{trip.total_crates} crates</span>
                  <span className="trip-time">
                    {format(new Date(trip.departed_at), 'HH:mm')}
                  </span>
                </div>
                <div className="trip-details">
                  <span>
                    Duration:{' '}
                    {trip.arrived_at
                      ? formatElapsedTime(
                          Math.floor(
                            (new Date(trip.arrived_at) -
                              new Date(trip.departed_at)) /
                              1000,
                          ),
                        )
                      : '—'}
                  </span>
                  {trip.broken_cakes > 0 && <span>• {trip.broken_cakes} broken</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default DeliveryView
