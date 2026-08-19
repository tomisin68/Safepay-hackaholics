/**
 * Who hears about an escrow, and in whose words.
 *
 * `webhookDispatcher` already announces every state change to *machines*. This
 * is the same set of moments aimed at people: both parties, each told what it
 * means from their own side of the deal.
 *
 * It sits between the engine and the mailer because neither should grow the
 * other's job — the engine has no business knowing about mailboxes, and the
 * mailer has no business knowing how to find the counterparty of an escrow.
 *
 * Event names here are the bare lifecycle verbs (`funded`), not the webhook
 * topics (`escrow.funded`). They are a different audience with a different
 * contract: a webhook name is public API that partners have hardcoded, while
 * these only have to match the copy table in the mailer.
 */

import { users } from '../store/index.js';
import { sendEscrowEmail, sendInBackground } from './mailer.js';

/**
 * Both sides of an escrow, as addressable people.
 *
 * The seller may be an invitation rather than an account: `create` accepts a
 * bare email address for someone who has never used SafePay. That address is
 * the one that most needs to hear about this — nobody signs up for a payment
 * they were never told about — so it is resolved here rather than skipped.
 */
function parties(escrow) {
  const found = [];

  const buyer = escrow.buyerId ? users.get(escrow.buyerId) : null;
  if (buyer?.email) {
    found.push({ role: 'buyer', email: buyer.email, name: buyer.name, invited: false });
  }

  const seller = escrow.sellerId ? users.get(escrow.sellerId) : null;
  if (seller?.email) {
    found.push({ role: 'seller', email: seller.email, name: seller.name, invited: false });
  } else if (escrow.sellerEmail) {
    found.push({ role: 'seller', email: escrow.sellerEmail, name: null, invited: true });
  }

  /* One address, one email. A buyer who invited their own address as the seller
   * would otherwise get the same event twice, in two voices. */
  return found.filter((p, i) => found.findIndex((q) => q.email === p.email) === i);
}

/** What the other side is called in your copy. Falls back to their address. */
const nameOf = (party) => (party ? party.name || party.email : null);

/**
 * Mails both parties about one escrow event.
 *
 * Queued, never awaited. An escrow transition is a financial state change that
 * has already happened by the time this runs — it must not be able to fail, or
 * even to slow down, because a mail API is having a bad minute.
 *
 * @param {object} escrow  the escrow *after* the transition
 * @param {string} event   bare lifecycle verb — see ESCROW_COPY in mailer.js
 * @param {{ milestone?: object }} [extra]  milestone that moved, for `milestone`
 */
export function notifyEscrow(escrow, event, { milestone } = {}) {
  if (!escrow) return;

  const recipients = parties(escrow);

  /* An escrow can exist before it has two sides: the in-person flow has the
   * seller open it and the buyer claim the code afterwards. Every word of the
   * `created` copy is about who you are dealing with, so while there is nobody
   * on the other side there is nothing true to say — the `claimed` mail covers
   * that moment instead, once both parties are real. */
  if (event === 'created' && recipients.length < 2) return;

  for (const person of recipients) {
    const other = recipients.find((p) => p.role !== person.role);

    sendInBackground(() => sendEscrowEmail({
      to: person.email,
      name: person.name,
      role: person.role,
      event,
      escrow,
      otherName: nameOf(other),
      invited: person.invited,
      milestone,
    }));
  }
}
