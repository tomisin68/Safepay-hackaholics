import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/AppShell';
import { Button } from '../components/ui/Button';
import { Card, Alert } from '../components/ui/Primitives';
import { Field, Input } from '../components/ui/Form';
import { useToast } from '../context/AppProviders';
import { api } from '../lib/api';
import { formatNaira } from '../lib/format';
import { IconQr, IconArrowRight, IconShieldCheck } from '../components/Icons';

export default function ClaimCode() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [code, setCode] = useState(params.get('code') ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [claimed, setClaimed] = useState(null);

  const submit = async (e) => {
    e?.preventDefault();
    const value = code.trim().toUpperCase();
    if (value.length < 8) {
      setError('A claim code looks like ABCD-2345.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { escrow } = await api.escrows.claim(value);
      setClaimed(escrow);
      toast.success('Escrow claimed', 'You are now the buyer on this escrow.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Arriving straight from a scanned QR should just work.
  useEffect(() => {
    if (params.get('code')) submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHeader
        title="Claim an escrow"
        description="Standing in front of the seller? Scan their QR code or type the short code they show you."
      />

      <div className="mx-auto max-w-lg">
        <Card>
          {claimed ? (
            <div className="text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success-ink">
                <IconShieldCheck size={30} />
              </span>
              <h2 className="mt-5 text-[1.2rem] font-semibold text-ink">You are on the escrow</h2>
              <p className="mt-2 text-[0.9rem] text-muted">{claimed.title}</p>
              <p className="numeric mt-3 text-[1.9rem] font-bold text-ink">{formatNaira(claimed.amountKobo)}</p>

              <Alert tone="brand" title="Fund it while you are together" className="mt-6 text-left">
                Once you fund the escrow the seller can hand the item over, and you both tap confirm
                on the spot.
              </Alert>

              <Button
                className="mt-6"
                fullWidth
                size="lg"
                iconRight={IconArrowRight}
                onClick={() => navigate(`/app/escrow/${claimed.id}`)}
              >
                Open and fund it
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <div className="mb-6 flex flex-col items-center text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-[16px] bg-brand-soft text-brand-ink">
                  <IconQr size={26} />
                </span>
                <h2 className="mt-4 text-[1.1rem] font-semibold text-ink">Enter the claim code</h2>
                <p className="mt-1.5 text-[0.87rem] text-muted">
                  The seller sees it on their screen when they create an in-person escrow.
                </p>
              </div>

              <Field label="Claim code" error={error} required>
                {(props) => (
                  <Input
                    {...props}
                    size="lg"
                    autoFocus
                    placeholder="ABCD-2345"
                    value={code}
                    onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(''); }}
                    invalid={Boolean(error)}
                    className="numeric text-center tracking-[0.18em] uppercase"
                    maxLength={9}
                  />
                )}
              </Field>

              <Button type="submit" size="lg" fullWidth loading={loading} className="mt-5" iconRight={IconArrowRight}>
                {loading ? 'Checking…' : 'Claim escrow'}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
