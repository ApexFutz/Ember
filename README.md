# Ember

> A verified talent pipeline that replaces résumé noise and LeetCode gatekeeping with real, provable skill — for both sides of the hiring table.

---

## What is Ember?

Ember is a closed-loop hiring platform where candidates prove their skills through real, proctored work samples — and recruiters review verified, recorded coding sessions instead of inflated résumés.

No LeetCode. No spam. No external link chains. No ghosting.

**For candidates:** Build a verifiable record of your actual skills. Complete real-world coding assessments and get seen by recruiters looking for exactly what you can do.

**For recruiters:** Define assessments based on real job work. Watch candidates code keystroke by keystroke. Hire with confidence — knowing a candidate can perform before you ever submit them.

---

## Why "closed loop"?

Most hiring today is a leaky pipeline: a role gets posted on one site, applications land in an ATS, résumés get emailed, screens happen on a third platform, interviews on a fourth. Every handoff is a drop-off point.

Ember keeps every step inside one system — post, assess, review, message, hire. Nothing leaves the platform. The accountability and the data stay intact from first contact to final decision.

---

## Core Features

- **Verified skill profiles** — candidates build a continuous, referenceable record
- **Role-specific rulesets** — recruiters define assessments based on real day-one work, not abstract puzzles
- **Proctored coding assessments** — a real in-browser code editor with a live timer
- **Keystroke-level session recording** — every edit captured as it happens
- **Replay viewer** — recruiters rewatch the full coding session with playback controls, speed adjustment, and large-paste detection flags
- **Submissions dashboard** — recruiters review, sort, and manage candidate status
- **One-click availability status** — candidates signal availability instantly
- **Real-time in-app messaging** — recruiters and candidates communicate without leaving the platform, with live unread badges

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| Backend / Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth with row-level security |
| Storage | Supabase Storage |
| Routing | React Router v6 |
| Code editor | Monaco Editor (@monaco-editor/react) |
| Real-time | Supabase Realtime |

---

## Project Structure

```
ember/
├── public/
├── src/
│   ├── lib/
│   │   └── supabase.ts          # Supabase client
│   ├── hooks/
│   │   └── useAuth.ts           # Session, profile, role detection, refresh
│   ├── components/
│   │   ├── Layout.tsx           # Nav shell with role-based navigation
│   │   ├── EmptyState.tsx       # Reusable empty state
│   │   └── SkeletonCard.tsx     # Loading skeleton
│   ├── pages/
│   │   ├── auth/
│   │   │   ├── Login.tsx
│   │   │   └── Signup.tsx
│   │   ├── recruiter/
│   │   │   ├── Dashboard.tsx     # Submissions review + status management
│   │   │   ├── Profile.tsx
│   │   │   ├── Roles.tsx         # Role posting management
│   │   │   ├── NewRole.tsx
│   │   │   ├── Ruleset.tsx       # Assessment ruleset builder
│   │   │   └── Replay.tsx        # Keystroke replay viewer
│   │   ├── candidate/
│   │   │   ├── Profile.tsx
│   │   │   ├── Roles.tsx         # Browse open roles
│   │   │   └── Assessments.tsx   # Track submitted assessments
│   │   ├── assessment/
│   │   │   └── Assessment.tsx    # Proctored coding environment
│   │   └── messages/
│   │       └── Messages.tsx      # Real-time messaging
│   ├── styles/
│   │   └── theme.ts             # Central design tokens
│   ├── App.tsx                  # Routes + protected route logic
│   └── main.tsx
├── .env                         # Secret keys — never commit
├── schema.sql                   # Full database schema
└── README.md
```

---

## Database Schema

8 tables in Supabase PostgreSQL, with row-level security enabled on every table:

| Table | Purpose |
|---|---|
| profiles | One row per user — recruiter and candidate fields |
| roles | Job postings with draft / active / archived status |
| rulesets | Assessment definition, one per role |
| assessments | A candidate's in-progress or submitted coding session |
| assessment_logs | Keystroke-level session recording (JSONB) |
| submissions | Created on submit — what recruiters review |
| threads | One messaging thread per recruiter-candidate-role |
| messages | Individual messages within a thread |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase account (free tier works)

### 1. Clone and install

```bash
git clone https://github.com/ApexFutz/Ember.git
cd Ember/Ember
npm install
```

### 2. Set up Supabase

1. Create a project at supabase.com
2. Run schema.sql in the Supabase SQL Editor
3. Enable Email auth under Authentication > Sign In / Providers
4. Disable CAPTCHA under Authentication > Attack Protection (for local dev)
5. Create a public profile-photos storage bucket

### 3. Environment variables

Create a .env file in the project root:

```
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_publishable_key
```

### 4. Run

```bash
npm run dev
```

Open http://localhost:5173

---

## Development

### Seeding test data

`npm run seed` populates a Supabase instance with a complete, demonstrable hiring
loop so you don't have to create accounts, roles, and assessments by hand.

It creates:

- **Users** — one recruiter (`recruiter@test.ember`) and two candidates
  (`alice@test.ember`, `bob@test.ember`), all with password `password123` and
  confirmed emails (login works immediately).
- **Roles** — an active *Frontend Engineer* role at Acme Corp (with a ruleset), a
  *Backend Engineer* draft (hidden from candidates), and an archived *Data Analyst*.
- **Assessments** — Alice has a fully submitted session (~200 keystroke log entries
  including one paste event) and a pending submission ready to replay; Bob has an
  in-progress session with a partial log.
- **Messages** — a thread between the recruiter and Alice with three messages.

**Setup:** the seed needs the **service-role** key (it writes across users, which
bypasses RLS). Add it to the root `.env` — it is never bundled into the frontend:

```
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key   # Project Settings → API
```

**Run** (from the repo root, with the schema already applied):

```bash
npm install   # first time only — installs tsx + dotenv
npm run seed
```

The script is **idempotent** — every row is matched on a natural key and reused, so
running it twice never creates duplicates. After seeding, log in as the recruiter
and open Alice's submission to walk the full replay workflow end to end.

---

## How It Works (End to End)

1. A **recruiter** signs up, posts a role, and builds a ruleset describing the real work a candidate will do
2. A **candidate** signs up, completes their profile, and browses open roles
3. The candidate starts a **proctored assessment** — a timed, in-browser coding environment where every keystroke is recorded
4. On submit, the work and full session log are saved
5. The recruiter sees the submission on their **dashboard** and watches a **keystroke-by-keystroke replay** of how the candidate worked
6. The recruiter updates the candidate's status and **messages** them in real time
7. The candidate tracks the status of every assessment they've submitted

---

## Status

This is an actively developed MVP. The complete core hiring loop is functional end to end.

---

## License

Private — all rights reserved.

---

*Ember. The spark before the fire.*
