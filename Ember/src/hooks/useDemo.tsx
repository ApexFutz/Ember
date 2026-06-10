import React, { createContext, useContext, useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export const DEMO_EMAIL = 'demo@ember.dev'
const DEMO_DURATION_MS = 15 * 60 * 1000
const STARTED_KEY = 'demo_started_at'
const SESSION_KEY = 'demo_session_id'

interface DemoContextValue {
  isDemo: boolean
  /** Call at the top of a mutating handler. If in demo, shows a toast and returns true (abort). */
  guard: () => boolean
  /** End the demo and head to signup, logging the conversion. */
  goSignup: () => void
}

const DemoContext = createContext<DemoContextValue>({
  isDemo: false,
  guard: () => false,
  goSignup: () => {},
})

export function useDemo() {
  return useContext(DemoContext)
}

/** Record demo session metadata at sign-in time (called from the Login page). */
export function markDemoStarted(sessionId: string | null) {
  sessionStorage.setItem(STARTED_KEY, String(Date.now()))
  if (sessionId) sessionStorage.setItem(SESSION_KEY, sessionId)
}

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isDemo = user?.email === DEMO_EMAIL
  const [toast, setToast] = useState(false)

  const goSignup = useCallback(() => {
    const sessionId = sessionStorage.getItem(SESSION_KEY)
    if (sessionId) {
      supabase.functions.invoke('create-demo-session', {
        body: { action: 'signup_click', session_id: sessionId },
      }).catch(() => {})
    }
    sessionStorage.removeItem(STARTED_KEY)
    sessionStorage.removeItem(SESSION_KEY)
    supabase.auth.signOut().finally(() => navigate('/signup'))
  }, [navigate])

  const guard = useCallback(() => {
    if (!isDemo) return false
    setToast(true)
    setTimeout(() => setToast(false), 6000)
    return true
  }, [isDemo])

  // Enforce the 15-minute session limit, then redirect to signup.
  useEffect(() => {
    if (!isDemo) return
    let started = Number(sessionStorage.getItem(STARTED_KEY))
    if (!started) { started = Date.now(); sessionStorage.setItem(STARTED_KEY, String(started)) }

    const check = () => {
      if (Date.now() - started >= DEMO_DURATION_MS) {
        sessionStorage.removeItem(STARTED_KEY)
        sessionStorage.removeItem(SESSION_KEY)
        supabase.auth.signOut().finally(() => navigate('/signup?demo=expired'))
      }
    }
    check()
    const t = setInterval(check, 20000)
    return () => clearInterval(t)
  }, [isDemo, navigate])

  return (
    <DemoContext.Provider value={{ isDemo, guard, goSignup }}>
      {children}
      {isDemo && toast && (
        <div style={styles.toast}>
          <span>This is a demo — sign up to use this feature.</span>
          <button onClick={goSignup} style={styles.toastBtn}>Sign up free</button>
        </div>
      )}
    </DemoContext.Provider>
  )
}

const styles: Record<string, React.CSSProperties> = {
  toast: {
    position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
    zIndex: 3000, display: 'flex', alignItems: 'center', gap: '14px',
    background: 'var(--color-text-primary)', color: 'var(--color-bg-primary)',
    padding: '12px 18px', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-xl)',
    fontSize: '14px', fontWeight: 500, maxWidth: '90vw',
  },
  toastBtn: {
    background: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none',
    borderRadius: 'var(--radius-sm)', padding: '6px 12px', fontSize: '13px', fontWeight: 600,
    cursor: 'pointer', flexShrink: 0,
  },
}
