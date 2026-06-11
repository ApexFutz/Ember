import React, { useEffect, useState } from 'react'
import { NavLink, useNavigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useDemo } from '../hooks/useDemo'
import { useIsMobile } from '../hooks/useIsMobile'
import { supabase } from '../lib/supabase'
import WelcomeModal from './WelcomeModal'
import { markWelcomeSeen } from '../lib/founding'

export default function Layout() {
  const { profile, isRecruiter, refreshProfile } = useAuth()
  const { isDemo, goSignup } = useDemo()
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const [unreadCount, setUnreadCount] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const showWelcome = !!profile?.founding_recruiter && !profile?.has_seen_welcome

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
    { path: '/recruiter/library', label: 'Library' },
    { path: '/recruiter/billing', label: 'Billing' },
    { path: '/recruiter/organization', label: 'Team' },
    { path: '/recruiter/messages', label: 'Messages' },
    { path: '/recruiter/profile', label: 'Profile' },
  ]

  const candidateNav = [
    { path: '/candidate/roles', label: 'Roles' },
    { path: '/candidate/assessments', label: 'My Assessments' },
    { path: '/candidate/skills', label: 'Skills' },
    { path: '/candidate/messages', label: 'Messages' },
    { path: '/candidate/profile', label: 'Profile' },
  ]

  const navItems = isRecruiter ? recruiterNav : candidateNav

  const DEMO_BAR = 44
  const MOBILE_BAR = 56
  const demoOffset = isDemo ? DEMO_BAR : 0

  // Shared sidebar body (logo, role, nav, account) used by the desktop sidebar
  // and the mobile slide-in drawer.
  const sidebarBody = (
    <>
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
            onClick={() => setDrawerOpen(false)}
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
        <div style={styles.userRow}>
          <div style={styles.avatar}>
            {profile?.full_name?.charAt(0).toUpperCase() ?? '?'}
          </div>
          <div style={styles.userName}>
            {profile?.full_name ?? 'Your account'}
          </div>
        </div>
        <button onClick={handleLogout} style={styles.logoutBtn}>
          Log out
        </button>
      </div>
    </>
  )

  if (isMobile) {
    return (
      <div style={styles.shellMobile}>
        {isDemo && (
          <div style={styles.demoBanner}>
            <span style={styles.demoBannerText}>You're in demo mode.</span>
            <button onClick={goSignup} style={styles.demoBannerCta}>Sign up free →</button>
          </div>
        )}
        {showWelcome && (
          <WelcomeModal onDismiss={async () => { await markWelcomeSeen(); await refreshProfile() }} />
        )}

        {/* Top app bar */}
        <header style={{ ...styles.topBar, top: demoOffset }}>
          <div style={styles.logoInline}>
            <span style={styles.logoText}>Ember</span>
            <span style={styles.logoDot}>.</span>
          </div>
          <button
            onClick={() => setDrawerOpen(o => !o)}
            style={styles.hamburger}
            aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={drawerOpen}
          >
            {drawerOpen ? '✕' : '☰'}
          </button>
        </header>

        {/* Drawer + scrim */}
        {drawerOpen && (
          <>
            <div style={styles.scrim} onClick={() => setDrawerOpen(false)} />
            <aside style={{ ...styles.drawer, top: demoOffset, height: `calc(100vh - ${demoOffset}px)` }}>
              {sidebarBody}
            </aside>
          </>
        )}

        <main style={{ ...styles.mainMobile, paddingTop: demoOffset + MOBILE_BAR + 20 }}>
          <Outlet />
        </main>
      </div>
    )
  }

  return (
    <div style={styles.shell}>
      {isDemo && (
        <div style={styles.demoBanner}>
          <span style={styles.demoBannerText}>
            You're in demo mode — no account needed.
          </span>
          <button onClick={goSignup} style={styles.demoBannerCta}>Sign up free →</button>
        </div>
      )}
      {showWelcome && (
        <WelcomeModal onDismiss={async () => { await markWelcomeSeen(); await refreshProfile() }} />
      )}
      {/* Sidebar */}
      <aside style={{ ...styles.sidebar, ...(isDemo ? { top: DEMO_BAR, height: `calc(100vh - ${DEMO_BAR}px)` } : {}) }}>
        {sidebarBody}
      </aside>

      {/* Main content */}
      <main style={{ ...styles.main, ...(isDemo ? { paddingTop: 48 + DEMO_BAR } : {}) }}>
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
  shellMobile: {
    minHeight: '100vh',
    backgroundColor: 'var(--color-bg-primary)',
  },
  topBar: {
    position: 'fixed',
    left: 0,
    right: 0,
    height: '56px',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    backgroundColor: 'var(--color-bg-secondary)',
    borderBottom: '1px solid var(--color-border-light)',
  },
  logoInline: { display: 'flex', alignItems: 'baseline' },
  hamburger: {
    width: '44px',
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-text-primary)',
    fontSize: '18px',
    cursor: 'pointer',
  },
  scrim: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 1500,
  },
  drawer: {
    position: 'fixed',
    left: 0,
    width: '264px',
    maxWidth: '85vw',
    zIndex: 1600,
    backgroundColor: 'var(--color-bg-secondary)',
    borderRight: '1px solid var(--color-border-light)',
    display: 'flex',
    flexDirection: 'column',
    paddingTop: '24px',
    paddingBottom: '24px',
    overflowY: 'auto',
    boxSizing: 'border-box',
    boxShadow: 'var(--shadow-xl)',
  },
  mainMobile: {
    padding: '20px 16px 40px',
    minHeight: '100vh',
    boxSizing: 'border-box',
  },
  demoBanner: {
    position: 'fixed', top: 0, left: 0, right: 0, height: '44px', zIndex: 2000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px',
    background: 'var(--color-primary)', color: 'var(--color-on-primary)',
    fontSize: '14px', fontWeight: 600,
  },
  demoBannerText: { letterSpacing: '0.01em' },
  demoBannerCta: {
    background: 'var(--color-on-primary)', color: 'var(--color-primary)', border: 'none',
    borderRadius: '999px', padding: '5px 14px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
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
    minHeight: '44px',
    boxSizing: 'border-box',
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
    color: 'var(--color-on-primary)',
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
    color: 'var(--color-on-primary)',
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