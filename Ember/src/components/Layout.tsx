import React, { useState } from 'react'
import { NavLink, useNavigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function Layout() {
  const { profile, isRecruiter } = useAuth()
  const navigate = useNavigate()
  const [unreadCount] = useState(0) // will wire up in messaging milestone

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const recruiterNav = [
    { path: '/recruiter/dashboard', label: 'Dashboard' },
    { path: '/recruiter/roles', label: 'Roles' },
    { path: '/recruiter/messages', label: 'Messages' },
    { path: '/recruiter/profile', label: 'Profile' },
  ]

  const candidateNav = [
    { path: '/candidate/roles', label: 'Roles' },
    { path: '/candidate/assessments', label: 'My Assessments' },
    { path: '/candidate/messages', label: 'Messages' },
    { path: '/candidate/profile', label: 'Profile' },
  ]

  const navItems = isRecruiter ? recruiterNav : candidateNav

  return (
    <div style={styles.shell}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        {/* Logo */}
        <div style={styles.logo}>
          <span style={styles.logoText}>Ember</span>
          <span style={styles.logoDot}>.</span>
        </div>

        {/* Role badge */}
        <div style={styles.roleBadge}>
          {isRecruiter ? 'Recruiter' : 'Candidate'}
        </div>

        {/* Nav items */}
        <nav style={styles.nav}>
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              style={({ isActive }) =>
                isActive ? { ...styles.navItem, ...styles.navItemActive }
                         : styles.navItem
              }
            >
              <span>{item.label}</span>
              {item.label === 'Messages' && unreadCount > 0 && (
                <span style={styles.badge}>{unreadCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom section */}
        <div style={styles.sidebarBottom}>
          {/* User info */}
          <div style={styles.userRow}>
            <div style={styles.avatar}>
              {profile?.full_name?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <div style={styles.userName}>
              {profile?.full_name ?? 'Your account'}
            </div>
          </div>

          {/* Logout */}
          <button onClick={handleLogout} style={styles.logoutBtn}>
            Log out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: 'flex',
    minHeight: '100vh',
    backgroundColor: '#f7f3ee',
    fontFamily: 'system-ui, sans-serif',
  },
  sidebar: {
    width: '220px',
    height: '100vh',
    backgroundColor: '#1a1714',
    display: 'flex',
    flexDirection: 'column',
    paddingTop: '28px',
    paddingBottom: '24px',
    paddingLeft: '0',
    paddingRight: '0',
    position: 'fixed',
    top: 0,
    left: 0,
    overflowY: 'auto',
    boxSizing: 'border-box',
  },
  logo: {
    padding: '0 24px',
    marginBottom: '8px',
  },
  logoText: {
    fontSize: '22px',
    fontWeight: '500',
    color: '#fff',
    letterSpacing: '-0.02em',
  },
  logoDot: {
    fontSize: '22px',
    color: '#c8943a',
  },
  roleBadge: {
    margin: '0 24px 28px',
    fontSize: '11px',
    color: '#8a837a',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    gap: '2px',
    padding: '0 12px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '9px 12px',
    borderRadius: '3px',
    fontSize: '14px',
    color: '#8a837a',
    textDecoration: 'none',
    transition: 'background 0.15s, color 0.15s',
  },
  navItemActive: {
    backgroundColor: '#2a2420',
    color: '#fff',
  },
  badge: {
    backgroundColor: '#c8943a',
    color: '#fff',
    fontSize: '11px',
    fontWeight: '500',
    padding: '2px 7px',
    borderRadius: '999px',
  },
  
  main: {
    marginLeft: '220px',
    flex: 1,
    padding: '40px',
    minHeight: '100vh',
  },
  sidebarBottom: {
    padding: '16px 12px 0',
    borderTop: '1px solid #2a2420',
    marginTop: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  userRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '4px 8px',
    borderRadius: '3px',
    backgroundColor: '#2a2420',
  },
  avatar: {
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    backgroundColor: '#c8943a',
    color: '#fff',
    fontSize: '13px',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  userName: {
    fontSize: '13px',
    color: '#fff',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: '400',
  },
  logoutBtn: {
    width: '100%',
    padding: '8px 12px',
    background: 'transparent',
    border: '1px solid #2a2420',
    borderRadius: '3px',
    color: '#8a837a',
    fontSize: '12px',
    cursor: 'pointer',
    textAlign: 'center',
    letterSpacing: '0.04em',
  },
}