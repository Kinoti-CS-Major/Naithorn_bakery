// ============================================================
// NAITHORN BAKERY — Mpesa Daraja C2B Webhook
// File: api/mpesa/callback.js  (Vercel serverless function)
// 
// In Safaricom Daraja, set your Confirmation URL to:
//   https://naithorn-bakery.vercel.app/api/mpesa/callback
// ============================================================

import { createClient } from '@supabase/supabase-js'

// Use SERVICE ROLE key here — bypasses RLS, safe server-side only
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = req.body

    // Daraja C2B callback structure
    // https://developer.safaricom.co.ke/APIs/CustomerToBusiness
    const {
      TransID,           // Unique Mpesa transaction ID
      TransAmount,       // Amount paid
      MSISDN,            // Customer phone number (e.g. 254711000001)
      TransTime,         // Transaction time YYYYMMDDHHMMSS
      BusinessShortCode, // Your till number: 4961870
      FirstName,
      MiddleName,
      LastName,
    } = body

    if (!TransID || !TransAmount || !MSISDN) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // Normalise Safaricom phone to +254XXXXXXXXX
    // Daraja sends: 254711000001 (no +), 0711000001, or 711000001
    let phone = String(MSISDN).replace(/\D/g, '')   // strip non-digits
    if (phone.startsWith('0'))   phone = '254' + phone.slice(1)
    if (phone.startsWith('7') || phone.startsWith('1')) phone = '254' + phone
    phone = '+' + phone  // final form: +254711000001

    // Parse Mpesa datetime format: 20240423143000
    const rawTime = String(TransTime)
    const txTime = new Date(
      `${rawTime.slice(0,4)}-${rawTime.slice(4,6)}-${rawTime.slice(6,8)}T${rawTime.slice(8,10)}:${rawTime.slice(10,12)}:${rawTime.slice(12,14)}+03:00`
    )

    // Insert payment — trigger auto-matches customer and credits balance
    const { data, error } = await supabase
      .from('mpesa_payments')
      .insert({
        transaction_id:   TransID,
        phone,
        amount:           parseFloat(TransAmount),
        till_number:      String(BusinessShortCode),
        transaction_time: txTime.toISOString(),
        raw_payload:      body,
      })
      .select()
      .single()

    if (error) {
      // Duplicate transaction — idempotent, return OK
      if (error.code === '23505') {
        return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted (duplicate)' })
      }
      console.error('Supabase error:', error)
      return res.status(500).json({ error: error.message })
    }

    console.log(`✓ Mpesa KES ${TransAmount} from ${phone} — matched: ${data.matched}`)

    // Safaricom expects this exact response to acknowledge receipt
    return res.status(200).json({
      ResultCode: 0,
      ResultDesc: 'Accepted'
    })

  } catch (err) {
    console.error('Webhook error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
