/**
 * Transactional email, via Keplars.
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
 * interesting. A signup must not 500 because the mail API had a bad minute —
 * and, more importantly, a login must not hang waiting on an alert email.
 *
 * Keplars splits sending by priority rather than by plan, so each message asks
 * for the tier it actually needs: `instant` (0-5s) for the OTP, because a code
 * that lands after the user gives up is the same as no code at all; `high` for
 * the sign-in alert; `async` for the welcome, which nobody is waiting on.
 *
 * With no KEPLARS_API_KEY the mailer runs in console mode: the message is logged
 * instead of sent, so a clean clone can still complete the OTP flow. That
 * fallback prints the code, so it only ever runs when mail is genuinely
 * unconfigured — in which case there is no other way to sign up.
 */

import { formatNaira } from '../lib/money.js';

const API_KEY = process.env.KEPLARS_API_KEY?.trim() || '';
const BASE_URL = (process.env.KEPLARS_BASE_URL?.trim() || 'https://api.keplars.com').replace(/\/$/, '');

/** A slow mail call must not become a slow signup. Hard ceiling, no retries. */
const TIMEOUT_MS = 12_000;

/**
 * MAIL_FROM is optional, and leaving it unset is the safer default: omit `from`
 * and Keplars sends as whatever mailbox the workspace has connected. Setting it
 * only helps once you have more than one verified sender to choose between, and
 * an address Keplars does not recognise is rejected rather than substituted.
 *
 * The `Name <addr>` form is accepted and unwrapped — Keplars wants a bare
 * address, so a MAIL_FROM carried over from another provider keeps working.
 */
function bareAddress(value) {
  const raw = String(value ?? '').trim();
  const angled = /<([^>]+)>/.exec(raw);
  return (angled ? angled[1] : raw).trim();
}

const FROM = bareAddress(process.env.MAIL_FROM);
const REPLY_TO = bareAddress(process.env.MAIL_REPLY_TO) || undefined;

/** Used in email links. Falls back to the first allowed browser origin. */
const APP_URL = (process.env.APP_URL || process.env.WEB_ORIGIN || '')
  .split(',')[0]
  .trim()
  .replace(/\/$/, '');

export const mailerReady = Boolean(API_KEY);

/* A mistyped key is otherwise only discoverable by watching a signup fail, and
 * the shape is distinctive enough to check for free at boot. */
if (API_KEY && !/^kms_[a-f0-9]+\.(live|adm)_[a-f0-9]+$/.test(API_KEY)) {
  console.warn('[mail] KEPLARS_API_KEY does not look like a Keplars key (kms_<id>.live_<secret>) — sends will be rejected');
}

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
 * One POST to Keplars. The endpoint carries the priority; the body is the same
 * either way.
 *
 * Keplars takes a single content field — `body` plus `is_html` — rather than an
 * html/text pair, so the HTML part is what goes out and the plain-text version
 * is kept only for the console fallback below.
 *
 * @param {'instant'|'high'|'async'} priority
 * @returns {Promise<{ ok: boolean, id?: string, error?: string, mode: 'keplars'|'console' }>}
 *          Never rejects.
 */
async function send({ to, subject, html, text, priority = 'async' }) {
  if (!mailerReady) {
    console.warn(`[mail] KEPLARS_API_KEY unset — not sending "${subject}" to ${to}`);
    // The plain-text part is the whole message in console mode: without a
    // mailbox to read, the log is the only place its contents can go.
    if (text) console.warn(`[mail]   ${text.replace(/\s+/g, ' ')}`);
    return { ok: false, error: 'mailer_unconfigured', mode: 'console' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}/api/v1/send-email/${priority}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: [to],
        subject,
        body: html,
        is_html: true,
        // Omitted unless configured, so Keplars falls back to the sender the
        // workspace has connected rather than being handed one it may reject.
        ...(FROM ? { from: FROM } : {}),
        ...(REPLY_TO ? { reply_to: REPLY_TO } : {}),
      }),
      signal: controller.signal,
    });

    const payload = await res.json().catch(() => ({}));

    /* Rejections come back in two different shapes depending on where they are
     * caught — `{ error: { type, message } }` from validation, `{ success:
     * false, message }` from auth — so both are unwrapped before falling back
     * to the status line. */
    if (!res.ok || payload?.success === false) {
      const reason = payload?.error?.message || payload?.message
        || (typeof payload?.error === 'string' ? payload.error : '')
        || `HTTP ${res.status}`;
      console.error(`[mail] rejected "${subject}" -> ${to}: ${reason}`);
      return { ok: false, error: String(reason), mode: 'keplars' };
    }

    // A queued send answers flat: { id, object, status, metadata }.
    return { ok: true, id: payload?.id || payload?.data?.id, mode: 'keplars' };
  } catch (err) {
    const reason = err.name === 'AbortError' ? `timed out after ${TIMEOUT_MS}ms` : err.message;
    console.error(`[mail] transport error for "${subject}" -> ${to}: ${reason}`);
    return { ok: false, error: reason, mode: 'keplars' };
  } finally {
    clearTimeout(timer);
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
    // The one message a user is actively waiting on. 0-5s tier.
    priority: 'instant',
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
    priority: 'high',
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
    priority: 'async',
  });
}

/* ------------------------------------------------------------------ *
 * Escrow lifecycle
 * ------------------------------------------------------------------ */

/**
 * Every escrow email is the same shape — heading, one line of what happened, a
 * summary table, one line of what to do about it — so the only thing that
 * varies per event is the copy. Keeping it in one table rather than one
 * function per event means the buyer's and the seller's version of the same
 * moment sit on adjacent lines, which is the only way to keep them consistent.
 *
 * The two sides genuinely need different words: "your payment is held" and
 * "you can start work" describe the same funding event, and sending either
 * party the other's version is worse than sending nothing.
 *
 * @type {Record<string, Record<'buyer'|'seller', (ctx) => { subject: string, heading: string, intro: string, next?: string }>>}
 */
const ESCROW_COPY = {
  created: {
    buyer: (c) => ({
      subject: `Escrow opened: ${c.title}`,
      heading: 'Your escrow is open',
      intro: `You opened an escrow with ${c.other} for ${c.amount}.`,
      next: 'Nothing has left your account yet. Fund it when you are ready and SafePay holds the money until you confirm delivery.',
    }),
    seller: (c) => ({
      subject: `${c.other} opened an escrow with you: ${c.title}`,
      heading: 'You have been added to an escrow',
      intro: `${c.other} opened a SafePay escrow for ${c.amount}.`,
      next: c.invited
        ? 'Create a SafePay account with this email address to accept it. Once the buyer funds the escrow the money sits with SafePay, not with them.'
        : 'Once the buyer funds it the money sits with SafePay, not with them, and is released to you when they confirm delivery.',
    }),
  },

  /* The in-person handshake. The seller opened this escrow and has been staring
   * at a QR code; the buyer has just scanned it. Neither of them opened an
   * escrow "with" a stranger, so `created` cannot describe this and does not
   * try — see notifyEscrow. */
  claimed: {
    buyer: (c) => ({
      subject: `You joined ${c.other}'s escrow: ${c.title}`,
      heading: 'You are on this escrow',
      intro: `You claimed ${c.other}'s escrow for ${c.amount}.`,
      next: 'Fund it and SafePay holds the money until you confirm you have what you paid for.',
    }),
    seller: (c) => ({
      subject: `${c.other} claimed ${c.title}`,
      heading: 'Your code was claimed',
      intro: `${c.other} scanned your code and joined the escrow for ${c.amount}.`,
      next: 'Wait for them to fund it before handing anything over. You will get an email the moment they do.',
    }),
  },

  funded: {
    buyer: (c) => ({
      subject: `You funded ${c.title}`,
      heading: 'Your payment is held in escrow',
      intro: `${c.amount} is now held by SafePay for ${c.title}.`,
      next: c.autoRelease
        ? `Release it once you are happy with what you received. If you do nothing it releases automatically on ${c.autoRelease}.`
        : 'Release it once you are happy with what you received.',
    }),
    seller: (c) => ({
      subject: `${c.other} funded ${c.title}`,
      heading: 'The buyer has funded this escrow',
      intro: `${c.amount} is held by SafePay and is yours once the buyer confirms delivery.`,
      next: 'It is safe to start. The money is already out of the buyer’s hands.',
    }),
  },

  delivered: {
    buyer: (c) => ({
      subject: `${c.other} marked ${c.title} as delivered`,
      heading: 'The seller says this is delivered',
      intro: `${c.other} has marked ${c.title} as delivered.`,
      next: c.autoRelease
        ? `Check it over, then release the funds. If nothing happens by ${c.autoRelease} they release automatically.`
        : 'Check it over, then release the funds. Open a dispute instead if something is wrong.',
    }),
    seller: (c) => ({
      subject: `You marked ${c.title} as delivered`,
      heading: 'Delivery recorded',
      intro: `You marked ${c.title} as delivered and the buyer has been told.`,
      next: 'The funds release when they confirm, or automatically if they go quiet.',
    }),
  },

  released: {
    buyer: (c) => ({
      subject: `Funds released for ${c.title}`,
      heading: 'This escrow is complete',
      intro: `${c.amount} has been released to ${c.other}.`,
      next: 'It counts toward both SafeScores, so the next escrow either of you opens starts from a stronger position.',
    }),
    seller: (c) => ({
      subject: `You have been paid for ${c.title}`,
      heading: 'The funds are yours',
      intro: `${c.net} is on its way to you${c.fee ? `, after the ${c.fee} SafePay fee` : ''}.`,
      next: 'A settled escrow is the single biggest input to your SafeScore.',
    }),
  },

  milestone: {
    buyer: (c) => ({
      subject: `Milestone approved: ${c.milestone}`,
      heading: 'You approved a milestone',
      intro: `${c.milestoneAmount} has been released to ${c.other} for "${c.milestone}".`,
      next: c.progress ? `${c.progress} on this escrow. The rest stays in escrow.` : 'The rest stays in escrow.',
    }),
    seller: (c) => ({
      subject: `Milestone paid: ${c.milestone}`,
      heading: 'A milestone has been released',
      intro: `${c.other} approved "${c.milestone}" and ${c.milestoneAmount} has been released to you.`,
      next: c.progress ? `${c.progress} on this escrow.` : 'The remaining milestones stay in escrow until approved.',
    }),
  },

  disputed: {
    buyer: (c) => ({
      subject: `A dispute was opened on ${c.title}`,
      heading: 'This escrow is in dispute',
      intro: `${c.amount} stays in escrow while this is reviewed.`,
      next: 'Nothing moves until it is resolved. Add anything that supports your side in the dashboard.',
    }),
    seller: (c) => ({
      subject: `A dispute was opened on ${c.title}`,
      heading: 'This escrow is in dispute',
      intro: `${c.amount} stays in escrow while this is reviewed.`,
      next: 'Nothing moves until it is resolved. Add anything that supports your side in the dashboard.',
    }),
  },

  refunded: {
    buyer: (c) => ({
      subject: `Refunded: ${c.title}`,
      heading: 'Your money is coming back',
      intro: `${c.refunded} is being returned to you for ${c.title}.`,
      next: 'This escrow is now closed.',
    }),
    seller: (c) => ({
      subject: `${c.title} was refunded to the buyer`,
      heading: 'This escrow was refunded',
      intro: `${c.refunded} has been returned to ${c.other}.`,
      next: 'No funds were released and the escrow is now closed.',
    }),
  },

  cancelled: {
    buyer: (c) => ({
      subject: `Escrow cancelled: ${c.title}`,
      heading: 'This escrow was cancelled',
      intro: `${c.title} was cancelled before it was funded.`,
      next: 'No money moved.',
    }),
    seller: (c) => ({
      subject: `Escrow cancelled: ${c.title}`,
      heading: 'This escrow was cancelled',
      intro: `${c.title} was cancelled before it was funded.`,
      next: 'No money moved.',
    }),
  },
};

/** Readable in an email, unambiguous across time zones. */
function emailDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toUTCString().replace(/ GMT$/, ' UTC');
}

/**
 * One escrow update, written from one party's side.
 *
 * `role` is whose inbox this is landing in, not who caused the event — the
 * caller works that out, because only it knows which of the two addresses it
 * is currently sending to.
 *
 * Unknown events return without sending rather than mailing a blank template:
 * a new state in the engine should be silent until someone writes its copy,
 * not noisy and wrong.
 *
 * @param {object}  arg
 * @param {'buyer'|'seller'} arg.role  the recipient's side of the escrow
 * @param {boolean} [arg.invited]      recipient has no account yet
 */
export async function sendEscrowEmail({ to, name, role, event, escrow, otherName, invited, milestone }) {
  const copyFor = ESCROW_COPY[event]?.[role];
  if (!copyFor) return { ok: false, error: `no_copy_for_${event}_${role}`, mode: 'console' };

  const first = String(name || '').trim().split(/\s+/)[0] || 'there';
  const fee = escrow.feeKobo ? formatNaira(escrow.feeKobo) : '';
  const net = formatNaira(escrow.netToSellerKobo ?? escrow.amountKobo - (escrow.feeKobo ?? 0));

  const approved = (escrow.milestones ?? []).filter((m) => m.status === 'approved').length;
  const total = (escrow.milestones ?? []).length;

  const { subject, heading, intro, next } = copyFor({
    title: escrow.title,
    amount: formatNaira(escrow.amountKobo),
    refunded: formatNaira(escrow.refundedKobo ?? escrow.amountKobo),
    net,
    fee,
    other: otherName || 'the other party',
    invited: Boolean(invited),
    autoRelease: emailDate(escrow.autoReleaseAt),
    milestone: milestone?.title ?? '',
    milestoneAmount: milestone ? formatNaira(milestone.amountKobo) : '',
    progress: total ? `${approved} of ${total} milestones approved` : '',
  });

  const row = (label, value) => (value ? `
    <tr>
      <td style="padding:7px 0;font-size:13px;color:#8A8390;width:110px;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:7px 0;font-size:13px;color:${INK};word-break:break-word;">${escapeHtml(value)}</td>
    </tr>` : '');

  /* An invited seller has no dashboard to open yet, so the button has to send
   * them somewhere that works — signup, with the escrow waiting once they are
   * through it. Sending them to a protected route would bounce them to a login
   * they cannot complete. */
  const cta = invited
    ? { href: APP_URL ? `${APP_URL}/signup` : '', label: 'Create my SafePay account' }
    : { href: APP_URL ? `${APP_URL}/app/escrow/${escrow.id}` : '', label: 'Open this escrow' };

  const html = layout({
    heading,
    intro: `Hi ${escapeHtml(first)} — ${escapeHtml(intro)}`,
    body: `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:12px;padding:6px 16px;">
        ${row('Escrow', escrow.title)}
        ${row('Amount', formatNaira(escrow.amountKobo))}
        ${row('Status', String(escrow.status ?? '').replace(/_/g, ' '))}
        ${row('Reference', escrow.id)}
      </table>
      ${next ? `<p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:${MUTED};">${escapeHtml(next)}</p>` : ''}
      ${button(cta.href, cta.label)}`,
    footnote: 'You are receiving this because you are a party to this SafePay escrow.',
  });

  const text = `${heading}. ${intro}${next ? ` ${next}` : ''} Escrow ${escrow.id} (${escrow.title}), ${formatNaira(escrow.amountKobo)}, status ${escrow.status}.`;

  /* `high` rather than `instant`: nobody is sitting on a form waiting for this
   * the way they wait for an OTP, but "your money moved" should not sit in a
   * five-minute queue either. */
  return send({ to, subject, html, text, priority: 'high' });
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
