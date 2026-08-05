'use client';

import { useState } from 'react';
import { Modal } from '@/components/Modal';

const ADDRESS = 'Yossi@JayCapitalFunding.com';

/**
 * "Email us" that works everywhere.
 *
 * Deliberately no mailto: option. On a device with no mail client registered
 * it does nothing at all -- no error, no tab -- and there is no reliable way
 * to tell that apart from success, so it was a button that sometimes silently
 * failed. The webmail composers always load a real page, and copying the
 * address covers every other client.
 */
export default function EmailUs({
  subject = 'Jay Capital Funding enquiry',
  label = 'Email us',
  className = 'btn secondary',
}: { subject?: string; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const s = encodeURIComponent(subject);
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(ADDRESS)}&su=${s}`;
  const outlook = `https://outlook.live.com/mail/0/deeplink/compose?to=${encodeURIComponent(ADDRESS)}&subject=${s}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>

      <Modal open={open} onClose={() => setOpen(false)} title="Email Jay Capital Funding" maxWidth={460}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            background: 'var(--pale)', borderRadius: 8, padding: '12px 14px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          }}>
            <span style={{ fontWeight: 700, color: 'var(--navy)', wordBreak: 'break-all' }}>{ADDRESS}</span>
            <button className="btn secondary" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          </div>

          <a className="btn" href={gmail} target="_blank" rel="noopener noreferrer"
             style={{ textAlign: 'center', textDecoration: 'none' }}>
            Compose in Gmail
          </a>
          <a className="btn secondary" href={outlook} target="_blank" rel="noopener noreferrer"
             style={{ textAlign: 'center', textDecoration: 'none' }}>
            Compose in Outlook
          </a>

          <p className="muted" style={{ fontSize: 12, margin: '2px 0 0', textAlign: 'center' }}>
            Using a different email app? Copy the address above. Or call (845) 828-0731.
          </p>
        </div>
      </Modal>
    </>
  );
}
