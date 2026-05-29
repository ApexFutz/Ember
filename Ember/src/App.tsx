import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Login from './pages/auth/Login'
import Signup from './pages/auth/Signup'

function ProtectedRoute({ children, requiredRole }: {
  children: React.ReactElement
  requiredRole?: 'recruiter' | 'candidate'
}) {
  const { user, profile, loading } = useAuth()

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  if (requiredRole && profile?.role !== requiredRole) {
    return <Navigate to="/login" replace />
  }

  return children
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      {/* Recruiter routes */}
      <Route path="/recruiter/dashboard" element={
        <ProtectedRoute requiredRole="recruiter">
          <div>Recruiter Dashboard coming soon</div>
        </ProtectedRoute>
      } />

      {/* Candidate routes */}
      <Route path="/candidate/dashboard" element={
        <ProtectedRoute requiredRole="candidate">
          <div>Candidate Dashboard coming soon</div>
        </ProtectedRoute>
      } />

      {/* Default */}
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App