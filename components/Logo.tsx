import * as React from 'react';

/**
 * Jay Capital Funding mark.
 *
 * An arch with a keystone: the arch is the building the money is for, the
 * keystone is the piece that lets it stand. The right leg drops and hooks
 * left, so the whole figure also reads as a J. Navy is the portal's own
 * --navy; the keystone is brass, which is where the warmth comes from --
 * navy on its own reads cold and institutional.
 */
export function LogoMark({ size = 40, tone = 'navy' }: { size?: number; tone?: 'navy' | 'light' }) {
  const stroke = tone === 'light' ? '#FFFFFF' : '#1F3864';
  const key = tone === 'light' ? '#E4C07A' : '#B08A4A';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M14 55 L14 30 A18 18 0 0 1 50 30 L50 45 A9 9 0 0 1 32 45"
        stroke={stroke} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
      />
      <path d="M25.5 9.5 L38.5 9.5 L41 20 L23 20 Z" fill={key} />
    </svg>
  );
}

export default function Logo({
  size = 40, tone = 'navy', showWordmark = true,
}: { size?: number; tone?: 'navy' | 'light'; showWordmark?: boolean }) {
  const ink = tone === 'light' ? '#FFFFFF' : '#1F3864';
  const sub = tone === 'light' ? 'rgba(255,255,255,.72)' : '#B08A4A';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
      <LogoMark size={size} tone={tone} />
      {showWordmark && (
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <span style={{
            fontFamily: 'var(--display)', fontWeight: 600, color: ink,
            fontSize: size * 0.46, letterSpacing: '.01em',
          }}>
            Jay Capital
          </span>
          <span style={{
            fontFamily: 'var(--body)', fontWeight: 700, color: sub,
            fontSize: size * 0.235, letterSpacing: '.26em', textTransform: 'uppercase',
            marginTop: size * 0.09,
          }}>
            Funding
          </span>
        </span>
      )}
    </span>
  );
}
