// Shared types + helpers for the collaborative panel-review feature.

export type Verdict = 'strong_yes' | 'yes' | 'no' | 'strong_no'
export type ReviewStatus = 'pending' | 'submitted'

export interface Review {
  id: string
  reviewer_id: string
  full_name: string | null
  photo_url?: string | null
  email?: string | null
  verdict: Verdict | null
  status: ReviewStatus
  private_note?: string | null
  submitted_at: string | null
}

export interface Annotation {
  id: string
  submission_id: string
  reviewer_id: string
  replay_timestamp_ms: number
  body: string
  created_at: string
}

export const VERDICTS: { value: Verdict; label: string; color: string; bg: string }[] = [
  { value: 'strong_yes', label: 'Strong yes', color: 'var(--color-success-text)', bg: 'var(--color-success-soft)' },
  { value: 'yes',        label: 'Yes',        color: 'var(--color-success-text)', bg: 'var(--color-success-soft)' },
  { value: 'no',         label: 'No',         color: 'var(--color-warning-text)', bg: 'var(--color-warning-soft)' },
  { value: 'strong_no',  label: 'Strong no',  color: 'var(--color-error-text)',   bg: 'var(--color-error-soft)' },
]

export function verdictMeta(v: Verdict | null) {
  return VERDICTS.find(x => x.value === v) ?? null
}

export interface Aggregate {
  total: number
  submitted: number
  allIn: boolean
  distribution: { value: Verdict; label: string; count: number }[]
  positives: number
  negatives: number
  recommendation: 'advance' | 'decline' | 'split' | null
}

// Majority of submitted verdicts: strong_yes/yes advance, no/strong_no decline.
export function aggregate(reviews: Review[]): Aggregate {
  const submittedReviews = reviews.filter(r => r.status === 'submitted')
  const distribution = VERDICTS.map(v => ({
    value: v.value, label: v.label,
    count: submittedReviews.filter(r => r.verdict === v.value).length,
  }))
  const positives = submittedReviews.filter(r => r.verdict === 'strong_yes' || r.verdict === 'yes').length
  const negatives = submittedReviews.filter(r => r.verdict === 'no' || r.verdict === 'strong_no').length
  const allIn = reviews.length > 0 && submittedReviews.length === reviews.length
  let recommendation: Aggregate['recommendation'] = null
  if (submittedReviews.length > 0) {
    recommendation = positives > negatives ? 'advance' : negatives > positives ? 'decline' : 'split'
  }
  return { total: reviews.length, submitted: submittedReviews.length, allIn, distribution, positives, negatives, recommendation }
}

export const RECOMMENDATION_LABEL: Record<NonNullable<Aggregate['recommendation']>, string> = {
  advance: 'Advance to next round',
  decline: 'Decline',
  split: 'Split panel — your call',
}

// The replay scrubber is indexed by edit step, but annotations are pinned to an
// absolute timestamp (ms). These map between the two against the log timeline.
interface TimedLog { timestamp: number }

export function stepToMs(logs: TimedLog[], step: number): number {
  if (logs.length === 0) return 0
  const i = Math.max(0, Math.min(step, logs.length - 1))
  return logs[i].timestamp
}

export function msToStep(logs: TimedLog[], ms: number): number {
  if (logs.length === 0) return 0
  for (let i = 0; i < logs.length; i++) {
    if (logs[i].timestamp >= ms) return i
  }
  return logs.length
}
