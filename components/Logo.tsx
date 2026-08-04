import * as React from 'react';

/**
 * Jay Capital Funding identity, taken from the supplied branding package.
 *
 * The mark is the traced vector of the supplied artwork (public/logo-mark.svg)
 * so it stays crisp at any size instead of being an upscaled bitmap. The gold
 * gradient and the ink colour are sampled from the same artwork.
 */
const INK = '#04162A';     // wordmark navy from the branding sheet
const GOLD = '#C0954A';    // FUNDING gold from the branding sheet

export function LogoMark({ size = 40, tone = 'navy' }: { size?: number; tone?: 'navy' | 'light' }) {
  // artwork is taller than it is wide (1168 x 1728). On dark grounds the
  // white cut from the brand kit reads better than the gold gradient.
  return (
    <img
      src={tone === 'light' ? '/logo-mark-white.svg' : '/logo-mark.svg'}
      alt=""
      aria-hidden="true"
      width={Math.round(size * (1168 / 1728))}
      height={size}
      style={{ display: 'block' }}
    />
  );
}

function Wordmark({ size, tone }: { size: number; tone: 'navy' | 'light' }) {
  const ink = tone === 'light' ? '#FFFFFF' : INK;
  const rule = tone === 'light' ? 'rgba(232,197,131,.75)' : GOLD;
  return (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
      <span style={{
        fontFamily: 'var(--logo)', fontWeight: 400, color: ink,
        fontSize: size, letterSpacing: '.12em', whiteSpace: 'nowrap',
      }}>
        JAY CAPITAL
      </span>
      <span style={{
        display: 'flex', alignItems: 'center', gap: size * 0.3,
        width: '100%', marginTop: size * 0.28,
      }}>
        <span style={{ flex: 1, height: 1, background: rule, opacity: .85 }} />
        <span style={{
          fontFamily: 'var(--logo)', fontWeight: 400, color: GOLD,
          fontSize: size * 0.44, letterSpacing: '.34em',
          whiteSpace: 'nowrap', textIndent: '.34em',
        }}>
          FUNDING
        </span>
        <span style={{ flex: 1, height: 1, background: rule, opacity: .85 }} />
      </span>
    </span>
  );
}

export default function Logo({
  size = 40, tone = 'navy', variant = 'horizontal', showWordmark = true,
}: {
  size?: number;
  tone?: 'navy' | 'light';
  /** horizontal: mark, hairline divider, wordmark. stacked: mark above wordmark. */
  variant?: 'horizontal' | 'stacked';
  showWordmark?: boolean;
}) {
  if (!showWordmark) return <LogoMark size={size} tone={tone} />;

  if (variant === 'stacked') {
    return (
      <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: size * 0.34 }}>
        <LogoMark size={size * 1.5} tone={tone} />
        <Wordmark size={size * 0.62} tone={tone} />
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.42 }}>
      <LogoMark size={size * 1.15} tone={tone} />
      <span style={{
        width: 1, alignSelf: 'stretch',
        background: tone === 'light' ? 'rgba(255,255,255,.28)' : 'rgba(4,22,42,.18)',
      }} />
      <Wordmark size={size * 0.5} tone={tone} />
    </span>
  );
}
