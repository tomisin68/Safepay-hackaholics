import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Logo, LogoMark } from '../brand/Logo';
import { Button } from '../components/ui/Button';
import { Card, Skeleton, Alert, CopyField } from '../components/ui/Primitives';
import { ScoreRing } from '../components/Trust';
import { api } from '../lib/api';
import { SCORE_TIER_META, formatDate } from '../lib/format';
import { IconShieldCheck, IconArrowRight, IconGlobe } from '../components/Icons';

/**
 * The shareable, public face of a SafeScore.
 *
 * No auth required — this is the page a seller drops in their Instagram bio so
 * a stranger can check them before sending money.
 */
export default function PublicTrust() {
  const { userId } = useParams();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.score
      .public(userId)
      .then(setProfile)
      .catch((err) => setError(err.message));
  }, [userId]);

  const meta = profile ? SCORE_TIER_META[profile.tier] : null;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line">
        <div className="mx-auto flex h-[68px] max-w-[900px] items-center justify-between px-5">
          <Link to="/" aria-label="SafePay home"><Logo size={32} /></Link>
          <Button to="/signup" size="sm" iconRight={IconArrowRight}>Get your own</Button>
        </div>
      </header>

      <main className="mx-auto max-w-[900px] px-5 py-12">
        {error ? (
          <Card className="mx-auto max-w-md text-center">
            <LogoMark size={48} className="mx-auto" />
            <h1 className="mt-5 text-[1.3rem] font-bold text-ink">No SafePay profile here</h1>
            <p className="mt-2 text-[0.9rem] text-muted">{error}</p>
            <Button to="/signup" className="mt-6">Create a SafePay account</Button>
          </Card>
        ) : !profile ? (
          <Skeleton className="mx-auto h-[420px] max-w-2xl rounded-[16px]" />
        ) : (
          <>
            <Card className="mx-auto max-w-2xl">
              <div className="flex flex-col items-center text-center">
                <ScoreRing score={profile.score} tier={profile.tier} size={172} thickness={13} />
                <h1 className="mt-6 text-[1.6rem] font-bold text-ink">{profile.user.name}</h1>
                <p className="mt-1.5 text-[0.9rem] text-muted">
                  On SafePay since {formatDate(profile.user.memberSince)}
                </p>
                <p className="mt-3 max-w-sm text-[0.92rem] leading-relaxed text-muted">{meta.blurb}</p>
              </div>

              <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-7 sm:grid-cols-4">
                {[
                  ['Completed deals', profile.stats.escrowsCompleted],
                  ['Dispute rate', `${profile.stats.disputeRatePct}%`],
                  ['Counterparties', profile.stats.uniqueCounterparties],
                  ['Verification', (profile.stats.verificationTier ?? 'none').replace('_', '/')],
                ].map(([label, value]) => (
                  <div key={label} className="text-center">
                    <dt className="text-[0.73rem] font-medium text-faint">{label}</dt>
                    <dd className="numeric mt-1 text-[1.15rem] font-semibold text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <div className="mx-auto mt-6 grid max-w-2xl gap-4 sm:grid-cols-2">
              <Card>
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand-ink">
                    <IconShieldCheck size={17} />
                  </span>
                  <div>
                    <p className="text-[0.9rem] font-semibold text-ink">What this means</p>
                    <p className="mt-1.5 text-[0.83rem] leading-relaxed text-muted">
                      This score comes from real settled transactions on SafePay — not stars, not
                      self-reported reviews. It cannot be bought.
                    </p>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-success-soft text-success-ink">
                    <IconGlobe size={17} />
                  </span>
                  <div>
                    <p className="text-[0.9rem] font-semibold text-ink">Trade safely</p>
                    <p className="mt-1.5 text-[0.83rem] leading-relaxed text-muted">
                      Even with a high score, use an escrow. SafePay holds the money until you
                      confirm you are happy.
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            <div className="mx-auto mt-6 max-w-2xl">
              <Card>
                <p className="text-[0.85rem] font-semibold text-ink">Embed this badge</p>
                <p className="mt-1 mb-4 text-[0.82rem] text-muted">
                  Anyone can render this score as an image — no SDK, no login.
                </p>
                <div className="mb-4 flex justify-center rounded-[12px] bg-sunken p-5">
                  <img
                    src={api.score.badgeUrl(userId)}
                    alt={`SafePay trust badge: ${profile.score} out of 100`}
                    width={300}
                    height={76}
                  />
                </div>
                <CopyField
                  label="Image URL"
                  value={api.score.badgeUrl(userId)}
                />
              </Card>
            </div>

            <div className="mx-auto mt-8 max-w-2xl text-center">
              <Alert tone="brand">
                <span className="font-semibold">Trading with {profile.user.name.split(' ')[0]}?</span>{' '}
                Open a SafePay escrow and neither of you has to go first.
              </Alert>
              <Button to="/signup" size="lg" className="mt-5" iconRight={IconArrowRight}>
                Start an escrow
              </Button>
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-line py-8">
        <p className="text-center text-[0.8rem] text-faint">
          Verified by SafePay · Trusted payments, everywhere
        </p>
      </footer>
    </div>
  );
}
