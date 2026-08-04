import nodemailer from 'nodemailer';

/**
 * The one place email leaves this app.
 *
 * Everything user-facing goes out over our own SMTP so the sender, branding
 * and deliverability are ours, and so we are not spending Supabase's mail
 * quota. Supabase's mailer must never be used: `inviteUserByEmail` and
 * `resetPasswordForEmail` SEND, so neither is called anywhere. Use
 * `auth.admin.generateLink`, which only returns a link, and mail it from here.
 */

export const BRAND = {
  company: 'Jay Capital Funding',
  address: '33 Downtown Dr, Monsey, NY 10952',
  phone: '(845) 828-0731',
  email: 'Yossi@JayCapitalFunding.com',
};

const NAVY = '#04162A', GOLD = '#C0954A', MUTED = '#6B7A90';

function transport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error('Email is not configured yet (SMTP_HOST, SMTP_USER, SMTP_PASS).');
  }
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

export function fromAddress(): string {
  return process.env.SMTP_FROM || process.env.SMTP_USER || BRAND.email;
}

/** Branded card wrapper, so every email we send looks like the same company. */
export function brandShell(inner: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#F7F9FC;font-family:Arial,Helvetica,sans-serif;color:#333">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E4EAF3;border-radius:10px;padding:28px">
      <div style="color:${NAVY};font-weight:800;letter-spacing:.12em;font-size:17px">JAY CAPITAL</div>
      <div style="color:${GOLD};font-weight:700;letter-spacing:.3em;font-size:9px;margin-top:2px">FUNDING</div>
      <div style="height:2px;background:${GOLD};border-radius:2px;margin:12px 0 20px"></div>
      ${inner}
      <p style="margin:20px 0 0;color:${MUTED};font-size:12px">
        ${BRAND.company} &middot; ${BRAND.address} &middot; ${BRAND.phone}
      </p>
    </div></body></html>`;
}

export function button(href: string, label: string): string {
  return `<p style="margin:0 0 18px"><a href="${href}" style="background:${NAVY};color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;display:inline-block;font-weight:600">${label}</a></p>`;
}

export function rawLink(href: string): string {
  return `<p style="margin:0 0 6px;color:${MUTED};font-size:12px;word-break:break-all">Or paste this into your browser:<br/>${href}</p>`;
}

export interface SendOpts {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}

export async function sendMail(opts: SendOpts) {
  const from = fromAddress();
  const t = transport();
  await t.sendMail({
    from: `${BRAND.company} <${from}>`,
    to: opts.to,
    replyTo: opts.replyTo || from,
    subject: opts.subject,
    html: opts.html,
    attachments: opts.attachments,
  });
}
