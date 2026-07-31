'use client';

import Logo from '@/components/Logo';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { browserClient } from '@/lib/supabase-browser';

/**
 * Auth landing page for every email link (invite, recovery, magic link).
 *
 * This used to be a server route handler, which could only ever read
 * `?code=`. Supabase's server-generated email links go through its /verify
 * endpoint and come back with the tokens in the URL **fragment**
 * (#access_token=...). Fragments are never sent to the server, so the old
 * handler saw nothing, bounced the user to /login, and an invited user could
 * never finish setting a password. Running this in the browser lets us read
 * all three shapes.
 */
function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const supabase = browserClient();
    const next = params.get('next') || '/';

    (async () => {
      // Errors can arrive on the query string or in the fragment.
      const hash = new URLSearchParams(
        typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : ''
      );
      const errDesc = params.get('error_description') || hash.get('error_description');
      if (errDesc) { setError(errDesc); return; }

      const accessToken = hash.get('access_token');
      const refreshToken = hash.get('refresh_token');
      const code = params.get('code');
      const tokenHash = params.get('token_hash');
      const type = params.get('type') || hash.get('type');

      try {
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken, refresh_token: refreshToken,
          });
          if (error) throw error;
        } else if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as any });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          setError('This link is missing its sign-in token. It may have already been used, or it may have expired.');
          return;
        }
      } catch (e: any) {
        setError(e?.message || 'That link could not be used. Please ask for a new one.');
        return;
      }

      // Invites and password resets must land on the set-password screen.
      const dest = (type === 'invite' || type === 'recovery' || type === 'signup')
        ? '/auth/set-password'
        : next;
      router.replace(dest);
      router.refresh();
    })();
  }, [params, router]);

  return (
    <div className="auth-shell">
      <div className="auth-card card">
        <div style={{ display: 'flex', justifyContent: 'center' }}><Logo size={30} variant="stacked" /></div>
        <div className="rule" />
        {error ? (
          <>
            <div className="alert error">{error}</div>
            <a className="btn" style={{ width: '100%', textAlign: 'center', textDecoration: 'none', display: 'block' }} href="/login">
              Back to sign in
            </a>
          </>
        ) : (
          <p className="muted" style={{ textAlign: 'center' }}>Signing you in&hellip;</p>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="auth-shell"><div className="auth-card card"><div style={{ display: 'flex', justifyContent: 'center' }}><Logo size={30} variant="stacked" /></div></div></div>}>
      <CallbackInner />
    </Suspense>
  );
}
