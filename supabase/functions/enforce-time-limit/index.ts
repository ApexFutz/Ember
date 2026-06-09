// Edge Function: enforce-time-limit
// Server-side safety net for the assessment timer. Sweeps every in-progress
// assessment whose started_at + ruleset time limit has elapsed and auto-submits
// it (status 'timed_out', auto_submitted = true) by delegating to the
// enforce_time_limit() SQL function, which holds the row locks.
//
// Handles the cases the client cannot: tab close, browser crash, network drop.
// Wire this to a schedule (Supabase scheduled function or external cron, e.g.
// once a minute) on projects where pg_cron isn't enabled. Optionally pass
// { assessment_id } to enforce a single assessment.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Optional single-assessment targeting; default is a full sweep.
  let assessmentId: string | null = null
  try {
    const body = await req.json()
    if (body && typeof body.assessment_id === 'string') assessmentId = body.assessment_id
  } catch {
    // no body — full sweep
  }

  const { data, error } = await supabase.rpc('enforce_time_limit', {
    p_assessment_id: assessmentId,
  })

  if (error) return json({ error: error.message }, 500)
  return json({ auto_submitted: data ?? 0 })
})
