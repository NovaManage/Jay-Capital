import nodemailer from 'nodemailer';
import { EMAIL_LOGO_BASE64, EMAIL_LOGO_CID } from '@/lib/email-logo';

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
  /** Marketing name, for headings and prose. */
  company: 'Jay Capital Funding',
  /** Registered name, for footers, statements and anywhere formal. */
  legal: 'Jay Capital Funding Inc.',
  address: '33 Downtown Drive, Suite 501, Monsey, NY 10952',
  phone: '(845) 828-0731',
  email: 'Info@JayCapitalFunding.com',
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

/**
 * Branded card wrapper, so every email we send looks like the same company.
 * The header is the logo itself, referenced by cid so it renders without the
 * recipient having to allow remote images.
 */
export function brandShell(inner: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#F7F9FC;font-family:Arial,Helvetica,sans-serif;color:#333">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E4EAF3;border-radius:10px;padding:28px">
      <img src="cid:${EMAIL_LOGO_CID}" alt="${BRAND.company}" width="200"
           style="display:block;width:200px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none" />
      <div style="height:2px;background:${GOLD};border-radius:2px;margin:14px 0 20px"></div>
      ${inner}
      <div style="border-top:1px solid #E4EAF3;margin:22px 0 0;padding-top:14px;color:${MUTED};font-size:12px;line-height:1.7">
        <b style="color:${NAVY}">${BRAND.legal}</b><br/>
        ${BRAND.address}<br/>
        <a href="tel:+18458280731" style="color:${MUTED};text-decoration:none">${BRAND.phone}</a>
        &nbsp;&middot;&nbsp;
        <a href="mailto:${BRAND.email}" style="color:${MUTED};text-decoration:none">${BRAND.email}</a>
      </div>
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

  // The logo travels with the message so it shows even when remote images
  // are blocked. cid attachments are inline and don't appear as downloads.
  const logo = {
    filename: 'jay-capital-funding.png',
    content: Buffer.from(EMAIL_LOGO_BASE64, 'base64'),
    contentType: 'image/png',
    cid: EMAIL_LOGO_CID,
    contentDisposition: 'inline' as const,
  };

  await t.sendMail({
    from: `${BRAND.company} <${from}>`,
    to: opts.to,
    replyTo: opts.replyTo || from,
    subject: opts.subject,
    html: opts.html,
    attachments: [logo, ...(opts.attachments ?? [])],
  });
}
