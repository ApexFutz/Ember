// Edge Function: stripe-billing-webhook
// Authoritative Stripe receiver for recruiter seat subscriptions and per-hire
// payment events. Verifies Stripe's raw-body signature before parsing JSON,
// stores processed event IDs, and keeps recruiter billing fields in sync.
//
// Env: STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'stripe-signature, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const textEncoder = new TextEncoder()
const service = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

type StripeEvent = {
  id?: string
  type?: string
  data?: { object?: Record<string, unknown> }
}

type StripeMetadata = Record<string, unknown> | undefined

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stripeId(value: unknown) {
  if (typeof value === 'string') return value
  return stringValue(objectValue(value).id)
}

function metadataValue(object: Record<string, unknown>): StripeMetadata {
  return objectValue(object.metadata)
}

function normalizeTier(value: unknown) {
  const tier = stringValue(value)?.toLowerCase()
  if (tier === 'founding' || tier === 'starter' || tier === 'growth' || tier === 'enterprise') {
    return tier
  }
  return null
}

function tierPatch(metadata?: StripeMetadata) {
  const tier = normalizeTier(metadata?.subscription_tier ?? metadata?.tier)
  return tier ? { subscription_tier: tier } : {}
}

function normalizeSubscriptionStatus(value: unknown) {
  const status = stringValue(value)
  if (
    status === 'trialing' ||
    status === 'active' ||
    status === 'past_due' ||
    status === 'canceled' ||
    status === 'incomplete' ||
    status === 'incomplete_expired' ||
    status === 'unpaid'
  ) {
    return status
  }
  return 'inactive'
}

function periodEndIso(value: unknown) {
  const seconds = numberValue(value)
  return seconds === null ? null : new Date(seconds * 1000).toISOString()
}

function parseStripeSignature(header: string) {
  const parsed = new Map<string, string[]>()
  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2)
    if (!key || !value) continue
    const values = parsed.get(key) ?? []
    values.push(value)
    parsed.set(key, values)
  }
  return {
    timestamp: Number(parsed.get('t')?.[0]),
    signatures: parsed.get('v1') ?? [],
  }
}

function timingSafeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

async function hmacSha256Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(payload))
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function verifyStripeSignature(options: {
  rawBody: string
  secret: string
  signatureHeader: string | null
  toleranceSeconds?: number
}) {
  if (!options.signatureHeader) return false
  const { timestamp, signatures } = parseStripeSignature(options.signatureHeader)
  if (!Number.isFinite(timestamp) || signatures.length === 0) return false
  const nowSeconds = Math.floor(Date.now() / 1000)
  const toleranceSeconds = options.toleranceSeconds ?? 300
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false

  const expected = await hmacSha256Hex(options.secret, `${timestamp}.${options.rawBody}`)
  return signatures.some((signature) => timingSafeEqualHex(signature, expected))
}

async function claimEvent(event: Required<Pick<StripeEvent, 'id' | 'type'>> & StripeEvent) {
  const { error } = await service.from('stripe_webhook_events').insert({
    id: event.id,
    type: event.type,
    payload: event,
  })
  if (!error) return { duplicate: false }
  if (error.code === '23505') return { duplicate: true }
  throw error
}

async function markProcessed(eventId: string) {
  await service
    .from('stripe_webhook_events')
    .update({ processed_at: new Date().toISOString(), processing_error: null })
    .eq('id', eventId)
}

async function markFailed(eventId: string, error: unknown) {
  await service
    .from('stripe_webhook_events')
    .update({ processing_error: String((error as Error).message ?? error) })
    .eq('id', eventId)
}

async function updateProfileByStripeIdentity(options: {
  customerId: string | null
  metadata?: StripeMetadata
  patch: Record<string, unknown>
  recruiterId?: string | null
  subscriptionId: string | null
}) {
  const recruiterId =
    options.recruiterId ??
    stringValue(options.metadata?.recruiter_id) ??
    stringValue(options.metadata?.user_id)
  if (recruiterId) {
    const { error } = await service.from('profiles').update(options.patch).eq('id', recruiterId)
    if (error) throw error
    return
  }
  if (options.subscriptionId) {
    const { error } = await service
      .from('profiles')
      .update(options.patch)
      .eq('stripe_subscription_id', options.subscriptionId)
    if (error) throw error
    return
  }
  if (options.customerId) {
    const { error } = await service
      .from('profiles')
      .update(options.patch)
      .eq('stripe_customer_id', options.customerId)
    if (error) throw error
  }
}

async function handleCheckoutCompleted(object: Record<string, unknown>) {
  const metadata = metadataValue(object)
  const customerId = stripeId(object.customer)
  const subscriptionId = stripeId(object.subscription)
  await updateProfileByStripeIdentity({
    customerId,
    metadata,
    patch: {
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      subscription_status: 'active',
      ...tierPatch(metadata),
    },
    recruiterId: stringValue(object.client_reference_id),
    subscriptionId,
  })
}

async function handleSubscriptionChanged(object: Record<string, unknown>, deleted = false) {
  const metadata = metadataValue(object)
  const customerId = stripeId(object.customer)
  const subscriptionId = stripeId(object.id)
  await updateProfileByStripeIdentity({
    customerId,
    metadata,
    patch: {
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      subscription_current_period_end: periodEndIso(object.current_period_end),
      subscription_status: deleted ? 'canceled' : normalizeSubscriptionStatus(object.status),
      ...tierPatch(metadata),
    },
    subscriptionId,
  })
}

async function handlePaymentIntentSucceeded(object: Record<string, unknown>) {
  const metadata = metadataValue(object)
  const kind = stringValue(metadata?.kind) ?? stringValue(metadata?.billing_kind)
  if (kind !== 'per_hire') return

  const recruiterId = stringValue(metadata?.recruiter_id)
  const submissionId = stringValue(metadata?.submission_id)
  const paymentIntentId = stringValue(object.id)
  if (!recruiterId || !submissionId || !paymentIntentId) {
    throw new Error('per_hire payment_intent.succeeded missing recruiter_id, submission_id, or id')
  }

  const { error } = await service.from('hire_events').upsert(
    {
      amount_cents: numberValue(object.amount_received) ?? numberValue(object.amount) ?? 0,
      currency: stringValue(object.currency)?.toLowerCase() ?? 'usd',
      recruiter_id: recruiterId,
      stripe_payment_intent_id: paymentIntentId,
      submission_id: submissionId,
    },
    { onConflict: 'stripe_payment_intent_id' },
  )
  if (error) throw error
}

async function dispatchEvent(event: Required<Pick<StripeEvent, 'id' | 'type'>> & StripeEvent) {
  const object = objectValue(event.data?.object)
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(object)
      break
    case 'customer.subscription.updated':
      await handleSubscriptionChanged(object)
      break
    case 'customer.subscription.deleted':
      await handleSubscriptionChanged(object, true)
      break
    case 'payment_intent.succeeded':
      await handlePaymentIntentSucceeded(object)
      break
    default:
      break
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!webhookSecret) return json({ error: 'webhook secret not configured' }, 503)

  const rawBody = await req.text()
  const verified = await verifyStripeSignature({
    rawBody,
    secret: webhookSecret,
    signatureHeader: req.headers.get('stripe-signature'),
  })
  if (!verified) return json({ error: 'invalid signature' }, 400)

  let event: StripeEvent
  try {
    event = JSON.parse(rawBody)
  } catch {
    return json({ error: 'invalid json' }, 400)
  }
  if (!event.id || !event.type) return json({ error: 'invalid stripe event' }, 400)

  const claimed = await claimEvent(event as Required<Pick<StripeEvent, 'id' | 'type'>> & StripeEvent)
  if (claimed.duplicate) return json({ ok: true, duplicate: true })

  try {
    await dispatchEvent(event as Required<Pick<StripeEvent, 'id' | 'type'>> & StripeEvent)
    await markProcessed(event.id)
    return json({ ok: true })
  } catch (error) {
    console.error('stripe billing webhook failed:', error)
    await markFailed(event.id, error)
    return json({ error: 'processing failed' }, 500)
  }
})
