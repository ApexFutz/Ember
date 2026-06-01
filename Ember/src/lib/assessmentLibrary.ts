// Types + thin data-access helpers for the global assessment library.
// Schema lives in supabase/migrations/20260531000000_assessment_library.sql.
// UI wiring (recruiter bundling, candidate dedup-at-take) is a later ticket.
import { supabase } from './supabase'

export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert'
export const DIFFICULTIES: Difficulty[] = ['Beginner', 'Intermediate', 'Advanced', 'Expert']

export type CandidateAssessmentStatus = 'in_progress' | 'submitted' | 'completed'
export type RoleSubmissionStatus = 'in_progress' | 'submitted' | 'completed'

/** A reusable assessment template (table: library_assessments). */
export interface LibraryAssessment {
  id: string
  skill_tag: string
  difficulty: Difficulty
  title: string
  description: string | null
  estimated_time_minutes: number | null
  codebase: unknown // JSONB: nested file/structure, shape defined by the authoring UI
  problem_statement: string | null
  success_criteria: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Links a role to a library assessment (table: role_assessments). */
export interface RoleAssessment {
  id: string
  role_id: string
  assessment_id: string
  is_required: boolean
  order_index: number
  created_at: string
}

/** Global per-candidate history for a library assessment (table: candidate_assessments). */
export interface CandidateAssessment {
  id: string
  candidate_id: string
  assessment_id: string
  status: CandidateAssessmentStatus
  score: number | null
  submission_data: unknown
  first_viewed_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

/** Candidate progress on a specific role (table: role_submissions). */
export interface RoleSubmission {
  id: string
  role_id: string
  candidate_id: string
  status: RoleSubmissionStatus
  started_at: string | null
  submitted_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

/** Browse the shared library, optionally filtered by skill tag and/or difficulty. */
export async function listLibraryAssessments(
  filters: { skillTag?: string; difficulty?: Difficulty } = {},
): Promise<LibraryAssessment[]> {
  let query = supabase
    .from('library_assessments')
    .select('*')
    .order('created_at', { ascending: false })
  if (filters.skillTag) query = query.eq('skill_tag', filters.skillTag)
  if (filters.difficulty) query = query.eq('difficulty', filters.difficulty)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as LibraryAssessment[]
}

/** Assessments bundled into a role, ordered, with the joined library template. */
export async function getRoleAssessments(
  roleId: string,
): Promise<(RoleAssessment & { library_assessments: LibraryAssessment | null })[]> {
  const { data, error } = await supabase
    .from('role_assessments')
    .select('*, library_assessments(*)')
    .eq('role_id', roleId)
    .order('order_index', { ascending: true })
  if (error) throw error
  return (data ?? []) as any
}

/** Create a new reusable library assessment owned by the given recruiter. */
export async function createLibraryAssessment(
  input: {
    skill_tag: string
    difficulty: Difficulty
    title: string
    description?: string | null
    estimated_time_minutes?: number | null
    codebase?: unknown
    problem_statement?: string | null
    success_criteria?: string | null
  },
  createdBy: string,
): Promise<LibraryAssessment> {
  const { data, error } = await supabase
    .from('library_assessments')
    .insert({
      skill_tag: input.skill_tag,
      difficulty: input.difficulty,
      title: input.title,
      description: input.description ?? null,
      estimated_time_minutes: input.estimated_time_minutes ?? null,
      codebase: input.codebase ?? [],
      problem_statement: input.problem_statement ?? null,
      success_criteria: input.success_criteria ?? null,
      created_by: createdBy,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as LibraryAssessment
}

/** Bundle a library assessment into a role. */
export async function addAssessmentToRole(
  roleId: string,
  assessmentId: string,
  opts: { isRequired?: boolean; orderIndex?: number } = {},
): Promise<void> {
  const { error } = await supabase.from('role_assessments').insert({
    role_id: roleId,
    assessment_id: assessmentId,
    is_required: opts.isRequired ?? true,
    order_index: opts.orderIndex ?? 0,
  })
  if (error) throw error
}

/** Update a bundling row (e.g. toggle required, reorder). */
export async function updateRoleAssessment(
  id: string,
  patch: Partial<Pick<RoleAssessment, 'is_required' | 'order_index'>>,
): Promise<void> {
  const { error } = await supabase.from('role_assessments').update(patch).eq('id', id)
  if (error) throw error
}

/** Remove a library assessment from a role. */
export async function removeRoleAssessment(id: string): Promise<void> {
  const { error } = await supabase.from('role_assessments').delete().eq('id', id)
  if (error) throw error
}

/** A candidate's global assessment history — the basis for cross-role dedup. */
export async function getCandidateHistory(candidateId: string): Promise<CandidateAssessment[]> {
  const { data, error } = await supabase
    .from('candidate_assessments')
    .select('*')
    .eq('candidate_id', candidateId)
  if (error) throw error
  return (data ?? []) as CandidateAssessment[]
}

/**
 * Record that a candidate opened an assessment. Creates the global record if
 * absent (status in_progress, first_viewed_at = now); leaves an existing
 * record's first_viewed_at untouched. Upserts on the (candidate, assessment)
 * unique key, so calling it across multiple roles deduplicates to one row.
 */
export async function markAssessmentViewed(
  candidateId: string,
  assessmentId: string,
): Promise<CandidateAssessment> {
  const { data: existing } = await supabase
    .from('candidate_assessments')
    .select('*')
    .eq('candidate_id', candidateId)
    .eq('assessment_id', assessmentId)
    .maybeSingle()

  if (existing) return existing as CandidateAssessment

  const { data, error } = await supabase
    .from('candidate_assessments')
    .insert({
      candidate_id: candidateId,
      assessment_id: assessmentId,
      status: 'in_progress',
      first_viewed_at: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (error) throw error
  return data as CandidateAssessment
}
