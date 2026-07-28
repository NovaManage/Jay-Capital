'use server';

import { run } from '@/lib/result';
import nodemailer from 'nodemailer';
import { serverClient, serviceClient } from '@/lib/supabase-server';
import { statementPDF } from '@/lib/statement-pdf';
import { statementHTML } from '@/lib/statement-html';
import { firstOfMonth, monthName, money, fmtDate } from '@/lib/format';
import { buildStatement, type Draw as EngineDraw } from '@/lib/interest';
import { buildLedger } from '@/lib/ledger';
import { fetchStatementExtras } from '@/lib/statement-data';

async function requireStaffOrAdmin() {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data: profile } = await supabase.from('profiles').select('role, email, full_name').eq('id', user.id).single();
  if (!profile || !['admin', 'staff'].includes(profile.role)) throw new Error('Staff or admin only');
  return { supabase, profile };
}

function transport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new Error('SMTP is not configured (SMTP_HOST, SMTP_USER, SMTP_PASS).');
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

/**
 * Email a borrower one or more monthly statements.
 * @param loanId   loan to send for
 * @param months   array of YYYY-MM-DD (snapped to first-of-month), one PDF each
 */
export async function emailStatement(loanId: string, months: string[]) {
  return run(async () => {
    const { supabase, profile } = await requireStaffOrAdmin();

    const { data: loan } = await supabase.from('loan_summary').select('*').eq('loan_id', loanId).single();
    if (!loan) throw new Error('Loan not found');
    if (!loan.borrower_email) throw new Error('This borrower has no email on file.');

    const { data: draws } = await supabase.from('draw_details').select('*').eq('loan_id', loanId).order('draw_date', { ascending: true });
    const drawList = draws ?? [];

    const cleanMonths = Array.from(new Set(months.map(m => firstOfMonth(m)))).sort();
    if (cleanMonths.length === 0) throw new Error('Pick at least one statement month.');

    // Attach a PDF per month.
    const attachments = [];
    for (const m of cleanMonths) {
      const pdf = await statementPDF(loan, drawList, m);
      attachments.push({
        filename: `Statement_${loan.borrower_name.replace(/[^a-z0-9]+/gi, '_')}_${m}.pdf`,
        content: Buffer.from(pdf),
        contentType: 'application/pdf',
      });
    }

    // Amount-due summary line(s) for the body.
    const engineDraws: EngineDraw[] = drawList.map((d: any) => ({ draw_date: d.draw_date, amount: Number(d.amount), description: d.description }));
    const dues = cleanMonths.map(m => {
      const s = buildStatement({ loan_amount: Number(loan.loan_amount), acquisition: Number(loan.acquisition), annual_rate: Number(loan.annual_rate), closing_date: loan.closing_date }, engineDraws, m);
      return { label: s.periodLabel, due: s.amountDue };
    });

    const multi = cleanMonths.length > 1;
    const subject = multi
      ? `Your Jay Capital statements (${dues.length} months) \u2014 ${loan.property}`
      : `Your Jay Capital statement \u2014 ${dues[0].label}`;

    const navy = '#1F3864', muted = '#6B7A90', pale = '#EEF2F9';
    const dueRows = dues.map(d =>
      `<tr><td style="padding:6px 0;color:${navy};font-weight:600">${d.label}</td>` +
      `<td style="padding:6px 0;text-align:right;font-weight:700">${money(d.due)}</td></tr>`).join('');

    const body = `<!doctype html><html><body style="margin:0;padding:24px;background:#F7F9FC;font-family:Arial,Helvetica,sans-serif;color:#333">
      <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E4EAF3;border-radius:10px;padding:28px">
        <div style="color:${navy};font-weight:800;letter-spacing:.04em;font-size:18px;margin-bottom:4px">JAY CAPITAL</div>
        <div style="height:3px;background:${navy};border-radius:2px;margin:8px 0 20px"></div>
        <p style="margin:0 0 14px">Hi ${loan.borrower_name.split(' ')[0] || loan.borrower_name},</p>
        <p style="margin:0 0 14px">Please find ${multi ? 'your statements' : 'your statement'} attached for <b>${loan.property}</b>${multi ? '' : `, for ${dues[0].label}`}. ${multi ? 'A summary of the amounts due is below.' : `The amount due is <b>${money(dues[0].due)}</b>.`}</p>
        ${multi ? `<table style="width:100%;border-collapse:collapse;background:${pale};border-radius:8px;padding:8px;margin:0 0 16px">
          <tr><td style="padding:8px 12px 4px;color:${muted};font-size:12px;text-transform:uppercase">Statement Month</td><td style="padding:8px 12px 4px;color:${muted};font-size:12px;text-transform:uppercase;text-align:right">Amount Due</td></tr>
          ${dueRows.replace(/padding:6px 0/g, 'padding:6px 12px')}
        </table>` : ''}
        <p style="margin:0 0 14px">The attached PDF${multi ? 's include' : ' includes'} the full breakdown of draws and interest. If you have any questions, just reply to this email.</p>
        <p style="margin:18px 0 0;color:${muted};font-size:13px">Thank you,<br/>${profile.full_name || 'Jay Capital'}</p>
      </div></body></html>`;

    const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER!;
    const t = transport();
    await t.sendMail({
      from: `Jay Capital <${fromAddress}>`,
      to: loan.borrower_email,
      replyTo: profile.email,
      subject,
      html: body,
      attachments,
    });

    return { ok: true, count: cleanMonths.length, to: loan.borrower_email };
  });
}

/**
 * Email a borrower a friendly welcome with their private statement/portal link
 * and a short description of what they can do once signed in.
 */
export async function sendPortalWelcome(loanId: string, toEmail: string) {
  return run(async () => {
    const { profile } = await requireStaffOrAdmin();
    const svc = serviceClient();

    const { data: loan } = await svc.from('loan_summary').select('*').eq('loan_id', loanId).single();
    if (!loan) throw new Error('Loan not found');

    const site = process.env.NEXT_PUBLIC_SITE_URL || '';
    const statementLink = site ? `${site}/statement/${loan.access_token}` : `/statement/${loan.access_token}`;

    const navy = '#1F3864', muted = '#6B7A90', pale = '#EEF2F9';
    const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#F7F9FC;font-family:Arial,Helvetica,sans-serif;color:#333">
      <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E4EAF3;border-radius:10px;padding:28px">
        <div style="color:${navy};font-weight:800;letter-spacing:.04em;font-size:18px;margin-bottom:4px">JAY CAPITAL</div>
        <div style="height:3px;background:${navy};border-radius:2px;margin:8px 0 20px"></div>
        <p style="margin:0 0 14px">Hi ${loan.borrower_name.split(' ')[0] || loan.borrower_name},</p>
        <p style="margin:0 0 14px">Welcome to your Jay Capital borrower portal for <b>${loan.property}</b>. You now have a private link to view your loan online, anytime.</p>
        <div style="background:${pale};border-radius:8px;padding:14px 16px;margin:0 0 18px">
          <div style="color:${navy};font-weight:700;margin-bottom:8px">In your portal you can:</div>
          <ul style="margin:0;padding-left:18px;color:#333;line-height:1.6">
            <li>View your current loan statement and amount due</li>
            <li>See your construction draws and the interest on each</li>
            <li>Review prior months and download a PDF of any statement</li>
            <li>Check your loan amount, disbursed total, and remaining draw balance</li>
          </ul>
        </div>
        <p style="margin:0 0 18px"><a href="${statementLink}" style="background:${navy};color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;display:inline-block;font-weight:600">Open my portal</a></p>
        <p style="margin:0 0 6px;color:${muted};font-size:12px;word-break:break-all">Or paste this link into your browser:<br/>${statementLink}</p>
        <p style="margin:16px 0 0;color:${muted};font-size:13px">Questions? Just reply to this email.<br/>${profile.full_name || 'Jay Capital'}</p>
      </div></body></html>`;

    const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER!;
    const t = transport();
    await t.sendMail({
      from: `Jay Capital <${fromAddress}>`,
      to: toEmail,
      replyTo: profile.email,
      subject: 'Welcome to your Jay Capital portal',
      html,
    });
    return { ok: true, to: toEmail };
  });
}
