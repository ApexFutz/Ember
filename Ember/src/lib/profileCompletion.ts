// Candidate profile completion — five equally-weighted fields (20% each).
// Shared by the Profile page (live form) and the Roles page (saved profile)
// so both surfaces report exactly the same five checks.

export interface CompletionInput {
  photo_url?: string | null
  bio?: string | null
  github_url?: string | null
  skills?: string[] | null
  availability?: string | null
}

export const BIO_MIN_LENGTH = 20

export interface CompletionItem {
  key: 'avatar' | 'bio' | 'github' | 'skills' | 'availability'
  label: string
  done: boolean
}

export function getCompletionItems(p: CompletionInput): CompletionItem[] {
  return [
    { key: 'avatar', label: 'Avatar uploaded', done: !!p.photo_url },
    { key: 'bio', label: `Bio (min ${BIO_MIN_LENGTH} characters)`, done: (p.bio?.trim().length ?? 0) >= BIO_MIN_LENGTH },
    { key: 'github', label: 'GitHub URL added', done: !!p.github_url?.trim() },
    { key: 'skills', label: 'At least one skill', done: (p.skills?.length ?? 0) >= 1 },
    { key: 'availability', label: 'Availability set', done: !!p.availability },
  ]
}

// Whole-number percentage (0, 20, 40, 60, 80, 100).
export function getCompletionPercent(p: CompletionInput): number {
  const items = getCompletionItems(p)
  const done = items.filter(i => i.done).length
  return Math.round((done / items.length) * 100)
}
