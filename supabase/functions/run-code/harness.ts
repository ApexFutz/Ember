// COPY of Ember/src/lib/testHarness.ts for the Deno edge runtime.
// Keep in sync with that canonical file — same protocol on both sides.

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

const jsFileFilter = (name: string) =>
  name.endsWith('.js') || name.endsWith('.mjs') || name.endsWith('.cjs')
const pyFileFilter = (name: string) => name.endsWith('.py')

export function buildProgram(runtime: Runtime, files: StarterFileLike[], test: TestCase): string {
  if (runtime === 'python') {
    const src = files.filter(f => pyFileFilter(f.name)).map(f => f.content).join('\n\n')
    return [
      PYTHON_PRELUDE,
      src,
      'try:',
      indent(test.content, '    '),
      'except Exception as _e:',
      `    print('${MARKER}::${escape(test.name)}::FAIL::' + str(_e))`,
      '',
    ].join('\n')
  }
  const src = files.filter(f => jsFileFilter(f.name)).map(f => f.content).join('\n\n')
  return [
    NODE_PRELUDE,
    src,
    'try {',
    test.content,
    `} catch (_e) {`,
    `  console.log('${MARKER}::${escape(test.name)}::FAIL::' + (_e && _e.message ? _e.message : String(_e)))`,
    '}',
    '',
  ].join('\n')
}

export function parseResults(stdout: string): TestResult[] {
  const results: TestResult[] = []
  for (const line of (stdout || '').split('\n')) {
    if (!line.startsWith(MARKER + '::')) continue
    const parts = line.split('::')
    results.push({
      name: parts[1] ?? '',
      passed: (parts[2] ?? '') === 'PASS',
      message: parts.slice(3).join('::') || undefined,
    })
  }
  return results
}

export const pistonLanguage = (runtime: Runtime) => (runtime === 'python' ? 'python' : 'javascript')
export const programFilename = (runtime: Runtime) => (runtime === 'python' ? 'main.py' : 'main.js')

function indent(text: string, pad: string): string {
  return text.split('\n').map(l => (l.length ? pad + l : l)).join('\n')
}
function escape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}
