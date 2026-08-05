'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { browserClient } from '@/lib/supabase-browser';

/**
 * Signs the session out after a period with no activity.
 *
 * The threat is a signed-in machine left unattended, so the countdown has to
 * survive things a naive timer misses:
 *
 *  - Multiple tabs. Activity is shared through localStorage, so working in one
 *    tab keeps the others alive; otherwise a background tab would sign you out
 *    mid-sentence in the one you are using.
 *  - A sleeping laptop. setTimeout does not fire while suspended, so the
 *    deadline is a stored timestamp that is re-checked on every wake, focus
 *    and visibility change. Coming back after the limit signs out immediately
 *    rather than granting a fresh window.
 *  - The warning itself. A silent sign-out mid-task loses work, so there is a
 *    countdown with a way to stay.
 */

// Tunable without a code change: set NEXT_PUBLIC_IDLE_MINUTES in Vercel.
const envMinutes = Number(process.env.NEXT_PUBLIC_IDLE_MINUTES);
const IDLE_MS = (Number.isFinite(envMinutes) && envMinutes > 0 ? envMinutes : 20) * 60 * 1000;
const WARN_MS = 60 * 1000;        // warn for the final minute
const KEY = 'jcf:lastActivity';
const CHECK_MS = 5000;

export default function IdleTimeout({
  idleMs = IDLE_MS, warnMs = Math.min(WARN_MS, IDLE_MS / 2),
}: { idleMs?: number; warnMs?: number }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const signingOut = useRef(false);

  const touch = useCallback(() => {
    try { window.localStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ }
  }, []);

  const lastActivity = useCallback((): number => {
    try {
      const v = Number(window.localStorage.getItem(KEY));
      return Number.isFinite(v) && v > 0 ? v : Date.now();
    } catch { return Date.now(); }
  }, []);

  const signOut = useCallback(async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    try { await browserClient().auth.signOut(); } catch { /* clear what we can */ }
    try { await fetch('/auth/signout', { method: 'POST', credentials: 'include' }); } catch { /* ignore */ }
    try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
    // Hard navigation, so nothing rendered for the signed-in user survives
    // in the client router cache.
    window.location.replace('/login?timedout=1');
  }, []);

  useEffect(() => {
    touch();

    let throttle = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - throttle < 2000) return;   // localStorage on every mousemove is wasteful
      throttle = now;
      touch();
      setSecondsLeft(null);
    };

    const events: (keyof WindowEventMap)[] = [
      'mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel', 'focus',
    ];
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }));

    const check = () => {
      const idle = Date.now() - lastActivity();
      if (idle >= idleMs) { void signOut(); return; }
      if (idle >= idleMs - warnMs) {
        setSecondsLeft(Math.max(0, Math.ceil((idleMs - idle) / 1000)));
      } else {
        setSecondsLeft(null);
      }
    };

    const timer = window.setInterval(check, CHECK_MS);

    // Re-check the moment the tab comes back: the interval does not run while
    // the machine is asleep or the tab is discarded.
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', check);

    check();

    return () => {
      events.forEach(e => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', check);
      window.clearInterval(timer);
    };
  }, [idleMs, warnMs, touch, lastActivity, signOut]);

  if (secondsLeft === null) return null;

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(4,22,42,.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, zIndex: 4000,
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 420,
        boxShadow: '0 14px 46px rgba(4,22,42,.32)', overflow: 'hidden',
      }}>
        <div style={{
          background: 'var(--navy)', color: '#fff', padding: '14px 20px',
          fontWeight: 700, letterSpacing: '.02em',
        }}>
          Still there?
        </div>
        <div style={{ padding: 22 }}>
          <p style={{ margin: '0 0 6px', lineHeight: 1.55 }}>
            You&apos;ll be signed out in{' '}
            <b style={{ color: 'var(--navy)' }}>{secondsLeft}</b> second{secondsLeft === 1 ? '' : 's'}.
          </p>
          <p className="muted" style={{ margin: '0 0 20px', fontSize: 13 }}>
            We sign you out automatically when the screen is left unattended.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn secondary" onClick={() => void signOut()}>Sign out now</button>
            <button className="btn" onClick={() => { touch(); setSecondsLeft(null); }} autoFocus>
              Stay signed in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
