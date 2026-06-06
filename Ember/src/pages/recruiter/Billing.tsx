import React, { useState } from 'react'
import { Check, X, TrendingUp, Zap, Target, Crown, ArrowRight, HelpCircle, type LucideIcon } from 'lucide-react'

interface Feature { text: string; included: boolean }
interface Tier {
  name: string
  description: string
  basePrice: number | null
  performancePercentage: number | string
  icon: LucideIcon
  accent: string
  features: Feature[]
  cta: string
  highlighted: boolean
}

const ORANGE = 'var(--color-primary)'
const ORANGE_LIGHT = 'var(--color-primary-light)'
const GRADIENT = 'linear-gradient(90deg, var(--color-primary), var(--color-primary-light))'

const tiers: Tier[] = [
  {
    name: 'Starter', description: 'For early-stage teams', basePrice: 89, performancePercentage: 8,
    icon: Zap, accent: '#fb923c', cta: 'Start Free Trial', highlighted: false,
    features: [
      { text: 'Up to 2 recruiters', included: true },
      { text: 'Unlimited assessments', included: true },
      { text: 'Real problem-solving assessments', included: true },
      { text: 'Keystroke replay viewer', included: true },
      { text: 'Submission dashboard', included: true },
      { text: 'Basic analytics', included: true },
      { text: 'In-app messaging', included: true },
      { text: 'Video interviews (coming Q3)', included: false },
      { text: 'Priority support', included: false },
      { text: 'Custom integrations', included: false },
    ],
  },
  {
    name: 'Growth', description: 'For scaling teams', basePrice: 199, performancePercentage: 6,
    icon: TrendingUp, accent: '#f97316', cta: 'Start Free Trial', highlighted: true,
    features: [
      { text: 'Up to 5 recruiters', included: true },
      { text: 'Unlimited assessments', included: true },
      { text: 'Real problem-solving assessments', included: true },
      { text: 'Keystroke replay viewer', included: true },
      { text: 'Advanced analytics dashboard', included: true },
      { text: 'Bulk candidate actions', included: true },
      { text: 'Assessment library (saved templates)', included: true },
      { text: 'Video interviews (when ready)', included: true },
      { text: 'Priority support', included: true },
      { text: 'Custom integrations', included: false },
    ],
  },
  {
    name: 'Scale', description: 'For enterprise hiring', basePrice: 499, performancePercentage: 4.5,
    icon: Target, accent: '#ea580c', cta: 'Contact Sales', highlighted: false,
    features: [
      { text: 'Up to 15 recruiters', included: true },
      { text: 'Unlimited assessments', included: true },
      { text: 'Real problem-solving assessments', included: true },
      { text: 'Keystroke replay with advanced analysis', included: true },
      { text: 'Advanced analytics & reporting', included: true },
      { text: 'Bulk candidate actions', included: true },
      { text: 'Assessment library with templates', included: true },
      { text: 'Video interviews with replay', included: true },
      { text: 'Dedicated support', included: true },
      { text: 'Custom integrations & API access', included: true },
    ],
  },
  {
    name: 'Enterprise', description: 'Fully customized', basePrice: null, performancePercentage: 'Custom',
    icon: Crown, accent: '#f59e0b', cta: 'Contact Sales', highlighted: false,
    features: [
      { text: 'Unlimited recruiters', included: true },
      { text: 'Unlimited assessments', included: true },
      { text: 'Real problem-solving assessments', included: true },
      { text: 'Keystroke replay with ML analysis', included: true },
      { text: 'Custom analytics & reporting', included: true },
      { text: 'All features included', included: true },
      { text: 'Assessment library with custom templates', included: true },
      { text: 'Video interviews with advanced features', included: true },
      { text: 'Dedicated account manager', included: true },
      { text: 'Custom integrations, SLAs, & more', included: true },
    ],
  },
]

const faqs = [
  { q: 'What counts as a "hired candidate"?', a: 'A hired candidate is someone who was assessed through Ember and accepted an offer from your company within 90 days of their assessment submission. If a candidate is assessed but not hired, there\'s no performance fee.' },
  { q: 'How does the performance percentage work?', a: 'It\'s simple: you pay the flat monthly fee + a percentage of your total first-year salary spend on candidates hired through Ember. For example, if you hire 3 engineers at $120k/year each ($360k total), you\'d pay 12% of $360k = $43,200 as the performance fee (plus your monthly flat fee). The percentage decreases with volume, so you pay less per hire as you scale.' },
  { q: 'When do I pay the performance fee?', a: 'The performance fee is calculated and billed at the end of each month based on hires from the previous 90 days. You\'ll see an itemized invoice showing each hire and the calculated percentage.' },
  { q: 'Can I switch tiers mid-month?', a: 'Yes! We prorate charges when you upgrade or downgrade. If you start on Starter and upgrade to Growth mid-month, you\'ll pay the difference prorated for the remaining days.' },
  { q: 'Is there a long-term contract required?', a: 'No contracts required. You can cancel anytime. We just ask for 30 days notice. We\'re confident you\'ll love Ember—if you don\'t, we\'ll refund your last month\'s flat fee, no questions asked.' },
  { q: 'Does the performance fee include contractors or international hires?', a: 'Yes, the performance fee applies to all hired candidates regardless of employment type (full-time, contractor, part-time) or location. We only exclude candidates who were pre-hired before using Ember.' },
  { q: 'What\'s included in "video interviews"?', a: 'Video interviews include real-time video + audio + shared code editor during live interviews. Recordings are retained for 7 days with pre-authorized recruiter access only (see our privacy policy). Coming Q3 2026.' },
  { q: 'Do you offer annual pricing discounts?', a: 'Yes! Pay annually and get 2 months free (20% discount). Annual billing is available for all tiers.' },
]

export default function Billing() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly')
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  const exampleHires = 5
  const exampleSalary = 120000
  const totalSalary = exampleHires * exampleSalary
  const emberTotal = 166 * 12 + Math.floor(totalSalary * 0.04)
  const gunTotal = Math.floor(totalSalary * 0.20)
  const savings = gunTotal - emberTotal
  const cheaperPct = Math.floor((1 - emberTotal / gunTotal) * 100)

  return (
    <div style={styles.page}>
      {/* Scoped animated background */}
      <div style={styles.bg}>
        <div className="ember-blob" style={{ ...styles.blob, top: '-40px', left: '15%', background: 'var(--color-primary)' }} />
        <div className="ember-blob ember-blob-delay-2000" style={{ ...styles.blob, top: '120px', right: '15%', background: '#f59e0b' }} />
        <div className="ember-blob ember-blob-delay-4000" style={{ ...styles.blob, top: '420px', left: '45%', background: '#ea580c' }} />
      </div>

      <div style={styles.content}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.eyebrow}>SIMPLE, TRANSPARENT PRICING</div>
          <h1 style={styles.h1}>Pricing That Aligns With Your Success</h1>
          <p style={styles.lede}>
            Pay a flat monthly fee + a performance percentage when you hire. The more you grow, the less you pay per hire.
          </p>
          <div style={styles.toggleRow}>
            <button
              onClick={() => setBillingPeriod('monthly')}
              style={billingPeriod === 'monthly' ? styles.toggleActive : styles.toggle}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod('annual')}
              style={billingPeriod === 'annual' ? styles.toggleActive : styles.toggle}
            >
              Annual <span style={styles.toggleSave}>(Save 20%)</span>
            </button>
          </div>
        </div>

        {/* Tier cards */}
        <div style={styles.grid}>
          {tiers.map(tier => {
            const Icon = tier.icon
            const annual = tier.basePrice ? Math.floor(tier.basePrice * 12 * 0.8) : null
            const display = billingPeriod === 'annual' ? annual : tier.basePrice
            return (
              <div key={tier.name} style={{ ...styles.card, ...(tier.highlighted ? styles.cardHi : {}) }}>
                {tier.highlighted && <span style={styles.popular}>Most Popular</span>}

                <div style={{ ...styles.iconWrap, backgroundColor: 'rgba(249, 115, 22, 0.12)' }}>
                  <Icon size={22} color={tier.accent} />
                </div>
                <h3 style={styles.cardName}>{tier.name}</h3>
                <p style={styles.cardDesc}>{tier.description}</p>

                <div style={styles.priceBlock}>
                  {display !== null ? (
                    <>
                      <div style={styles.priceRow}>
                        <span style={styles.price}>${display.toLocaleString()}</span>
                        <span style={styles.priceUnit}>{billingPeriod === 'annual' ? '/year' : '/month'}</span>
                      </div>
                      <p style={styles.perHire}>
                        + <span style={{ color: ORANGE, fontWeight: 600 }}>{tier.performancePercentage}%</span> per hire (over 90 days)
                      </p>
                    </>
                  ) : (
                    <>
                      <p style={{ ...styles.price, color: ORANGE }}>Custom Pricing</p>
                      <p style={styles.perHire}>Negotiable percentage based on volume</p>
                    </>
                  )}
                </div>

                <button style={tier.highlighted ? styles.ctaHi : styles.cta}>
                  {tier.cta} <ArrowRight size={16} />
                </button>

                <div style={styles.features}>
                  {tier.features.map((f, i) => (
                    <div key={i} style={styles.featureRow}>
                      {f.included
                        ? <Check size={18} color={ORANGE} style={{ flexShrink: 0, marginTop: '1px' }} />
                        : <X size={18} color="var(--color-text-tertiary)" style={{ flexShrink: 0, marginTop: '1px' }} />}
                      <span style={f.included ? styles.featureOn : styles.featureOff}>{f.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* ROI calculator */}
        <div style={styles.section}>
          <h2 style={styles.h2}>See How Much You Save</h2>
          <div style={styles.roiGrid}>
            <div style={{ ...styles.roiCard, borderColor: 'rgba(249, 115, 22, 0.3)' }}>
              <h3 style={styles.roiTitle}><span style={{ color: ORANGE }}>✓</span> Ember</h3>
              <div style={styles.roiRow}><span style={styles.muted}>Growth tier (monthly)</span><span style={styles.strong}>$166</span></div>
              <div style={styles.roiRow}><span style={styles.muted}>Performance fee (4% × ${totalSalary.toLocaleString()})</span><span style={styles.strong}>${Math.floor(totalSalary * 0.04).toLocaleString()}</span></div>
              <div style={styles.roiTotal}><span style={styles.strong}>Total for 5 hires/year</span><span style={{ color: ORANGE, fontWeight: 700, fontSize: '18px' }}>${emberTotal.toLocaleString()}</span></div>
            </div>

            <div style={styles.roiCard}>
              <h3 style={styles.roiTitle}><span style={{ color: 'var(--color-text-tertiary)' }}>✗</span> Gun.io (20% fee)</h3>
              <div style={styles.roiRow}><span style={styles.muted}>Platform fee</span><span style={styles.strong}>$0</span></div>
              <div style={styles.roiRow}><span style={styles.muted}>Placement fee (20% × ${totalSalary.toLocaleString()})</span><span style={styles.strong}>${gunTotal.toLocaleString()}</span></div>
              <div style={styles.roiTotal}><span style={styles.strong}>Total for 5 hires/year</span><span style={{ color: 'var(--color-text-secondary)', fontWeight: 700, fontSize: '18px' }}>${gunTotal.toLocaleString()}</span></div>
            </div>

            <div style={styles.saveCard}>
              <h3 style={{ ...styles.roiTitle, color: ORANGE }}>You Save</h3>
              <p style={styles.muted}>At scale, Ember is significantly more cost-effective than traditional agencies.</p>
              <div style={styles.saveNum}>${savings.toLocaleString()}</div>
              <p style={styles.saveSub}>+{cheaperPct}% cheaper per year</p>
            </div>
          </div>
          <p style={styles.footnote}>*Based on hiring 5 engineers at $120k/year each through Ember Growth tier vs. Gun.io 20% placement fee</p>
        </div>

        {/* FAQ */}
        <div style={styles.section}>
          <h2 style={styles.h2}>Frequently Asked Questions</h2>
          <div style={styles.faqList}>
            {faqs.map((faq, idx) => (
              <div key={idx} style={styles.faqItem}>
                <button onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)} style={styles.faqBtn}>
                  <span style={styles.faqQ}>
                    <HelpCircle size={18} color={ORANGE} style={{ flexShrink: 0 }} />
                    {faq.q}
                  </span>
                  <span style={{ color: ORANGE, transition: 'transform 0.2s', transform: expandedFaq === idx ? 'rotate(180deg)' : 'none' }}>▼</span>
                </button>
                {expandedFaq === idx && <div style={styles.faqA}>{faq.a}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* CTA footer */}
        <div style={styles.ctaFooterWrap}>
          <div style={styles.ctaFooter}>
            <h2 style={styles.h2}>Ready to hire better engineers?</h2>
            <p style={styles.lede}>Start a free 14-day trial. No credit card required. See how Ember can transform your hiring process.</p>
            <button style={styles.ctaHi}>Start Free Trial <ArrowRight size={16} /></button>
            <p style={styles.footnote}>14-day free trial. Cancel anytime. Full access to all features.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

const card: React.CSSProperties = {
  background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-xl)', padding: '28px', boxShadow: 'var(--shadow-md)',
}

const styles: Record<string, React.CSSProperties> = {
  page: { position: 'relative', overflow: 'hidden', margin: '-48px -56px', padding: '48px 56px' },
  bg: { position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', opacity: 0.18 },
  blob: { position: 'absolute', width: '360px', height: '360px', borderRadius: '50%', filter: 'blur(70px)' },
  content: { position: 'relative', zIndex: 1, maxWidth: '1100px', margin: '0 auto' },

  header: { textAlign: 'center', maxWidth: '760px', margin: '0 auto 48px' },
  eyebrow: { display: 'inline-block', marginBottom: '16px', padding: '6px 14px', borderRadius: '999px', background: 'rgba(249, 115, 22, 0.12)', border: '1px solid rgba(249, 115, 22, 0.4)', color: ORANGE, fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em' },
  h1: { fontSize: '44px', lineHeight: 1.1, fontWeight: 700, margin: '0 0 20px', fontFamily: 'var(--font-display)', background: GRADIENT, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', WebkitTextFillColor: 'transparent' },
  lede: { fontSize: '18px', color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: '0 0 28px' },
  toggleRow: { display: 'flex', justifyContent: 'center', gap: '12px' },
  toggle: { padding: '9px 20px', borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: '14px', cursor: 'pointer', background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' },
  toggleActive: { padding: '9px 20px', borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: '14px', cursor: 'pointer', background: 'var(--color-primary)', color: '#fff', border: '1px solid var(--color-primary)' },
  toggleSave: { fontSize: '11px', marginLeft: '6px', color: ORANGE_LIGHT },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '80px', alignItems: 'start' },
  card: { ...card, position: 'relative', display: 'flex', flexDirection: 'column' },
  cardHi: { borderColor: 'rgba(249, 115, 22, 0.6)', boxShadow: '0 10px 40px rgba(249, 115, 22, 0.18)' },
  popular: { position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', padding: '4px 14px', borderRadius: '999px', background: GRADIENT, color: '#fff', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' },
  iconWrap: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '46px', height: '46px', borderRadius: 'var(--radius-md)', marginBottom: '16px' },
  cardName: { fontSize: '22px', fontWeight: 700, margin: '0 0 4px', color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' },
  cardDesc: { fontSize: '13px', color: 'var(--color-text-tertiary)', margin: '0 0 20px' },
  priceBlock: { marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid var(--color-border-light)' },
  priceRow: { display: 'flex', alignItems: 'baseline', gap: '8px' },
  price: { fontSize: '36px', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)', margin: 0 },
  priceUnit: { color: 'var(--color-text-tertiary)', fontSize: '14px' },
  perHire: { color: 'var(--color-text-secondary)', fontSize: '13px', margin: '8px 0 0' },
  cta: { width: '100%', padding: '11px', borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: '14px', cursor: 'pointer', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' },
  ctaHi: { width: '100%', padding: '11px', borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: '14px', cursor: 'pointer', marginBottom: '24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: GRADIENT, color: '#fff', border: 'none', boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)' },
  features: { display: 'flex', flexDirection: 'column', gap: '11px' },
  featureRow: { display: 'flex', alignItems: 'flex-start', gap: '10px' },
  featureOn: { fontSize: '13px', color: 'var(--color-text-secondary)' },
  featureOff: { fontSize: '13px', color: 'var(--color-text-tertiary)', textDecoration: 'line-through' },

  section: { marginBottom: '80px' },
  h2: { fontSize: '30px', fontWeight: 700, textAlign: 'center', margin: '0 0 40px', color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' },
  roiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px', maxWidth: '900px', margin: '0 auto 16px' },
  roiCard: { ...card },
  roiTitle: { fontSize: '16px', fontWeight: 600, margin: '0 0 18px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-primary)' },
  roiRow: { display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' },
  muted: { color: 'var(--color-text-secondary)', fontSize: '13px' },
  strong: { fontWeight: 600, color: 'var(--color-text-primary)', fontSize: '13px' },
  roiTotal: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border)', paddingTop: '12px', marginTop: '6px' },
  saveCard: { ...card, background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.14), rgba(245, 158, 11, 0.10))', border: '1px solid rgba(249, 115, 22, 0.5)', display: 'flex', flexDirection: 'column', justifyContent: 'center' },
  saveNum: { fontSize: '38px', fontWeight: 700, color: ORANGE, fontFamily: 'var(--font-display)', margin: '12px 0 4px' },
  saveSub: { fontSize: '12px', color: 'var(--color-text-tertiary)', margin: 0 },
  footnote: { textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '13px', margin: 0 },

  faqList: { display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '760px', margin: '0 auto' },
  faqItem: { ...card, padding: 0, overflow: 'hidden' },
  faqBtn: { width: '100%', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' },
  faqQ: { display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 600, fontSize: '14px', color: 'var(--color-text-primary)' },
  faqA: { padding: '0 20px 18px 50px', color: 'var(--color-text-secondary)', fontSize: '14px', lineHeight: 1.6 },

  ctaFooterWrap: { display: 'flex', justifyContent: 'center' },
  ctaFooter: { ...card, maxWidth: '620px', textAlign: 'center', padding: '48px', background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.14), rgba(245, 158, 11, 0.08))', border: '1px solid rgba(249, 115, 22, 0.5)' },
}
