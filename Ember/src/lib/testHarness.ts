// Canonical test-harness contract shared by the candidate Run path
// (Ember/src/pages/assessment/Assessment.tsx) and the run-code Edge Function
// (supabase/functions/run-code). Keep this in sync with any copy in the Deno
// function — this file is the source of truth for the protocol.

export type Runtime = 'node' | 'python'

export interface StarterFileLike {
  name: string
  content: string
}

export interface TestCase {
  name: string
  content: string
  hidden: boolean
}

export interface TestResult {
  name: string
  passed: boolean
  message?: string
}

// Each program prints one line per test outcome:
//   EMBER_TEST::<name>::PASS
//   EMBER_TEST::<name>::FAIL::<optional message>
const MARKER = 'EMBER_TEST'

const NODE_PRELUDE = `function emberAssert(name, cond, msg) {
  if (cond) { console.log('${MARKER}::' + name + '::PASS') }
  else { console.log('${MARKER}::' + name + '::FAIL::' + (msg || 'assertion failed')) }
}
`

const PYTHON_PRELUDE = `def ember_assert(name, cond, msg=''):
    if cond:
        print('${MARKER}::' + name + '::PASS')
    else:
        print('${MARKER}::' + name + '::FAIL::' + (msg or 'assertion failed'))
`

function jsFileFilter(name: string) {
  return name.endsWith('.js') || name.endsWith('.mjs') || name.endsWith('.cjs')
}

function pyFileFilter(name: string) {
  return name.endsWith('.py')
}

// Concatenate candidate source for the chosen runtime, prepend the assert
// helper, then append the test body wrapped so an exception still reports a
// FAIL line (keyed by the test name) instead of crashing the whole run.
export function buildProgram(runtime: Runtime, files: StarterFileLike[], test: TestCase): string {
  if (runtime === 'python') {
    const src = files.filter(f => pyFileFilter(f.name)).map(f => f.content).join('\n\n')
    return [
      PYTHON_PRELUDE,
      src,
      'try:',
      indent(test.content, '    '),
      'except Exception as _e:',
      `    print('${MARKER}::${escapePy(test.name)}::FAIL::' + str(_e))`,
      '',
    ].join('\n')
  }

  // node (default)
  const src = files.filter(f => jsFileFilter(f.name)).map(f => f.content).join('\n\n')
  return [
    NODE_PRELUDE,
    src,
    'try {',
    test.content,
    `} catch (_e) {`,
    `  console.log('${MARKER}::${escapeJs(test.name)}::FAIL::' + (_e && _e.message ? _e.message : String(_e)))`,
    '}',
    '',
  ].join('\n')
}

export function parseResults(stdout: string): TestResult[] {
  const results: TestResult[] = []
  for (const line of (stdout || '').split('\n')) {
    if (!line.startsWith(MARKER + '::')) continue
    const parts = line.split('::')
    // [MARKER, name, PASS|FAIL, ...message]
    const name = parts[1] ?? ''
    const status = parts[2] ?? ''
    const message = parts.slice(3).join('::')
    results.push({ name, passed: status === 'PASS', message: message || undefined })
  }
  return results
}

// Piston "language" id for a runtime.
export function pistonLanguage(runtime: Runtime): string {
  return runtime === 'python' ? 'python' : 'javascript'
}

export function programFilename(runtime: Runtime): string {
  return runtime === 'python' ? 'main.py' : 'main.js'
}

function indent(text: string, pad: string): string {
  return text
    .split('\n')
    .map(l => (l.length ? pad + l : l))
    .join('\n')
}

function escapeJs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function escapePy(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}
