import { createClient } from '@supabase/supabase-js'
import { PRODUCTS, MIXES_PER_SACK } from './bakery'

const rawUrl = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const rawKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

function isValidSupabaseUrl(url) {
  if (!url) return false
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    if (/your[_-]?supabase|placeholder/i.test(url)) return false
    return true
  } catch {
    return false
  }
}

function isValidAnonKey(key) {
  if (!key || key.length < 32) return false
  if (/your[_-]?anon|changeme|placeholder/i.test(key)) return false
  return true
}

const supabaseUrl = rawUrl
const supabaseAnonKey = rawKey

const isConfigured =
  isValidSupabaseUrl(supabaseUrl) && isValidAnonKey(supabaseAnonKey)

if (!isConfigured) {
  console.warn(
    '[Naithorn] Supabase env missing or invalid. Using in-browser demo data.\n' +
      'Fix: create a file named .env in the project root with:\n' +
      '  VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co\n' +
      '  VITE_SUPABASE_ANON_KEY=your_anon_public_key\n' +
      'Then restart the dev server (npm run dev). Keys are in Supabase Dashboard → Settings → API.',
  )
}

/** True when talking to your real Supabase project (not the local mock). */
export const isSupabaseConfigured = isConfigured

const mockData = {
  production_logs: [],
  delivery_trips: [],
  customer_exchanges: [],
  flour_inventory: [{ id: 1, sacks_remaining: 60 }],
  inventory: [
    { product: 'Coconut Cake', quantity: 240, location: 'store' },
    { product: 'Cupcake', quantity: 200, location: 'store' },
    { product: 'Heartcake', quantity: 300, location: 'store' },
    { product: 'Sweet Cake', quantity: 180, location: 'store' },
    { product: 'Coconut Cake', quantity: 80, location: 'market' },
    { product: 'Cupcake', quantity: 60, location: 'market' },
    { product: 'Heartcake', quantity: 100, location: 'market' },
    { product: 'Sweet Cake', quantity: 50, location: 'market' },
    { product: 'Coconut Cake', quantity: 0, location: 'transit' },
    { product: 'Cupcake', quantity: 0, location: 'transit' },
    { product: 'Heartcake', quantity: 0, location: 'transit' },
    { product: 'Sweet Cake', quantity: 0, location: 'transit' },
  ],
  customers: [
    { id: 1, name: 'John Doe', mpesa_balance: 5000 },
    { id: 2, name: 'Jane Smith', mpesa_balance: 3500 },
    { id: 3, name: 'Bob Johnson', mpesa_balance: 2000 },
  ],
  sales: [],
  staff_sessions: [],
  mpesa_payments: [],
  daily_crate_stock: [],
}

function ensureTable(table) {
  if (!mockData[table]) mockData[table] = []
  return mockData[table]
}

function applyProductionSideEffects(row) {
  if (!row) return
  const fi = mockData.flour_inventory?.[0]
  if (!fi) return
  const used = Number(row.flour_sacks_used) || 0
  if (used <= 0) return
  fi.sacks_remaining = Math.max(
    0,
    Math.round((Number(fi.sacks_remaining || 0) - used) * 100) / 100,
  )
}

/** Minimal PostgREST-style builder that supports `await` on the final chain. */
function createMockFrom(table) {
  const selectBuilder = () => {
    let rows = [...ensureTable(table)]
    const filters = []
    const sorts = []
    let lim = null
    let wantSingle = false

    const applyFilters = () =>
      filters.reduce((acc, fn) => acc.filter(fn), [...rows])

    const run = async () => {
      let result = applyFilters()
      for (const { field, asc } of sorts) {
        result = [...result].sort((a, b) => {
          const av = a[field]
          const bv = b[field]
          if (av === bv) return 0
          if (av == null) return 1
          if (bv == null) return -1
          const cmp = av < bv ? -1 : 1
          return asc ? cmp : -cmp
        })
      }
      if (lim != null) result = result.slice(0, lim)
      if (wantSingle) {
        return { data: result[0] ?? null, error: null }
      }
      return { data: result, error: null }
    }

    const builder = {
      select: () => builder,
      eq: (field, value) => {
        filters.push((r) => r[field] === value)
        return builder
      },
      in: (field, values) => {
        const set = new Set(values)
        filters.push((r) => set.has(r[field]))
        return builder
      },
      gte: (field, value) => {
        const t = new Date(value).getTime()
        filters.push((r) => {
          const v = r[field]
          if (v == null) return false
          return new Date(v).getTime() >= t
        })
        return builder
      },
      ilike: (field, pattern) => {
        const q = String(pattern).replace(/^%|%$/g, '').toLowerCase()
        filters.push((r) =>
          String(r[field] ?? '')
            .toLowerCase()
            .includes(q),
        )
        return builder
      },
      order: (field, options) => {
        const asc = options?.ascending !== false
        sorts.push({ field, asc })
        return builder
      },
      limit: (n) => {
        lim = n
        return builder
      },
      single: () => {
        wantSingle = true
        return builder
      },
      then: (onFulfilled, onRejected) =>
        run().then(onFulfilled, onRejected),
      catch: (onRejected) => run().catch(onRejected),
      finally: (onFinally) => run().finally(onFinally),
    }
    return builder
  }

  const finalizeUpdate = (tbl, predicate, patch) => {
    tbl.forEach((row, i) => {
      if (predicate(row)) {
        tbl[i] = { ...row, ...patch }
      }
    })
    return Promise.resolve({ data: null, error: null })
  }

  return {
    select: () => selectBuilder(),
    insert: (payload) => {
      const recs = Array.isArray(payload) ? payload : [payload]
      const tbl = ensureTable(table)
      const inserted = []
      for (const r of recs) {
        let row = {
          ...r,
          id: r.id ?? Date.now() + Math.floor(Math.random() * 1000),
        }
        if (table === 'production_logs') {
          const mixes = Number(row.mixes) || 0
          const p = PRODUCTS.find((x) => x.label === row.product)
          const deduct = p?.deductFlour
          if (row.flour_sacks_used == null && mixes > 0 && deduct) {
            row = {
              ...row,
              flour_sacks_used: Math.round((mixes / MIXES_PER_SACK) * 100) / 100,
            }
          }
          // Ensure shift and note have defaults
          if (!row.shift) row.shift = 'day'
          if (!row.note) row.note = null
          applyProductionSideEffects(row)
        }
        tbl.push(row)
        inserted.push(row)
      }

      const insertThenable = {
        select: () => {
          const sel = {
            single: () =>
              Promise.resolve({ data: inserted[0] ?? null, error: null }),
            then: (onFulfilled, onRejected) =>
              Promise.resolve({ data: inserted, error: null }).then(
                onFulfilled,
                onRejected,
              ),
            catch: (onRejected) =>
              Promise.resolve({ data: inserted, error: null }).catch(onRejected),
          }
          return sel
        },
        then: (onFulfilled, onRejected) =>
          Promise.resolve({ data: null, error: null }).then(
            onFulfilled,
            onRejected,
          ),
        catch: (onRejected) =>
          Promise.resolve({ data: null, error: null }).catch(onRejected),
      }
      return insertThenable
    },
    update: (patch) => {
      const conditions = []
      const chain = {
        eq: (field, value) => {
          conditions.push({ field, value })
          return chain
        },
        then: (onFulfilled, onRejected) => {
          const tbl = ensureTable(table)
          const pred = (row) =>
            conditions.every(({ field, value }) => row[field] === value)
          return finalizeUpdate(tbl, pred, patch).then(onFulfilled, onRejected)
        },
        catch: (onRejected) =>
          finalizeUpdate(ensureTable(table), () => false, patch).catch(
            onRejected,
          ),
      }
      return chain
    },
  }
}

const mockChannels = new Set()

const mockSupabase = {
  from: (table) => createMockFrom(table),
  channel: () => {
    const ch = {
      on: () => ch,
      subscribe: () => {
        const sub = {
          unsubscribe: () => {
            mockChannels.delete(sub)
          },
        }
        mockChannels.add(sub)
        return sub
      },
    }
    return ch
  },
  removeChannel: (channel) => {
    if (channel && typeof channel.unsubscribe === 'function') {
      channel.unsubscribe()
    }
    mockChannels.delete(channel)
  },
}

export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : mockSupabase
