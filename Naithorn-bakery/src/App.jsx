import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ToastProvider } from './contexts/ToastContext'
import SupabaseDemoBanner from './components/SupabaseDemoBanner'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import WorkerView from './pages/WorkerView'
import DeliveryView from './pages/DeliveryView'
import SalesView from './pages/SalesView'
import AdminDashboard from './pages/AdminDashboard'
import BottomNav from './components/BottomNav'

function App() {
  return (
    <ToastProvider>
      <SupabaseDemoBanner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/worker" element={
            <div className="app-container">
              <ProtectedRoute allow="worker">
                <WorkerView />
              </ProtectedRoute>
              <BottomNav />
            </div>
          } />
          <Route path="/delivery" element={
            <div className="app-container">
              <ProtectedRoute allow="delivery">
                <DeliveryView />
              </ProtectedRoute>
              <BottomNav />
            </div>
          } />
          <Route path="/sales" element={
            <div className="app-container">
              <ProtectedRoute allow="sales">
                <SalesView />
              </ProtectedRoute>
              <BottomNav />
            </div>
          } />
          <Route path="/admin" element={
            <div className="app-container">
              <ProtectedRoute allow="admin">
                <AdminDashboard />
              </ProtectedRoute>
              <BottomNav />
            </div>
          } />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}

export default App
