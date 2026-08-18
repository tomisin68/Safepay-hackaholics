import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/AppShell';
import { Button } from '../components/ui/Button';
import { Card, EmptyState, Skeleton, Tabs, Alert } from '../components/ui/Primitives';
import { Input } from '../components/ui/Form';
import { EscrowCard } from '../components/Escrow';
import { useAuth } from '../context/AppProviders';
import { api } from '../lib/api';
import { formatNaira } from '../lib/format';
import { IconPlus, IconSearch, IconWallet } from '../components/Icons';

const FILTERS = [
  { value: 'all', label: 'All', match: () => true },
  { value: 'active', label: 'Active', match: (e) => ['created', 'funded', 'in_progress'].includes(e.status) },
  { value: 'buying', label: 'Buying', match: (e, uid) => e.buyer?.id === uid },
  { value: 'selling', label: 'Selling', match: (e, uid) => e.seller?.id === uid },
  { value: 'closed', label: 'Closed', match: (e) => ['released', 'refunded', 'cancelled'].includes(e.status) },
];

export default function Escrows() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    api.escrows.list().then(setData).catch((err) => setError(err.message));
  }, []);

  const escrows = useMemo(() => data?.escrows ?? [], [data]);

  const tabs = useMemo(
    () =>
      FILTERS.map((f) => ({
        value: f.value,
        label: f.label,
        count: escrows.filter((e) => f.match(e, user?.id)).length,
      })),
    [escrows, user?.id],
  );

  const visible = useMemo(() => {
    const active = FILTERS.find((f) => f.value === filter) ?? FILTERS[0];
    const q = query.trim().toLowerCase();
    return escrows
      .filter((e) => active.match(e, user?.id))
      .filter(
        (e) =>
          !q ||
          e.title.toLowerCase().includes(q) ||
          e.buyer?.name?.toLowerCase().includes(q) ||
          e.seller?.name?.toLowerCase().includes(q),
      );
  }, [escrows, filter, query, user?.id]);

  return (
    <>
      <PageHeader
        title="Escrows"
        description={
          data
            ? `${escrows.length} total · ${formatNaira(data.summary.inEscrowKobo, { decimals: false })} currently held`
            : 'Everything you are buying or selling through SafePay.'
        }
        action={<Button to="/app/new" icon={IconPlus}>New escrow</Button>}
      />

      {error && <Alert tone="danger" title="Could not load escrows" className="mb-6">{error}</Alert>}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs tabs={tabs} value={filter} onChange={setFilter} className="sm:max-w-fit" />
        <div className="relative sm:w-[280px]">
          <IconSearch size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
          <Input
            type="search"
            placeholder="Search by item or person"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
            aria-label="Search escrows"
          />
        </div>
      </div>

      {!data ? (
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[76px] rounded-[13px]" />)}
        </div>
      ) : visible.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={IconWallet}
            title={query ? 'Nothing matches that search' : 'No escrows here'}
            description={
              query
                ? 'Try a different item name or person.'
                : 'When you create or join an escrow it will show up in this list.'
            }
            action={
              query
                ? <Button variant="secondary" onClick={() => setQuery('')}>Clear search</Button>
                : <Button to="/app/new" icon={IconPlus}>Create an escrow</Button>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {visible.map((escrow) => (
            <EscrowCard key={escrow.id} escrow={escrow} viewerId={user?.id} />
          ))}
        </div>
      )}
    </>
  );
}
