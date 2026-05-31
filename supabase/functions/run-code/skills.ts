// COPY of Ember/src/lib/skills.ts for the Deno edge runtime.
// Keep in sync with that canonical file.

export type Tier = 'beginner' | 'intermediate' | 'advanced'

export interface DerivedSkill {
  slug: string
  label: string
}

const TASK_TYPE_SKILLS: Record<string, DerivedSkill> = {
  fix_a_bug: { slug: 'debugging', label: 'Debugging' },
  write_tests: { slug: 'testing', label: 'Testing' },
  refactor_code: { slug: 'refactoring', label: 'Refactoring' },
  build_a_feature: { slug: 'feature-development', label: 'Feature development' },
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function deriveSkills(stackTags: string[] | null | undefined, taskType: string): DerivedSkill[] {
  const bySlug = new Map<string, DerivedSkill>()
  for (const tag of stackTags ?? []) {
    const label = tag.trim()
    const slug = slugify(label)
    if (slug && !bySlug.has(slug)) bySlug.set(slug, { slug, label })
  }
  const taskSkill = TASK_TYPE_SKILLS[taskType]
  if (taskSkill && !bySlug.has(taskSkill.slug)) bySlug.set(taskSkill.slug, taskSkill)
  return [...bySlug.values()]
}

export function tierFromStats(avgScore: number, evidenceCount: number): Tier {
  if (avgScore >= 0.85 && evidenceCount >= 3) return 'advanced'
  if (avgScore >= 0.6) return 'intermediate'
  return 'beginner'
}
