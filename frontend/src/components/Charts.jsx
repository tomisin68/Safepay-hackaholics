import { useState } from 'react';
import { cn } from '../lib/cn';
import { formatCompact, formatNaira } from '../lib/format';

/**
 * Stat tile — a hero number, not a chart.
 *
 * When the data's job is "one headline value", a chart is the wrong form. The
 * number wears text tokens; the only colour is a small status pill for the
 * delta, which always ships with a sign as well as a hue.
 */
export function StatTile({ label, value, sublabel, icon: Icon, tone = 'neutral', hint }) {
  const accent = {
    brand: 'bg-brand-soft text-brand-ink',
    success: 'bg-success-soft text-success-ink',
    warn: 'bg-warn-soft text-warn-ink',
    danger: 'bg-danger-soft text-danger-ink',
    neutral: 'bg-sunken text-muted',
  }[tone];

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.8rem] font-semibold text-muted">{label}</p>
        {Icon && (
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]', accent)}>
            <Icon size={16} />
          </span>
        )}
      </div>
      <p className="numeric mt-3 text-[1.6rem] font-semibold leading-none text-ink">{value}</p>
      {sublabel && <p className="mt-2 text-[0.78rem] text-muted leading-snug">{sublabel}</p>}
      {hint && <p className="mt-1 text-[0.72rem] text-faint">{hint}</p>}
    </div>
  );
}

/**
 * Settlement volume — a single-series bar chart.
 *
 * One series, so no legend: the title names it. Sequential single hue, bars
 * anchored to the baseline with 4px rounded data-ends and a 2px surface gap
 * between them, recessive axes, and a hover tooltip on every bar. Values are
 * also available as a table for anyone who cannot read the marks.
 */
export function VolumeChart({ series = [], height = 172, valueKey = 'valueKobo', title = 'Settlement volume' }) {
  const [hover, setHover] = useState(null);
  const [showTable, setShowTable] = useState(false);

  const values = series.map((d) => Number(d[valueKey]) || 0);
  const max = Math.max(...values, 1);
  const total = values.reduce((a, b) => a + b, 0);

  if (!series.length) {
    return (
      <div className="flex h-[172px] items-center justify-center rounded-[12px] border border-dashed border-line text-[0.85rem] text-faint">
        No settlement activity yet
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <p className="text-[0.8rem] font-semibold text-muted">{title} · last {series.length} days</p>
          <p className="numeric mt-1 text-[1.5rem] font-semibold leading-none text-ink">
            {valueKey === 'valueKobo' ? formatNaira(total, { decimals: false }) : total.toLocaleString()}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowTable((s) => !s)}
          className="text-[0.75rem] font-semibold text-muted hover:text-brand-ink transition-colors"
          aria-expanded={showTable}
        >
          {showTable ? 'Show chart' : 'Show values'}
        </button>
      </div>

      {showTable ? (
        <div className="max-h-[172px] overflow-y-auto rounded-[10px] border border-line">
          <table className="w-full text-[0.8rem]">
            <caption className="sr-only">{title} by day</caption>
            <thead className="sticky top-0 bg-sunken">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-muted">Date</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold text-muted">Value</th>
              </tr>
            </thead>
            <tbody>
              {series.map((d) => (
                <tr key={d.date} className="border-t border-line">
                  <td className="px-3 py-1.5 text-ink">{d.date}</td>
                  <td className="numeric px-3 py-1.5 text-right text-ink">
                    {valueKey === 'valueKobo' ? formatNaira(d[valueKey]) : d[valueKey]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <div
            className="flex items-end gap-[2px]"
            style={{ height }}
            role="img"
            aria-label={`${title}: ${series.length} daily bars, peak ${formatNaira(max, { decimals: false })}`}
          >
            {series.map((d, i) => {
              const value = Number(d[valueKey]) || 0;
              const pct = (value / max) * 100;
              const active = hover === i;
              return (
                <div
                  key={d.date}
                  className="relative flex flex-1 items-end justify-center h-full"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                >
                  {/* full-height hit target, larger than the mark itself */}
                  <span className="absolute inset-0" aria-hidden="true" />
                  <div
                    className={cn(
                      'w-full rounded-t-[4px] transition-[background-color,opacity] duration-200',
                      active ? 'bg-brand' : 'bg-brand/55',
                    )}
                    style={{ height: `${Math.max(pct, value > 0 ? 3 : 1.5)}%` }}
                  />
                  {active && (
                    <div className="pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-[9px] border border-line bg-surface px-2.5 py-1.5 shadow-[var(--shadow-md)]">
                      <p className="text-[0.7rem] font-medium text-muted">{d.date}</p>
                      <p className="numeric text-[0.82rem] font-semibold text-ink">
                        {valueKey === 'valueKobo' ? formatNaira(value) : value}
                      </p>
                      {d.count != null && (
                        <p className="text-[0.68rem] text-muted">{d.count} escrow{d.count === 1 ? '' : 's'}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* recessive baseline + endpoint labels only, never a label per bar */}
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-[0.7rem] text-faint">
            <span>{series[0]?.date?.slice(5)}</span>
            <span className="numeric">peak {formatCompact(max)}</span>
            <span>{series[series.length - 1]?.date?.slice(5)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
