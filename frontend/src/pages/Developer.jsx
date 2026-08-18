import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/AppShell';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CopyField, Alert, Pill, Skeleton, Modal, EmptyState, Tabs } from '../components/ui/Primitives';
import { Field, Input, Textarea } from '../components/ui/Form';
import { VolumeChart } from '../components/Charts';
import { useToast } from '../context/AppProviders';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { timeAgo, formatDateTime } from '../lib/format';
import {
  IconCode, IconKey, IconWebhook, IconPlus, IconRefresh, IconExternal, IconCheck,
  IconAlert, IconSpark, IconChart,
} from '../components/Icons';

const ENDPOINTS = [
  ['POST', '/v1/escrows', 'Create an escrow'],
  ['GET', '/v1/escrows', 'List escrows'],
  ['GET', '/v1/escrows/:id', 'Retrieve one escrow'],
  ['POST', '/v1/escrows/:id/fund', 'Fund it'],
  ['POST', '/v1/escrows/:id/release', 'Release the funds'],
  ['POST', '/v1/disputes', 'Raise a dispute'],
  ['GET', '/v1/score/:userId', 'Look up a SafeScore (public)'],
  ['GET', '/v1/score/:userId/badge.svg', 'Embeddable trust badge'],
];

const METHOD_TONE = { POST: 'bg-success-soft text-success-ink', GET: 'bg-brand-soft text-brand-ink' };

export default function Developer() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('keys');
  const [logs, setLogs] = useState({ webhooks: null, requests: null });

  const [createOpen, setCreateOpen] = useState(false);
  const [newApp, setNewApp] = useState({ name: '', description: '', webhookUrl: '' });
  const [creating, setCreating] = useState(false);
  const [freshKeys, setFreshKeys] = useState(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.developer.apps();
      setData(res);
      setSelected((current) => res.apps.find((a) => a.id === current?.id) ?? res.apps[0] ?? null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selected) return;
    api.developer.webhooks(selected.id).then((r) => setLogs((l) => ({ ...l, webhooks: r.logs }))).catch(() => {});
    api.developer.requests(selected.id).then((r) => setLogs((l) => ({ ...l, requests: r }))).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const createApp = async () => {
    if (newApp.name.trim().length < 2) return;
    setCreating(true);
    try {
      const res = await api.developer.createApp({
        name: newApp.name.trim(),
        description: newApp.description.trim(),
        webhookUrl: newApp.webhookUrl.trim() || undefined,
      });
      setFreshKeys(res);
      setCreateOpen(false);
      setNewApp({ name: '', description: '', webhookUrl: '' });
      await load();
      toast.success('App created', 'Copy your keys now — they are only shown once.');
    } catch (err) {
      toast.error('Could not create app', err.message);
    } finally {
      setCreating(false);
    }
  };

  const rotate = async (mode) => {
    setBusy(mode);
    try {
      const res = await api.developer.rotate(selected.id, mode);
      setFreshKeys({ keys: { [mode]: res.key }, notice: res.notice, app: res.app });
      await load();
    } catch (err) {
      toast.error('Could not rotate key', err.message);
    } finally {
      setBusy('');
    }
  };

  const sendTest = async () => {
    setBusy('test');
    try {
      await api.developer.testWebhook(selected.id);
      toast.success('Test event sent', 'Check your delivery log in a moment.');
      setTimeout(() => {
        api.developer.webhooks(selected.id).then((r) => setLogs((l) => ({ ...l, webhooks: r.logs })));
      }, 1200);
    } catch (err) {
      toast.error('Could not send test', err.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <PageHeader
        title="Developer platform"
        description="Add escrow, settlement and trust scoring to your own app."
        action={<Button icon={IconPlus} onClick={() => setCreateOpen(true)}>New app</Button>}
      />

      {error && <Alert tone="danger" title="Could not load your apps" className="mb-6">{error}</Alert>}

      {!data ? (
        <Skeleton className="h-[400px] rounded-[14px]" />
      ) : data.apps.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={IconCode}
            title="No apps yet"
            description="Create an app to get sandbox API keys and start building against SafePay. Test mode uses fake money — nothing real moves."
            action={<Button icon={IconPlus} onClick={() => setCreateOpen(true)}>Create your first app</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[260px_1fr] lg:items-start">
          {/* ---------- app list ---------- */}
          <Card padded={false} className="p-2">
            {data.apps.map((app) => (
              <button
                key={app.id}
                type="button"
                onClick={() => setSelected(app)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-[11px] p-3 text-left transition-colors',
                  selected?.id === app.id ? 'bg-brand-soft' : 'hover:bg-sunken',
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]',
                    selected?.id === app.id ? 'bg-brand text-white' : 'bg-sunken text-muted',
                  )}
                >
                  <IconCode size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-[0.87rem] font-semibold', selected?.id === app.id ? 'text-brand-ink' : 'text-ink')}>
                    {app.name}
                  </span>
                  <span className="block text-[0.72rem] text-muted">
                    {app.stats.requests24h} calls · 24h
                  </span>
                </span>
              </button>
            ))}
          </Card>

          {/* ---------- app detail ---------- */}
          {selected && (
            <div className="flex flex-col gap-6">
              <Card>
                <CardHeader
                  title={selected.name}
                  description={selected.description || 'No description yet.'}
                  action={<Pill tone={selected.liveEnabled ? 'success' : 'warn'}>{selected.liveEnabled ? 'Live enabled' : 'Sandbox only'}</Pill>}
                />

                <div className="grid grid-cols-3 gap-3">
                  {[
                    ['Calls (24h)', selected.stats.requests24h, IconChart],
                    ['Webhooks OK', selected.stats.webhooksDelivered, IconCheck],
                    ['Webhooks failed', selected.stats.webhooksFailed, IconAlert],
                  ].map(([label, value, Icon]) => (
                    <div key={label} className="rounded-[11px] border border-line bg-sunken p-3">
                      <div className="flex items-center gap-1.5 text-muted">
                        <Icon size={13} />
                        <span className="text-[0.71rem] font-medium">{label}</span>
                      </div>
                      <p className="numeric mt-1.5 text-[1.25rem] font-semibold text-ink">{value}</p>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <Tabs
                  className="mb-5 sm:max-w-fit"
                  value={tab}
                  onChange={setTab}
                  tabs={[
                    { value: 'keys', label: 'API keys' },
                    { value: 'webhooks', label: 'Webhooks' },
                    { value: 'usage', label: 'Usage' },
                    { value: 'reference', label: 'Reference' },
                  ]}
                />

                {tab === 'keys' && (
                  <div className="flex flex-col gap-5">
                    <Alert tone="brand" title="Keys are stored hashed">
                      SafePay keeps only a SHA-256 hash of each key, so nobody — including us — can
                      read it back. Rotate it if you lose it.
                    </Alert>

                    {[['test', 'Sandbox key', selected.testKeyPreview], ['live', 'Live key', selected.liveKeyPreview]].map(
                      ([mode, label, preview]) => (
                        <div key={mode} className="rounded-[12px] border border-line p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <IconKey size={16} className="text-brand" />
                              <span className="text-[0.87rem] font-semibold text-ink">{label}</span>
                              <Pill tone={mode === 'test' ? 'warn' : 'success'} size="sm" dot={false}>{mode}</Pill>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={IconRefresh}
                              loading={busy === mode}
                              onClick={() => rotate(mode)}
                            >
                              Rotate
                            </Button>
                          </div>
                          <CopyField value={preview} />
                        </div>
                      ),
                    )}

                    <div className="rounded-[12px] bg-sunken p-4">
                      <p className="text-[0.8rem] font-semibold text-ink">Try it right now</p>
                      <pre className="mt-2.5 overflow-x-auto rounded-[9px] bg-plum p-3.5 text-[0.75rem] leading-relaxed text-white/85">
                        <code className="numeric">{`curl ${window.location.origin}/v1/escrows \\
  -H "Authorization: Bearer sk_test_..."`}</code>
                      </pre>
                    </div>
                  </div>
                )}

                {tab === 'webhooks' && (
                  <div className="flex flex-col gap-5">
                    <CopyField label="Signing secret" value={selected.webhookSecret} revealable />

                    <Alert tone="brand" title="Verify every payload">
                      Each request carries <code className="numeric text-[0.8rem]">SafePay-Signature: t=…,v1=…</code> —
                      an HMAC-SHA256 over <code className="numeric text-[0.8rem]">{'`${t}.${body}`'}</code>. Reject anything
                      whose timestamp falls outside your tolerance window and replay attacks stop working.
                    </Alert>

                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[0.85rem] font-semibold text-ink">Endpoint</p>
                        <p className="truncate text-[0.79rem] text-muted">{selected.webhookUrl || 'Not configured'}</p>
                      </div>
                      <Button size="sm" variant="secondary" icon={IconWebhook} loading={busy === 'test'} onClick={sendTest}>
                        Send test event
                      </Button>
                    </div>

                    <div>
                      <p className="mb-2.5 text-[0.85rem] font-semibold text-ink">Recent deliveries</p>
                      {!logs.webhooks ? (
                        <Skeleton className="h-24 rounded-[11px]" />
                      ) : logs.webhooks.length === 0 ? (
                        <p className="rounded-[11px] border border-dashed border-line px-4 py-6 text-center text-[0.83rem] text-faint">
                          No deliveries yet.
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {logs.webhooks.slice(0, 8).map((log) => (
                            <li key={log.id} className="flex items-center gap-3 rounded-[10px] border border-line px-3 py-2.5">
                              <Pill
                                tone={log.status === 'delivered' ? 'success' : log.status === 'failed' ? 'danger' : 'warn'}
                                size="sm"
                              >
                                {log.status}
                              </Pill>
                              <span className="numeric truncate text-[0.79rem] text-ink">{log.event}</span>
                              <span className="ml-auto shrink-0 text-[0.72rem] text-faint">
                                {log.attempts} try{log.attempts === 1 ? '' : 's'} · {timeAgo(log.createdAt)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <p className="mb-2 text-[0.85rem] font-semibold text-ink">Subscribed events</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(selected.subscribedEvents ?? []).map((event) => (
                          <span key={event} className="numeric rounded-full bg-sunken px-2.5 py-1 text-[0.72rem] text-muted">
                            {event}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {tab === 'usage' && (
                  <div className="flex flex-col gap-6">
                    {!logs.requests ? (
                      <Skeleton className="h-[220px] rounded-[11px]" />
                    ) : (
                      <>
                        <VolumeChart
                          series={logs.requests.series}
                          valueKey="count"
                          title="API calls"
                        />
                        <div>
                          <p className="mb-2.5 text-[0.85rem] font-semibold text-ink">Recent requests</p>
                          {logs.requests.logs.length === 0 ? (
                            <p className="rounded-[11px] border border-dashed border-line px-4 py-6 text-center text-[0.83rem] text-faint">
                              No API calls with this key yet.
                            </p>
                          ) : (
                            <ul className="flex flex-col gap-1.5">
                              {logs.requests.logs.slice(0, 10).map((log) => (
                                <li key={log.id} className="flex items-center gap-3 rounded-[9px] bg-sunken px-3 py-2">
                                  <span className={cn('numeric rounded px-1.5 py-0.5 text-[0.68rem] font-bold', METHOD_TONE[log.method] ?? 'bg-neutral-soft text-neutral-ink')}>
                                    {log.method}
                                  </span>
                                  <span className="numeric truncate text-[0.78rem] text-ink">{log.path}</span>
                                  <span className="ml-auto shrink-0 text-[0.71rem] text-faint">{formatDateTime(log.at)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {tab === 'reference' && (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[0.85rem] text-muted">Full OpenAPI reference with request and response schemas.</p>
                      <Button size="sm" variant="secondary" href="/docs" iconRight={IconExternal}>Open docs</Button>
                    </div>
                    <ul className="divide-y divide-line rounded-[12px] border border-line">
                      {ENDPOINTS.map(([method, path, description]) => (
                        <li key={`${method}${path}`} className="flex items-center gap-3 p-3">
                          <span className={cn('numeric w-12 shrink-0 rounded px-1.5 py-0.5 text-center text-[0.68rem] font-bold', METHOD_TONE[method])}>
                            {method}
                          </span>
                          <code className="numeric truncate text-[0.79rem] text-ink">{path}</code>
                          <span className="ml-auto hidden shrink-0 text-[0.76rem] text-muted sm:block">{description}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ---------- create app ---------- */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create an app"
        description="You will get a sandbox key immediately. Sandbox mode moves fake money only."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button loading={creating} onClick={createApp} icon={IconCode}>Create app</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="App name" required>
            {(props) => (
              <Input
                {...props}
                data-autofocus
                placeholder="Campus Marketplace"
                value={newApp.name}
                onChange={(e) => setNewApp((a) => ({ ...a, name: e.target.value }))}
              />
            )}
          </Field>
          <Field label="What does it do?" hint="Optional — helps you tell apps apart later.">
            {(props) => (
              <Textarea
                {...props}
                rows={2}
                placeholder="Student-to-student trading for Nigerian universities."
                value={newApp.description}
                onChange={(e) => setNewApp((a) => ({ ...a, description: e.target.value }))}
              />
            )}
          </Field>
          <Field label="Webhook URL" hint="Optional — where SafePay posts signed events.">
            {(props) => (
              <Input
                {...props}
                type="url"
                placeholder="https://yourapp.com/webhooks/safepay"
                value={newApp.webhookUrl}
                onChange={(e) => setNewApp((a) => ({ ...a, webhookUrl: e.target.value }))}
              />
            )}
          </Field>
        </div>
      </Modal>

      {/* ---------- fresh keys, shown once ---------- */}
      <Modal
        open={Boolean(freshKeys)}
        onClose={() => setFreshKeys(null)}
        title="Copy your keys now"
        description={freshKeys?.notice}
        size="lg"
        footer={<Button onClick={() => setFreshKeys(null)} icon={IconCheck} data-autofocus>I have saved them</Button>}
      >
        <div className="flex flex-col gap-4">
          <Alert tone="warn" title="This is the only time you will see these">
            SafePay stores a hash, never the key itself. If you lose it, rotate and update your app.
          </Alert>
          {freshKeys?.keys?.test && <CopyField label="Sandbox key (sk_test_…)" value={freshKeys.keys.test} />}
          {freshKeys?.keys?.live && <CopyField label="Live key (sk_live_…)" value={freshKeys.keys.live} revealable />}
          <div className="flex items-start gap-2.5 rounded-[11px] bg-sunken p-3.5">
            <IconSpark size={16} className="mt-0.5 shrink-0 text-brand" />
            <p className="text-[0.82rem] leading-relaxed text-muted">
              Start with the sandbox key. Every escrow it creates is simulated, so you can build the
              whole flow — funding, release, disputes, webhooks — without moving a naira.
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}
