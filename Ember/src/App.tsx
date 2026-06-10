import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { DemoProvider } from './hooks/useDemo'
import Layout from './components/Layout'
import Login from './pages/auth/Login'
import Signup from './pages/auth/Signup'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import PublicProfile from './pages/PublicProfile'
import Admin from './pages/Admin'
import CandidateProfile from './pages/candidate/Profile'
import RecruiterProfile from './pages/recruiter/Profile'
import RecruiterRoles from './pages/recruiter/Roles.tsx'
import NewRole from './pages/recruiter/NewRole.tsx'
import Ruleset from './pages/recruiter/Ruleset.tsx'
import Library from './pages/recruiter/Library.tsx'
import Billing from './pages/recruiter/Billing.tsx'
import Organization from './pages/recruiter/Organization.tsx'
import CandidateRoles from './pages/candidate/Roles'
import Assessment from './pages/assessment/Assessment.tsx'
import RecruiterDashboard from './pages/recruiter/Dashboard.tsx'
import Replay from './pages/recruiter/Replay.tsx'
import RoleAnalytics from './pages/recruiter/RoleAnalytics.tsx'
import Messages from './pages/messages/Messages.tsx'
import CandidateAssessments from './pages/candidate/Assessments.tsx'
import CandidateSkills from './pages/candidate/Skills.tsx'
import Practice from './pages/candidate/Practice.tsx'

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
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Public shareable candidate profile — no auth */}
      <Route path="/c/:username" element={<PublicProfile />} />

      {/* Admin — auth required; page itself gates on is_admin() */}
      <Route path="/admin" element={
        <ProtectedRoute>
          <Admin />
        </ProtectedRoute>
      } />

      {/* Assessment — fullscreen, completely standalone */}
      <Route path="/assessment/:roleId" element={
        <ProtectedRoute requiredRole="candidate">
          <Assessment />
        </ProtectedRoute>
      } />

      {/* Practice — fullscreen, standalone */}
      <Route path="/candidate/practice/:taskId" element={
        <ProtectedRoute requiredRole="candidate">
          <Practice />
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
        <Route path="library" element={<Library />} />
        <Route path="billing" element={<Billing />} />
        <Route path="organization" element={<Organization />} />
        <Route path="roles/new" element={<NewRole />} />
        <Route path="roles/:id/ruleset" element={<Ruleset />} />
        <Route path="roles/:roleId/analytics" element={<RoleAnalytics />} />
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
        <Route path="skills" element={<CandidateSkills />} />
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
      <DemoProvider>
        <AppRoutes />
      </DemoProvider>
    </BrowserRouter>
  )
}

export default App