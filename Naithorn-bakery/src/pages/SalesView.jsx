import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import {
  adjustInventoryQty,
  RETAIL_PRICE,
  WHOLESALE_PRICE,
  PRODUCTS,
  CAKES_PER_CRATE,
} from '../lib/bakery'
import { useToast } from '../contexts/ToastContext'
import './SalesView.css'

const PRODUCT_LABELS = PRODUCTS.map((p) => p.label)

const SalesView = () => {
  const [currentTime, setCurrentTime] = useState('')
  const [inventory, setInventory] = useState({})
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [cart, setCart] = useState([])
  const [selectedProduct, setSelectedProduct] = useState('Coconut Cake')
  const [quantity, setQuantity] = useState('')
  const [priceType, setPriceType] = useState('retail')
  const [todaySales, setTodaySales] = useState([])
  const [arrivedTrips, setArrivedTrips] = useState([])
  const [selectedTrip, setSelectedTrip] = useState(null)
  const [receivedCrates, setReceivedCrates] = useState('')
  const [brokenOnReceive, setBrokenOnReceive] = useState('')
  const [emptyCratesPlanned, setEmptyCratesPlanned] = useState('')
  const [unsoldCratesPlanned, setUnsoldCratesPlanned] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const { showToast } = useToast()

  const [exReturnProduct, setExReturnProduct] = useState('Coconut Cake')
  const [exReturnQty, setExReturnQty] = useState('')
  const [exIssueProduct, setExIssueProduct] = useState('Coconut Cake')
  const [exIssueQty, setExIssueQty] = useState('')
  const [stockBreakdown, setStockBreakdown] = useState([])

  const prices = { retail: RETAIL_PRICE, wholesale: WHOLESALE_PRICE }

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

        return {
          product,
          produced,
          sold,
          remaining,
          inStore,
          atMarket,
          value
        }
      })

      setStockBreakdown(breakdown)
    } catch (err) {
      console.error('Failed to load stock breakdown:', err)
    }
  }

  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(format(new Date(), 'HH:mm'))
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  const fetchInventory = useCallback(async () => {
    try {
      const { data, error: qErr } = await supabase
        .from('inventory')
        .select('*')
        .eq('location', 'market')

      if (qErr) throw qErr
      const inventoryMap = {}
      ;(data || []).forEach((item) => {
        inventoryMap[item.product] = item
      })
      setInventory(inventoryMap)
    } catch (err) {
      setError('Failed to load inventory')
      console.error(err)
    }
  }, [])

  const fetchTodaySales = useCallback(async () => {
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const { data, error: qErr } = await supabase
        .from('sales')
        .select('*')
        .gte('sold_at', todayStart.toISOString())
        .order('sold_at', { ascending: false })

      if (qErr) throw qErr
      setTodaySales(data || [])
    } catch (err) {
      setError('Failed to load sales')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const fetchPendingTrips = useCallback(async () => {
    try {
      const { data, error: qErr } = await supabase
        .from('delivery_trips')
        .select('*')
        .in('status', ['arrived', 'receipt_confirmed'])
        .order('departed_at', { ascending: false })

      if (qErr) throw qErr
      setArrivedTrips((data || []).filter((t) => t.status === 'arrived'))
    } catch (err) {
      console.error('Failed to load pending trips:', err)
    }
  }, [])
  useEffect(() => {
    if (arrivedTrips.length > 0) {
      showToast('Delivery arrived — confirm crates received', 'success')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivedTrips.length])

  const moveTransitToMarketByCrates = async (trip, cratesReceived, brokenCakes) => {
    const breakdown = trip?.product_breakdown || {}
    const totalPlanned = parseInt(trip.total_crates, 10) || 0
    const received = Math.min(cratesReceived, totalPlanned)
    const broken = Math.max(0, parseInt(brokenCakes, 10) || 0)

    // Allocate received crates by the planned breakdown ratio; if no breakdown, split evenly.
    const plannedByProduct = {}
    let sumPlanned = 0
    PRODUCT_LABELS.forEach((p) => {
      const c = parseInt(String(breakdown[p] ?? ''), 10) || 0
      plannedByProduct[p] = c
      sumPlanned += c
    })

    const alloc = {}
    if (sumPlanned > 0) {
      PRODUCT_LABELS.forEach((p) => {
        alloc[p] = Math.round((received * plannedByProduct[p]) / sumPlanned)
      })
    } else {
      const each = Math.floor(received / PRODUCT_LABELS.length)
      PRODUCT_LABELS.forEach((p) => {
        alloc[p] = each
      })
    }

    // Fix rounding drift
    let allocSum = Object.values(alloc).reduce((a, b) => a + b, 0)
    while (allocSum < received) {
      alloc[PRODUCT_LABELS[allocSum % PRODUCT_LABELS.length]] += 1
      allocSum += 1
    }
    while (allocSum > received) {
      const k = PRODUCT_LABELS[allocSum % PRODUCT_LABELS.length]
      if (alloc[k] > 0) {
        alloc[k] -= 1
        allocSum -= 1
      } else break
    }

    const totalCakes = received * CAKES_PER_CRATE
    for (const p of PRODUCT_LABELS) {
      const crates = alloc[p] || 0
      const cakes = crates * CAKES_PER_CRATE
      const brokenShare = totalCakes > 0 ? Math.round((broken * cakes) / totalCakes) : 0
      const toMarket = Math.max(0, cakes - brokenShare)
      await adjustInventoryQty(p, 'transit', -cakes)
      await adjustInventoryQty(p, 'market', toMarket)
    }
  }

  const handleSalesConfirmReceipt = async (e) => {
    e.preventDefault()
    if (!selectedTrip) return
    const crates = parseInt(receivedCrates, 10) || 0
    if (crates <= 0) return

    setIsSubmitting(true)
    try {
      const broken = parseInt(brokenOnReceive, 10) || 0
      await moveTransitToMarketByCrates(selectedTrip, crates, broken)

      const { error: uErr } = await supabase
        .from('delivery_trips')
        .update({
          received_crates: crates,
          received_at: new Date().toISOString(),
          receipt_confirmed_at: new Date().toISOString(),
          broken_cakes: broken,
          status: 'receipt_confirmed',
        })
        .eq('id', selectedTrip.id)
        .eq('status', 'arrived')

      if (uErr) throw uErr
      showToast('Receipt confirmed — stock updated at market', 'success')
      setSelectedTrip(null)
      setReceivedCrates('')
      setBrokenOnReceive('')
      fetchPendingTrips()
      fetchInventory()
    } catch (err) {
      showToast('Could not confirm receipt', 'error')
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handlePrepareReturn = async (e) => {
    e.preventDefault()
    if (!selectedTrip) return
    const empty = parseInt(emptyCratesPlanned, 10) || 0
    const unsold = parseInt(unsoldCratesPlanned, 10) || 0
    setIsSubmitting(true)
    try {
      const { error: uErr } = await supabase
        .from('delivery_trips')
        .update({
          empty_crates_planned: empty,
          unsold_crates_planned: unsold,
          return_prepared_at: new Date().toISOString(),
          status: 'return_prepared',
        })
        .eq('id', selectedTrip.id)
        .eq('status', 'receipt_confirmed')
      if (uErr) throw uErr
      showToast('Return prepared — delivery will confirm', 'success')
      setSelectedTrip(null)
      setEmptyCratesPlanned('')
      setUnsoldCratesPlanned('')
      fetchPendingTrips()
    } catch (err) {
      showToast('Could not prepare return', 'error')
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    fetchInventory()
    fetchTodaySales()
    fetchPendingTrips()
    fetchStockBreakdown()

    const invCh = supabase
      .channel('sales-inventory')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory' },
        () => {
          fetchInventory()
          fetchStockBreakdown()
        },
      )
      .subscribe()

    const salesCh = supabase
      .channel('sales-today')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sales' },
        () => {
          fetchTodaySales()
        },
      )
      .subscribe()

    const tripCh = supabase
      .channel('sales-delivery')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_trips' },
        () => {
          fetchPendingTrips()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(invCh)
      supabase.removeChannel(salesCh)
      supabase.removeChannel(tripCh)
    }
  }, [fetchInventory, fetchTodaySales, fetchPendingTrips])

  useEffect(() => {
    if (customerSearch.length > 0) {
      searchCustomers(customerSearch)
    } else {
      setCustomerResults([])
      setShowCustomerDropdown(false)
    }
  }, [customerSearch])

  const searchCustomers = async (query) => {
    try {
      const { data, error: qErr } = await supabase
        .from('customers')
        .select('*')
        .ilike('name', `%${query}%`)
        .limit(10)

      if (qErr) throw qErr
      setCustomerResults(data || [])
      setShowCustomerDropdown(true)
    } catch (err) {
      console.error('Failed to search customers:', err)
    }
  }

  const handleCustomerSelect = (customer) => {
    setSelectedCustomer(customer)
    setCustomerSearch(customer.name)
    setShowCustomerDropdown(false)
  }

  const calculateTotal = () => {
    if (!quantity || parseInt(quantity, 10) <= 0) return 0
    return parseInt(quantity, 10) * prices[priceType]
  }

  const calculateCartTotal = () => {
    return cart.reduce((sum, item) => sum + (item.quantity * prices[item.priceType]), 0)
  }

  const addToCart = () => {
    if (!quantity || parseInt(quantity, 10) <= 0) {
      showToast('Please enter a valid quantity', 'error')
      return
    }

    const marketRow = inventory[selectedProduct]
    const stock = marketRow?.quantity ?? 0
    const qty = parseInt(quantity, 10)

    if (stock < qty) {
      showToast('Not enough stock at the market for this product', 'error')
      return
    }

    const existingIndex = cart.findIndex(
      item => item.product === selectedProduct && item.priceType === priceType
    )

    if (existingIndex >= 0) {
      const newCart = [...cart]
      newCart[existingIndex].quantity += qty
      setCart(newCart)
    } else {
      setCart([...cart, { product: selectedProduct, quantity: qty, priceType }])
    }

    setQuantity('')
    showToast('Added to cart', 'success')
  }

  const removeFromCart = (index) => {
    const newCart = [...cart]
    newCart.splice(index, 1)
    setCart(newCart)
  }

  const clearCart = () => {
    setCart([])
  }

  const refreshCustomerRow = async (id) => {
    const { data: rows } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .limit(1)
    const row = rows?.[0]
    if (row) setSelectedCustomer(row)
  }

  const handleRecordSale = async (e) => {
    e.preventDefault()

    if (!selectedCustomer || cart.length === 0) return

    const cartTotal = calculateCartTotal()
    const bal = Number(selectedCustomer.mpesa_balance) || 0
    if (bal < cartTotal) {
      showToast(`M-Pesa balance is KES ${bal.toLocaleString()}, need KES ${cartTotal.toLocaleString()}`, 'error')
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      // Check stock for all cart items
      for (const item of cart) {
        const marketRow = inventory[item.product]
        const stock = marketRow?.quantity ?? 0
        if (stock < item.quantity) {
          showToast(`Not enough stock for ${item.product}`, 'error')
          setIsSubmitting(false)
          return
        }
      }

      // Insert all sales
      for (const item of cart) {
        const itemTotal = item.quantity * prices[item.priceType]
        const { error: insErr } = await supabase.from('sales').insert({
          customer_name: selectedCustomer.name,
          product: item.product,
          quantity: item.quantity,
          price_type: item.priceType,
          unit_price: prices[item.priceType],
          total: itemTotal,
          sold_at: new Date().toISOString(),
        })

        if (insErr) throw insErr

        await adjustInventoryQty(item.product, 'market', -item.quantity)
      }

      const newBal = Math.max(0, bal - cartTotal)
      const { error: cErr } = await supabase
        .from('customers')
        .update({ mpesa_balance: newBal })
        .eq('id', selectedCustomer.id)

      if (cErr) throw cErr

      showToast(`Sale recorded successfully! KES ${cartTotal.toLocaleString()}`, 'success')
      setCart([])
      setQuantity('')
      fetchTodaySales()
      fetchInventory()
      await refreshCustomerRow(selectedCustomer.id)
    } catch (err) {
      setError('Failed to record sale')
      showToast('Failed to record sale', 'error')
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  // legacy handler removed (replaced by counted receipt + broken cakes + return plan flow)

  const handleExchange = async (e) => {
    e.preventDefault()
    if (!selectedCustomer) {
      showToast('Select a customer first', 'error')
      return
    }
    const rq = parseInt(exReturnQty, 10) || 0
    const iq = parseInt(exIssueQty, 10) || 0
    if (rq <= 0 || iq <= 0) {
      showToast('Enter quantities for both sides of the exchange', 'error')
      return
    }

    const issueStock = inventory[exIssueProduct]?.quantity ?? 0
    if (issueStock < iq) {
      showToast('Not enough stock to fulfil the exchange', 'error')
      return
    }

    setIsSubmitting(true)
    try {
      const { error: xErr } = await supabase.from('customer_exchanges').insert({
        customer_name: selectedCustomer.name,
        return_product: exReturnProduct,
        return_qty: rq,
        issue_product: exIssueProduct,
        issue_qty: iq,
        created_at: new Date().toISOString(),
      })
      if (xErr) throw xErr

      await adjustInventoryQty(exReturnProduct, 'market', rq)
      await adjustInventoryQty(exIssueProduct, 'market', -iq)

      showToast('Exchange recorded', 'success')
      setExReturnQty('')
      setExIssueQty('')
      fetchInventory()
    } catch (err) {
      showToast('Exchange failed', 'error')
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const stockRetailValue = PRODUCTS.reduce((sum, p) => {
    const q = inventory[p.label]?.quantity || 0
    return sum + q * RETAIL_PRICE
  }, 0)

  return (
    <div className="sales-view page-with-nav">
      <div className="sales-header">
        <h1 className="page-title">Sales</h1>
        <div className="clock">{currentTime}</div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {arrivedTrips.length > 0 && (
        <div className="form-card pending-trips-card">
          <h2 className="list-title">Delivery arrived</h2>
          <p className="pending-trips-hint">
            Select the trip, count physical crates, note any broken cakes, and confirm receipt.
          </p>
          <ul className="pending-trips-list">
            {arrivedTrips.map((trip) => (
              <li key={trip.id} className="pending-trip-row">
                <span>
                  Trip #{trip.id} · collected {trip.collected_crates ?? trip.total_crates} crates · departed{' '}
                  {trip.departed_at ? format(new Date(trip.departed_at), 'HH:mm') : '—'}
                </span>
                <button
                  type="button"
                  className="confirm-trip-btn"
                  onClick={() => setSelectedTrip(trip)}
                >
                  Confirm receipt
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedTrip && selectedTrip.status === 'arrived' && (
        <form className="sale-form form-card" onSubmit={handleSalesConfirmReceipt}>
          <h2 className="list-title">Confirm receipt — Trip #{selectedTrip.id}</h2>
          <div className="input-group">
            <label className="input-label">Crates received</label>
            <input
              type="number"
              className="quantity-input"
              value={receivedCrates}
              onChange={(e) => setReceivedCrates(e.target.value)}
              placeholder="0"
              min="0"
              style={{ minHeight: '48px' }}
            />
          </div>
          <div className="input-group">
            <label className="input-label">Broken cakes noted</label>
            <input
              type="number"
              className="quantity-input"
              value={brokenOnReceive}
              onChange={(e) => setBrokenOnReceive(e.target.value)}
              placeholder="0"
              min="0"
              style={{ minHeight: '48px' }}
            />
          </div>
          <button type="submit" className="record-sale-btn" disabled={isSubmitting} style={{ minHeight: '48px' }}>
            {isSubmitting ? 'Saving…' : 'Confirm receipt'}
          </button>
        </form>
      )}

      {selectedTrip && selectedTrip.status === 'receipt_confirmed' && (
        <form className="sale-form form-card" onSubmit={handlePrepareReturn}>
          <h2 className="list-title">Prepare return — Trip #{selectedTrip.id}</h2>
          <p className="exchange-hint">
            Enter how many empty crates are going back, and how many crates still have unsold cakes (stay at market overnight).
          </p>
          <div className="input-group">
            <label className="input-label">Empty crates to return</label>
            <input
              type="number"
              className="quantity-input"
              value={emptyCratesPlanned}
              onChange={(e) => setEmptyCratesPlanned(e.target.value)}
              placeholder="0"
              min="0"
              style={{ minHeight: '48px' }}
            />
          </div>
          <div className="input-group">
            <label className="input-label">Crates staying at market (unsold)</label>
            <input
              type="number"
              className="quantity-input"
              value={unsoldCratesPlanned}
              onChange={(e) => setUnsoldCratesPlanned(e.target.value)}
              placeholder="0"
              min="0"
              style={{ minHeight: '48px' }}
            />
          </div>
          <button type="submit" className="record-sale-btn" disabled={isSubmitting} style={{ minHeight: '48px' }}>
            {isSubmitting ? 'Saving…' : 'Save return plan'}
          </button>
        </form>
      )}

      <div className="stock-panel-block">
        <p className="stock-panel-meta">
          Live stock at market · retail value approx.{' '}
          <strong>KES {stockRetailValue.toLocaleString()}</strong>
        </p>
        <div className="stock-panel">
          {isLoading ? (
            <div className="skeleton" style={{ height: '120px', width: '100%' }} />
          ) : (
            <div className="stock-breakdown-table">
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* pendingTrips block removed in favor of the arrival + confirm + return plan flow */}

      <div className="customer-search-container">
        <input
          type="text"
          value={customerSearch}
          onChange={(e) => setCustomerSearch(e.target.value)}
          placeholder="Search customer..."
          className="customer-search"
          style={{ minHeight: '48px' }}
        />

        {showCustomerDropdown && customerResults.length > 0 && (
          <div className="customer-dropdown">
            {customerResults.map((customer) => (
              <div
                key={customer.id}
                className="customer-option"
                onClick={() => handleCustomerSelect(customer)}
                style={{ minHeight: '48px', display: 'flex', alignItems: 'center' }}
              >
                <span className="customer-name">{customer.name}</span>
              </div>
            ))}
          </div>
        )}

        {selectedCustomer && (
          <div className="customer-badge">
            <span className="badge-label">M-Pesa balance (till 4961870):</span>
            <span className="badge-value">
              KES {Number(selectedCustomer.mpesa_balance || 0).toLocaleString()}
            </span>
          </div>
        )}
        <p className="mpesa-note">
          Balances update when payments hit your Supabase data (e.g. Safaricom Daraja callback writing to{' '}
          <code>customers.mpesa_balance</code>).
        </p>
      </div>

      {selectedCustomer && (
        <form className="sale-form form-card" onSubmit={handleRecordSale}>
          <div className="product-selector">
            {PRODUCT_LABELS.map((product) => (
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

          <div className="input-group">
            <label className="input-label">Quantity</label>
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              className="quantity-input"
              min="0"
              required
              style={{ minHeight: '48px' }}
            />
          </div>

          <div className="price-toggle">
            <button
              type="button"
              className={`price-btn ${priceType === 'retail' ? 'selected' : ''}`}
              onClick={() => setPriceType('retail')}
              style={{ minHeight: '48px' }}
            >
              Retail — KES {RETAIL_PRICE}
            </button>
            <button
              type="button"
              className={`price-btn ${priceType === 'wholesale' ? 'selected' : ''}`}
              onClick={() => setPriceType('wholesale')}
              style={{ minHeight: '48px' }}
            >
              Wholesale — KES {WHOLESALE_PRICE}
            </button>
          </div>

          <div className="total-display">
            Item Total: KES {calculateTotal().toLocaleString()}
          </div>

          <button
            type="button"
            className="add-to-cart-btn"
            onClick={addToCart}
            disabled={!quantity || parseInt(quantity, 10) <= 0}
            style={{ minHeight: '48px' }}
          >
            Add to Cart
          </button>

          {cart.length > 0 && (
            <div className="cart-section">
              <h3 className="cart-title">Cart</h3>
              <div className="cart-items">
                {cart.map((item, index) => (
                  <div key={index} className="cart-item">
                    <span>{item.product} ({item.priceType}) x {item.quantity}</span>
                    <span>KES {(item.quantity * prices[item.priceType]).toLocaleString()}</span>
                    <button
                      type="button"
                      onClick={() => removeFromCart(index)}
                      className="remove-cart-item"
                      style={{ minHeight: '32px', padding: '4px 8px' }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="cart-total">
                <strong>Cart Total: KES {calculateCartTotal().toLocaleString()}</strong>
              </div>
              <button
                type="button"
                onClick={clearCart}
                className="clear-cart-btn"
                style={{ minHeight: '36px' }}
              >
                Clear Cart
              </button>
            </div>
          )}

          <button
            type="submit"
            className="record-sale-btn"
            disabled={cart.length === 0 || isSubmitting}
            style={{ minHeight: '48px' }}
          >
            {isSubmitting && <span className="loading-spinner"></span>}
            {isSubmitting ? 'Recording...' : 'Record Sale'}
          </button>
        </form>
      )}

      {selectedCustomer && (
        <form className="sale-form form-card exchange-card" onSubmit={handleExchange}>
          <h2 className="list-title">Customer exchange</h2>
          <p className="exchange-hint">
            Customer returns cakes to stock and receives a different product from market stock.
          </p>
          <div className="exchange-grid">
            <div>
              <label className="input-label">Return to stock</label>
              <select
                className="customer-search"
                value={exReturnProduct}
                onChange={(e) => setExReturnProduct(e.target.value)}
              >
                {PRODUCT_LABELS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                className="quantity-input"
                placeholder="Qty"
                value={exReturnQty}
                onChange={(e) => setExReturnQty(e.target.value)}
                style={{ marginTop: 8, minHeight: '48px' }}
              />
            </div>
            <div>
              <label className="input-label">Issue from stock</label>
              <select
                className="customer-search"
                value={exIssueProduct}
                onChange={(e) => setExIssueProduct(e.target.value)}
              >
                {PRODUCT_LABELS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                className="quantity-input"
                placeholder="Qty"
                value={exIssueQty}
                onChange={(e) => setExIssueQty(e.target.value)}
                style={{ marginTop: 8, minHeight: '48px' }}
              />
            </div>
          </div>
          <button type="submit" className="record-sale-btn" disabled={isSubmitting} style={{ minHeight: '48px' }}>
            Record exchange
          </button>
        </form>
      )}

      <div className="sales-log">
        <h2 className="list-title">{"Today's Sales"}</h2>
        {isLoading ? (
          <div className="skeleton" style={{ height: '100px', marginBottom: '12px' }} />
        ) : todaySales.length === 0 ? (
          <p className="empty-state">No sales yet today</p>
        ) : (
          <div className="sales-list">
            {todaySales.map((sale) => (
              <div key={sale.id} className="sale-item">
                <div className="sale-main">
                  <span className="sale-customer">{sale.customer_name}</span>
                  <span className="sale-time">
                    {format(new Date(sale.sold_at), 'HH:mm')}
                  </span>
                </div>
                <div className="sale-details">
                  <span>{sale.product}</span>
                  <span>•</span>
                  <span>{sale.quantity} pcs</span>
                  <span>•</span>
                  <span>KES {sale.total.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default SalesView
