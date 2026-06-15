// Edge Function: send-notification-email
// Transactional email for Ember's highest-value events, sent via Resend and
// driven by database webhooks (see the notify_email() trigger). Each handler
// resolves recipients server-side (service role), respects the per-user
// email_notifications opt-out, debounces new-message emails, and writes an audit
// row to notification_log. Also serves a functional unsubscribe GET endpoint.
//
// Env: RESEND_API_KEY, NOTIFY_WEBHOOK_SECRET, APP_URL, EMAIL_FROM (optional),
//      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
}

const APP_URL = (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '')
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'Ember <onboarding@resend.dev>'
const MESSAGE_DEBOUNCE_MIN = 5

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ── data helpers ──────────────────────────────────────────────────────────────
async function getEmail(userId: string): Promise<string | null> {
  const { data } = await supabase.auth.admin.getUserById(userId)
  return data.user?.email ?? null
}

async function getProfile(userId: string): Promise<{ full_name: string | null; opted_in: boolean }> {
  const { data } = await supabase
    .from('profiles')
    .select('full_name, email_notifications')
    .eq('id', userId)
    .maybeSingle()
  return { full_name: data?.full_name ?? null, opted_in: data?.email_notifications !== false }
}

async function recentlyNotified(recipientId: string, event: string, minutes: number): Promise<boolean> {
  const since = new Date(Date.now() - minutes * 60_000).toISOString()
  const { count } = await supabase
    .from('notification_log')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', recipientId)
    .eq('event', event)
    .gte('created_at', since)
  return (count ?? 0) > 0
}

async function logSent(recipientId: string, event: string) {
  await supabase.from('notification_log').insert({ recipient_id: recipientId, event })
}

function shell(bodyHtml: string, recipientId: string): string {
  const unsubscribeUrl =
    `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification-email?action=unsubscribe&uid=${recipientId}`
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
    <div style="font-size:22px;font-weight:700;color:#f97316;padding:16px 0">Ember<span style="color:#1a1a1a">.</span></div>
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #eee;margin:28px 0 12px" />
    <p style="font-size:12px;color:#888;line-height:1.5">
      You're receiving this because you have an Ember account.
      <a href="${unsubscribeUrl}" style="color:#888">Unsubscribe from these emails</a>.
    </p>
  </div>`
}

function button(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;
    padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;margin:8px 0">${label}</a>`
}

async function sendEmail(opts: {
  recipientId: string; to: string; subject: string; heading: string; body: string;
  linkUrl: string; linkLabel: string; event: string
}) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set; skipping email')
    return false
  }
  const html = shell(
    `<h1 style="font-size:20px;margin:0 0 12px">${opts.heading}</h1>
     <p style="font-size:14px;line-height:1.6;color:#444">${opts.body}</p>
     ${button(opts.linkUrl, opts.linkLabel)}`,
    opts.recipientId,
  )
  const text = `${opts.heading}\n\n${opts.body.replace(/<[^>]+>/g, '')}\n\n${opts.linkLabel}: ${opts.linkUrl}\n\n` +
    `— Ember\nUnsubscribe: ${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification-email?action=unsubscribe&uid=${opts.recipientId}`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, to: opts.to, subject: opts.subject, html, text }),
  })
  if (!res.ok) {
    console.error('Resend error:', await res.text())
    return false
  }
  await logSent(opts.recipientId, opts.event)
  return true
}

// Send to a user only if they exist + haven't opted out.
async function notifyUser(userId: string, build: (name: string | null) => {
  subject: string; heading: string; body: string; linkUrl: string; linkLabel: string; event: string
}) {
  const { full_name, opted_in } = await getProfile(userId)
  if (!opted_in) return
  const to = await getEmail(userId)
  if (!to) return
  const t = build(full_name)
  await sendEmail({ recipientId: userId, to, ...t })
}

// ── event handlers ────────────────────────────────────────────────────────────
async function handleSubmissionCreated(submissionId: string) {
  const { data: sub } = await supabase
    .from('submissions')
    .select('role_id, candidate_id, assessment_id')
    .eq('id', submissionId)
    .maybeSingle()
  if (!sub) return

  const [{ data: role }, { data: assessment }, candidate] = await Promise.all([
    supabase.from('roles').select('title, recruiter_id').eq('id', sub.role_id).maybeSingle(),
    supabase.from('assessments').select('auto_submitted').eq('id', sub.assessment_id).maybeSingle(),
    getProfile(sub.candidate_id),
  ])
  if (!role) return
  const roleTitle = role.title ?? 'a role'
  const candidateName = candidate.full_name ?? 'A candidate'
  const replayUrl = `${APP_URL}/recruiter/submissions/${submissionId}/replay`

  if (assessment?.auto_submitted) {
    // Auto-submitted (time expired) → notify BOTH parties.
    await notifyUser(role.recruiter_id, () => ({
      subject: `Assessment submitted — ${roleTitle}`,
      heading: 'An assessment was auto-submitted',
      body: `${candidateName}'s time expired on <strong>${roleTitle}</strong> and their work was submitted automatically. The full session is ready to review.`,
      linkUrl: replayUrl, linkLabel: 'Watch the replay', event: 'auto_submitted',
    }))
    await notifyUser(sub.candidate_id, () => ({
      subject: `Assessment submitted — ${roleTitle}`,
      heading: 'Your assessment was submitted',
      body: `Time expired on your <strong>${roleTitle}</strong> assessment, so your work was submitted automatically. You can track its status anytime.`,
      linkUrl: `${APP_URL}/candidate/assessments`, linkLabel: 'View my assessments', event: 'auto_submitted',
    }))
  } else {
    // Manual submission → notify the recruiter.
    await notifyUser(role.recruiter_id, () => ({
      subject: `New submission: ${candidateName} — ${roleTitle}`,
      heading: 'New submission to review',
      body: `${candidateName} just submitted an assessment for <strong>${roleTitle}</strong>. Watch their keystroke-by-keystroke replay to review.`,
      linkUrl: replayUrl, linkLabel: 'Watch the replay', event: 'new_submission',
    }))
  }
}

async function handleStatusUpdated(submissionId: string) {
  const { data: sub } = await supabase
    .from('submissions')
    .select('candidate_id, role_id')
    .eq('id', submissionId)
    .maybeSingle()
  if (!sub) return
  const { data: role } = await supabase.from('roles').select('title').eq('id', sub.role_id).maybeSingle()
  const roleTitle = role?.title ?? 'a role'

  await notifyUser(sub.candidate_id, () => ({
    subject: 'Your application status has been updated',
    heading: 'Your application status changed',
    body: `There's an update on your application for <strong>${roleTitle}</strong>. Sign in to see the latest status.`,
    linkUrl: `${APP_URL}/candidate/assessments`, linkLabel: 'View my assessments', event: 'status_changed',
  }))

  // Reviewers who scored this submission are notified when the owner acts on it.
  const { data: reviews } = await supabase
    .from('reviews').select('reviewer_id').eq('submission_id', submissionId)
  for (const r of reviews ?? []) {
    await notifyUser(r.reviewer_id, () => ({
      subject: `Decision update — ${roleTitle}`,
      heading: 'A submission you reviewed was updated',
      body: `The role owner updated the status of a submission you reviewed for <strong>${roleTitle}</strong>.`,
      linkUrl: `${APP_URL}/recruiter/submissions/${submissionId}/replay`,
      linkLabel: 'View submission', event: 'review_status_changed',
    }))
  }
}

// A reviewer was invited → ask them to review.
async function handleReviewRequested(reviewId: string) {
  const { data: rv } = await supabase
    .from('reviews').select('reviewer_id, submission_id').eq('id', reviewId).maybeSingle()
  if (!rv) return
  const { data: sub } = await supabase
    .from('submissions').select('role_id, candidate_id').eq('id', rv.submission_id).maybeSingle()
  if (!sub) return
  const [{ data: role }, candidate] = await Promise.all([
    supabase.from('roles').select('title').eq('id', sub.role_id).maybeSingle(),
    getProfile(sub.candidate_id),
  ])
  const roleTitle = role?.title ?? 'a role'
  const candidateName = candidate.full_name ?? 'a candidate'
  await notifyUser(rv.reviewer_id, () => ({
    subject: `Review requested: ${candidateName} — ${roleTitle}`,
    heading: "You've been asked to review a submission",
    body: `You've been invited to review <strong>${candidateName}</strong>'s submission for <strong>${roleTitle}</strong>. Watch the replay, leave timestamped notes, and submit your verdict.`,
    linkUrl: `${APP_URL}/recruiter/submissions/${rv.submission_id}/replay`,
    linkLabel: 'Start your review', event: 'review_requested',
  }))
}

// Every reviewer has submitted → tell the role owner the panel is done.
async function handleReviewsComplete(submissionId: string) {
  const { data: sub } = await supabase
    .from('submissions').select('role_id, candidate_id').eq('id', submissionId).maybeSingle()
  if (!sub) return
  const [{ data: role }, candidate] = await Promise.all([
    supabase.from('roles').select('title, recruiter_id').eq('id', sub.role_id).maybeSingle(),
    getProfile(sub.candidate_id),
  ])
  if (!role) return
  const candidateName = candidate.full_name ?? 'the candidate'
  await notifyUser(role.recruiter_id, () => ({
    subject: `All reviews are in — ${candidateName}`,
    heading: 'Your review panel has finished',
    body: `Every reviewer has submitted their verdict for <strong>${candidateName}</strong> on <strong>${role.title ?? 'a role'}</strong>. See the aggregate decision and make the final call.`,
    linkUrl: `${APP_URL}/recruiter/submissions/${submissionId}/replay`,
    linkLabel: 'View the decision', event: 'reviews_complete',
  }))
}

async function handleMessageCreated(messageId: string) {
  const { data: msg } = await supabase
    .from('messages')
    .select('thread_id, sender_id')
    .eq('id', messageId)
    .maybeSingle()
  if (!msg) return
  const { data: thread } = await supabase
    .from('threads')
    .select('recruiter_id, candidate_id')
    .eq('id', msg.thread_id)
    .maybeSingle()
  if (!thread) return

  const recipientId = msg.sender_id === thread.recruiter_id ? thread.candidate_id : thread.recruiter_id
  const recipientIsRecruiter = recipientId === thread.recruiter_id

  // Debounce: at most one new-message email per recipient per window.
  if (await recentlyNotified(recipientId, 'new_message', MESSAGE_DEBOUNCE_MIN)) return

  const sender = await getProfile(msg.sender_id)
  const senderName = sender.full_name ?? 'Someone'
  const inbox = recipientIsRecruiter ? `${APP_URL}/recruiter/messages` : `${APP_URL}/candidate/messages`

  await notifyUser(recipientId, () => ({
    subject: `New message from ${senderName} on Ember`,
    heading: `New message from ${senderName}`,
    body: `You have a new message waiting on Ember. Open your inbox to read and reply.`,
    linkUrl: inbox, linkLabel: 'Open messages', event: 'new_message',
  }))
}

// ── unsubscribe (CAN-SPAM) ────────────────────────────────────────────────────
async function handleUnsubscribe(uid: string): Promise<Response> {
  await supabase.from('profiles').update({ email_notifications: false }).eq('id', uid)
  return new Response(
    `<html><body style="font-family:sans-serif;text-align:center;padding:60px">
      <h2>You're unsubscribed</h2>
      <p>You won't receive further notification emails from Ember.</p>
      <p>Changed your mind? Re-enable notifications in your Ember profile settings.</p>
    </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } },
  )
}

// ── entrypoint ────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  if (req.method === 'GET' && url.searchParams.get('action') === 'unsubscribe') {
    const uid = url.searchParams.get('uid')
    if (!uid) return json({ error: 'missing uid' }, 400)
    return handleUnsubscribe(uid)
  }

  // Shared-secret guard for the webhook payloads.
  const expected = Deno.env.get('NOTIFY_WEBHOOK_SECRET')
  if (expected && req.headers.get('x-webhook-secret') !== expected) {
    return json({ error: 'unauthorized' }, 401)
  }

  let payload: any
  try { payload = await req.json() } catch { return json({ error: 'invalid json' }, 400) }

  try {
    switch (payload.type) {
      case 'submission_created': await handleSubmissionCreated(payload.submission_id); break
      case 'status_updated':     await handleStatusUpdated(payload.submission_id); break
      case 'message_created':    await handleMessageCreated(payload.message_id); break
      case 'review_requested':   await handleReviewRequested(payload.review_id); break
      case 'reviews_complete':   await handleReviewsComplete(payload.submission_id); break
      default: return json({ error: `unknown type: ${payload.type}` }, 400)
    }
  } catch (e) {
    console.error('notification error:', e)
    return json({ error: String((e as Error).message ?? e) }, 500)
  }
  return json({ ok: true })
})
