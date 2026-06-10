import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

interface Profile {
  id: string
  role: 'recruiter' | 'candidate'
  full_name: string | null
  photo_url: string | null
  availability?: 'available' | 'open' | 'not_looking'
  company_name?: string | null
  headline?: string | null
  bio?: string | null
  skills?: string[]
  github_url?: string | null
  linkedin_url?: string | null
  portfolio_url?: string | null
  recruiter_linkedin_url?: string | null
  job_title?: string | null
  founding_recruiter?: boolean
  has_seen_welcome?: boolean
  email_notifications?: boolean
  onboarding_dismissed?: boolean
}

interface AuthState {
  user: User | null
  profile: Profile | null
  loading: boolean
  isRecruiter: boolean
  isCandidate: boolean
  refreshProfile: () => Promise<void>
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  // fetchProfile is now defined at hook scope so refreshProfile can call it
  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Error fetching profile:', error.message)
    } else {
      setProfile(data)
    }
    setLoading(false)
  }, [])

  const refreshProfile = useCallback(async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (currentUser) await fetchProfile(currentUser.id)
  }, [fetchProfile])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) fetchProfile(session.user.id)
        else {
          setProfile(null)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  return {
    user,
    profile,
    loading,
    isRecruiter: profile?.role === 'recruiter',
    isCandidate: profile?.role === 'candidate',
    refreshProfile,
  }
}