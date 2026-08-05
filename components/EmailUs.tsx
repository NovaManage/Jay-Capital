'use client';

import { useState } from 'react';
import { Modal } from '@/components/Modal';

const ADDRESS = 'Yossi@JayCapitalFunding.com';

/**
 * "Email us" that works everywhere.
 *
 * A bare mailto: does nothing on a device with no mail client registered --
 * no error, no tab, nothing. This offers the webmail composers plus a copy
 * button, and keeps mailto for people who do have a client.
 */
export default function EmailUs({
  subject = 'Jay Capital Funding enquiry',
  label = 'Email us',
  className = 'btn secondary',
}: { subject?: string; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [noMailApp, setNoMailApp] = useState(false);

  const s = encodeURIComponent(subject);
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(ADDRESS)}&su=${s}`;
  const outlook = `https://outlook.live.com/mail/0/deeplink/compose?to=${encodeURIComponent(ADDRESS)}&subject=${s}`;

  /**
   * Hand off to the device's mail client without risking a blank tab.
   *
   * target="_blank" is the obvious approach and the wrong one: when no mail
   * client is registered the new tab opens and just sits there empty. Setting
   * location.href on the CURRENT tab is safe -- an unhandled mailto: does not
   * navigate the page anywhere, it simply does nothing.
   *
   * The catch is that "nothing" is indistinguishable from success to the user,
   * so we watch for the handoff: if a client opens, the browser loses focus or
   * the page is hidden. If neither happens within a moment, nothing took the
   * link, and we say so and point at the alternatives.
   */
  function openMailApp() {
    setNoMailApp(false);
    let handedOff = false;
    const mark = () => { handedOff = true; };

    window.addEventListener('blur', mark);
    document.addEventListener('visibilitychange', mark);
    window.addEventListener('pagehide', mark);

    window.location.href = `mailto:${ADDRESS}?subject=${s}`;

    window.setTimeout(() => {
      window.removeEventListener('blur', mark);
      document.removeEventListener('visibilitychange', mark);
      window.removeEventListener('pagehide', mark);
      if (!handedOff) setNoMailApp(true);
    }, 1200);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch { setCopied(false); }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => { setNoMailApp(false); setOpen(true); }}>{label}</button>

      <Modal open={open} onClose={() => setOpen(false)} title="Email Jay Capital Funding" maxWidth={460}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            background: 'var(--pale)', borderRadius: 8, padding: '12px 14px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          }}>
            <span style={{ fontWeight: 700, color: 'var(--navy)', wordBreak: 'break-all' }}>{ADDRESS}</span>
            <button className="btn secondary" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          </div>

          <button type="button" className="btn" onClick={openMailApp}>
            Open my email app
          </button>

          {noMailApp && (
            <div className="alert info" style={{ margin: 0 }}>
              This device doesn&apos;t seem to have an email app set up. Use Gmail or
              Outlook below, or copy the address and paste it wherever you read email.
            </div>
          )}
          <a className="btn secondary" href={gmail} target="_blank" rel="noopener noreferrer" style={{ textAlign: 'center', textDecoration: 'none' }}>
            Compose in Gmail
          </a>
          <a className="btn secondary" href={outlook} target="_blank" rel="noopener noreferrer" style={{ textAlign: 'center', textDecoration: 'none' }}>
            Compose in Outlook
          </a>

          <p className="muted" style={{ fontSize: 12, margin: 0, textAlign: 'center' }}>
            Or call (845) 828-0731.
          </p>
        </div>
      </Modal>
    </>
  );
}
