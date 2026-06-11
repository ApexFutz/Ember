import { Link } from 'react-router-dom'

const VALUE_PROPS = [
  {
    icon: '⌨️',
    title: 'Keystroke Replay',
    body: 'Watch exactly how a candidate solved the problem — every keystroke, paste, and pause — so you judge the thinking, not just the final answer.',
  },
  {
    icon: '🛠️',
    title: 'Real Work Assessments',
    body: 'No trivia, no whiteboard puzzles. Candidates build, fix, and refactor in a real editor against a real codebase and test suite.',
  },
  {
    icon: '🔄',
    title: 'Closed Loop Hiring',
    body: 'Review, message, and move candidates forward in one place. Every submission stays connected to the role and the conversation.',
  },
]

export default function Landing() {
  return (
    <div className="landing">
      <div className="landing-glow" aria-hidden="true" />

      {/* Nav */}
      <nav className="landing-nav">
        <span className="landing-logo">
          Ember<span className="landing-logo-dot">.</span>
        </span>
        <div className="landing-nav-links">
          <Link to="/login" className="landing-nav-link">Log in</Link>
          <Link to="/signup" className="landing-nav-cta">Sign up</Link>
        </div>
      </nav>

      {/* Hero */}
      <header className="landing-hero">
        <span className="landing-eyebrow">Hiring, on the strength of the work</span>
        <h1 className="landing-headline">
          See how engineers <em>actually</em> work.
        </h1>
        <p className="landing-subhead">
          Ember replaces résumé guesswork with real assessments and keystroke-level
          replay — so you hire on evidence, and candidates get judged on their craft.
        </p>
        <div className="landing-cta-row">
          <Link to="/signup?role=recruiter" className="landing-cta landing-cta-primary">
            I'm a Recruiter →
          </Link>
          <Link to="/signup?role=candidate" className="landing-cta landing-cta-secondary">
            I'm a Candidate →
          </Link>
        </div>
      </header>

      {/* Value props */}
      <section className="landing-values">
        {VALUE_PROPS.map(v => (
          <div key={v.title} className="landing-value-card">
            <span className="landing-value-icon" aria-hidden="true">{v.icon}</span>
            <h2 className="landing-value-title">{v.title}</h2>
            <p className="landing-value-body">{v.body}</p>
          </div>
        ))}
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-brand">
          <span className="landing-footer-name">
            Ember<span className="landing-logo-dot">.</span>
          </span>
          <span className="landing-footer-tagline">Hire on evidence, not résumés.</span>
        </div>
        <div className="landing-footer-links">
          <Link to="/login" className="landing-footer-link">Log in</Link>
          <Link to="/signup" className="landing-footer-link">Sign up</Link>
        </div>
      </footer>
    </div>
  )
}
