import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface PublicAssessment {
  role_title: string
  company: string | null
  completed_at: string
}
interface PublicProfileData {
  full_name: string | null
  photo_url: string | null
  availability: 'available' | 'open' | 'not_looking' | null
  username: string
  assessments: PublicAssessment[]
}

const availabilityConfig: Record<string, { label: string; color: string; bg: string }> = {
  available: { label: 'Available', color: 'var(--color-success-text)', bg: 'var(--color-success-soft)' },
  open: { label: 'Open to offers', color: 'var(--color-warning-text)', bg: 'var(--color-warning-soft)' },
  not_looking: { label: 'Not looking', color: 'var(--color-text-secondary)', bg: 'var(--color-neutral-soft)' },
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// Inject/update a meta tag in <head>; returns a cleanup that removes it if we created it.
function setMeta(attr: 'name' | 'property', key: string, content: string): () => void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  const created = !el
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el) }
  const prev = el.getAttribute('content')
  el.setAttribute('content', content)
  return () => {
    if (created) el!.remove()
    else if (prev !== null) el!.setAttribute('content', prev)
  }
}

export default function PublicProfile() {
  const { username } = useParams<{ username: string }>()
  const [data, setData] = useState<PublicProfileData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!username) return
    async function load() {
      const { data: res } = await supabase.rpc('get_public_profile', { p_username: username })
      setData((res as PublicProfileData) ?? null)
      setLoading(false)
    }
    load()
  }, [username])

  // Client-side OG / title (note: full crawler unfurl needs SSR — see plan).
  useEffect(() => {
    if (!data) return
    const name = data.full_name ?? 'Candidate'
    const avail = data.availability ? availabilityConfig[data.availability]?.label : ''
    const desc = `Verified on Ember${avail ? ' · ' + avail : ''} · ${data.assessments.length} completed assessment${data.assessments.length !== 1 ? 's' : ''}`
    const prevTitle = document.title
    document.title = `${name} · Ember`
    const cleanups = [
      setMeta('property', 'og:title', `${name} · Ember`),
      setMeta('property', 'og:description', desc),
      setMeta('property', 'og:type', 'profile'),
      setMeta('name', 'description', desc),
      setMeta('name', 'twitter:card', 'summary'),
      setMeta('name', 'twitter:title', `${name} · Ember`),
      setMeta('name', 'twitter:description', desc),
    ]
    return () => { document.title = prevTitle; cleanups.forEach(c => c()) }
  }, [data])

  if (loading) return <div style={styles.centered}>Loading…</div>

  if (!data) return (
    <div style={styles.centered}>
      <div style={styles.card}>
        <div style={styles.logo}><span style={styles.logoText}>Ember</span><span style={styles.logoDot}>.</span></div>
        <h1 style={styles.privateTitle}>This profile is private or doesn't exist</h1>
        <p style={styles.privateSub}>The link may be wrong, or the candidate has made their profile private.</p>
        <Link to="/signup" style={styles.cta}>Create your own Ember profile →</Link>
      </div>
    </div>
  )

  const avail = data.availability ? availabilityConfig[data.availability] : null

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <Link to="/" style={styles.logo}><span style={styles.logoText}>Ember</span><span style={styles.logoDot}>.</span></Link>
        <Link to="/signup" style={styles.topCta}>Create your profile</Link>
      </div>

      <div style={styles.content}>
        <div style={styles.profileCard}>
          <div style={styles.avatar}>
            {data.photo_url
              ? <img src={data.photo_url} alt="" style={styles.avatarImg} />
              : <span style={styles.avatarInitial}>{data.full_name?.charAt(0).toUpperCase() ?? '?'}</span>}
          </div>
          <h1 style={styles.name}>{data.full_name ?? 'Candidate'}</h1>
          {avail && <span style={{ ...styles.availBadge, color: avail.color, backgroundColor: avail.bg }}>{avail.label}</span>}
        </div>

        <div style={styles.sectionHead}>
          <h2 style={styles.sectionTitle}>Verified assessments</h2>
          <span style={styles.count}>{data.assessments.length}</span>
        </div>

        {data.assessments.length === 0 ? (
          <div style={styles.empty}>No completed assessments yet.</div>
        ) : (
          <div style={styles.list}>
            {data.assessments.map((a, i) => (
              <div key={i} style={styles.row}>
                <div>
                  <p style={styles.roleTitle}>{a.role_title}</p>
                  <p style={styles.roleMeta}>{a.company ?? 'A company'} · {formatDate(a.completed_at)}</p>
                </div>
                <span style={styles.verified}>✓ Verified by Ember</span>
              </div>
            ))}
          </div>
        )}

        <p style={styles.footer}>
          Assessed and verified on <Link to="/signup" style={styles.footerLink}>Ember</Link> — real problem-solving, not trivia.
        </p>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-primary)' },
  centered: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-primary)', padding: '24px' },
  topbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 32px', borderBottom: '1px solid var(--color-border-light)' },
  logo: { textDecoration: 'none' },
  logoText: { fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
  logoDot: { fontSize: '22px', color: 'var(--color-primary)', fontFamily: 'var(--font-display)' },
  topCta: { fontSize: '13px', fontWeight: 600, color: 'var(--color-primary)', textDecoration: 'none' },
  content: { maxWidth: '640px', margin: '0 auto', padding: '48px 24px' },
  profileCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '40px' },
  avatar: { width: '88px', height: '88px', borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarInitial: { fontSize: '36px', fontWeight: 700, color: 'var(--color-on-primary)', fontFamily: 'var(--font-display)' },
  name: { fontSize: '32px', fontWeight: 600, margin: '0 0 12px', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
  availBadge: { fontSize: '13px', fontWeight: 600, padding: '5px 14px', borderRadius: '999px' },
  sectionHead: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' },
  sectionTitle: { fontSize: '15px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 },
  count: { fontSize: '12px', fontWeight: 700, color: 'var(--color-primary)', background: 'var(--color-primary-soft)', borderRadius: '999px', padding: '2px 10px' },
  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: '20px 24px', boxShadow: 'var(--shadow-md)' },
  roleTitle: { fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 4px', fontFamily: 'var(--font-display)' },
  roleMeta: { fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0 },
  verified: { fontSize: '12px', fontWeight: 600, color: 'var(--color-success-text)', background: 'var(--color-success-soft)', borderRadius: '999px', padding: '4px 12px', whiteSpace: 'nowrap', flexShrink: 0 },
  empty: { background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: '40px', textAlign: 'center', fontSize: '14px', color: 'var(--color-text-secondary)' },
  footer: { textAlign: 'center', fontSize: '13px', color: 'var(--color-text-tertiary)', marginTop: '40px' },
  footerLink: { color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 600 },
  // private / 404 card
  card: { background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: '48px', textAlign: 'center', maxWidth: '440px', width: '100%', boxShadow: 'var(--shadow-lg)' },
  privateTitle: { fontSize: '22px', fontWeight: 600, margin: '20px 0 8px', fontFamily: 'var(--font-display)' },
  privateSub: { fontSize: '14px', color: 'var(--color-text-secondary)', margin: '0 0 24px', lineHeight: 1.6 },
  cta: { color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 600, fontSize: '14px' },
}
