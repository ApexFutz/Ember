import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

interface Profile {
  id: string
  role: 'recruiter' | 'candidate'
  full_name: string | null
  photo_url: string | null
  availability?: 'available' | 'open' | 'not_looking'
  company_name?: string | null
}

interface AuthState {
  user: User | null
  profile: Profile | null
  loading: boolean
  isRecruiter: boolean
  isCandidate: boolean
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    // Listen for auth changes (login, logout, token refresh)
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
  }, [])

  async function fetchProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, full_name, photo_url, availability, company_name')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Error fetching profile:', error.message)
    } else {
      setProfile(data)
    }
    setLoading(false)
  }

  return {
    user,
    profile,
    loading,
    isRecruiter: profile?.role === 'recruiter',
    isCandidate: profile?.role === 'candidate',
  }
}