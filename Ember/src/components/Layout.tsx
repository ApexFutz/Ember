import React, { useEffect, useState } from 'react'
import { NavLink, useNavigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function Layout() {
  const { profile, isRecruiter } = useAuth()
  const navigate = useNavigate()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!profile) return

    async function fetchUnread() {
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('read', false)
        .neq('sender_id', profile!.id)

      setUnreadCount(count ?? 0)
    }

    fetchUnread()

    const channel = supabase
      .channel('unread-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=neq.${profile.id}`,
        },
        () => {
          fetchUnread()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
        },
        () => {
          fetchUnread()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile])

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
              style={({ isActive }) => ({
                ...styles.navItem,
                ...(isActive ? styles.navItemActive : {}),
              })}
              onMouseEnter={(e) => {
                if (!(e.currentTarget as HTMLElement).style.boxShadow?.includes('primary')) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-bg-hover)'
                }
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement
                if (!el.style.boxShadow?.includes('primary')) {
                  el.style.backgroundColor = 'transparent'
                }
              }}
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
    backgroundColor: 'var(--color-bg-primary)',
  },
  sidebar: {
    width: '256px',
    height: '100vh',
    backgroundColor: 'var(--color-bg-secondary)',
    borderRight: '1px solid var(--color-border-light)',
    display: 'flex',
    flexDirection: 'column',
    paddingTop: '32px',
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
    marginBottom: '12px',
  },
  logoText: {
    fontSize: '24px',
    fontWeight: '700',
    color: 'var(--color-text-primary)',
    letterSpacing: '-0.02em',
    fontFamily: 'var(--font-display)',
  },
  logoDot: {
    fontSize: '24px',
    color: 'var(--color-primary)',
    fontFamily: 'var(--font-display)',
  },
  roleBadge: {
    margin: '0 24px 32px',
    fontSize: '11px',
    color: 'var(--color-text-tertiary)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    gap: '4px',
    padding: '0 12px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '11px 14px',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--color-text-secondary)',
    textDecoration: 'none',
    transition: 'all var(--transition-fast)',
    cursor: 'pointer',
  },
  navItemActive: {
    backgroundColor: 'var(--color-bg-tertiary)',
    color: 'var(--color-text-primary)',
    boxShadow: 'inset 0 0 0 1px var(--color-primary)',
  },
  badge: {
    backgroundColor: 'var(--color-primary)',
    color: '#fff',
    fontSize: '11px',
    fontWeight: '600',
    padding: '3px 9px',
    borderRadius: '999px',
  },
  main: {
    marginLeft: '256px',
    flex: 1,
    padding: '48px 56px',
    minHeight: '100vh',
  },
  sidebarBottom: {
    padding: '20px 12px 0',
    borderTop: '1px solid var(--color-border-light)',
    marginTop: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  userRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-bg-tertiary)',
    border: '1px solid var(--color-border-light)',
    transition: 'all var(--transition-fast)',
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontFamily: 'var(--font-display)',
  },
  userName: {
    fontSize: '14px',
    color: 'var(--color-text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: '500',
  },
  logoutBtn: {
    width: '100%',
    padding: '10px 14px',
    background: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-text-secondary)',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    textAlign: 'center',
    letterSpacing: '0.02em',
    transition: 'all var(--transition-fast)',
  },
}