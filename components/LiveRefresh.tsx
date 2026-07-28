'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Keeps a server-rendered page current without a manual reload.
 *
 * Next's App Router keeps a client-side Router Cache, so a tab that's already
 * open keeps showing the payload it fetched earlier -- which is why a lender
 * rename or a new draw made in the admin area didn't appear on an open
 * borrower link. router.refresh() re-fetches the server component tree.
 *
 * Refreshes when the tab regains focus or becomes visible (covers the common
 * "switch back to the borrower tab" case instantly) and on a slow interval
 * while visible, so a statement left open on screen keeps up on its own.
 */
export default function LiveRefresh({ intervalMs = 15000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const refresh = () => router.refresh();

    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') refresh();
      }, intervalMs);
    };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') { refresh(); start(); }
      else stop();
    };

    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    if (document.visibilityState === 'visible') start();

    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [router, intervalMs]);

  return null;
}
