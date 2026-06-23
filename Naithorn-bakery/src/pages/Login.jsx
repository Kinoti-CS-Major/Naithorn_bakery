import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listUsers, signInWithPin } from '../lib/bakery'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import './Login.css'

const Login = () => {
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [pin, setPin] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()
  const { showToast } = useToast()

  const users = listUsers()

  const handleSignIn = (e) => {
    e.preventDefault()
    if (selectedUserId && pin.length === 4) {
      setIsSubmitting(true)
      setTimeout(async () => {
        const res = signInWithPin(selectedUserId, pin)
        if (!res.ok) {
          showToast(res.error || 'Sign in failed', 'error')
          setIsSubmitting(false)
          return
        }
        const role = res.user.role
        const user = users.find(u => u.id === selectedUserId)
        
        // Record staff session in database
        if (user && ['worker', 'delivery', 'sales'].includes(role)) {
          try {
            const hour = new Date().getHours()
            const shift = hour >= 6 && hour < 18 ? 'day' : 'night'
            await supabase.from('staff_sessions').insert({
              staff_id: user.id,
              staff_name: user.name,
              role: role,
              shift: shift,
              login_at: new Date().toISOString(),
            })
          } catch (err) {
            console.error('Failed to record staff session:', err)
            // Don't block login if this fails
          }
        }
        
        navigate(`/${role}`)
        showToast(`Welcome, ${res.user.name}`, 'success')
        setPin('')
        setIsSubmitting(false)
      }, 500)
    }
  }

  return (
    <div className="login-page">
      <div className="login-header">
        <h1 className="logo">Naithorn Bakery</h1>
        <p className="subtitle">Select your profile, then enter PIN</p>
      </div>

      <div className="role-selector">
        {users.map((u) => (
          <button
            key={u.id}
            type="button"
            className={`role-card ${selectedUserId === u.id ? 'selected' : ''}`}
            onClick={() => setSelectedUserId(u.id)}
            style={{ minHeight: '120px' }}
          >
            <span className="role-icon">{u.icon}</span>
            <h3 className="role-name">{u.label}</h3>
            <p className="role-description">{u.name}</p>
          </button>
        ))}
      </div>

      {selectedUserId && (
        <form className="login-form form-card" onSubmit={handleSignIn}>
          <div className="pin-input-container">
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              placeholder="Enter 4-digit PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="pin-input"
              style={{ minHeight: '48px' }}
            />
          </div>
          <button type="submit" className="sign-in-btn" disabled={pin.length !== 4 || isSubmitting} style={{ minHeight: '48px' }}>
            {isSubmitting && <span className="loading-spinner"></span>}
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      )}
    </div>
  )
}

export default Login
