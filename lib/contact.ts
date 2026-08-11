'use server';

import { run } from '@/lib/result';
import { sendMail } from '@/lib/mailer';

/**
 * Public enquiry form.
 *
 * A mailto: link only works if the visitor's device has a mail client wired
 * up. On a desktop with no Outlook/Mail configured -- which is most Chrome
 * users -- clicking one does nothing at all, silently. That is the worst
 * possible outcome for the only lead-capture route on a brokerage site, so
 * enquiries go through our own SMTP instead and mailto is offered only as a
 * convenience alongside.
 */

const CONTACT_TO = 'Info@JayCapitalFunding.com';

export async function sendEnquiry(input: {
  name: string; email: string; phone?: string; topic?: string; message: string;
  /** Honeypot: real people leave this empty. */
  website?: string;
}) {
  return run(async () => {
    // Bots fill every field they find.
    if (input.website && input.website.trim() !== '') {
      return { message: 'Thanks — we’ll be in touch shortly.' };
    }

    const name = String(input.name || '').trim();
    const email = String(input.email || '').trim();
    const phone = String(input.phone || '').trim();
    const topic = String(input.topic || '').trim();
    const message = String(input.message || '').trim();

    if (!name) throw new Error('Please tell us your name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Please enter a valid email address.');
    if (message.length < 5) throw new Error('Please tell us a little about what you need.');
    if (message.length > 5000) throw new Error('That message is too long. Please shorten it a little.');

    const navy = '#04162A', gold = '#C0954A', muted = '#6B7A90';
    const esc = (v: string) => v.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));

    const row = (k: string, v: string) =>
      `<tr><td style="padding:6px 14px 6px 0;color:${muted};white-space:nowrap">${k}</td>` +
      `<td style="padding:6px 0;font-weight:700">${esc(v)}</td></tr>`;

    await sendMail({
      to: CONTACT_TO,
      // so hitting reply in the inbox goes straight back to the enquirer
      replyTo: `${name} <${email}>`,
      subject: `Website enquiry — ${name}${topic ? ' — ' + topic : ''}`,
      html: `<!doctype html><html><body style="margin:0;padding:24px;background:#F7F9FC;font-family:Arial,Helvetica,sans-serif;color:#333">
        <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E4EAF3;border-radius:10px;padding:28px">
          <div style="color:${navy};font-weight:800;letter-spacing:.12em;font-size:16px">JAY CAPITAL</div>
          <div style="color:${gold};font-weight:700;letter-spacing:.3em;font-size:9px;margin-top:2px">FUNDING</div>
          <div style="height:2px;background:${gold};border-radius:2px;margin:12px 0 20px"></div>
          <p style="margin:0 0 16px;font-size:15px"><b>New enquiry from the website</b></p>
          <table style="border-collapse:collapse;margin:0 0 18px">
            ${row('Name', name)}
            ${row('Email', email)}
            ${phone ? row('Phone', phone) : ''}
            ${topic ? row('Looking for', topic) : ''}
          </table>
          <div style="background:#EDF2F8;border-radius:8px;padding:14px 16px;white-space:pre-wrap;line-height:1.55">${esc(message)}</div>
          <p style="margin:18px 0 0;color:${muted};font-size:12px">Reply to this email to answer ${esc(name)} directly.</p>
        </div></body></html>`,
    });

    return { message: 'Thanks — your message is on its way. We’ll be in touch shortly.' };
  });
}
