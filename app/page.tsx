import Link from 'next/link';
import type { Metadata } from 'next';
import Logo from '@/components/Logo';
import { todayInAppTz } from '@/lib/format';
import ContactForm from '@/components/ContactForm';
import EmailUs from '@/components/EmailUs';

export const metadata: Metadata = {
  title: 'Jay Capital Funding — Residential, Commercial, HELOC & Hard Money Lending',
  description:
    'Jay Capital Funding arranges residential, commercial, home equity and hard money financing, and stays on the file through closing and every draw after it.',
};

const PHONE = '(845) 828-0731';
const PHONE_HREF = 'tel:+18458280731';
const EMAIL = 'Info@JayCapitalFunding.com';
// subject prefilled so the message lands looking like an enquiry, not blank

const SERVICES = [
  { tag: 'Residential', title: 'Homes and rentals',
    body: 'Purchases and refinances for the house you live in and the ones you rent out — including borrowers whose income does not fit a standard box.' },
  { tag: 'Commercial', title: 'Income-producing property',
    body: 'Multifamily, mixed-use, retail and office. Acquisition, refinance, and cash-out against property you already hold.' },
  { tag: 'HELOC', title: 'Home equity line of credit',
    body: 'Draw against equity you have already built, and pay interest only on what you actually use — useful when a project’s timing is not yet fixed.' },
  { tag: 'Hard money', title: 'Speed and construction',
    body: 'Asset-based capital when a deal will not wait for a conventional timeline, with construction draws released as the work gets done.' },
];

const STEPS = [
  { n: '01', title: 'Tell us about the deal',
    body: 'A short call about the property, the numbers, and when you need to close.' },
  { n: '02', title: 'Get real terms',
    body: 'We take it to the lenders who actually fit the file and come back with terms you can compare side by side, not a rate teaser.' },
  { n: '03', title: 'Close, then draw',
    body: 'We stay on the file through closing. Afterwards your loan lives in the borrower portal, where every statement and construction draw is tracked to the dollar.' },
];

export default function LandingPage() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-shell lp-nav-in">
          <Link href="/" aria-label="Jay Capital Funding home" style={{ textDecoration: 'none' }}>
            <Logo size={34} />
          </Link>
          <nav className="lp-nav-links">
            <a href="#services">Lending</a>
            <a href="#how">How it works</a>
            <a href="#contact">Contact</a>
            <Link className="lp-btn" href="/login">Borrower Portal</Link>
          </nav>
        </div>
      </header>

      {/* The signature is the term sheet: the real artifact of this business,
          drawn in the same card language as the statements borrowers get inside. */}
      <section className="lp-hero">
        <div className="lp-shell lp-hero-grid">
          <div>
            <div className="lp-eyebrow">Residential &middot; Commercial &middot; HELOC &middot; Hard money</div>
            <div className="lp-rule" style={{ marginTop: 18 }} />
            <h1>One stop.<br />Every loan.<br />Right solution.</h1>
            <p className="lp-lede">
              Most borrowers end up explaining their deal four times to four different
              people. Bring it here once. We find the lender it belongs with, structure
              it properly, and stay on the file long after the wire clears.
            </p>
            <div className="lp-cta-row">
              <a className="lp-btn brass" href={PHONE_HREF}>Call us</a>
              <a className="lp-btn ghost" href="#contact">Email us</a>
            </div>
          </div>

          <div className="lp-sheet" aria-label="Illustrative term sheet">
            <div className="lp-sheet-head">
              <span>Term Sheet</span>
              <span style={{ letterSpacing: '.08em', opacity: .72 }}>Illustrative</span>
            </div>
            <div className="lp-sheet-body">
              <div className="lp-sheet-row"><span className="k">Product</span><span className="v">Hard money &middot; construction</span></div>
              <div className="lp-sheet-row"><span className="k">Loan amount</span><span className="v">$1,000,000</span></div>
              <div className="lp-sheet-row"><span className="k">Acquisition</span><span className="v">$700,000</span></div>
              <div className="lp-sheet-row"><span className="k">Construction budget</span><span className="v">$300,000</span></div>
              <div className="lp-sheet-row"><span className="k">Structure</span><span className="v">Interest only</span></div>
              <div className="lp-sheet-row"><span className="k">Draws</span><span className="v">Released as work completes</span></div>
            </div>
            <div className="lp-sheet-note">
              An illustration of how a file is laid out, not an offer of credit. Your terms
              depend on the property, the plan, and your file.
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section alt" id="services">
        <div className="lp-shell">
          <div className="lp-head">
            <div className="lp-eyebrow">What we arrange</div>
            <h2 style={{ marginTop: 14 }}>Four kinds of lending, one relationship.</h2>
            <p>
              A borrower rarely needs the same thing twice. The house, the building, the
              equity line and the fix-and-flip all get financed differently — so we place
              each one where it belongs instead of forcing it through a single product.
            </p>
          </div>
          <div className="lp-grid">
            {SERVICES.map(s => (
              <article className="lp-card" key={s.tag}>
                <span className="lp-tag">{s.tag}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section" id="how">
        <div className="lp-shell">
          <div className="lp-head">
            <div className="lp-eyebrow">How it works</div>
            <h2 style={{ marginTop: 14 }}>Three steps, and you keep our number.</h2>
          </div>
          <div className="lp-steps">
            {STEPS.map(s => (
              <div className="lp-step" key={s.n}>
                <div className="lp-step-n">{s.n}</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section alt">
        <div className="lp-shell lp-hero-grid">
          <div>
            <div className="lp-eyebrow">The borrower portal</div>
            <h2 style={{ marginTop: 14 }}>Your loan, in plain numbers.</h2>
            <p style={{ color: '#4A5568', fontSize: 17, maxWidth: '48ch', marginTop: 14 }}>
              Every Jay Capital borrower gets a private portal: current balance, what has
              been disbursed, what is left to draw, every payment received, and a
              downloadable statement for any month — without a phone call to find out
              where you stand.
            </p>
            <div className="lp-cta-row" style={{ marginTop: 26 }}>
              <Link className="lp-btn" href="/login">Open the portal</Link>
            </div>
          </div>
          <div className="lp-sheet">
            <div className="lp-sheet-head"><span>Account Activity</span></div>
            <div className="lp-sheet-body">
              <div className="lp-sheet-row"><span className="k">Previous Balance</span><span className="v">$7,603.83</span></div>
              <div className="lp-sheet-row"><span className="k">Payments Received</span><span className="v">($3,000.00)</span></div>
              <div className="lp-sheet-row"><span className="k">Previous Open Balance</span><span className="v">$4,603.83</span></div>
              <div className="lp-sheet-row"><span className="k">Current Charges</span><span className="v">$7,680.00</span></div>
              <div className="lp-sheet-row" style={{ background: 'var(--pale)', padding: 12, borderRadius: 8, borderBottom: 'none', marginTop: 6 }}>
                <span className="k" style={{ fontSize: 16 }}>Amount Due</span>
                <span className="v" style={{ fontWeight: 800, fontSize: 16, color: 'var(--navy)' }}>$12,283.83</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-contact" id="contact" style={{ scrollMarginTop: 80 }}>
        <div className="lp-shell">
          <div className="lp-eyebrow" style={{ color: 'var(--brass-lt)' }}>Get in touch</div>
          <h2 style={{ marginTop: 14 }}>Tell us about the deal.</h2>
          <p style={{ marginTop: 14 }}>
            Call and you will speak to someone who can tell you whether it is financeable.
            If it is not a fit, we will say so on the first call.
          </p>
          <div className="lp-contact-grid">
            <div className="lp-contact-aside">
              <div className="lp-contact-item">
                <span className="lbl">Call</span>
                <a href={PHONE_HREF}>{PHONE}</a>
              </div>
              <div className="lp-contact-item">
                <span className="lbl">Email</span>
                <a href="#contact-form">{EMAIL}</a>
              </div>
              <div className="lp-contact-item">
                <span className="lbl">Office</span>
                <span className="lp-contact-plain">8 Murin Street<br />Spring Valley, NY 10977</span>
              </div>
              <p className="lp-contact-hint">
                Prefer to email us directly? <EmailUs className="lp-linkbtn" label="Get the address" subject="Loan enquiry" />
              </p>
            </div>
            <div id="contact-form" style={{ scrollMarginTop: 90 }}>
              <ContactForm />
            </div>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-shell lp-foot-row">
          <Logo size={30} tone="light" />
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
            <a href={PHONE_HREF}>{PHONE}</a>
            <a href="#contact">{EMAIL}</a>
            <Link href="/login">Borrower Portal</Link>
          </div>
          <div>&copy; {todayInAppTz().getFullYear()} Jay Capital Funding Inc.</div>
        </div>
      </footer>
    </div>
  );
}
