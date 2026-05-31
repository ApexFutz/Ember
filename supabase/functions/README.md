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
