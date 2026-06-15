import React, { useState } from 'react'
import { aggregate, verdictMeta, RECOMMENDATION_LABEL, type Review } from '../../lib/review'

interface Props {
  reviews: Review[]
  inviting: boolean
  onInvite: (email: string) => void
  settingStatus: boolean
  onSetStatus: (status: 'moved_forward' | 'passed') => void
}

const MAX_REVIEWERS = 5

// Role-owner panel: invite reviewers, watch the live panel, and (once everyone
// has submitted) see the aggregate verdict + recommended action. Owner-only.
export default function OwnerReviewPanel({ reviews, inviting, onInvite, settingStatus, onSetStatus }: Props) {
  const [email, setEmail] = useState('')
  const agg = aggregate(reviews)

  function invite() {
    const e = email.trim()
    if (!e) return
    onInvite(e)
    setEmail('')
  }

  return (
    <div style={styles.card}>
      <div style={styles.head}>
        <span style={styles.title}>Review panel</span>
        <span style={styles.count}>{agg.submitted}/{agg.total} submitted</span>
      </div>

      {/* Invite */}
      {reviews.length < MAX_REVIEWERS && (
        <div style={styles.inviteRow}>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') invite() }}
            placeholder="reviewer@company.com"
            style={styles.input}
          />
          <button onClick={invite} disabled={inviting || !email.trim()} style={styles.inviteBtn}>
            {inviting ? 'Inviting…' : 'Invite'}
          </button>
        </div>
      )}
      <p style={styles.hint}>
        Invite up to {MAX_REVIEWERS} recruiters. Each reviews independently — verdicts stay private
        until everyone submits.
      </p>

      {/* Reviewer list */}
      {reviews.length === 0 ? (
        <p style={styles.empty}>No reviewers invited yet.</p>
      ) : (
        <div style={styles.list}>
          {reviews.map(r => {
            const m = verdictMeta(r.verdict)
            const done = r.status === 'submitted'
            return (
              <div key={r.id} style={styles.row}>
                <div style={styles.avatar}>
                  {r.photo_url
                    ? <img src={r.photo_url} alt="" style={styles.avatarImg} />
                    : <span>{(r.full_name ?? '?').charAt(0).toUpperCase()}</span>}
                </div>
                <div style={styles.rowMain}>
                  <span style={styles.rowName}>{r.full_name ?? r.email ?? 'Reviewer'}</span>
                  <span style={styles.rowSub}>
                    {done && r.submitted_at ? `Submitted ${new Date(r.submitted_at).toLocaleDateString()}` : 'Awaiting review'}
                  </span>
                </div>
                {/* Individual verdict hidden until the whole panel is in. */}
                {done ? (
                  agg.allIn && m
                    ? <span style={{ ...styles.chip, color: m.color, backgroundColor: m.bg }}>{m.label}</span>
                    : <span style={{ ...styles.chip, ...styles.chipDone }}>Submitted</span>
                ) : (
                  <span style={{ ...styles.chip, ...styles.chipPending }}>Pending</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Aggregate decision — only once all reviewers have submitted */}
      {agg.allIn && (
        <div style={styles.aggregate}>
          <p style={styles.aggLabel}>Panel decision</p>
          <div style={styles.distRow}>
            {agg.distribution.filter(d => d.count > 0).map(d => {
              const m = verdictMeta(d.value)!
              return (
                <span key={d.value} style={{ ...styles.distChip, color: m.color, backgroundColor: m.bg }}>
                  {d.count} {m.label.toLowerCase()}
                </span>
              )
            })}
          </div>

          {/* Per-reviewer notes */}
          {reviews.some(r => r.private_note) && (
            <div style={styles.notes}>
              {reviews.filter(r => r.private_note).map(r => (
                <div key={r.id} style={styles.noteItem}>
                  <span style={styles.noteName}>{r.full_name ?? 'Reviewer'}</span>
                  <span style={styles.noteBody}>{r.private_note}</span>
                </div>
              ))}
            </div>
          )}

          {agg.recommendation && (
            <p style={styles.reco}>
              Recommended: <strong>{RECOMMENDATION_LABEL[agg.recommendation]}</strong>
            </p>
          )}
          <div style={styles.actions}>
            <button
              onClick={() => onSetStatus('moved_forward')}
              disabled={settingStatus}
              style={{ ...styles.actionBtn, ...styles.advance, ...(agg.recommendation === 'advance' ? styles.recommended : {}) }}
            >
              Advance
            </button>
            <button
              onClick={() => onSetStatus('passed')}
              disabled={settingStatus}
              style={{ ...styles.actionBtn, ...styles.decline, ...(agg.recommendation === 'decline' ? styles.recommended : {}) }}
            >
              Decline
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)', padding: '20px', boxShadow: 'var(--shadow-md)', marginBottom: '16px',
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' },
  title: { fontSize: 'var(--text-base)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' },
  count: { fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)' },
  inviteRow: { display: 'flex', gap: '8px', marginBottom: '8px' },
  input: {
    flex: 1, padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    fontSize: '13px', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-bg-tertiary)',
    outline: 'none', fontFamily: 'var(--font-primary)',
  },
  inviteBtn: {
    padding: '9px 16px', backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none',
    borderRadius: 'var(--radius-md)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', flexShrink: 0,
  },
  hint: { fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', margin: '0 0 14px', lineHeight: 1.5 },
  empty: { fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0 },
  list: { display: 'flex', flexDirection: 'column', gap: '8px' },
  row: { display: 'flex', alignItems: 'center', gap: '12px' },
  avatar: {
    width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
    background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--color-on-primary)', fontSize: '13px', fontWeight: 600,
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  rowMain: { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 },
  rowName: { fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' },
  rowSub: { fontSize: '11px', color: 'var(--color-text-secondary)' },
  chip: { fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', flexShrink: 0 },
  chipPending: { color: 'var(--color-text-secondary)', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' },
  chipDone: { color: 'var(--color-info-text)', background: 'var(--color-info-soft)' },
  aggregate: { marginTop: '18px', paddingTop: '18px', borderTop: '1px solid var(--color-border-light)' },
  aggLabel: {
    fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--color-text-tertiary)', margin: '0 0 12px',
  },
  distRow: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' },
  distChip: { fontSize: '12px', fontWeight: 700, padding: '5px 12px', borderRadius: '999px' },
  notes: { display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' },
  noteItem: { display: 'flex', flexDirection: 'column', gap: '3px', borderLeft: '2px solid var(--color-border)', paddingLeft: '12px' },
  noteName: { fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)' },
  noteBody: { fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  reco: { fontSize: '13px', color: 'var(--color-text-primary)', margin: '0 0 12px' },
  actions: { display: 'flex', gap: '10px' },
  actionBtn: { flex: 1, padding: '10px', borderRadius: 'var(--radius-md)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' },
  advance: {},
  decline: {},
  recommended: { borderColor: 'var(--color-primary)', color: 'var(--color-primary)', background: 'var(--color-primary-soft)' },
}
