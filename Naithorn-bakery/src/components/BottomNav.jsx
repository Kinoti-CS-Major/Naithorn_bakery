import { useLocation, useNavigate } from 'react-router-dom'
import { getCurrentUser, signOut } from '../lib/bakery'
import './BottomNav.css'

const BottomNav = () => {
  const location = useLocation()
  const navigate = useNavigate()

  const navItems = [
    { path: '/worker', icon: '🏭', label: 'Worker' },
    { path: '/delivery', icon: '🚚', label: 'Delivery' },
    { path: '/sales', icon: '🛒', label: 'Sales' },
    { path: '/admin', icon: '📊', label: 'Admin' },
  ]

  const { role } = getCurrentUser()
  const visibleItems =
    role === 'admin'
      ? navItems
      : navItems.filter((i) => i.path !== '/admin')

  return (
    <nav className="bottom-nav">
      {visibleItems.map((item) => (
        <button
          key={item.path}
          className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
          onClick={() => navigate(item.path)}
        >
          <span className="nav-icon">{item.icon}</span>
          <span className="nav-label">{item.label}</span>
        </button>
      ))}
      <button
        className="nav-item"
        onClick={() => {
          signOut()
          navigate('/')
        }}
        title="Sign out"
      >
        <span className="nav-icon">🚪</span>
        <span className="nav-label">Logout</span>
      </button>
    </nav>
  )
}

export default BottomNav
