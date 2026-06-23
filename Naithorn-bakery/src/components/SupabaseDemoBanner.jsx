import { isSupabaseConfigured } from '../lib/supabase'
import './SupabaseDemoBanner.css'

export default function SupabaseDemoBanner() {
  if (isSupabaseConfigured) return null

  return (
    <div className="supabase-demo-banner" role="status">
      <strong>Demo mode</strong>
      <span>
        Not connected to Supabase — data stays in this browser only. Add{' '}
        <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to a{' '}
        <code>.env</code> file and restart <code>npm run dev</code>.
      </span>
    </div>
  )
}
