import { useState } from 'react';
import { PageHeader } from '../components/AppShell';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CopyField, Alert, Pill, Skeleton } from '../components/ui/Primitives';
import { Field, Select } from '../components/ui/Form';
import { ScoreRing, ScoreBreakdown } from '../components/Trust';
import { useAuth, useToast } from '../context/AppProviders';
import { api } from '../lib/api';
import { SCORE_TIER_META, formatNaira } from '../lib/format';
import { IconShieldCheck, IconExternal, IconGlobe, IconSpark, IconCheck } from '../components/Icons';

const TIERS = [
  { value: 'none', label: 'Not verified', points: 0 },
  /* Awarded automatically by the signup OTP, never chosen here. Listed so the
     ladder reads completely and a freshly verified account can see where it sits. */
  { value: 'email', label: 'Email verified', points: 3 },
  { value: 'phone', label: 'Phone verified', points: 5 },
  { value: 'bvn_nin', label: 'BVN / NIN verified', points: 12 },
  { value: 'address', label: 'Address verified', points: 15 },
];

export default function TrustProfile() {
  const { user, score, refresh } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [badgeTheme, setBadgeTheme] = useState('light');

  /* The select is a draft over the saved value rather than a copy of it, so it
     re-syncs for free when the account refreshes — no effect needed. */
  const [tierDraft, setTierDraft] = useState(null);
  const savedTier = user?.verificationTier ?? 'none';
  const tier = tierDraft ?? savedTier;

  if (!score) {
    return (
      <>
        <PageHeader title="Trust profile" />
        <Skeleton className="h-[420px] rounded-[14px]" />
      </>
    );
  }

  const meta = SCORE_TIER_META[score.tier];
  const badgeUrl = api.score.badgeUrl(user.id, badgeTheme);
  const publicUrl = `${window.location.origin}/trust/${user.id}`;
  const embedSnippet = `<a href="${publicUrl}">\n  <img src="${badgeUrl}" alt="SafePay trust score" width="300" height="76">\n</a>`;

  const saveTier = async () => {
    setSaving(true);
    try {
      await api.auth.updateMe({ verificationTier: tier });
      setTierDraft(null);
      await refresh();
      toast.success('Verification updated', 'Your SafeScore has been recalculated.');
    } catch (err) {
      toast.error('Could not update', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Your trust profile"
        description="This is what other people see before they agree to trade with you."
        action={
          <Button href={publicUrl} variant="secondary" iconRight={IconExternal}>
            View public page
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.25fr] lg:items-start">
        {/* ---------- score ---------- */}
        <div className="flex flex-col gap-6">
          <Card>
            <div className="flex flex-col items-center text-center">
              <ScoreRing score={score.score} tier={score.tier} size={168} thickness={12} />
              <p className="mt-5 text-[1.15rem] font-semibold text-ink">{user.name}</p>
              <p className="mt-1 text-[0.87rem] leading-relaxed text-muted">{meta.blurb}</p>
            </div>

            <dl className="mt-7 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-line pt-6">
              {[
                ['Completed deals', score.stats.escrowsCompleted],
                ['Value settled', formatNaira((score.stats.totalValueSettledNaira ?? 0) * 100, { decimals: false })],
                ['Dispute rate', `${score.stats.disputeRatePct}%`],
                ['Counterparties', score.stats.uniqueCounterparties],
                ['Median release', score.stats.medianReleaseHours != null ? `${score.stats.medianReleaseHours}h` : '—'],
                ['Account age', `${score.stats.accountAgeDays ?? 0}d`],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[0.74rem] font-medium text-faint">{label}</dt>
                  <dd className="numeric mt-0.5 text-[1rem] font-semibold text-ink">{value}</dd>
                </div>
              ))}
            </dl>

            {score.stats.concentrationFlag && (
              <Alert tone="warn" title="Score capped" className="mt-5">
                Most of your settled volume is with a small number of counterparties, so your score
                is capped until you trade more widely. This protects everyone from score farming.
              </Alert>
            )}
          </Card>

          <Card>
            <CardHeader
              icon={IconShieldCheck}
              title="Raise your score"
              description="Verification is the fastest lever — it is worth up to 15 points on its own."
            />
            <Field label="Verification level" hint="Demo build: pick a tier to see the score respond instantly.">
              {(props) => (
                <Select {...props} value={tier} onChange={(e) => setTierDraft(e.target.value)}>
                  {TIERS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label} · +{t.points} points</option>
                  ))}
                </Select>
              )}
            </Field>
            <Button
              className="mt-4"
              onClick={saveTier}
              loading={saving}
              disabled={tier === savedTier}
              icon={IconCheck}
            >
              {tier === savedTier ? 'Already at this level' : 'Update verification'}
            </Button>
          </Card>
        </div>

        {/* ---------- breakdown + badge ---------- */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader
              icon={IconSpark}
              title="How your score is built"
              description="Every point is accounted for. A trust score nobody can interrogate is a trust score nobody trusts."
            />
            <ScoreBreakdown breakdown={score.breakdown} weights={score.weights} />
          </Card>

          <Card>
            <CardHeader
              icon={IconGlobe}
              title="Your Trust Badge"
              description="Drop this into an Instagram bio link, a storefront, or any website. It updates itself — no SDK, no JavaScript."
              action={
                <div className="flex gap-1 rounded-[9px] bg-sunken p-0.5">
                  {['light', 'dark'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setBadgeTheme(t)}
                      className={`rounded-[7px] px-2.5 py-1 text-[0.74rem] font-semibold capitalize transition-colors ${
                        badgeTheme === t ? 'bg-surface text-ink shadow-[var(--shadow-xs)]' : 'text-muted'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              }
            />

            <div className={`flex justify-center rounded-[13px] border border-line p-6 ${badgeTheme === 'dark' ? 'bg-plum' : 'bg-sunken'}`}>
              <img
                src={badgeUrl}
                alt={`SafePay trust badge for ${user.name}: ${score.score} out of 100`}
                width={300}
                height={76}
              />
            </div>

            <div className="mt-5 flex flex-col gap-4">
              <CopyField label="Embed code" value={embedSnippet} />
              <CopyField label="Public profile link" value={publicUrl} />
              <CopyField label="Score API endpoint" value={`GET /v1/score/${user.id}`} />
            </div>

            <Alert tone="brand" className="mt-5">
              <span className="font-semibold">Reputation portability.</span> Any third-party app can
              call the score endpoint — like a credit bureau, but for everyday trading.
            </Alert>
          </Card>

          <Card>
            <CardHeader title="Tiers" />
            <ul className="flex flex-col gap-2.5">
              {Object.entries(SCORE_TIER_META).map(([key, t], i) => {
                const ranges = ['0 – 24', '25 – 54', '55 – 79', '80 – 100'];
                const current = key === score.tier;
                return (
                  <li
                    key={key}
                    className={`flex items-center gap-3 rounded-[11px] border p-3 ${
                      current ? 'border-brand bg-brand-soft' : 'border-line'
                    }`}
                  >
                    <Pill tone={t.tone} size="sm">{t.label}</Pill>
                    <span className="numeric text-[0.8rem] text-muted">{ranges[i]}</span>
                    {current && (
                      <span className="ml-auto text-[0.75rem] font-semibold text-brand-ink">You are here</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
