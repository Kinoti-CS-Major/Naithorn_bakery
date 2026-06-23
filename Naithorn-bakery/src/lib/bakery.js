import { supabase } from './supabase'

// ========= Business rules (tune here) =========
export const CAKES_PER_CRATE = 40
export const MIXES_PER_SACK = 6
export const RETAIL_PRICE = 50
export const WHOLESALE_PRICE = 43

// ========= App auth (client-side) =========
const USER_ROLE_KEY = 'naithorn_user_role'
const USER_NAME_KEY = 'naithorn_user_name'
const USER_ID_KEY = 'naithorn_user_id'

export const PRODUCTS = [
  {
    id: 'coconut',
    label: 'Coconut Cake',
    emoji: '🥥',
    cakesPerMix: 40, // 3 mixes -> 3 crates of 40 => 40 cakes per mix
    cratesPerMix: 1, // 3 mixes -> 3 crates => 1 crate per mix
    deductFlour: false, // formula pending
  },
  {
    id: 'cupcake',
    label: 'Cupcake',
    emoji: '🧁',
    cakesPerMix: 40,
    cratesPerMix: 1,
    deductFlour: true, // 1 sack = 6 mixes
  },
  {
    id: 'heartcake',
    label: 'Heartcake',
    emoji: '🫀',
    cakesPerMix: 120, // 1 mix -> 1 basin -> 3 crates of 40 => 120 cakes per mix
    cratesPerMix: 3, // 3 crates per mix
    deductFlour: true,
  },
  {
    id: 'sweet',
    label: 'Sweet Cake',
    emoji: '🍰',
    cakesPerMix: 40,
    cratesPerMix: 1,
    deductFlour: true,
  },
]

export function getProduct(label) {
  return PRODUCTS.find((p) => p.label === label) || PRODUCTS[0]
}

export function mixesToCakes(mixes, productLabel) {
  const n = parseInt(String(mixes), 10)
  if (!n || n < 0) return 0
  const p = productLabel ? getProduct(productLabel) : PRODUCTS[0]
  return n * p.cakesPerMix
}

export function mixesToCrates(mixes, productLabel) {
  const n = parseInt(String(mixes), 10)
  if (!n || n < 0) return { cratesFull: 0, cratesPartial: 0 }
  const p = productLabel ? getProduct(productLabel) : PRODUCTS[0]
  return { cratesFull: n * p.cratesPerMix, cratesPartial: 0 }
}

export function flourSacksForMixes(mixes, productLabel) {
  const n = parseInt(String(mixes), 10)
  if (!n || n < 0) return 0
  const p = productLabel ? getProduct(productLabel) : PRODUCTS[0]
  if (!p.deductFlour) return 0
  return Math.round((n / MIXES_PER_SACK) * 100) / 100
}

// ========= Users (hardcoded for MVP) =========
// NOTE: This is only a UI gate. Real security must be enforced in Supabase with Auth + RLS.
export const USERS = [
  {
    id: 'worker_day',
    role: 'worker',
    label: 'Worker 1 (Day Shift)',
    name: 'Mary Njeri',
    pin: '2048',
    icon: '🏭',
  },
  {
    id: 'worker_night',
    role: 'worker',
    label: 'Worker 2 (Night Shift)',
    name: 'Asha Otieno',
    pin: '7319',
    icon: '🏭',
  },
  {
    id: 'delivery',
    role: 'delivery',
    label: 'Delivery Guy',
    name: 'Kevin Mwangi',
    pin: '4621',
    icon: '🚚',
  },
  {
    id: 'sales',
    role: 'sales',
    label: 'Sales Guy',
    name: 'Brian Kiptoo',
    pin: '5893',
    icon: '🛒',
  },
  {
    id: 'admin',
    role: 'admin',
    label: 'Admin / Owner',
    name: 'Mr. Naithorn',
    pin: '9174',
    icon: '📊',
  },
]

export function listUsers() {
  return USERS
}

export function getCurrentUser() {
  const role = localStorage.getItem(USER_ROLE_KEY) || localStorage.getItem('userRole') || ''
  const name = localStorage.getItem(USER_NAME_KEY) || ''
  const id = localStorage.getItem(USER_ID_KEY) || ''
  return { id, role, name }
}

export function signOut() {
  const id = localStorage.getItem(USER_ID_KEY)
  const role = localStorage.getItem(USER_ROLE_KEY)
  
  // Record logout time in staff_sessions
  if (id && ['worker', 'delivery', 'sales'].includes(role || '')) {
    supabase
      .from('staff_sessions')
      .update({ logout_at: new Date().toISOString() })
      .eq('staff_id', id)
      .is('logout_at', null)
      .then(() => {
        localStorage.removeItem(USER_ROLE_KEY)
        localStorage.removeItem(USER_NAME_KEY)
        localStorage.removeItem(USER_ID_KEY)
        localStorage.removeItem('userRole')
      })
      .catch(err => {
        console.error('Failed to record logout:', err)
        // Still clear local storage even if DB update fails
        localStorage.removeItem(USER_ROLE_KEY)
        localStorage.removeItem(USER_NAME_KEY)
        localStorage.removeItem(USER_ID_KEY)
        localStorage.removeItem('userRole')
      })
  } else {
    localStorage.removeItem(USER_ROLE_KEY)
    localStorage.removeItem(USER_NAME_KEY)
    localStorage.removeItem(USER_ID_KEY)
    localStorage.removeItem('userRole')
  }
}

export function signInWithPin(userId, pin) {
  const u = USERS.find((x) => x.id === userId)
  if (!u) return { ok: false, error: 'Unknown user' }
  if (String(pin) !== u.pin) return { ok: false, error: 'Wrong PIN' }

  localStorage.setItem(USER_ROLE_KEY, u.role)
  localStorage.setItem(USER_NAME_KEY, u.name)
  localStorage.setItem(USER_ID_KEY, u.id)
  localStorage.setItem('userRole', u.role) // backwards compatibility

  // If they are a worker, also set production identity automatically.
  if (u.role === 'worker') {
    localStorage.setItem(WORKER_NAME_KEY, u.name)
    localStorage.setItem(WORKER_ID_KEY, u.id)
  }

  return { ok: true, user: u }
}

// ========= Worker identity (local only) =========
const WORKER_ID_KEY = 'naithorn_worker_id'
const WORKER_NAME_KEY = 'naithorn_worker_display_name'

export function getWorkerId() {
  let id = localStorage.getItem(WORKER_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(WORKER_ID_KEY, id)
  }
  return id
}

export function getWorkerDisplayName() {
  return localStorage.getItem(WORKER_NAME_KEY)?.trim() || ''
}

export function setWorkerDisplayName(name) {
  const v = String(name || '').trim()
  if (v) localStorage.setItem(WORKER_NAME_KEY, v)
  else localStorage.removeItem(WORKER_NAME_KEY)
}

// ========= Inventory adjustments =========
export async function adjustInventoryQty(product, location, delta) {
  if (!delta) return

  const { data: rows, error: selErr } = await supabase
    .from('inventory')
    .select('*')
    .eq('product', product)
    .eq('location', location)
    .limit(1)

  if (selErr) throw selErr
  const row = rows?.[0]

  if (!row) {
    // Create missing inventory row when increasing stock.
    if (delta > 0) {
      const { error: iErr } = await supabase
        .from('inventory')
        .insert({ product, location, quantity: delta })
      if (iErr) throw iErr
    }
    return
  }

  const next = Math.max(0, (row.quantity || 0) + delta)
  const { error: uErr } = await supabase
    .from('inventory')
    .update({ quantity: next })
    .eq('product', product)
    .eq('location', location)
  if (uErr) throw uErr
}

