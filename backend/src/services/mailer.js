/**
 * Transactional email, via Resend.
 *
 * Three messages matter to security, so all three live here rather than being
 * scattered through the routes that trigger them:
 *
 *   OTP           the six-digit code that gates every new account
 *   login alert   "this was you, right?" on every successful sign-in
 *   welcome       sent once, the moment an address is proven
 *
 * Delivery is never allowed to fail a request. `send()` swallows transport
 * errors and reports them in its return value; callers decide whether that is
 * interesting. A signup must not 500 because Resend had a bad minute — and,
 * more importantly, a login must not hang waiting on an alert email.
 *
 * With no RESEND_API_KEY the mailer runs in console mode: the message is logged
 * instead of sent, so a clean clone can still complete the OTP flow. That
 * fallback prints the code, so it only ever runs when mail is genuinely
 * unconfigured — in which case there is no other way to sign up.
 */

import { Resend } from 'resend';

const API_KEY = process.env.RESEND_API_KEY?.trim() || '';

/**
 * Resend will only deliver from a domain you have verified. Until then
 * `onboarding@resend.dev` works, with one catch worth knowing before demo day:
 * it can only send to the address that owns the Resend account. Verify a domain
 * and set MAIL_FROM to reach anyone else.
 */
const FROM = process.env.MAIL_FROM?.trim() || 'SafePay <onboarding@resend.dev>';
const REPLY_TO = process.env.MAIL_REPLY_TO?.trim() || undefined;

/** Used in email links. Falls back to the first allowed browser origin. */
const APP_URL = (process.env.APP_URL || process.env.WEB_ORIGIN || '')
  .split(',')[0]
  .trim()
  .replace(/\/$/, '');

export const mailerReady = Boolean(API_KEY);

const resend = API_KEY ? new Resend(API_KEY) : null;

/* ------------------------------------------------------------------ *
 * Templates
 * ------------------------------------------------------------------ */

const BRAND = '#981D87';
const PLUM = '#3B1439';
const INK = '#1C1720';
const MUTED = '#655E6B';
const LINE = '#E9E5EC';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Email clients have no CSS support worth relying on — tables and inline styles only. */
function layout({ heading, intro, body, footnote }) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#F6F4F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F4F7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid ${LINE};border-radius:16px;overflow:hidden;">

        <tr><td style="background:${PLUM};padding:22px 28px;">
          <span style="color:#FFFFFF;font-size:17px;font-weight:700;letter-spacing:-0.2px;">SafePay</span>
          <span style="color:#E884D8;font-size:12px;padding-left:10px;">Trusted payments, everywhere.</span>
        </td></tr>

        <tr><td style="padding:30px 28px 8px;">
          <h1 style="margin:0 0 10px;font-size:21px;line-height:1.3;color:${INK};font-weight:700;">${escapeHtml(heading)}</h1>
          <p style="margin:0;font-size:15px;line-height:1.6;color:${MUTED};">${intro}</p>
        </td></tr>

        <tr><td style="padding:16px 28px 26px;">${body}</td></tr>

        <tr><td style="border-top:1px solid ${LINE};padding:18px 28px;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#8A8390;">
            ${footnote || 'You are receiving this because this address was used to sign in to SafePay.'}
          </p>
        </td></tr>
      </table>
      <p style="max-width:520px;margin:14px auto 0;font-size:11px;color:#9C96A2;text-align:center;">
        SafePay holds funds in escrow until both sides are satisfied. We never ask for your password or a code by reply.
      </p>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(href, label) {
  if (!href) return '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 0;"><tr>
    <td style="background:${BRAND};border-radius:10px;">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#FFFFFF;text-decoration:none;">${escapeHtml(label)}</a>
    </td></tr></table>`;
}

/* ------------------------------------------------------------------ *
 * Transport
 * ------------------------------------------------------------------ */

/**
 * @returns {Promise<{ ok: boolean, id?: string, error?: string, mode: 'resend'|'console' }>}
 *          Never rejects.
 */
async function send({ to, subject, html, text, tags }) {
  if (!resend) {
    console.warn(`[mail] RESEND_API_KEY unset — not sending "${subject}" to ${to}`);
    return { ok: false, error: 'mailer_unconfigured', mode: 'console' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: [to],
      subject,
      html,
      text,
      ...(REPLY_TO ? { replyTo: REPLY_TO } : {}),
      ...(tags ? { tags } : {}),
    });

    if (error) {
      // Resend reports rejections in-band rather than by throwing.
      console.error(`[mail] rejected "${subject}" -> ${to}:`, error.message || error.name || error);
      return { ok: false, error: error.message || 'send_rejected', mode: 'resend' };
    }
    return { ok: true, id: data?.id, mode: 'resend' };
  } catch (err) {
    console.error(`[mail] transport error for "${subject}" -> ${to}:`, err.message);
    return { ok: false, error: err.message, mode: 'resend' };
  }
}

/* ------------------------------------------------------------------ *
 * Messages
 * ------------------------------------------------------------------ */

/**
 * The signup / sign-in gate. The deadline is stated in the body because a code
 * with no visible expiry gets typed in an hour later and blamed on us.
 */
export async function sendOtpEmail({ to, name, code, minutes }) {
  const first = String(name || '').trim().split(/\s+/)[0] || 'there';

  const html = layout({
    heading: 'Confirm your email address',
    intro: `Hi ${escapeHtml(first)} — enter this code in SafePay to finish securing your account.`,
    body: `
      <div style="background:#FBEDF9;border:1px solid #F0D3EB;border-radius:12px;padding:20px;text-align:center;">
        <div style="font-size:34px;letter-spacing:9px;font-weight:700;color:${BRAND};font-variant-numeric:tabular-nums;">${escapeHtml(code)}</div>
        <div style="margin-top:8px;font-size:12px;color:#7A1770;">Expires in ${Number(minutes)} minutes</div>
      </div>
      <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:${MUTED};">
        We ask for this once, when an address is new to us. Until it is confirmed the account
        cannot hold or move money.
      </p>`,
    footnote: 'If you did not try to create a SafePay account, ignore this email and the code expires on its own. Never share it with anyone, including anyone claiming to be SafePay support.',
  });

  const text = `Your SafePay verification code is ${code}. It expires in ${minutes} minutes. If you did not request it, ignore this email.`;

  const result = await send({
    to,
    subject: `${code} is your SafePay verification code`,
    html,
    text,
    tags: [{ name: 'category', value: 'otp' }],
  });

  /* Console fallback. Without it an unconfigured deploy has no path through the
   * OTP gate at all. Unreachable once a transport exists. */
  if (!result.ok && result.mode === 'console') {
    console.warn(`[mail] === DEV FALLBACK: verification code for ${to} is ${code} (valid ${minutes}m) ===`);
  }
  return result;
}

/**
 * Sign-in alert. The details are what make it useful — a login the owner did
 * not perform is only recognisable as such if the email says where from.
 */
export async function sendLoginAlertEmail({ to, name, ip, userAgent, at }) {
  const first = String(name || '').trim().split(/\s+/)[0] || 'there';
  const when = new Date(at || Date.now()).toUTCString();

  const row = (label, value) => `
    <tr>
      <td style="padding:7px 0;font-size:13px;color:#8A8390;width:96px;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:7px 0;font-size:13px;color:${INK};word-break:break-word;">${escapeHtml(value || 'Unknown')}</td>
    </tr>`;

  const html = layout({
    heading: 'New sign-in to your SafePay account',
    intro: `Hi ${escapeHtml(first)} — your account was just accessed. If that was you, nothing to do.`,
    body: `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:12px;padding:6px 16px;">
        ${row('When', when)}
        ${row('IP address', ip)}
        ${row('Device', userAgent)}
      </table>
      <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:${MUTED};">
        Was this not you? Change your password now and check your open escrows — anything
        still held in escrow has not moved yet.
      </p>
      ${button(APP_URL ? `${APP_URL}/app/trust` : '', 'Review my account')}`,
    footnote: 'We send this on every sign-in. It is the fastest way to notice an account you no longer control.',
  });

  const text = `A new sign-in to your SafePay account.\nWhen: ${when}\nIP: ${ip || 'unknown'}\nDevice: ${userAgent || 'unknown'}\n\nIf this was not you, change your password immediately.`;

  return send({
    to,
    subject: 'New sign-in to your SafePay account',
    html,
    text,
    tags: [{ name: 'category', value: 'login_alert' }],
  });
}

/** Sent once, immediately after an address is proven. */
export async function sendWelcomeEmail({ to, name }) {
  const first = String(name || '').trim().split(/\s+/)[0] || 'there';

  const bullets = [
    'Money is held by SafePay until the buyer confirms delivery',
    'Every settled escrow builds your SafeScore, and it travels with you',
    'Sandbox API keys are already waiting in the developer console',
  ];

  const html = layout({
    heading: 'Your email is confirmed',
    intro: `Welcome to SafePay, ${escapeHtml(first)}. Your account is live and ready to hold its first escrow.`,
    body: `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${bullets.map((line) => `<tr><td style="padding:6px 0;font-size:14px;line-height:1.6;color:${INK};">
             <span style="color:${BRAND};font-weight:700;">&#8226;</span>&nbsp; ${escapeHtml(line)}</td></tr>`).join('')}
      </table>
      ${button(APP_URL ? `${APP_URL}/app` : '', 'Open my dashboard')}`,
    footnote: 'Sent once, when a new SafePay account is verified.',
  });

  const text = `Welcome to SafePay, ${first}. Your email is confirmed and your account is live.`;

  return send({
    to,
    subject: 'Welcome to SafePay — your email is confirmed',
    html,
    text,
    tags: [{ name: 'category', value: 'welcome' }],
  });
}

/**
 * Fire-and-forget wrapper for mail that must never delay a response — the login
 * alert, above all. `send` never rejects, but the guard costs nothing and keeps
 * an unhandled rejection out of the process.
 */
export function sendInBackground(promiseFactory) {
  Promise.resolve()
    .then(promiseFactory)
    .catch((err) => console.error('[mail] background send failed:', err?.message));
}
