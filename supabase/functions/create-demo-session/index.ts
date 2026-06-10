// Edge Function: create-demo-session
// Signs in as the read-only demo recruiter and returns session tokens so a
// visitor can explore Ember without an account. Also logs each demo start to
// demo_sessions for conversion analytics, and records signup-CTA clicks.
//
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//      DEMO_EMAIL, DEMO_PASSWORD.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const url = Deno.env.get('SUPABASE_URL')!
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let body: any = {}
  try { body = await req.json() } catch { /* no body */ }

  // Record that a demo session's signup CTA was clicked (conversion event).
  if (body.action === 'signup_click' && body.session_id) {
    await service.from('demo_sessions').update({ clicked_signup: true }).eq('id', body.session_id)
    return json({ ok: true })
  }

  // Sign in as the demo recruiter.
  const email = Deno.env.get('DEMO_EMAIL')
  const password = Deno.env.get('DEMO_PASSWORD')
  if (!email || !password) return json({ error: 'demo account not configured' }, 500)

  const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!)
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  if (error || !data.session) return json({ error: error?.message ?? 'sign-in failed' }, 500)

  // Log the session start for conversion analytics.
  const referrer = body.referrer ?? req.headers.get('referer') ?? null
  const { data: logged } = await service
    .from('demo_sessions')
    .insert({ referrer })
    .select('id')
    .single()

  return json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    session_id: logged?.id ?? null,
  })
})
