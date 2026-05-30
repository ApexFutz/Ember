import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import Login from './pages/auth/Login'
import Signup from './pages/auth/Signup'
import CandidateProfile from './pages/candidate/Profile'
import RecruiterProfile from './pages/recruiter/Profile'

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

      {/* Recruiter routes — wrapped in Layout */}
      <Route path="/recruiter" element={
        <ProtectedRoute requiredRole="recruiter">
          <Layout />
        </ProtectedRoute>
      }>
        <Route path="dashboard" element={<div>Recruiter Dashboard coming soon</div>} />
        <Route path="roles" element={<div>Roles coming soon</div>} />
        <Route path="messages" element={<div>Messages coming soon</div>} />
        <Route path="profile" element={<RecruiterProfile />} />
      </Route>

      {/* Candidate routes — wrapped in Layout */}
      <Route path="/candidate" element={
        <ProtectedRoute requiredRole="candidate">
          <Layout />
        </ProtectedRoute>
      }>
        <Route path="dashboard" element={<Navigate to="/candidate/roles" replace />} />
        <Route path="roles" element={<div>Roles coming soon</div>} />
        <Route path="assessments" element={<div>Assessments coming soon</div>} />
        <Route path="messages" element={<div>Messages coming soon</div>} />
        <Route path="profile" element={<CandidateProfile />} />
      </Route>

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