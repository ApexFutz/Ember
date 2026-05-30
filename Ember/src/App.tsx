import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import Login from './pages/auth/Login'
import Signup from './pages/auth/Signup'
import CandidateProfile from './pages/candidate/Profile'
import RecruiterProfile from './pages/recruiter/Profile'
import RecruiterRoles from './pages/recruiter/Roles.tsx'
import NewRole from './pages/recruiter/NewRole.tsx'
import Ruleset from './pages/recruiter/Ruleset.tsx'
import CandidateRoles from './pages/candidate/Roles'
import Assessment from './pages/assessment/Assessment.tsx'
import RecruiterDashboard from './pages/recruiter/Dashboard.tsx'
import Replay from './pages/recruiter/Replay.tsx'
import Messages from './pages/messages/Messages.tsx'
import CandidateAssessments from './pages/candidate/Assessments.tsx'

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

  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      {/* Assessment — fullscreen, completely standalone */}
      <Route path="/assessment/:roleId" element={
        <ProtectedRoute requiredRole="candidate">
          <Assessment />
        </ProtectedRoute>
      } />

      {/* Recruiter routes */}
      <Route path="/recruiter" element={
        <ProtectedRoute requiredRole="recruiter">
          <Layout />
        </ProtectedRoute>
      }>
        <Route path="dashboard" element={<RecruiterDashboard />} />
        <Route path="roles" element={<RecruiterRoles />} />
        <Route path="roles/new" element={<NewRole />} />
        <Route path="roles/:id/ruleset" element={<Ruleset />} />
        <Route path="messages" element={<Messages />} />
        <Route path="profile" element={<RecruiterProfile />} />
        <Route path="submissions/:id/replay" element={<Replay />} />
      </Route>

      {/* Candidate routes */}
      <Route path="/candidate" element={
        <ProtectedRoute requiredRole="candidate">
          <Layout />
        </ProtectedRoute>
      }>
        <Route path="dashboard" element={<Navigate to="/candidate/roles" replace />} />
        <Route path="roles" element={<CandidateRoles />} />
        <Route path="assessments" element={<CandidateAssessments />} />
        <Route path="messages" element={<Messages />} />
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