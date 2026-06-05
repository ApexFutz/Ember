import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import EmptyState from '../../components/EmptyState'
import SkeletonCard from '../../components/SkeletonCard'
import { RailLayout, RailCard } from '../../components/RailLayout'
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
  const [generating, setGenerating] = useState<string | null>(null) // skill slug or '*' for general
  const [genError, setGenError] = useState<string | null>(null)

  async function generatePractice(skill?: string) {
    setGenerating(skill ?? '*')
    setGenError(null)
    const { data, error } = await supabase.functions.invoke('generate-practice', {
      body: skill ? { skill } : {},
    })
    if (error || !data?.id) {
      setGenError(error?.message ?? 'Could not generate a practice task. Try again.')
      setGenerating(null)
      return
    }
    navigate(`/candidate/practice/${data.id}`)
  }

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

  const tierBreakdown = (['advanced', 'intermediate', 'beginner'] as Tier[]).map(t => ({
    tier: t,
    label: tierConfig[t].label,
    color: tierConfig[t].color,
    count: skills.filter(s => s.tier === t).length,
  }))

  const rail = skills.length > 0 ? (
    <>
      <RailCard title="Proficiency">
        <p style={styles.railBig}>
          <span style={styles.railBigNum}>{skills.length}</span> skill{skills.length !== 1 ? 's' : ''} tracked
        </p>
        <div style={styles.railList}>
          {tierBreakdown.map(t => (
            <div key={t.tier} style={styles.railRow}>
              <span style={{ ...styles.railDot, backgroundColor: t.color }} />
              <span style={styles.railRowName}>{t.label}</span>
              <span style={styles.railRowNum}>{t.count}</span>
            </div>
          ))}
        </div>
      </RailCard>
      <RailCard title="Level up">
        <p style={styles.railNote}>Complete recruiter assessments or generate practice to raise your tiers.</p>
        <button onClick={() => navigate('/candidate/roles')} style={styles.railAction}>Browse open roles</button>
      </RailCard>
    </>
  ) : null

  return (
    <RailLayout rail={rail}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>Skills</h1>
          <p style={styles.subtitle}>Your proficiency, built from the assessments you complete.</p>
        </div>
        {skills.length > 0 && (
          <button
            onClick={() => generatePractice()}
            disabled={generating !== null}
            style={generating ? { ...styles.genBtn, opacity: 0.6 } : styles.genBtn}
          >
            {generating === '*' ? 'Generating…' : 'Generate practice'}
          </button>
        )}
      </div>

      {genError && <div style={styles.error}>{genError}</div>}

      {skills.length === 0 ? (
        <EmptyState
          title="No skills yet"
          message="Generate a practice task to start building your skill profile, or complete a recruiter assessment."
          actionLabel={generating === '*' ? 'Generating…' : 'Generate a practice task'}
          onAction={() => generatePractice()}
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
                <button
                  onClick={() => generatePractice(s.skill)}
                  disabled={generating !== null}
                  style={generating ? { ...styles.cardPracticeBtn, opacity: 0.6 } : styles.cardPracticeBtn}
                >
                  {generating === s.skill ? 'Generating…' : 'Practice this skill'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </RailLayout>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: '900px' },
  header: { marginBottom: '32px' },
  headerRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '24px' },
  genBtn: {
    padding: '10px 18px', backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none',
    borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)',
    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
  },
  cardPracticeBtn: {
    marginTop: '4px', padding: '8px', width: '100%', background: 'transparent',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontWeight: 'var(--weight-medium)',
  },
  error: {
    background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: '13px',
    color: 'var(--color-error)', marginBottom: '20px',
  },
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
  railBig: { fontSize: '13px', color: 'var(--color-text-secondary)', margin: '0 0 12px' },
  railBigNum: { fontSize: '20px', fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'var(--font-display)' },
  railList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  railRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  railDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  railRowName: { flex: 1, fontSize: '13px', color: 'var(--color-text-primary)' },
  railRowNum: { fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)' },
  railNote: { fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: '0 0 12px' },
  railAction: { padding: '9px 14px', width: '100%', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: '13px', fontWeight: 500, color: 'var(--color-text-secondary)', cursor: 'pointer' },
}
