import React, { useState } from 'react'
import { VERDICTS, verdictMeta, type Review, type Verdict } from '../../lib/review'

interface Props {
  review: Review
  submitting: boolean
  onSubmit: (verdict: Verdict, note: string) => void
}

// Reviewer's private scoring panel. Editable until submitted, then locked.
export default function ReviewerPanel({ review, submitting, onSubmit }: Props) {
  const locked = review.status === 'submitted'
  const [verdict, setVerdict] = useState<Verdict | null>(review.verdict)
  const [note, setNote] = useState(review.private_note ?? '')

  if (locked) {
    const m = verdictMeta(review.verdict)
    return (
      <div style={styles.card}>
        <p style={styles.label}>Your review</p>
        <div style={styles.lockedRow}>
          <span style={{ ...styles.verdictChip, color: m?.color, backgroundColor: m?.bg }}>
            {m?.label ?? '—'}
          </span>
          <span style={styles.lockedNote}>Submitted · locked</span>
        </div>
        {review.private_note && <p style={styles.lockedBody}>{review.private_note}</p>}
      </div>
    )
  }

  return (
    <div style={styles.card}>
      <p style={styles.label}>Your verdict</p>
      <div style={styles.verdicts}>
        {VERDICTS.map(v => (
          <button
            key={v.value}
            onClick={() => setVerdict(v.value)}
            style={{
              ...styles.verdictBtn,
              ...(verdict === v.value ? { borderColor: v.color, color: v.color, background: v.bg } : {}),
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      <p style={{ ...styles.label, marginTop: '16px' }}>Private notes</p>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Your reasoning — kept private until all reviews are in"
        style={styles.textarea}
        rows={4}
      />

      <button
        onClick={() => verdict && onSubmit(verdict, note)}
        disabled={!verdict || submitting}
        style={{ ...styles.submit, ...(!verdict || submitting ? styles.submitDisabled : {}) }}
        title={!verdict ? 'Pick a verdict first' : ''}
      >
        {submitting ? 'Submitting…' : 'Submit review'}
      </button>
      <p style={styles.hint}>Submitting locks your verdict and notes — you can't edit afterward.</p>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'var(--color-bg-secondary)', border: '1px solid var(--color-primary-soft-border)',
    borderRadius: 'var(--radius-xl)', padding: '20px', boxShadow: 'var(--shadow-md)', marginBottom: '16px',
  },
  label: {
    fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--color-text-tertiary)', margin: '0 0 12px',
  },
  verdicts: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' },
  verdictBtn: {
    padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', fontSize: '13px',
    fontWeight: 600, cursor: 'pointer', transition: 'all var(--transition-fast)',
  },
  textarea: {
    width: '100%', padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-base)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-bg-tertiary)',
    boxSizing: 'border-box', resize: 'vertical', fontFamily: 'var(--font-primary)', outline: 'none', lineHeight: 1.6,
  },
  submit: {
    marginTop: '14px', width: '100%', padding: '11px 16px', backgroundColor: 'var(--color-primary)',
    color: 'var(--color-on-primary)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
    fontWeight: 'var(--weight-semibold)', cursor: 'pointer', boxShadow: 'var(--shadow-primary)',
  },
  submitDisabled: { opacity: 0.5, cursor: 'not-allowed', boxShadow: 'none' },
  hint: { fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', margin: '10px 0 0', textAlign: 'center' },
  lockedRow: { display: 'flex', alignItems: 'center', gap: '12px' },
  verdictChip: { fontSize: '13px', fontWeight: 700, padding: '5px 14px', borderRadius: '999px' },
  lockedNote: { fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' },
  lockedBody: { fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', margin: '12px 0 0', lineHeight: 1.6, whiteSpace: 'pre-wrap' },
}
