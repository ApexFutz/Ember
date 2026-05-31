import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import EmptyState from '../../components/EmptyState'
import SkeletonCard from '../../components/SkeletonCard'
import type { Tier } from '../../lib/skills'

interface CandidateSkill {
  skill: string
  label: string
  evidence_count: number
  score_sum: number
  tier: Tier
}

const tierConfig: Record<Tier, { label: string; color: string; bg: string }> = {
  beginner: { label: 'Beginner', color: 'var(--color-text-secondary)', bg: 'rgba(154, 154, 168, 0.12)' },
  intermediate: { label: 'Intermediate', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.15)' },
  advanced: { label: 'Advanced', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
}

export default function CandidateSkills() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [skills, setSkills] = useState<CandidateSkill[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    async function load() {
      const { data } = await supabase
        .from('candidate_skills')
        .select('skill, label, evidence_count, score_sum, tier')
        .eq('candidate_id', user!.id)
        .order('evidence_count', { ascending: false })

      if (data) setSkills(data as CandidateSkill[])
      setLoading(false)
    }
    load()
  }, [user])

  if (loading) return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Skills</h1>
        <p style={styles.subtitle}>Your proficiency, built from the assessments you complete.</p>
      </div>
      <SkeletonCard />
      <SkeletonCard />
    </div>
  )

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Skills</h1>
        <p style={styles.subtitle}>Your proficiency, built from the assessments you complete.</p>
      </div>

      {skills.length === 0 ? (
        <EmptyState
          title="No skills yet"
          message="Complete assessments to build your skill profile. Each one updates your proficiency in the technologies it covers."
          actionLabel="Browse roles"
          onAction={() => navigate('/candidate/roles')}
        />
      ) : (
        <div style={styles.grid}>
          {skills.map(s => {
            const cfg = tierConfig[s.tier] ?? tierConfig.beginner
            const avg = s.evidence_count > 0 ? Math.round((s.score_sum / s.evidence_count) * 100) : 0
            return (
              <div key={s.skill} style={styles.card}>
                <div style={styles.cardTop}>
                  <span style={styles.skillLabel}>{s.label}</span>
                  <span style={{ ...styles.tierBadge, color: cfg.color, backgroundColor: cfg.bg }}>
                    {cfg.label}
                  </span>
                </div>
                <div style={styles.barTrack}>
                  <div style={{ ...styles.barFill, width: `${avg}%` }} />
                </div>
                <div style={styles.cardBottom}>
                  <span style={styles.metaText}>{avg}% avg score</span>
                  <span style={styles.metaText}>
                    {s.evidence_count} assessment{s.evidence_count !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: '900px' },
  header: { marginBottom: '32px' },
  title: { fontSize: 'var(--text-4xl)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)', margin: '0 0 8px', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
  subtitle: { fontSize: '14px', color: 'var(--color-text-secondary)', margin: 0 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' },
  card: {
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)',
    padding: '20px 22px',
    boxShadow: 'var(--shadow-md)',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  cardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
  skillLabel: { fontSize: '15px', fontWeight: '600', color: 'var(--color-text-primary)' },
  tierBadge: {
    fontSize: '11px', fontWeight: '600', padding: '4px 10px', borderRadius: '999px',
    letterSpacing: '0.02em', whiteSpace: 'nowrap',
  },
  barTrack: {
    height: '6px', borderRadius: '999px', backgroundColor: 'var(--color-bg-tertiary)', overflow: 'hidden',
  },
  barFill: {
    height: '100%', borderRadius: '999px',
    background: 'linear-gradient(90deg, var(--color-primary), var(--color-primary-light))',
  },
  cardBottom: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  metaText: { fontSize: '12px', color: 'var(--color-text-secondary)' },
}
