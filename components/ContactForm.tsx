'use client';

import { useState } from 'react';
import { sendEnquiry } from '@/lib/contact';

const TOPICS = ['Residential', 'Commercial', 'HELOC', 'Hard money', 'Not sure yet'];

export default function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [topic, setTopic] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');   // honeypot
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    const res = await sendEnquiry({ name, email, phone, topic, message, website });
    setBusy(false);
    if (!res.ok) { setErr(res.error || 'Could not send your message.'); return; }
    setDone(res.message || 'Thanks — we’ll be in touch shortly.');
  }

  if (done) {
    return (
      <div className="lp-form lp-form-done">
        <div className="lp-eyebrow">Message sent</div>
        <p style={{ margin: '10px 0 0', color: '#4A5568' }}>{done}</p>
      </div>
    );
  }

  return (
    <form className="lp-form" onSubmit={submit}>
      <div className="lp-form-grid">
        <label className="lp-field">
          <span>Name</span>
          <input value={name} onChange={e => setName(e.target.value)} required autoComplete="name" />
        </label>
        <label className="lp-field">
          <span>Email</span>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label className="lp-field">
          <span>Phone <em>optional</em></span>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" />
        </label>
        <label className="lp-field">
          <span>Looking for</span>
          <select value={topic} onChange={e => setTopic(e.target.value)}>
            <option value="">Select…</option>
            {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>

      <label className="lp-field">
        <span>About the deal</span>
        <textarea rows={4} value={message} onChange={e => setMessage(e.target.value)} required
          placeholder="Property, rough numbers, and when you need to close." />
      </label>

      {/* honeypot: off-screen, not hidden, so bots still fill it */}
      <input
        tabIndex={-1} autoComplete="off" aria-hidden="true"
        value={website} onChange={e => setWebsite(e.target.value)}
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
      />

      {err && <div className="lp-form-err">{err}</div>}

      <button className="lp-btn brass" type="submit" disabled={busy} style={{ border: 'none', cursor: 'pointer' }}>
        {busy ? 'Sending…' : 'Send enquiry'}
      </button>
      <p className="lp-form-note">
        Goes straight to our inbox — no email app needed.
      </p>
    </form>
  );
}
