# Supabase Edge Functions

## run-code

Executes candidate code against a ruleset's tests using the public
[Piston](https://github.com/engineer-man/piston) API and (in submit mode) writes
the resulting score + metrics back to the `submissions` row.

### Why server-side
Hidden test bodies must never reach the candidate's browser, and untrusted code
can't run client-side. This function loads tests with the **service-role key** and
runs them in Piston's sandbox.

### Deploy
```bash
supabase functions deploy run-code
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically by the Supabase platform — no manual secrets needed for the public
Piston endpoint.

### Request body
```jsonc
{
  "role_id": "uuid",
  "files": [{ "name": "main.js", "content": "function add(a,b){return a+b}" }],
  "mode": "practice",          // or "submit"
  "assessment_id": "uuid"      // required when mode === "submit"
}
```

- `practice` → `{ results: [{ name, passed, message? }] }` (visible tests only).
- `submit`   → `{ tests_passed, tests_total, score }` and updates `submissions`.

### Smoke test
```bash
curl -i -X POST "$SUPABASE_URL/functions/v1/run-code" \
  -H "Authorization: Bearer <user-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"role_id":"<role>","mode":"practice","files":[{"name":"main.js","content":"function add(a,b){return a+b}"}]}'
```

### Runtimes
MVP supports plain **Node** (`runtime = 'node'`) and **Python** (`runtime = 'python'`).
React/Express starter templates need a container runner with dependency install and
are not yet executable. For production load, self-host Piston instead of the public
`emkc.org` endpoint (rate limits).

> `harness.ts` here is a copy of `Ember/src/lib/testHarness.ts`. Keep them in sync.

## stripe-billing-webhook

Receives Stripe Billing events for recruiter subscriptions and per-hire charges.
It verifies the `stripe-signature` header against the raw request body, records
Stripe event IDs in `stripe_webhook_events`, updates recruiter subscription
fields on `profiles`, and records `payment_intent.succeeded` events with
`metadata.kind = per_hire` in `hire_events`.

### Deploy

```bash
supabase functions deploy stripe-billing-webhook
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase. The
function expects Stripe metadata on Checkout Sessions / Payment Intents:

```jsonc
{
  "recruiter_id": "auth user uuid",
  "subscription_tier": "founding | starter | growth | enterprise",
  "kind": "per_hire",
  "submission_id": "submission uuid"
}
```

### Stripe events

- `checkout.session.completed` updates the recruiter profile with
  `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, and
  `subscription_tier`.
- `customer.subscription.updated` and `customer.subscription.deleted` keep
  `subscription_status` and `subscription_current_period_end` in sync.
- `payment_intent.succeeded` with `metadata.kind = per_hire` inserts or updates
  one `hire_events` row keyed by `stripe_payment_intent_id`.

### Local smoke test

```bash
stripe listen --forward-to "$SUPABASE_URL/functions/v1/stripe-billing-webhook"
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
```

Use real Checkout Session metadata for an end-to-end recruiter profile update.
