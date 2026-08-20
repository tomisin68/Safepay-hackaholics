import 'dotenv/config';
import {
  users, escrows, disputes, apps,
  resetAll, flushNow, pushAllToFirestore, storeBackend,
} from './store/index.js';
import { PEOPLE, DEMO_PASSWORD, seedFromScratch } from './demoData.js';
import { balanceOf } from './services/wallet.js';
import { formatNaira } from './lib/money.js';

/**
 * Rebuilds the demo dataset from scratch.
 *
 * Destructive: everything currently stored is deleted first. That is why it
 * lives behind an npm script and not on any boot path — the server calls
 * `ensureDemoData()` instead, which only ever adds what is missing.
 *
 * Run: npm run seed
 */

const { ids, testKey } = seedFromScratch(resetAll);
flushNow();

/* The write-through in store/index.js only mirrors documents as they change, so
 * a seed would otherwise sit in memory until something happened to touch it.
 * Push the whole set up front: a freshly seeded deploy is then durable
 * immediately, and survives the first restart rather than the second. */
if (storeBackend === 'firestore') {
  const mirrored = await pushAllToFirestore();
  console.log(mirrored.ok
    ? '  Mirrored the seed to Firestore.'
    : '  Could not mirror to Firestore (see the error above). The local store is seeded and usable.');
}

/* --------------------------------- report -------------------------------- */
const line = (label, value) => console.log(`  ${label.padEnd(24)} ${value}`);

console.log('\n  SafePay demo data ready\n  ' + '-'.repeat(52));
line('Users', users.count());
line('Escrows', escrows.count());
line('Disputes', disputes.count());
line('Developer apps', apps.count());

console.log(`\n  Sign in with any of these (password: ${DEMO_PASSWORD})\n  ` + '-'.repeat(52));
for (const person of PEOPLE) {
  const user = users.get(ids[person.key]);
  line(
    user.email,
    `SafeScore ${String(user.safeScore).padStart(3)}  ${user.scoreTier.padEnd(13)}`
    + `wallet ${formatNaira(balanceOf(user.id)).padStart(14)}`
    + (person.role === 'admin' ? '  [admin]' : ''),
  );
}

console.log('\n  Sandbox API key for "Campus Marketplace"\n  ' + '-'.repeat(52));
console.log(`  ${testKey}\n`);
console.log(`  Try it:  curl -H "Authorization: Bearer ${testKey}" http://localhost:${process.env.PORT || 4000}/v1/escrows\n`);
