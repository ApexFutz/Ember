import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import { supabase } from '../../lib/supabase'
import { useDemo } from '../../hooks/useDemo'
import { useAuth } from '../../hooks/useAuth'
import { extractPasteEvents, extractFocusEvents, formatElapsed } from '../../lib/pasteDetection'
import { toast, extractMessage } from '../../lib/toast'
import { msToStep, stepToMs, type Review, type Annotation, type Verdict } from '../../lib/review'
import ReviewerPanel from '../../components/review/ReviewerPanel'
import OwnerReviewPanel from '../../components/review/OwnerReviewPanel'

interface LogEntry {
  timestamp: number
  file: string
  type: 'insert' | 'delete' | 'paste' | 'focus_loss'
  content: string
  position: number
}

interface FileTab {
  name: string
  content: string
}

interface SubmissionDetail {
  candidate_name: string | null
  candidate_headline: string | null
  candidate_id: string
  role_title: string
  assessment_id: string
  recruiter_notes: string | null
}

interface Score {
  score: number | null
  tests_passed: number | null
  tests_total: number | null
  metrics: { edit_count?: number; paste_count?: number; duration_s?: number | null } | null
}

interface StatusEvent {
  id: string
  from_status: string | null
  to_status: string
  changed_at: string
}

const STATUS_LABELS: Record<string, string> = {
  pending_review: 'Pending',
  reviewed: 'Reviewed',
  moved_forward: 'Advanced',
  passed: 'Rejected',
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} minute${m !== 1 ? 's' : ''} ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hour${h !== 1 ? 's' : ''} ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} day${d !== 1 ? 's' : ''} ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo} month${mo !== 1 ? 's' : ''} ago`
  return `${Math.floor(mo / 12)} year${Math.floor(mo / 12) !== 1 ? 's' : ''} ago`
}

export default function Replay() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isDemo, guard } = useDemo()
  const { user } = useAuth()

  const [submission, setSubmission] = useState<SubmissionDetail | null>(null)
  const [score, setScore] = useState<Score | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [finalFiles, setFinalFiles] = useState<FileTab[]>([])
  const [loading, setLoading] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [displayContent, setDisplayContent] = useState('')
  const [activeReplayFile, setActiveReplayFile] = useState('')
  const [autoSubmitted, setAutoSubmitted] = useState(false)
  const [statusEvents, setStatusEvents] = useState<StatusEvent[]>([])
  const [skills, setSkills] = useState<string[]>([])

  // Collaborative review
  const [mode, setMode] = useState<'owner' | 'reviewer' | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [ownReview, setOwnReview] = useState<Review | null>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [annFilter, setAnnFilter] = useState<string>('all') // 'all' | reviewer_id (owner)
  const [inviting, setInviting] = useState(false)
  const [submittingReview, setSubmittingReview] = useState(false)
  const [settingStatus, setSettingStatus] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerMs, setComposerMs] = useState(0)
  const [composerBody, setComposerBody] = useState('')
  const [savingAnn, setSavingAnn] = useState(false)

  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!id || !user) return
    async function load() {
      const me = user!.id

      // Replay context resolves for the role owner AND invited reviewers
      // (SECURITY DEFINER RPC, so reviewers don't depend on the owner-only view).
      const { data: ctx, error: ctxErr } = await supabase.rpc('get_review_context', { p_submission_id: id })
      if (ctxErr || !ctx) { setLoading(false); return }
      setSubmission({
        candidate_name: ctx.candidate_name, candidate_headline: ctx.candidate_headline,
        candidate_id: ctx.candidate_id, role_title: ctx.role_title,
        assessment_id: ctx.assessment_id, recruiter_notes: null,
      })
      if (Array.isArray(ctx.candidate_skills)) setSkills(ctx.candidate_skills)
      const assessmentId = ctx.assessment_id as string

      // Owner vs reviewer: get_submission_reviews succeeds only for the owner.
      const ownerRes = await supabase.rpc('get_submission_reviews', { p_submission_id: id })
      const owner = !ownerRes.error
      setMode(owner ? 'owner' : 'reviewer')
      if (owner) {
        setReviews((ownerRes.data ?? []) as Review[])
      } else {
        const { data: mine } = await supabase
          .from('reviews').select('*')
          .eq('submission_id', id).eq('reviewer_id', me).maybeSingle()
        if (mine) setOwnReview({ ...(mine as any), full_name: 'You' })
      }

      // Annotations — RLS returns all for the owner, own-only for a reviewer.
      const { data: anns } = await supabase
        .from('replay_annotations').select('*')
        .eq('submission_id', id).order('replay_timestamp_ms', { ascending: true })
      setAnnotations((anns ?? []) as Annotation[])

      // Owner-only extras (private notes, status history, replay_viewed flag).
      if (owner) {
        const { data: noteRow } = await supabase
          .from('submission_notes').select('body').eq('submission_id', id).maybeSingle()
        setNotes(noteRow?.body ?? '')
        const { data: events } = await supabase
          .from('status_events').select('id, from_status, to_status, changed_at')
          .eq('submission_id', id).order('changed_at', { ascending: true })
        if (events) setStatusEvents(events)
        if (!isDemo) {
          await supabase.from('submissions').update({ replay_viewed: true }).eq('id', id)
        }
      }

      // Scoring + metrics (owner via owner RLS, reviewer via reviewer-read RLS).
      const { data: scoreData } = await supabase
        .from('submissions').select('score, tests_passed, tests_total, metrics').eq('id', id).single()
      if (scoreData) setScore(scoreData)

      // Replay logs + final files.
      const { data: logData } = await supabase
        .from('assessment_logs').select('log').eq('assessment_id', assessmentId).single()
      if (logData?.log) setLogs(logData.log)

      const { data: assessmentData } = await supabase
        .from('assessments').select('files, auto_submitted').eq('id', assessmentId).single()
      if (assessmentData?.auto_submitted) setAutoSubmitted(true)
      if (assessmentData?.files) {
        setFinalFiles(assessmentData.files)
        if (assessmentData.files.length > 0) {
          setDisplayContent(assessmentData.files[0].content)
          setActiveReplayFile(assessmentData.files[0].name)
        }
      }

      setLoading(false)
    }
    load()
  }, [id, user])

  // Reconstruct content up to a given step
  function reconstructAtStep(step: number) {
    // Build file contents by replaying logs up to step
    const fileContents: Record<string, string> = {}

    for (let i = 0; i < step && i < logs.length; i++) {
      const entry = logs[i]
      if (entry.type === 'focus_loss') continue // not an edit
      if (!fileContents[entry.file]) fileContents[entry.file] = ''

      const content = fileContents[entry.file]
      const pos = entry.position

      if (entry.type === 'insert' || entry.type === 'paste') {
        fileContents[entry.file] =
          content.slice(0, pos) + entry.content + content.slice(pos)
      } else if (entry.type === 'delete') {
        fileContents[entry.file] =
          content.slice(0, pos) + content.slice(pos + entry.content.length)
      }
    }

    // Show the file that was most recently edited
    if (step > 0 && step <= logs.length) {
      const lastFile = logs[step - 1]?.file
      if (lastFile && fileContents[lastFile] !== undefined) {
        setActiveReplayFile(lastFile)
        setDisplayContent(fileContents[lastFile])
        return
      }
    }

    // Default to first file
    const firstFile = Object.keys(fileContents)[0]
    if (firstFile) {
      setActiveReplayFile(firstFile)
      setDisplayContent(fileContents[firstFile])
    }
  }

  // Playback
  useEffect(() => {
    if (!playing) {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current)
      return
    }

    if (currentStep >= logs.length) {
      setPlaying(false)
      return
    }

    playIntervalRef.current = setInterval(() => {
      setCurrentStep(prev => {
        const next = prev + 1
        if (next >= logs.length) {
          setPlaying(false)
          reconstructAtStep(logs.length)
          return logs.length
        }
        reconstructAtStep(next)
        return next
      })
    }, 150 / speed)

    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current)
    }
  }, [playing, speed, logs.length])

  function handlePlayPause() {
    if (currentStep >= logs.length) {
      // Restart from beginning
      setCurrentStep(0)
      reconstructAtStep(0)
    }
    setPlaying(!playing)
  }

  function handleScrub(step: number) {
    setPlaying(false)
    setCurrentStep(step)
    reconstructAtStep(step)
  }

  function showFinalCode() {
    setPlaying(false)
    setCurrentStep(logs.length)
    if (finalFiles.length > 0) {
      setActiveReplayFile(finalFiles[0].name)
      setDisplayContent(finalFiles[0].content)
    }
  }

  async function saveNotes(value: string) {
    if (!id) return
    if (guard()) return
    setSavingNotes(true)
    await supabase
      .from('submission_notes')
      .upsert({ submission_id: id, body: value, updated_at: new Date().toISOString() },
        { onConflict: 'submission_id' })
    setSavingNotes(false)
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2000)
  }

  // Autosave on blur, debounced so a quick blur/refocus doesn't double-write.
  function scheduleSave(value: string) {
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => saveNotes(value), 500)
  }

  // ── Collaborative review handlers ──
  async function handleInvite(email: string) {
    if (guard()) return
    setInviting(true)
    const { data, error } = await supabase.rpc('invite_reviewer', { p_submission_id: id, p_email: email })
    if (error) {
      toast.error('Could not invite reviewer', extractMessage(error))
    } else if (data) {
      setReviews(prev => [...prev, data as Review])
      toast.success(`Invited ${(data as Review).full_name ?? email}`)
    }
    setInviting(false)
  }

  async function handleSubmitReview(verdict: Verdict, note: string) {
    if (guard() || !ownReview) return
    setSubmittingReview(true)
    const submitted_at = new Date().toISOString()
    const { error } = await supabase
      .from('reviews')
      .update({ verdict, private_note: note, status: 'submitted', submitted_at })
      .eq('id', ownReview.id)
    if (error) {
      toast.error('Could not submit review', extractMessage(error))
    } else {
      setOwnReview({ ...ownReview, verdict, private_note: note, status: 'submitted', submitted_at })
      toast.success('Review submitted')
    }
    setSubmittingReview(false)
  }

  async function handleSetStatus(status: 'moved_forward' | 'passed') {
    if (guard()) return
    setSettingStatus(true)
    const { error } = await supabase.from('submissions').update({ status }).eq('id', id)
    if (error) toast.error('Could not update status', extractMessage(error))
    else toast.success(status === 'moved_forward' ? 'Candidate advanced' : 'Candidate declined')
    setSettingStatus(false)
  }

  function openComposer() {
    setPlaying(false)
    setComposerMs(stepToMs(logs, currentStep))
    setComposerBody('')
    setComposerOpen(true)
  }

  async function saveAnnotation() {
    if (guard() || !composerBody.trim() || !user) return
    setSavingAnn(true)
    const { data, error } = await supabase
      .from('replay_annotations')
      .insert({ submission_id: id, reviewer_id: user.id, replay_timestamp_ms: composerMs, body: composerBody.trim() })
      .select('*').single()
    if (error) {
      toast.error('Could not add note', extractMessage(error))
    } else if (data) {
      setAnnotations(prev => [...prev, data as Annotation].sort((a, b) => a.replay_timestamp_ms - b.replay_timestamp_ms))
      setComposerOpen(false)
      setComposerBody('')
    }
    setSavingAnn(false)
  }

  function reviewerName(rid: string): string {
    if (rid === user?.id) return 'You'
    return reviews.find(r => r.reviewer_id === rid)?.full_name ?? 'Reviewer'
  }

  const canAnnotate = mode === 'owner' || (!!ownReview && ownReview.status !== 'submitted')
  const visibleAnnotations = annotations.filter(a => annFilter === 'all' || a.reviewer_id === annFilter)

  // Large-paste events (potential external-code flags), with snippets + timing.
  const pasteEvents = extractPasteEvents(logs)
  const focusEvents = extractFocusEvents(logs)
  const startTs = logs[0]?.timestamp ?? 0

  function getLanguage(filename: string) {
    if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return 'typescript'
    if (filename.endsWith('.js') || filename.endsWith('.jsx')) return 'javascript'
    if (filename.endsWith('.py')) return 'python'
    if (filename.endsWith('.css')) return 'css'
    if (filename.endsWith('.html')) return 'html'
    return 'plaintext'
  }

  if (loading) return <div style={styles.loading}>Loading replay...</div>

  return (
    <div style={styles.page}>
      <button onClick={() => navigate('/recruiter/dashboard')} style={styles.backBtn}>
        ← Back to dashboard
      </button>

      <div style={styles.header}>
        <h1 style={styles.title}>{submission?.candidate_name ?? 'Candidate'}</h1>
        <p style={styles.subtitle}>
          {submission?.candidate_headline} · {submission?.role_title}
        </p>
        <div style={styles.skillRow}>
          {skills.length > 0 ? (
            skills.map(sk => <span key={sk} style={styles.skillChip}>{sk}</span>)
          ) : (
            <span style={styles.noSkills}>No skills listed</span>
          )}
        </div>
        {autoSubmitted && (
          <span style={styles.autoBadge}>⏱ Auto-submitted — time expired</span>
        )}
      </div>

      {mode === 'reviewer' && ownReview && (
        <ReviewerPanel review={ownReview} submitting={submittingReview} onSubmit={handleSubmitReview} />
      )}

      {mode === 'owner' && statusEvents.length > 0 && (
        <div style={styles.timelineCard}>
          <p style={styles.timelineLabel}>Status history</p>
          <div style={styles.timeline}>
            {statusEvents.map((ev, i) => (
              <div key={ev.id} style={styles.timelineRow}>
                <div style={styles.timelineMarker}>
                  <span style={{ ...styles.timelineDot, ...(i === statusEvents.length - 1 ? styles.timelineDotActive : {}) }} />
                  {i < statusEvents.length - 1 && <span style={styles.timelineLine} />}
                </div>
                <div style={styles.timelineContent}>
                  <span style={styles.timelineStatus}>
                    {ev.from_status ? '→ ' : ''}{STATUS_LABELS[ev.to_status] ?? ev.to_status}
                  </span>
                  <span style={styles.timelineTime} title={new Date(ev.changed_at).toLocaleString()}>
                    {relativeTime(ev.changed_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {logs.length === 0 ? (
        <div style={styles.noLogs}>
          No replay data available for this submission.
        </div>
      ) : (
        <>
          {/* Replay editor */}
          <div style={styles.editorCard}>
            <div style={styles.editorHeader}>
              <span style={styles.fileName}>{activeReplayFile || 'main.js'}</span>
              <span style={styles.stepIndicator}>
                {currentStep} / {logs.length} edits
              </span>
            </div>
            <div style={styles.editorWrapper}>
              <Editor
                height="400px"
                language={getLanguage(activeReplayFile)}
                value={displayContent}
                options={{
                  readOnly: true,
                  fontSize: 14,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  lineNumbers: 'on',
                  domReadOnly: true,
                }}
                theme="vs-dark"
              />
            </div>
          </div>

          {/* Playback controls */}
          <div style={styles.controls}>
            <button onClick={handlePlayPause} style={styles.playBtn}>
              {playing ? '⏸ Pause' : currentStep >= logs.length ? '↻ Replay' : '▶ Play'}
            </button>

            {/* Scrubber */}
            <div style={styles.scrubberWrapper}>
              <input
                type="range"
                min={0}
                max={logs.length}
                value={currentStep}
                onChange={e => handleScrub(Number(e.target.value))}
                style={styles.scrubber}
              />
              {/* Large-paste tick marks */}
              {pasteEvents.map(ev => (
                <div
                  key={`p${ev.step}`}
                  onClick={() => handleScrub(ev.step)}
                  style={{
                    ...styles.pasteMarker,
                    left: `${(ev.step / logs.length) * 100}%`,
                  }}
                  title={`Large paste — ${ev.charCount} characters at ${formatElapsed(ev.timestamp, startTs)}`}
                />
              ))}
              {/* Focus-loss tick marks */}
              {focusEvents.map(ev => (
                <div
                  key={`f${ev.step}`}
                  onClick={() => handleScrub(ev.step)}
                  style={{
                    ...styles.focusMarker,
                    left: `${(ev.step / logs.length) * 100}%`,
                  }}
                  title={`Left the tab at ${formatElapsed(ev.timestamp, startTs)}`}
                />
              ))}
              {/* Reviewer annotation flags */}
              {visibleAnnotations.map(a => {
                const step = msToStep(logs, a.replay_timestamp_ms)
                return (
                  <div
                    key={a.id}
                    onClick={() => handleScrub(step)}
                    style={{ ...styles.annMarker, left: `${(step / logs.length) * 100}%` }}
                    title={`${reviewerName(a.reviewer_id)}: ${a.body}`}
                  />
                )
              })}
            </div>

            {/* Speed */}
            <div style={styles.speedControls}>
              <button
                onClick={() => setSpeed(1)}
                style={speed === 1 ? styles.speedBtnActive : styles.speedBtn}
              >
                1x
              </button>
              <button
                onClick={() => setSpeed(2)}
                style={speed === 2 ? styles.speedBtnActive : styles.speedBtn}
              >
                2x
              </button>
            </div>

            <button onClick={showFinalCode} style={styles.finalBtn}>
              Final code
            </button>

            {canAnnotate && (
              <button onClick={openComposer} style={styles.noteBtn2}>
                + Note
              </button>
            )}
          </div>

          {/* Annotation composer (pinned to the paused moment) */}
          {composerOpen && (
            <div style={styles.composer}>
              <span style={styles.composerTime}>
                📍 Pinned at {formatElapsed(composerMs, startTs)}
              </span>
              <textarea
                value={composerBody}
                onChange={e => setComposerBody(e.target.value)}
                placeholder="Comment on this moment…"
                style={styles.composerArea}
                rows={2}
                autoFocus
              />
              <div style={styles.composerActions}>
                <button onClick={() => setComposerOpen(false)} style={styles.composerCancel}>Cancel</button>
                <button
                  onClick={saveAnnotation}
                  disabled={savingAnn || !composerBody.trim()}
                  style={{ ...styles.composerSave, ...(savingAnn || !composerBody.trim() ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                >
                  {savingAnn ? 'Saving…' : 'Add note'}
                </button>
              </div>
            </div>
          )}

          {/* Annotations list */}
          {annotations.length > 0 && (
            <div style={styles.annPanel}>
              <div style={styles.annHead}>
                <span style={styles.annTitle}>Reviewer notes</span>
                {mode === 'owner' && reviews.length > 0 && (
                  <select value={annFilter} onChange={e => setAnnFilter(e.target.value)} style={styles.annFilter}>
                    <option value="all">All reviewers</option>
                    {reviews.map(r => (
                      <option key={r.reviewer_id} value={r.reviewer_id}>{r.full_name ?? r.email}</option>
                    ))}
                  </select>
                )}
              </div>
              <div style={styles.annList}>
                {visibleAnnotations.map(a => (
                  <button key={a.id} onClick={() => handleScrub(msToStep(logs, a.replay_timestamp_ms))} style={styles.annItem}>
                    <div style={styles.annItemTop}>
                      <span style={styles.annItemTime}>⏱ {formatElapsed(a.replay_timestamp_ms, startTs)}</span>
                      <span style={styles.annItemName}>{reviewerName(a.reviewer_id)}</span>
                    </div>
                    <span style={styles.annItemBody}>{a.body}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Paste Events panel */}
          {pasteEvents.length > 0 && (
            <div style={styles.pastePanel}>
              <div style={styles.pastePanelHead}>
                <span style={styles.pastePanelTitle}>Paste Events</span>
                <span style={styles.pasteCountBadge}>
                  {pasteEvents.length} paste event{pasteEvents.length !== 1 ? 's' : ''} detected
                </span>
              </div>
              <p style={styles.pastePanelHint}>
                Marked in red on the timeline. Click an entry to jump to that moment.
              </p>
              <div style={styles.pasteList}>
                {pasteEvents.map(ev => (
                  <button
                    key={ev.step}
                    onClick={() => handleScrub(ev.step)}
                    style={styles.pasteItem}
                  >
                    <div style={styles.pasteItemTop}>
                      <span style={styles.pasteItemTime}>⏱ {formatElapsed(ev.timestamp, startTs)}</span>
                      <span style={styles.pasteItemCount}>{ev.charCount} chars</span>
                      <span style={styles.pasteItemFile}>{ev.file}</span>
                    </div>
                    <code style={styles.pasteSnippet}>
                      {ev.snippet.replace(/\n/g, '↵')}{ev.charCount > ev.snippet.length ? '…' : ''}
                    </code>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Focus Events panel */}
          {focusEvents.length > 0 && (
            <div style={styles.pastePanel}>
              <div style={styles.pastePanelHead}>
                <span style={styles.pastePanelTitle}>Focus Events</span>
                <span style={styles.focusCountBadge}>
                  {focusEvents.length} focus loss{focusEvents.length !== 1 ? 'es' : ''} detected
                </span>
              </div>
              <p style={styles.pastePanelHint}>
                Tab switches / window blur (amber on the timeline). Context, not a verdict —
                legitimate reasons exist. Click an entry to jump to that moment.
              </p>
              <div style={styles.pasteList}>
                {focusEvents.map(ev => (
                  <button
                    key={ev.step}
                    onClick={() => handleScrub(ev.step)}
                    style={styles.focusItem}
                  >
                    <span style={styles.pasteItemTime}>⏱ {formatElapsed(ev.timestamp, startTs)}</span>
                    <span style={styles.focusItemLabel}>Left the tab</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Owner-only collaborative review panel */}
          {mode === 'owner' && (
            <OwnerReviewPanel
              reviews={reviews}
              inviting={inviting}
              onInvite={handleInvite}
              settingStatus={settingStatus}
              onSetStatus={handleSetStatus}
            />
          )}

          {/* Results summary */}
          {score && score.tests_total != null && score.tests_total > 0 && (
            <div style={styles.summaryCard}>
              <div style={styles.summaryItem}>
                <span style={styles.summaryNum}>
                  {score.tests_passed}/{score.tests_total}
                </span>
                <span style={styles.summaryLabel}>Tests passed</span>
              </div>
              <div style={styles.summaryItem}>
                <span style={styles.summaryNum}>{Math.round((score.score ?? 0) * 100)}%</span>
                <span style={styles.summaryLabel}>Score</span>
              </div>
              {score.metrics?.duration_s != null && (
                <div style={styles.summaryItem}>
                  <span style={styles.summaryNum}>{Math.round(score.metrics.duration_s / 60)}m</span>
                  <span style={styles.summaryLabel}>Time used</span>
                </div>
              )}
              <div style={styles.summaryItem}>
                <span style={styles.summaryNum}>{score.metrics?.edit_count ?? 0}</span>
                <span style={styles.summaryLabel}>Edits</span>
              </div>
              <div style={styles.summaryItem}>
                <span style={styles.summaryNum}>{score.metrics?.paste_count ?? 0}</span>
                <span style={styles.summaryLabel}>Pastes</span>
              </div>
            </div>
          )}

          {/* Notes — owner-only, autosave on blur, never shown to the candidate */}
          {mode === 'owner' && (
          <div style={styles.notesCard}>
            <div style={styles.notesHeader}>
              <p style={styles.notesLabel}>Private notes</p>
              <span style={{ ...styles.notesSaved, opacity: (notesSaved || savingNotes) ? 1 : 0 }}>
                {savingNotes ? 'Saving…' : 'Saved'}
              </span>
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={e => scheduleSave(e.target.value)}
              placeholder="Private notes — only you can see these"
              style={styles.notesArea}
              rows={4}
            />
          </div>
          )}
        </>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: '860px' },
  loading: { padding: '2rem', color: 'var(--color-text-secondary)', fontSize: '14px' },
  backBtn: {
    background: 'none', border: 'none', color: 'var(--color-text-secondary)',
    fontSize: 'var(--text-sm)', cursor: 'pointer', padding: 0, marginBottom: '16px', display: 'block',
  },
  header: { marginBottom: '24px' },
  title: { fontSize: 'var(--text-3xl)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)', margin: '0 0 4px', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
  subtitle: { fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)', margin: 0 },
  skillRow: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' },
  skillChip: {
    fontSize: '12px', fontWeight: '500', color: 'var(--color-text-secondary)',
    background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-light)',
    borderRadius: '999px', padding: '3px 11px',
  },
  noSkills: { fontSize: '12px', color: 'var(--color-text-tertiary)', fontStyle: 'italic' },
  autoBadge: {
    display: 'inline-block', marginTop: '10px', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)',
    color: 'var(--color-error-text)', background: 'var(--color-error-soft)', border: '1px solid var(--color-error)',
    borderRadius: '999px', padding: '4px 12px', letterSpacing: '0.02em',
  },
  timelineCard: {
    background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)', padding: '20px 24px', marginBottom: '24px', boxShadow: 'var(--shadow-md)',
  },
  timelineLabel: {
    fontSize: '12px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--color-text-tertiary)', margin: '0 0 16px',
  },
  timeline: { display: 'flex', flexDirection: 'column' },
  timelineRow: { display: 'flex', gap: '14px', minHeight: '40px' },
  timelineMarker: { display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 },
  timelineDot: {
    width: '12px', height: '12px', borderRadius: '50%', marginTop: '2px',
    background: 'var(--color-bg-tertiary)', border: '2px solid var(--color-border)',
  },
  timelineDotActive: { background: 'var(--color-primary)', borderColor: 'var(--color-primary)' },
  timelineLine: { flex: 1, width: '2px', background: 'var(--color-border-light)', margin: '2px 0' },
  timelineContent: { display: 'flex', flexDirection: 'column', gap: '2px', paddingBottom: '16px' },
  timelineStatus: { fontSize: '14px', fontWeight: '600', color: 'var(--color-text-primary)' },
  timelineTime: { fontSize: '12px', color: 'var(--color-text-secondary)', cursor: 'default' },
  noLogs: {
    padding: '40px', textAlign: 'center', fontSize: '14px', color: 'var(--color-text-secondary)',
    background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)',
  },
  editorCard: {
    background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-xl)', overflow: 'hidden',
    border: '1px solid var(--color-border)', marginBottom: '16px', boxShadow: 'var(--shadow-md)',
  },
  editorHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 16px', backgroundColor: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border)',
  },
  fileName: { fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', fontWeight: 'var(--weight-medium)', fontFamily: 'var(--font-mono)' },
  stepIndicator: { fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' },
  editorWrapper: { height: '400px' },
  controls: {
    display: 'flex', alignItems: 'center', gap: '16px',
    padding: '16px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)', marginBottom: '16px', boxShadow: 'var(--shadow-md)',
  },
  playBtn: {
    padding: '9px 18px', backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary)',
    border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
    fontWeight: 'var(--weight-semibold)', cursor: 'pointer', whiteSpace: 'nowrap', minWidth: '90px',
  },
  scrubberWrapper: { flex: 1, position: 'relative', display: 'flex', alignItems: 'center' },
  scrubber: { width: '100%', cursor: 'pointer', accentColor: 'var(--color-primary)' },
  pasteMarker: {
    position: 'absolute', top: '50%', transform: 'translateX(-50%) translateY(-50%)',
    width: '3px', height: '16px', backgroundColor: 'var(--color-error)',
    borderRadius: '1px', cursor: 'pointer', zIndex: 2,
  },
  focusMarker: {
    position: 'absolute', top: '50%', transform: 'translateX(-50%) translateY(-50%)',
    width: '3px', height: '16px', backgroundColor: 'var(--color-warning, #f59e0b)',
    borderRadius: '1px', cursor: 'pointer', zIndex: 2,
  },
  annMarker: {
    position: 'absolute', top: '50%', transform: 'translateX(-50%) translateY(-50%)',
    width: '10px', height: '10px', backgroundColor: 'var(--color-info, #3b82f6)',
    border: '2px solid var(--color-bg-secondary)', borderRadius: '50%', cursor: 'pointer', zIndex: 3,
  },
  noteBtn2: {
    padding: '8px 14px', border: '1px solid var(--color-info, #3b82f6)', borderRadius: 'var(--radius-md)',
    background: 'var(--color-info-soft)', fontSize: 'var(--text-xs)', color: 'var(--color-info-text)',
    cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 'var(--weight-semibold)',
  },
  composer: {
    background: 'var(--color-bg-secondary)', border: '1px solid var(--color-info, #3b82f6)',
    borderRadius: 'var(--radius-xl)', padding: '16px', marginBottom: '16px', boxShadow: 'var(--shadow-md)',
  },
  composerTime: { fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-info-text)', display: 'block', marginBottom: '10px', fontFamily: 'var(--font-mono)' },
  composerArea: {
    width: '100%', padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-base)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-bg-tertiary)',
    boxSizing: 'border-box', resize: 'vertical', fontFamily: 'var(--font-primary)', outline: 'none', lineHeight: 1.6,
  },
  composerActions: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' },
  composerCancel: {
    padding: '8px 14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    background: 'transparent', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontWeight: 'var(--weight-medium)',
  },
  composerSave: {
    padding: '8px 16px', border: 'none', borderRadius: 'var(--radius-md)', background: 'var(--color-primary)',
    color: 'var(--color-on-primary)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', cursor: 'pointer',
  },
  annPanel: {
    background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)', padding: '20px', marginBottom: '16px',
  },
  annHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' },
  annTitle: { fontSize: 'var(--text-base)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' },
  annFilter: {
    padding: '6px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-bg-tertiary)', cursor: 'pointer', outline: 'none',
  },
  annList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  annItem: {
    display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
    background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-light)',
    borderLeft: '3px solid var(--color-info, #3b82f6)', borderRadius: 'var(--radius-md)', padding: '10px 12px',
  },
  annItemTop: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' },
  annItemTime: { fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-info-text)', fontFamily: 'var(--font-mono)' },
  annItemName: { fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 'var(--weight-medium)' },
  annItemBody: { fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', lineHeight: 1.5 },
  speedControls: { display: 'flex', gap: '4px' },
  speedBtn: {
    padding: '7px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    background: 'var(--color-bg-tertiary)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', cursor: 'pointer',
  },
  speedBtnActive: {
    padding: '7px 12px', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-md)',
    background: 'var(--color-primary)', fontSize: 'var(--text-xs)', color: 'var(--color-on-primary)', cursor: 'pointer', fontWeight: 'var(--weight-semibold)',
  },
  finalBtn: {
    padding: '8px 16px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    background: 'transparent', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 'var(--weight-medium)',
  },
  pastePanel: {
    background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)', padding: '20px', marginBottom: '16px',
  },
  pastePanelHead: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' },
  pastePanelTitle: {
    fontSize: 'var(--text-base)', fontWeight: 'var(--weight-semibold)',
    color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)',
  },
  pasteCountBadge: {
    fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-error-text)',
    background: 'var(--color-error-soft)', border: '1px solid var(--color-error)',
    borderRadius: '999px', padding: '3px 10px',
  },
  pastePanelHint: { fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', margin: '0 0 14px' },
  pasteList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  pasteItem: {
    display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
    background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-light)',
    borderLeft: '3px solid var(--color-error)', borderRadius: 'var(--radius-md)', padding: '10px 12px',
  },
  pasteItemTop: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' },
  pasteItemTime: {
    fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)',
    fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)',
  },
  pasteItemCount: { fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-error-text)' },
  pasteItemFile: { fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginLeft: 'auto' },
  pasteSnippet: {
    display: 'block', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  focusCountBadge: {
    fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-warning-text, #92400e)',
    background: 'var(--color-warning-soft, #fef3c7)', border: '1px solid var(--color-warning, #f59e0b)',
    borderRadius: '999px', padding: '3px 10px',
  },
  focusItem: {
    display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left', cursor: 'pointer',
    background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-light)',
    borderLeft: '3px solid var(--color-warning, #f59e0b)', borderRadius: 'var(--radius-md)', padding: '10px 12px',
  },
  focusItemLabel: { fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' },
  summaryCard: {
    display: 'flex', gap: '12px', flexWrap: 'wrap',
    background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)', padding: '20px', boxShadow: 'var(--shadow-md)', marginBottom: '16px',
  },
  summaryItem: {
    display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '80px',
  },
  summaryNum: {
    fontSize: 'var(--text-2xl)', fontWeight: 'var(--weight-semibold)',
    color: 'var(--color-primary)', fontFamily: 'var(--font-display)',
  },
  summaryLabel: {
    fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 'var(--weight-medium)',
  },
  notesCard: {
    background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: '20px', boxShadow: 'var(--shadow-md)',
  },
  notesHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px',
  },
  notesLabel: {
    fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--color-text-tertiary)', margin: 0,
  },
  notesArea: {
    width: '100%', padding: '10px 14px', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)', fontSize: 'var(--text-base)', color: 'var(--color-text-primary)',
    backgroundColor: 'var(--color-bg-tertiary)',
    boxSizing: 'border-box', resize: 'vertical', fontFamily: 'var(--font-primary)',
    outline: 'none', lineHeight: 1.6,
  },
  notesFooter: {
    display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
    gap: '12px', marginTop: '12px',
  },
  notesSaved: {
    fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-success)',
    transition: 'opacity 0.6s ease',
  },
  notesBtn: {
    padding: '9px 18px', backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary)',
    border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
    fontWeight: 'var(--weight-semibold)', cursor: 'pointer',
  },
}