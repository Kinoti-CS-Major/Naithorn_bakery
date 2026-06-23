import { useState, useEffect, useMemo } from 'react'
import { format, differenceInMinutes, subDays } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import './AdminDashboard.css'

const formatTripElapsed = (departedAt) => {
  if (!departedAt) return '—'
  const sec = Math.floor((Date.now() - new Date(departedAt).getTime()) / 1000)
  const hrs = Math.floor(sec / 3600)
  const mins = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
}

const AdminDashboard = () => {
  const [todayDate, setTodayDate] = useState('')
  const [kpis, setKpis] = useState({
    revenue: 0,
    retailRevenue: 0,
    wholesaleRevenue: 0,
    cakesSold: 0,
    cratesInStore: 0,
  })
  const [flourMetric, setFlourMetric] = useState({ sacks: 0, days: null })
  const [isAddingFlour, setIsAddingFlour] = useState(false)
  const [flourToAdd, setFlourToAdd] = useState('')
  const [salesLedger, setSalesLedger] = useState([])
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [stockBreakdown, setStockBreakdown] = useState([])
  const [shiftComparison, setShiftComparison] = useState({ day: [], night: [] })
  const [cratesData, setCratesData] = useState(null)
  const [staffSessions, setStaffSessions] = useState([])
  const [mpesaPayments, setMpesaPayments] = useState([])
  const [isAddingMpesa, setIsAddingMpesa] = useState(false)
  const [mpesaForm, setMpesaForm] = useState({ customerName: '', amount: '', transactionId: '' })
  const [isAdjustingCrates, setIsAdjustingCrates] = useState(false)
  const [crateAdjustment, setCrateAdjustment] = useState({ product: '', quantity: '', location: 'store' })
  const [activeTab, setActiveTab] = useState('overview')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [liveTrip, setLiveTrip] = useState(null)
  const [tripTick, setTripTick] = useState(0)
  const { showToast } = useToast()

  const today = format(new Date(), 'EEEE, MMMM d, yyyy')

  const topSelling = useMemo(() => {
    const m = new Map()
    salesLedger.forEach((s) => {
      const q = s.quantity || 0
      m.set(s.product, (m.get(s.product) || 0) + q)
    })
    let best = null
    let max = 0
    m.forEach((qty, name) => {
      if (qty > max) {
        max = qty
        best = name
      }
    })
    return best ? { product: best, qty: max } : { product: '—', qty: 0 }
  }, [salesLedger])

  useEffect(() => {
    if (!liveTrip) return
    const i = setInterval(() => setTripTick((t) => t + 1), 1000)
    return () => clearInterval(i)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset interval when trip id changes
  }, [liveTrip?.id])

  useEffect(() => {
    const loadData = async () => {
      setTodayDate(today)
      await Promise.all([
        fetchKPIs(),
        fetchSalesLedger(),
        fetchFlourMetric(),
        fetchLiveTrip(),
        fetchStockBreakdown(),
        fetchShiftComparison(),
        fetchCratesData(),
        fetchStaffSessions(),
        fetchMpesaPayments(),
      ])
      setIsLoading(false)
    }

    loadData()

    const salesSubscription = subscribeToSales()
    const inventorySubscription = subscribeToInventory()
    const productionSubscription = subscribeToProduction()
    const deliverySubscription = subscribeToDelivery()

    return () => {
      if (salesSubscription) supabase.removeChannel(salesSubscription)
      if (inventorySubscription) supabase.removeChannel(inventorySubscription)
      if (productionSubscription) supabase.removeChannel(productionSubscription)
      if (deliverySubscription) supabase.removeChannel(deliverySubscription)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchKPIs = async () => {
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('total, quantity, price_type')
        .gte('sold_at', todayStart.toISOString())

      if (salesError) throw salesError

      const revenue =
        salesData?.reduce((sum, sale) => sum + (sale.total || 0), 0) || 0
      const retailRevenue =
        salesData?.filter(s => s.price_type === 'retail').reduce((sum, sale) => sum + (sale.total || 0), 0) || 0
      const wholesaleRevenue =
        salesData?.filter(s => s.price_type === 'wholesale').reduce((sum, sale) => sum + (sale.total || 0), 0) || 0
      const cakesSold =
        salesData?.reduce((sum, sale) => sum + (sale.quantity || 0), 0) || 0

      const { data: inventoryData, error: inventoryError } = await supabase
        .from('inventory')
        .select('quantity, location')
        .eq('location', 'store')

      if (inventoryError) throw inventoryError

      const cratesInStore =
        inventoryData?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0

      setKpis({
        revenue,
        retailRevenue,
        wholesaleRevenue,
        cakesSold,
        cratesInStore,
      })
    } catch (err) {
      setError('Failed to load KPIs')
      console.error(err)
    }
  }

  const fetchFlourMetric = async () => {
    try {
      const { data: flourRows } = await supabase
        .from('flour_inventory')
        .select('*')
        .limit(1)
      const sacks = Number(flourRows?.[0]?.sacks_remaining ?? 0)

      const since = subDays(new Date(), 7).toISOString()
      const { data: logs } = await supabase
        .from('production_logs')
        .select('flour_sacks_used')
        .gte('submitted_at', since)

      const totalUsed = logs?.reduce((sum, log) => sum + (Number(log.flour_sacks_used) || 0), 0) || 0
      const days = totalUsed > 0 ? Math.round((sacks / totalUsed) * 7) : null

      setFlourMetric({ sacks, days })
    } catch (err) {
      console.error('Flour metric:', err)
      setFlourMetric({ sacks: 0, days: null })
    }
  }

  const handleAddFlour = async () => {
    const sacks = parseFloat(flourToAdd)
    if (!sacks || sacks <= 0) {
      showToast('Please enter a valid number', 'error')
      return
    }

    setIsAddingFlour(true)
    try {
      const { data: current } = await supabase
        .from('flour_inventory')
        .select('*')
        .limit(1)
        .single()

      const currentSacks = Number(current?.sacks_remaining || 0)
      const newSacks = currentSacks + sacks

      const { error } = await supabase
        .from('flour_inventory')
        .update({ sacks_remaining: newSacks })
        .eq('id', 1)

      if (error) throw error

      showToast(`Added ${sacks} sacks of flour`, 'success')
      setFlourToAdd('')
      setIsAddingFlour(false)
      fetchFlourMetric()
    } catch (err) {
      showToast('Failed to add flour', 'error')
      console.error(err)
      setIsAddingFlour(false)
    }
  }

  const fetchLiveTrip = async () => {
    try {
      const { data, error: qErr } = await supabase
        .from('delivery_trips')
        .select('*')
        .eq('status', 'in_transit')
        .order('departed_at', { ascending: false })
        .limit(1)

      if (qErr) throw qErr
      setLiveTrip(data?.[0] || null)
    } catch (err) {
      console.error('Live trip:', err)
      setLiveTrip(null)
    }
  }

  const fetchSalesLedger = async () => {
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const { data, error: qErr } = await supabase
        .from('sales')
        .select('*')
        .gte('sold_at', todayStart.toISOString())
        .order('sold_at', { ascending: false })

      if (qErr) throw qErr
      setSalesLedger(data || [])
    } catch (err) {
      setError('Failed to load sales ledger')
      console.error(err)
      showToast('Failed to load sales ledger', 'error')
    }
  }

  const fetchStockBreakdown = async () => {
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const { data: productionData, error: prodError } = await supabase
        .from('production_logs')
        .select('product, cakes_produced')
        .gte('submitted_at', todayStart.toISOString())

      if (prodError) throw prodError

      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('product, quantity')
        .gte('sold_at', todayStart.toISOString())

      if (salesError) throw salesError

      const { data: inventoryData, error: invError } = await supabase
        .from('inventory')
        .select('*')

      if (invError) throw invError

      const products = ['Coconut Cake', 'Cupcake', 'Heartcake', 'Sweet Cake']
      const breakdown = products.map(product => {
        const produced = productionData?.filter(p => p.product === product).reduce((sum, p) => sum + (p.cakes_produced || 0), 0) || 0
        const sold = salesData?.filter(s => s.product === product).reduce((sum, s) => sum + (s.quantity || 0), 0) || 0
        const remaining = Math.max(0, produced - sold)
        const inStore = inventoryData?.filter(i => i.product === product && i.location === 'store').reduce((sum, i) => sum + (i.quantity || 0), 0) || 0
        const atMarket = inventoryData?.filter(i => i.product === product && i.location === 'market').reduce((sum, i) => sum + (i.quantity || 0), 0) || 0
        const retailPrice = 50
        const value = remaining * retailPrice
        const earned = sold * retailPrice

        return {
          product,
          produced,
          sold,
          remaining,
          inStore,
          atMarket,
          value,
          earned
        }
      })

      setStockBreakdown(breakdown)
    } catch (err) {
      console.error('Failed to load stock breakdown:', err)
    }
  }

  const fetchShiftComparison = async () => {
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const { data: logs, error: qErr } = await supabase
        .from('production_logs')
        .select('shift, product, mixes, cakes_produced, flour_sacks_used')
        .gte('submitted_at', todayStart.toISOString())

      if (qErr) throw qErr

      const products = ['Coconut Cake', 'Cupcake', 'Heartcake', 'Sweet Cake']
      
      const dayData = products.map(product => {
        const shiftLogs = logs?.filter(l => l.shift === 'day' && l.product === product) || []
        const mixes = shiftLogs.reduce((sum, l) => sum + (l.mixes || 0), 0)
        const cakes = shiftLogs.reduce((sum, l) => sum + (l.cakes_produced || 0), 0)
        const flour = shiftLogs.reduce((sum, l) => sum + (Number(l.flour_sacks_used) || 0), 0)
        return { product, mixes, cakes, flour }
      })

      const nightData = products.map(product => {
        const shiftLogs = logs?.filter(l => l.shift === 'night' && l.product === product) || []
        const mixes = shiftLogs.reduce((sum, l) => sum + (l.mixes || 0), 0)
        const cakes = shiftLogs.reduce((sum, l) => sum + (l.cakes_produced || 0), 0)
        const flour = shiftLogs.reduce((sum, l) => sum + (Number(l.flour_sacks_used) || 0), 0)
        return { product, mixes, cakes, flour }
      })

      setShiftComparison({ day: dayData, night: nightData })
    } catch (err) {
      console.error('Failed to load shift comparison:', err)
    }
  }

  const fetchCratesData = async () => {
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayDate = todayStart.toISOString().split('T')[0]

      // Get or create today's daily stock record
      const { data: dailyStock, error: dailyError } = await supabase
        .from('daily_crate_stock')
        .select('*')
        .eq('date', todayDate)
        .limit(1)

      if (dailyError && dailyError.code !== 'PGRST116') throw dailyError

      let openingCakes = 0
      let openingEmpty = 0

      if (dailyStock && dailyStock.length > 0) {
        openingCakes = dailyStock[0].opening_cakes || 0
        openingEmpty = dailyStock[0].opening_empty_crates || 0
      } else {
        // If no record for today, try to get yesterday's closing as today's opening
        const yesterday = new Date(todayStart)
        yesterday.setDate(yesterday.getDate() - 1)
        const yesterdayDate = yesterday.toISOString().split('T')[0]

        const { data: yesterdayStock } = await supabase
          .from('daily_crate_stock')
          .select('*')
          .eq('date', yesterdayDate)
          .limit(1)

        if (yesterdayStock && yesterdayStock.length > 0) {
          openingCakes = yesterdayStock[0].closing_cakes || 0
          openingEmpty = yesterdayStock[0].closing_empty_crates || 0
        }

        // Create today's record
        await supabase.from('daily_crate_stock').insert({
          date: todayDate,
          opening_cakes: openingCakes,
          opening_empty_crates: openingEmpty,
          closing_cakes: openingCakes,
          closing_empty_crates: openingEmpty,
        })
      }

      const { data: productionData, error: prodError } = await supabase
        .from('production_logs')
        .select('crates_full, crates_partial')
        .gte('submitted_at', todayStart.toISOString())

      if (prodError) throw prodError

      const { data: inventoryData, error: invError } = await supabase
        .from('inventory')
        .select('*')

      if (invError) throw invError

      const { data: deliveryData, error: delError } = await supabase
        .from('delivery_trips')
        .select('*')
        .gte('created_at', todayStart.toISOString())

      if (delError) throw delError

      // Produced today
      const producedFull = productionData?.reduce((sum, p) => sum + (p.crates_full || 0), 0) || 0
      const producedPartial = productionData?.reduce((sum, p) => sum + (p.crates_partial || 0), 0) || 0
      const producedCakes = producedFull * 40 + producedPartial

      // Total available
      const totalAvailable = openingCakes + producedCakes

      // Delivered today
      const deliveredCrates = deliveryData?.reduce((sum, d) => sum + (d.total_crates || 0), 0) || 0
      const deliveredCakes = deliveredCrates * 40

      // Current locations
      const inStore = inventoryData?.filter(i => i.location === 'store').reduce((sum, i) => sum + (i.quantity || 0), 0) || 0
      const inTransit = inventoryData?.filter(i => i.location === 'transit').reduce((sum, i) => sum + (i.quantity || 0), 0) || 0
      const atMarket = inventoryData?.filter(i => i.location === 'market').reduce((sum, i) => sum + (i.quantity || 0), 0) || 0

      // Projection for tomorrow (assuming no more changes)
      const tomorrowOpening = inStore

      setCratesData({
        openingCakes,
        openingEmpty,
        producedCakes,
        totalAvailable,
        deliveredCakes,
        inStore,
        inTransit,
        atMarket,
        tomorrowOpening
      })
    } catch (err) {
      console.error('Failed to load crates data:', err)
    }
  }

  const fetchStaffSessions = async () => {
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const { data, error: qErr } = await supabase
        .from('staff_sessions')
        .select('*')
        .gte('login_at', todayStart.toISOString())
        .order('login_at', { ascending: false })

      if (qErr) {
        // If table doesn't exist or no data, show empty state
        setStaffSessions([])
        return
      }

      setStaffSessions(data || [])
    } catch (err) {
      console.error('Failed to load staff sessions:', err)
      setStaffSessions([])
    }
  }

  const fetchMpesaPayments = async () => {
    try {
      const { data, error: qErr } = await supabase
        .from('mpesa_payments')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(50)

      if (qErr) {
        setMpesaPayments([])
        return
      }

      setMpesaPayments(data || [])
    } catch (err) {
      console.error('Failed to load M-Pesa payments:', err)
      setMpesaPayments([])
    }
  }

  const handleAddMpesaPayment = async () => {
    const amount = parseFloat(mpesaForm.amount)
    if (!mpesaForm.customerName || !amount || amount <= 0) {
      showToast('Please fill in all required fields', 'error')
      return
    }

    setIsAddingMpesa(true)
    try {
      const { error: insErr } = await supabase.from('mpesa_payments').insert({
        customer_name: mpesaForm.customerName,
        amount,
        transaction_id: mpesaForm.transactionId || null,
        recorded_by: 'Admin',
      })

      if (insErr) throw insErr

      // Update customer balance if customer exists
      const { data: customers } = await supabase
        .from('customers')
        .select('*')
        .ilike('name', `%${mpesaForm.customerName}%`)
        .limit(1)

      if (customers && customers.length > 0) {
        const customer = customers[0]
        const newBalance = Number(customer.mpesa_balance || 0) + amount
        await supabase
          .from('customers')
          .update({ mpesa_balance: newBalance })
          .eq('id', customer.id)
      }

      showToast('M-Pesa payment recorded successfully', 'success')
      setMpesaForm({ customerName: '', amount: '', transactionId: '' })
      setIsAddingMpesa(false)
      fetchMpesaPayments()
    } catch (err) {
      showToast('Failed to record M-Pesa payment', 'error')
      console.error(err)
      setIsAddingMpesa(false)
    }
  }

  const handleAdjustCrates = async () => {
    const qty = parseInt(crateAdjustment.quantity, 10)
    if (!crateAdjustment.product || !crateAdjustment.location || qty === null || qty < 0) {
      showToast('Please fill in all fields', 'error')
      return
    }

    setIsAdjustingCrates(true)
    try {
      const { data: existing } = await supabase
        .from('inventory')
        .select('*')
        .eq('product', crateAdjustment.product)
        .eq('location', crateAdjustment.location)
        .limit(1)

      if (existing && existing.length > 0) {
        const { error: uErr } = await supabase
          .from('inventory')
          .update({ quantity: qty })
          .eq('id', existing[0].id)

        if (uErr) throw uErr
      } else {
        const { error: insErr } = await supabase.from('inventory').insert({
          product: crateAdjustment.product,
          quantity: qty,
          location: crateAdjustment.location,
        })

        if (insErr) throw insErr
      }

      showToast('Inventory adjusted successfully', 'success')
      setCrateAdjustment({ product: '', quantity: '', location: 'store' })
      setIsAdjustingCrates(false)
      fetchStockBreakdown()
    } catch (err) {
      showToast('Failed to adjust inventory', 'error')
      console.error(err)
      setIsAdjustingCrates(false)
    }
  }

  const subscribeToSales = () => {
    return supabase
      .channel('sales-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sales' },
        () => {
          fetchKPIs()
          fetchSalesLedger()
          fetchStockBreakdown()
        },
      )
      .subscribe()
  }

  const subscribeToInventory = () => {
    return supabase
      .channel('inventory-changes-admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory' },
        () => {
          fetchKPIs()
          fetchStockBreakdown()
          fetchCratesData()
        },
      )
      .subscribe()
  }

  const subscribeToProduction = () => {
    return supabase
      .channel('production-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'production_logs' },
        () => {
          fetchFlourMetric()
          fetchStockBreakdown()
          fetchShiftComparison()
        },
      )
      .subscribe()
  }

  const subscribeToDelivery = () => {
    return supabase
      .channel('delivery-live-admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_trips' },
        () => {
          fetchLiveTrip()
        },
      )
      .subscribe()
  }

  const filteredLedger = salesLedger.filter((sale) =>
    sale.customer_name?.toLowerCase().includes(ledgerSearch.toLowerCase()),
  )

  const flourLabel =
    flourMetric.days != null
      ? `${Math.round(flourMetric.sacks)} sacks · ~${flourMetric.days}d at recent usage`
      : flourMetric.sacks > 0
        ? `${Math.round(flourMetric.sacks)} sacks`
        : '—'

  return (
    <div className="admin-dashboard page-with-nav">
      <div className="dashboard-header">
        <h1 className="logo">Naithorn Bakery</h1>
        <p className="subtitle">Live Dashboard</p>
        <p className="date-display">{todayDate}</p>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="tab-nav">
        <button
          className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
          style={{ minHeight: '48px' }}
        >
          Overview
        </button>
        <button
          className={`tab-button ${activeTab === 'stock' ? 'active' : ''}`}
          onClick={() => setActiveTab('stock')}
          style={{ minHeight: '48px' }}
        >
          Stock
        </button>
        <button
          className={`tab-button ${activeTab === 'shifts' ? 'active' : ''}`}
          onClick={() => setActiveTab('shifts')}
          style={{ minHeight: '48px' }}
        >
          Shifts
        </button>
        <button
          className={`tab-button ${activeTab === 'crates' ? 'active' : ''}`}
          onClick={() => setActiveTab('crates')}
          style={{ minHeight: '48px' }}
        >
          Crates
        </button>
        <button
          className={`tab-button ${activeTab === 'staff' ? 'active' : ''}`}
          onClick={() => setActiveTab('staff')}
          style={{ minHeight: '48px' }}
        >
          Staff
        </button>
      </div>

      {activeTab === 'overview' && (
        <>
          {liveTrip && (
        <div className="live-trip-banner">
          <div>
            <p className="live-trip-label">Delivery in transit</p>
            <p className="live-trip-detail">
              Trip #{liveTrip.id} · {liveTrip.total_crates} crates · timer{' '}
              <strong>{formatTripElapsed(liveTrip.departed_at)}</strong>
            </p>
            <span className="live-trip-tick" aria-hidden>
              {tripTick}
            </span>
          </div>
        </div>
      )}

      <div className="kpi-grid kpi-grid-extended">
        {isLoading ? (
          <>
            <div className="skeleton" style={{ height: '100px' }} />
            <div className="skeleton" style={{ height: '100px' }} />
            <div className="skeleton" style={{ height: '100px' }} />
            <div className="skeleton" style={{ height: '100px' }} />
            <div className="skeleton" style={{ height: '100px' }} />
            <div className="skeleton" style={{ height: '100px' }} />
          </>
        ) : (
          <>
            <div className="kpi-card">
              <h3 className="kpi-label">{"Today's Revenue"}</h3>
              <p className="kpi-value">KES {kpis.revenue.toLocaleString()}</p>
              <p className="kpi-sub">
                Retail: KES {kpis.retailRevenue.toLocaleString()} · Wholesale: KES {kpis.wholesaleRevenue.toLocaleString()}
              </p>
            </div>
            <div className="kpi-card">
              <h3 className="kpi-label">Cakes Sold</h3>
              <p className="kpi-value">{kpis.cakesSold}</p>
            </div>
            <div className="kpi-card">
              <h3 className="kpi-label">Cakes in Store</h3>
              <p className="kpi-value">{kpis.cratesInStore}</p>
            </div>
            <div className="kpi-card">
              <h3 className="kpi-label">Flour (est. runway)</h3>
              <p className="kpi-value kpi-value-sm">{flourLabel}</p>
              {flourMetric.sacks < 10 && (
                <p className="flour-warning">⚠️ Low stock!</p>
              )}
              <button
                type="button"
                className="add-flour-btn"
                onClick={() => setIsAddingFlour(true)}
                style={{ minHeight: '36px', marginTop: '8px' }}
              >
                + Add Stock
              </button>
              {isAddingFlour && (
                <div className="add-flour-form" style={{ marginTop: '12px' }}>
                  <input
                    type="number"
                    value={flourToAdd}
                    onChange={(e) => setFlourToAdd(e.target.value)}
                    placeholder="Sacks to add"
                    style={{ minHeight: '40px', marginBottom: '8px', width: '100%' }}
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => { setIsAddingFlour(false); setFlourToAdd('') }}
                      disabled={isAddingFlour}
                      style={{ minHeight: '40px', flex: 1 }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddFlour}
                      disabled={isAddingFlour}
                      style={{ minHeight: '40px', flex: 1 }}
                    >
                      {isAddingFlour && <span className="loading-spinner"></span>}
                      {isAddingFlour ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="kpi-card">
              <h3 className="kpi-label">Top product today</h3>
              <p className="kpi-value kpi-value-sm">
                {topSelling.product} ({topSelling.qty} pcs)
              </p>
            </div>
            <div className="kpi-card kpi-card-muted">
              <h3 className="kpi-label">M-Pesa till</h3>
              <p className="kpi-value kpi-value-sm">4961870 · via Daraja → DB</p>
            </div>
          </>
        )}
      </div>

      <div className="sales-ledger-section form-card">
        <h2 className="section-title">Full Sales Ledger</h2>
        <input
          type="text"
          value={ledgerSearch}
          onChange={(e) => setLedgerSearch(e.target.value)}
          placeholder="Search by customer..."
          className="ledger-search"
          style={{ minHeight: '48px' }}
        />
        <div className="ledger-table-container">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Customer</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="6">
                    <div className="skeleton" style={{ height: '60px' }} />
                  </td>
                </tr>
              ) : filteredLedger.length === 0 ? (
                <tr>
                  <td colSpan="6" className="empty-state">No sales found</td>
                </tr>
              ) : (
                filteredLedger.map((sale) => (
                  <tr key={sale.id}>
                    <td>{format(new Date(sale.sold_at), 'HH:mm')}</td>
                    <td>{sale.customer_name}</td>
                    <td>{sale.product}</td>
                    <td>{sale.quantity}</td>
                    <td>{sale.price_type}</td>
                    <td>KES {sale.total?.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}

      {activeTab === 'stock' && (
        <div className="stock-section form-card">
          <h2 className="section-title">Stock Breakdown</h2>
          {isLoading ? (
            <div className="skeleton" style={{ height: '200px' }} />
          ) : (
            <div className="stock-table-container">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Produced</th>
                    <th>Sold</th>
                    <th>Remaining</th>
                    <th>In Store</th>
                    <th>At Market</th>
                    <th>Value</th>
                    <th>Earned</th>
                  </tr>
                </thead>
                <tbody>
                  {stockBreakdown.map((item) => (
                    <tr key={item.product}>
                      <td>{item.product}</td>
                      <td>{item.produced}</td>
                      <td>{item.sold}</td>
                      <td>{item.remaining}</td>
                      <td>{item.inStore}</td>
                      <td>{item.atMarket}</td>
                      <td>KES {item.value.toLocaleString()}</td>
                      <td>KES {item.earned.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="stock-actions" style={{ marginTop: '24px' }}>
            <h3 className="section-title" style={{ fontSize: '16px' }}>Adjust Inventory</h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <select
                value={crateAdjustment.product}
                onChange={(e) => setCrateAdjustment({ ...crateAdjustment, product: e.target.value })}
                style={{ minHeight: '48px', padding: '0 12px' }}
              >
                <option value="">Select Product</option>
                <option value="Coconut Cake">Coconut Cake</option>
                <option value="Cupcake">Cupcake</option>
                <option value="Heartcake">Heartcake</option>
                <option value="Sweet Cake">Sweet Cake</option>
              </select>
              <select
                value={crateAdjustment.location}
                onChange={(e) => setCrateAdjustment({ ...crateAdjustment, location: e.target.value })}
                style={{ minHeight: '48px', padding: '0 12px' }}
              >
                <option value="store">Store</option>
                <option value="transit">Transit</option>
                <option value="market">Market</option>
              </select>
              <input
                type="number"
                value={crateAdjustment.quantity}
                onChange={(e) => setCrateAdjustment({ ...crateAdjustment, quantity: e.target.value })}
                placeholder="Quantity"
                min="0"
                style={{ minHeight: '48px', padding: '0 12px', flex: 1 }}
              />
              <button
                type="button"
                onClick={handleAdjustCrates}
                disabled={isAdjustingCrates}
                style={{ minHeight: '48px', padding: '0 20px' }}
              >
                {isAdjustingCrates ? 'Adjusting...' : 'Adjust'}
              </button>
            </div>
          </div>

          <div className="mpesa-section" style={{ marginTop: '24px' }}>
            <h3 className="section-title" style={{ fontSize: '16px' }}>M-Pesa Payment Records</h3>
            {isAddingMpesa ? (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <input
                  type="text"
                  value={mpesaForm.customerName}
                  onChange={(e) => setMpesaForm({ ...mpesaForm, customerName: e.target.value })}
                  placeholder="Customer Name"
                  style={{ minHeight: '48px', padding: '0 12px', flex: 1 }}
                />
                <input
                  type="number"
                  value={mpesaForm.amount}
                  onChange={(e) => setMpesaForm({ ...mpesaForm, amount: e.target.value })}
                  placeholder="Amount"
                  min="0"
                  style={{ minHeight: '48px', padding: '0 12px', flex: 1 }}
                />
                <input
                  type="text"
                  value={mpesaForm.transactionId}
                  onChange={(e) => setMpesaForm({ ...mpesaForm, transactionId: e.target.value })}
                  placeholder="Transaction ID (optional)"
                  style={{ minHeight: '48px', padding: '0 12px', flex: 1 }}
                />
                <button
                  type="button"
                  onClick={handleAddMpesaPayment}
                  disabled={isAddingMpesa}
                  style={{ minHeight: '48px', padding: '0 20px' }}
                >
                  {isAddingMpesa ? 'Adding...' : 'Add'}
                </button>
                <button
                  type="button"
                  onClick={() => { setIsAddingMpesa(false); setMpesaForm({ customerName: '', amount: '', transactionId: '' }) }}
                  style={{ minHeight: '48px', padding: '0 20px' }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddingMpesa(true)}
                style={{ minHeight: '48px', padding: '0 20px' }}
              >
                + Add Payment Record
              </button>
            )}
            {mpesaPayments.length > 0 && (
              <div className="mpesa-table-container" style={{ marginTop: '16px' }}>
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Customer</th>
                      <th>Amount</th>
                      <th>Transaction ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mpesaPayments.map((payment) => (
                      <tr key={payment.id}>
                        <td>{format(new Date(payment.recorded_at), 'MMM d, HH:mm')}</td>
                        <td>{payment.customer_name}</td>
                        <td>KES {payment.amount.toLocaleString()}</td>
                        <td>{payment.transaction_id || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'shifts' && (
        <div className="shifts-section form-card">
          <h2 className="section-title">Shift Comparison</h2>
          {isLoading ? (
            <div className="skeleton" style={{ height: '200px' }} />
          ) : (
            <div className="shift-comparison-container">
              <div className="shift-column">
                <h3 className="shift-title">Day Shift (6AM-6PM)</h3>
                <table className="shift-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Mixes</th>
                      <th>Cakes</th>
                      <th>Flour (sacks)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shiftComparison.day.map((item) => (
                      <tr key={item.product}>
                        <td>{item.product}</td>
                        <td>{item.mixes}</td>
                        <td>{item.cakes}</td>
                        <td>{item.flour.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="shift-column">
                <h3 className="shift-title">Night Shift (6PM-6AM)</h3>
                <table className="shift-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Mixes</th>
                      <th>Cakes</th>
                      <th>Flour (sacks)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shiftComparison.night.map((item) => (
                      <tr key={item.product}>
                        <td>{item.product}</td>
                        <td>{item.mixes}</td>
                        <td>{item.cakes}</td>
                        <td>{item.flour.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'crates' && (
        <div className="crates-section form-card">
          <h2 className="section-title">Crates Overview</h2>
          {isLoading ? (
            <div className="skeleton" style={{ height: '300px' }} />
          ) : (
            <div className="crates-flow">
              <div className="crates-stage">
                <h4 className="stage-title">Opening Stock (from yesterday)</h4>
                <div className="stage-value">{cratesData?.openingCakes || 0} cakes</div>
                <div className="stage-sub">{cratesData?.openingEmpty || 0} empty crates</div>
              </div>
              <div className="crates-arrow">↓</div>
              <div className="crates-stage">
                <h4 className="stage-title">Produced Today</h4>
                <div className="stage-value">{cratesData?.producedCakes || 0} cakes</div>
              </div>
              <div className="crates-arrow">↓</div>
              <div className="crates-stage">
                <h4 className="stage-title">Total Available</h4>
                <div className="stage-value">{cratesData?.totalAvailable || 0} cakes</div>
              </div>
              <div className="crates-arrow">↓</div>
              <div className="crates-stage">
                <h4 className="stage-title">Delivered Today</h4>
                <div className="stage-value">{cratesData?.deliveredCakes || 0} cakes</div>
              </div>
              <div className="crates-arrow">↓</div>
              <div className="crates-stage">
                <h4 className="stage-title">Current Status</h4>
                <div className="stage-breakdown">
                  <div>In Store: {cratesData?.inStore || 0} cakes</div>
                  <div>In Transit: {cratesData?.inTransit || 0} cakes</div>
                  <div>At Market: {cratesData?.atMarket || 0} cakes</div>
                </div>
              </div>
              <div className="crates-arrow">↓</div>
              <div className="crates-stage stage-projection">
                <h4 className="stage-title">Tomorrow&apos;s Opening</h4>
                <div className="stage-value">{cratesData?.tomorrowOpening || 0} cakes</div>
                <div className="stage-sub">(if no more changes today)</div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'staff' && (
        <div className="staff-section form-card">
          <h2 className="section-title">Staff Activity Today</h2>
          {isLoading ? (
            <div className="skeleton" style={{ height: '200px' }} />
          ) : staffSessions.length === 0 ? (
            <p className="empty-state">No staff sessions recorded today. Staff tracking requires login/logout implementation.</p>
          ) : (
            <div className="staff-table-container">
              <table className="staff-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Shift</th>
                    <th>Login Time</th>
                    <th>Logout Time</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {staffSessions.map((session) => {
                    const duration = session.logout_at
                      ? differenceInMinutes(new Date(session.logout_at), new Date(session.login_at))
                      : differenceInMinutes(new Date(), new Date(session.login_at))
                    const hours = Math.floor(duration / 60)
                    const mins = duration % 60
                    const durationLabel = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
                    
                    return (
                      <tr key={session.id}>
                        <td>{session.staff_name}</td>
                        <td>{session.role}</td>
                        <td>{session.shift}</td>
                        <td>{format(new Date(session.login_at), 'HH:mm')}</td>
                        <td>{session.logout_at ? format(new Date(session.logout_at), 'HH:mm') : 'Active'}</td>
                        <td>{durationLabel}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AdminDashboard
