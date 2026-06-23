import { Navigate } from 'react-router-dom'

function getUserRole() {
  return localStorage.getItem('userRole') || ''
}

/**
 * Client-side route gate (UI only).
 * This prevents casual access by typing URLs, but it is NOT security by itself.
 * Real security must be enforced with Supabase RLS + auth.
 */
export default function ProtectedRoute({ allow, children }) {
  const role = getUserRole()
  const allowed = Array.isArray(allow) ? allow : [allow]

  if (!role) return <Navigate to="/" replace />
  if (!allowed.includes(role)) return <Navigate to="/" replace />
  return children
}

