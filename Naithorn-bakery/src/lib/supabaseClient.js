// ============================================================
// NAITHORN BAKERY — Supabase Client & API Layer
// File: supabaseClient.js
// Drop this into your React project: src/lib/supabaseClient.js
// ============================================================

import { createClient } from '@supabase/supabase-js'

// Vite uses import.meta.env instead of process.env
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Safety check to make sure variables are loading
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing Supabase Environment Variables. Check your .env file!")
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
// ============================================================
// AUTH
// ============================================================
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getCurrentWorker() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('workers')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()
  return data
}

// ============================================================
// WORKER SESSIONS
// ============================================================
export async function startSession(workerId) {
  const { data, error } = await supabase
    .from('worker_sessions')
    .insert({ worker_id: workerId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function endSession(sessionId) {
  const { error } = await supabase
    .from('worker_sessions')
    .update({ logout_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (error) throw error
}

// ============================================================
// WORKER — Production
// ============================================================
export async function logBatch({ workerId, productId, mixes, notes = null }) {
  // The BEFORE INSERT trigger recalculates cakes_out, crates_out, flour_used
  // from the products table — we send placeholder 1s (not 0s) to satisfy
  // the NOT NULL + check constraints before the trigger overwrites them.
  const { data, error } = await supabase
    .from('production_batches')
    .insert({
      worker_id:  workerId,
      product_id: productId,
      mixes,
      cakes_out:  1,
      crates_out: 1,
      flour_used: 0.1,
      notes,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getTodaysBatches(workerId) {
  // Kenya is UTC+3. We compute today's midnight in EAT so the filter
  // doesn't cut off early-morning batches when the UTC date rolls over.
  const now = new Date()
  const eatOffset = 3 * 60  // minutes
  const eatNow = new Date(now.getTime() + (eatOffset - now.getTimezoneOffset()) * 60000)
  const todayEAT = eatNow.toISOString().split('T')[0]  // YYYY-MM-DD in EAT

  const { data, error } = await supabase
    .from('production_batches')
    .select('*, products(name, cakes_per_mix, crate_size)')
    .eq('worker_id', workerId)
    .gte('logged_at', todayEAT)
    .order('logged_at', { ascending: false })
  if (error) throw error
  return data
}

// ============================================================
// DELIVERY
// ============================================================
export async function createTrip(driverId, items) {
  // items = [{ product_id, crates, crate_size }, ...]
  // We calculate cakes here so trip_items always has the right value
  const { data: trip, error: tripError } = await supabase
    .from('delivery_trips')
    .insert({ driver_id: driverId, status: 'loading' })
    .select()
    .single()
  if (tripError) throw tripError

  const tripItems = items.map(i => ({
    trip_id:    trip.id,
    product_id: i.product_id,
    crates:     i.crates,
    cakes:      i.crates * i.crate_size,   // always calculated, never guessed
  }))

  const { error: itemError } = await supabase
    .from('delivery_trip_items')
    .insert(tripItems)

  if (itemError) {
    // Roll back the trip row if items failed
    await supabase.from('delivery_trips').delete().eq('id', trip.id)
    throw itemError
  }

  return trip
}

export async function departTrip(tripId) {
  // Trigger moves inventory store → transit
  const { data, error } = await supabase
    .from('delivery_trips')
    .update({ status: 'transit' })
    .eq('id', tripId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function arriveTrip(tripId) {
  // Trigger moves inventory transit → market
  const { data, error } = await supabase
    .from('delivery_trips')
    .update({ status: 'arrived' })
    .eq('id', tripId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function completeTrip(tripId, emptyCrates, brokenCakes) {
  const { data, error } = await supabase
    .from('delivery_trips')
    .update({ status: 'complete', empty_crates_returned: emptyCrates, broken_cakes: brokenCakes })
    .eq('id', tripId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getActiveTrip(driverId) {
  const { data, error } = await supabase
    .from('delivery_trips')
    .select('*, delivery_trip_items(*, products(name, crate_size))')
    .eq('driver_id', driverId)
    .in('status', ['loading', 'transit', 'arrived'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

// ============================================================
// SALES
// ============================================================
export async function searchCustomer(nameOrPhone) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .or(`name.ilike.%${nameOrPhone}%,phone.ilike.%${nameOrPhone}%`)
    .limit(5)
  if (error) throw error
  return data
}

export async function recordSale({ salesPersonId, customerId, productId, quantity, priceType, unitPrice, paymentMethod = 'mpesa' }) {
  // total_amount is recalculated by the BEFORE INSERT trigger,
  // but we pass the real value too as a safety net in case trigger is off.
  const { data, error } = await supabase
    .from('sales')
    .insert({
      sales_person_id: salesPersonId,
      customer_id:     customerId,
      product_id:      productId,
      quantity,
      price_type:      priceType,
      unit_price:      unitPrice,
      total_amount:    quantity * unitPrice,  // trigger will overwrite, but this is valid if it doesn't
      payment_method:  paymentMethod,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getTodaysSales() {
  const { data, error } = await supabase
    .from('v_sales_today')
    .select('*')
  if (error) throw error
  return data
}

// ============================================================
// INVENTORY (used by all roles)
// ============================================================
export async function getLiveInventory() {
  const { data, error } = await supabase
    .from('v_inventory_live')
    .select('*')
  if (error) throw error
  return data
}

export async function getFlourForecast() {
  const { data, error } = await supabase
    .from('v_flour_forecast')
    .select('*')
    .single()
  if (error) throw error
  return data
}

// ============================================================
// ADMIN
// ============================================================
export async function getDashboard() {
  const { data, error } = await supabase
    .from('v_dashboard')
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function getSalesByHour() {
  const { data, error } = await supabase
    .from('v_sales_by_hour')
    .select('*')
  if (error) throw error
  return data
}

export async function getActiveWorkers() {
  const { data, error } = await supabase
    .from('v_active_workers')
    .select('*')
  if (error) throw error
  return data
}

export async function getInventoryMovements(limit = 50) {
  const { data, error } = await supabase
    .from('inventory_movements')
    .select('*, products(name)')
    .order('moved_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}

// Admin: manually adjust flour stock
export async function adjustFlour(newQuantityKg) {
  const { error } = await supabase
    .from('flour_stock')
    .update({ quantity_kg: newQuantityKg })
    .eq('id', 1)
  if (error) throw error
}

// ============================================================
// REALTIME SUBSCRIPTIONS
// Call these in useEffect; call the returned function to unsubscribe
// ============================================================

// Subscribe to inventory changes (all roles)
export function subscribeToInventory(callback) {
  const channel = supabase
    .channel('inventory-changes')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'inventory' },
      payload => callback(payload)
    )
    .subscribe()
  return () => supabase.removeChannel(channel)
}

// Subscribe to new sales (admin + sales)
export function subscribeToSales(callback) {
  const channel = supabase
    .channel('sales-changes')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'sales' },
      payload => callback(payload)
    )
    .subscribe()
  return () => supabase.removeChannel(channel)
}

// Subscribe to new production batches (admin)
export function subscribeToBatches(callback) {
  const channel = supabase
    .channel('batch-changes')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'production_batches' },
      payload => callback(payload)
    )
    .subscribe()
  return () => supabase.removeChannel(channel)
}

// Subscribe to delivery trip status (all roles)
export function subscribeToTrips(callback) {
  const channel = supabase
    .channel('trip-changes')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'delivery_trips' },
      payload => callback(payload)
    )
    .subscribe()
  return () => supabase.removeChannel(channel)
}

// Subscribe to Mpesa payments (admin + sales)
export function subscribeToMpesa(callback) {
  const channel = supabase
    .channel('mpesa-changes')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'mpesa_payments' },
      payload => callback(payload)
    )
    .subscribe()
  return () => supabase.removeChannel(channel)
}

// Subscribe to flour stock changes
export function subscribeToFlour(callback) {
  const channel = supabase
    .channel('flour-changes')
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'flour_stock' },
      payload => callback(payload)
    )
    .subscribe()
  return () => supabase.removeChannel(channel)
}

// Master admin feed — subscribes to everything at once
export function subscribeAdminFeed({ onSale, onBatch, onTrip, onInventory, onMpesa }) {
  const channel = supabase
    .channel('admin-feed')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales' },              onSale)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'production_batches' }, onBatch)
    .on('postgres_changes', { event: '*',      schema: 'public', table: 'delivery_trips' },     onTrip)
    .on('postgres_changes', { event: '*',      schema: 'public', table: 'inventory' },          onInventory)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mpesa_payments' },     onMpesa)
    .subscribe()
  return () => supabase.removeChannel(channel)
}
