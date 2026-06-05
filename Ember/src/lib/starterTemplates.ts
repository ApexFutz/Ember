export type StarterTemplate = 'blank' | 'react_component' | 'node_api' | 'bugfix_repo'

export interface StarterFile {
  name: string
  content: string
}

export interface StarterTemplateOption {
  value: StarterTemplate
  label: string
  description: string
  files: StarterFile[]
}

export const STARTER_TEMPLATES: StarterTemplateOption[] = [
  {
    value: 'blank',
    label: 'Blank',
    description: 'Start from an empty file',
    files: [{ name: 'main.js', content: '// Start coding here\n' }],
  },
  {
    value: 'react_component',
    label: 'React component',
    description: 'App.jsx + styles.css scaffold to build on',
    files: [
      {
        name: 'App.jsx',
        content: `import './styles.css'

// TODO: implement the component described in the task.
export default function App() {
  return (
    <div className="app">
      <h1>Hello</h1>
    </div>
  )
}
`,
      },
      {
        name: 'styles.css',
        content: `.app {
  font-family: sans-serif;
  padding: 24px;
}
`,
      },
    ],
  },
  {
    value: 'bugfix_repo',
    label: 'Bug-fix repo (multi-file)',
    description: 'A small interlinked JS codebase with a planted bug',
    files: [
      {
        name: 'money.js',
        content: `// Currency helpers used across the cart.
function formatUSD(cents) {
  return '$' + (cents / 100).toFixed(2)
}

function applyDiscount(cents, percent) {
  // BUG: discount is applied as a flat amount, not a percentage.
  return cents - percent
}
`,
      },
      {
        name: 'cart.js',
        content: `// Cart total. Uses helpers from money.js (shared scope at runtime).
function cartTotal(items, discountPercent) {
  const subtotal = items.reduce((sum, it) => sum + it.priceCents * it.qty, 0)
  return applyDiscount(subtotal, discountPercent)
}
`,
      },
      {
        name: 'main.js',
        content: `// Example usage. Fix cartTotal so the discount is a real percentage.
const items = [
  { priceCents: 1000, qty: 2 }, // $20.00
  { priceCents: 500, qty: 1 },  // $5.00
]
// 10% off $25.00 should be $22.50
console.log(formatUSD(cartTotal(items, 10)))
`,
      },
    ],
  },
  {
    value: 'node_api',
    label: 'Node REST API',
    description: 'server.js + routes.js scaffold to build on',
    files: [
      {
        name: 'server.js',
        content: `const express = require('express')
const routes = require('./routes')

const app = express()
app.use(express.json())
app.use('/api', routes)

// TODO: wire up any additional middleware described in the task.
app.listen(3000, () => console.log('Listening on :3000'))
`,
      },
      {
        name: 'routes.js',
        content: `const express = require('express')
const router = express.Router()

// TODO: implement the route handlers described in the task.
router.get('/health', (req, res) => {
  res.json({ ok: true })
})

module.exports = router
`,
      },
    ],
  },
]

export function getTemplateFiles(value: string | null | undefined): StarterFile[] {
  const template = STARTER_TEMPLATES.find(o => o.value === value)
  return (template ?? STARTER_TEMPLATES[0]).files
}

export function getTemplateLabel(value: string | null | undefined): string {
  const template = STARTER_TEMPLATES.find(o => o.value === value)
  return (template ?? STARTER_TEMPLATES[0]).label
}
