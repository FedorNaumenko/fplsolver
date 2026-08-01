'use client';

import { useState } from 'react';
import type { Player, TransferSuggestion, MultiTransferPlan, PlannedTransfer } from '@/lib/types';
import { formatPrice, getPositionName } from '@/lib/utils';
import { canSwap } from '@/lib/calculations/squadRules';

interface Props {
  suggestions: TransferSuggestion[];
  plan2: MultiTransferPlan;
  plan3: MultiTransferPlan;
  wildcard: MultiTransferPlan;
  localSquad: Player[];
  localBudget: number;
  onApplyTransfer: (playerOut: Player, playerIn: Player) => void;
  transfersLoading: boolean;
}

type Tab = 'single' | '2' | '3' | 'wildcard';

function PriorityBadge({ priority }: { priority: TransferSuggestion['priority'] }) {
  const styles: Record<string, React.CSSProperties> = {
    high: { background: 'oklch(87.6% 0.229 152.4 / 0.15)', color: 'var(--color-money)', border: '1px solid oklch(87.6% 0.229 152.4 / 0.35)' },
    medium: { background: 'oklch(85.6% 0.166 88.4 / 0.15)', color: 'var(--color-warn)', border: '1px solid oklch(85.6% 0.166 88.4 / 0.35)' },
    low: { background: 'var(--fill-2)', color: 'var(--ink-muted)', border: '1px solid var(--rule)' },
  };
  return (
    <span
      className="text-xs px-2 py-0.5 rounded font-semibold uppercase"
      style={styles[priority]}
    >
      {priority}
    </span>
  );
}

function SingleTransferCard({
  s,
  localSquad,
  localBudget,
  onApply,
  isApplied,
}: {
  s: TransferSuggestion;
  localSquad: Player[];
  localBudget: number;
  onApply: () => void;
  isApplied: boolean;
}) {
  const verdict = canSwap(localSquad, s.playerOut, s.playerIn, localBudget);
  const canApply = verdict.ok;
  const applyReason = verdict.reason ?? '';

  return (
    <div
      className="rounded-lg p-4 transition-colors"
      style={{
        background: 'var(--fill-1)',
        border: '1px solid var(--rule)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <PriorityBadge priority={s.priority} />
          <span className="text-sm font-medium">
            <span style={{ color: 'var(--color-danger)' }}>{s.playerOut.web_name}</span>
            <span style={{ color: 'var(--ink-muted)' }}> → </span>
            <span style={{ color: 'var(--color-money)' }}>{s.playerIn.web_name}</span>
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ background: 'var(--fill-2)', color: 'var(--ink-muted)' }}
          >
            {getPositionName(s.playerIn.element_type)}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex gap-3 text-sm">
            <div className="text-right">
              <div className="text-xs" style={{ color: 'var(--ink-muted)' }}>xPts</div>
              <div className="num font-bold" style={{ color: 'var(--color-money)' }}>+{s.expectedPointsGain}</div>
            </div>
            <div className="text-right">
              <div className="text-xs" style={{ color: 'var(--ink-muted)' }}>Cost</div>
              <div
                className="font-medium"
                style={{
                  color: s.cost > 0 ? 'var(--color-danger)' : s.cost < 0 ? 'var(--color-money)' : 'var(--ink-muted)',
                }}
              >
                {s.cost > 0 ? `+${formatPrice(s.cost)}` : s.cost < 0 ? `-${formatPrice(Math.abs(s.cost))}` : 'Free'}
              </div>
            </div>
          </div>
          {isApplied ? (
            <button
              disabled
              className="text-xs font-semibold px-2 py-1 rounded"
              style={{ background: 'oklch(87.6% 0.229 152.4 / 0.15)', color: 'var(--color-money)', border: '1px solid oklch(87.6% 0.229 152.4 / 0.35)', cursor: 'default' }}
            >
              Applied ✓
            </button>
          ) : canApply ? (
            <button
              onClick={onApply}
              className="text-xs font-semibold px-2 py-1 rounded transition-colors"
              style={{ background: 'var(--color-accent)', color: 'var(--color-ground)' }}
            >
              Apply →
            </button>
          ) : (
            <div
              className="text-xs font-medium px-2 py-1 rounded text-center"
              style={{ background: 'oklch(71.2% 0.181 22.8 / 0.12)', color: 'var(--color-danger-ink)', border: '1px solid oklch(71.2% 0.181 22.8 / 0.3)', minWidth: '60px' }}
            >
              {applyReason}
            </div>
          )}
        </div>
      </div>
      <p className="text-xs mt-2" style={{ color: 'var(--ink-muted)' }}>{s.reasoning}</p>
    </div>
  );
}

function PlannedTransferRow({ t, index }: { t: PlannedTransfer; index: number }) {
  return (
    <div
      className="flex items-center justify-between py-3"
      style={{ borderBottom: '1px solid var(--rule)' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-bold w-5 shrink-0" style={{ color: 'var(--ink-muted)' }}>
          #{index + 1}
        </span>
        <span
          className="text-xs px-1.5 py-0.5 rounded shrink-0"
          style={{ background: 'var(--fill-2)', color: 'var(--ink-muted)' }}
        >
          {getPositionName(t.playerIn.element_type)}
        </span>
        <span className="text-sm font-medium truncate">
          <span style={{ color: 'var(--color-danger)' }}>{t.playerOut.web_name}</span>
          <span style={{ color: 'var(--ink-muted)' }}> → </span>
          <span style={{ color: 'var(--color-money)' }}>{t.playerIn.web_name}</span>
        </span>
      </div>
      <div className="flex gap-3 text-sm shrink-0 ml-2">
        <div className="text-right">
          <div className="text-xs" style={{ color: 'var(--ink-muted)' }}>xPts</div>
          <div className="num font-bold" style={{ color: 'var(--color-money)' }}>+{t.xPtsGain}</div>
        </div>
        <div className="text-right">
          <div className="text-xs" style={{ color: 'var(--ink-muted)' }}>Price</div>
          <div
            className="font-medium text-xs"
            style={{
              color: t.costDiff > 0 ? 'var(--color-danger)' : t.costDiff < 0 ? 'var(--color-money)' : 'var(--ink-muted)',
            }}
          >
            {t.costDiff > 0 ? `+${formatPrice(t.costDiff)}` : t.costDiff < 0 ? `-${formatPrice(Math.abs(t.costDiff))}` : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanSummary({ plan, isWildcard }: { plan: MultiTransferPlan; isWildcard: boolean }) {
  if (plan.transfers.length === 0) {
    return (
      <p className="text-sm py-4 text-center" style={{ color: 'var(--ink-muted)' }}>
        No beneficial transfers found within your budget.
      </p>
    );
  }

  return (
    <div>
      <div>
        {plan.transfers.map((t, i) => (
          <PlannedTransferRow key={i} t={t} index={i} />
        ))}
      </div>
      <div
        className="mt-4 pt-4 flex items-center justify-between flex-wrap gap-3"
        style={{ borderTop: '1px solid var(--fill-2)' }}
      >
        <div className="flex gap-4 text-sm">
          <div>
            <span className="text-xs block" style={{ color: 'var(--ink-muted)' }}>xPts gain</span>
            <span className="num font-bold" style={{ color: 'var(--color-money)' }}>+{plan.totalXPtsGain}</span>
          </div>
          {!isWildcard && (
            <div>
              <span className="text-xs block" style={{ color: 'var(--ink-muted)' }}>Points hit</span>
              <span className="font-bold" style={{ color: plan.pointsHit > 0 ? 'var(--color-danger)' : 'var(--ink-muted)' }}>
                {plan.pointsHit > 0 ? `-${plan.pointsHit}` : 'None'}
              </span>
            </div>
          )}
          <div>
            <span className="text-xs block" style={{ color: 'var(--ink-muted)' }}>Net gain</span>
            <span className="font-bold" style={{ color: plan.netGain > 0 ? 'var(--color-money)' : 'var(--color-danger)' }}>
              {plan.netGain > 0 ? `+${plan.netGain}` : plan.netGain}
            </span>
          </div>
        </div>
        {!isWildcard && plan.pointsHit > 0 && (
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
            −{plan.pointsHit} pts hit ({plan.transfers.length - 1} extra transfer{plan.transfers.length - 1 > 1 ? 's' : ''})
          </p>
        )}
        {isWildcard && (
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Wildcard — no points hit</p>
        )}
      </div>
    </div>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'single', label: 'Best 1' },
  { id: '2', label: 'Plan 2' },
  { id: '3', label: 'Plan 3' },
  { id: 'wildcard', label: 'Wildcard' },
];

export default function TransferPlanner({ suggestions, plan2, plan3, wildcard, localSquad, localBudget, onApplyTransfer, transfersLoading }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('single');
  const [appliedSet, setAppliedSet] = useState<Set<number>>(new Set());

  const handleApply = (index: number, playerOut: Player, playerIn: Player) => {
    onApplyTransfer(playerOut, playerIn);
    setAppliedSet(prev => new Set(prev).add(index));
  };

  return (
    // Deliberately not the same enclosed box as the squad panel — an open section
    // hung off a top rule, so the two stacked sections differ in weight.
    <div className="overflow-hidden" style={{ borderTop: '1px solid var(--rule-strong)' }}>
      {/* Tab bar */}
      <div className="flex" style={{ background: 'var(--color-well)' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            aria-pressed={activeTab === tab.id}
            className="flex-1 min-w-0 py-3 text-sm font-medium"
            style={{
              transition: 'color var(--dur-short) var(--ease-out)',
              ...(activeTab === tab.id
                ? { color: 'var(--ink)', borderBottom: '2px solid var(--color-accent)' }
                : { color: 'var(--ink-muted)', borderBottom: '2px solid transparent' }),
            }}
          >
            {tab.label}
            {tab.id === 'wildcard' && (
              <span
                className="ml-1 text-xs px-1 py-0.5 rounded font-semibold"
                style={{ background: 'oklch(72.2% 0.177 305.5 / 0.22)', color: 'var(--color-chip)' }}
              >
                CHIP
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="relative">
        <div className="p-4" style={{ background: 'var(--fill-1)' }}>
          {activeTab === 'single' && (
            <>
              <p className="text-xs mb-3" style={{ color: 'var(--ink-muted)' }}>
                Best individual transfers — ranked by expected points gain over the next 3 gameweeks.
              </p>
              {suggestions.length === 0 ? (
                <p className="text-sm py-4 text-center" style={{ color: 'var(--ink-muted)' }}>
                  No beneficial transfers found within your budget.
                </p>
              ) : (
                <div className="space-y-3">
                  {suggestions.map((s, i) => (
                    <SingleTransferCard
                      key={i}
                      s={s}
                      localSquad={localSquad}
                      localBudget={localBudget}
                      onApply={() => handleApply(i, s.playerOut, s.playerIn)}
                      isApplied={appliedSet.has(i)}
                    />
                  ))}
                </div>
              )}
              <p
                className="text-xs mt-4 pt-3"
                style={{ color: 'var(--ink-muted)', borderTop: '1px solid var(--fill-2)' }}
              >
                Based on form × fixture difficulty × avg minutes/GW over next 3 weeks. Assumes 1 free transfer.
              </p>
            </>
          )}

          {activeTab === '2' && (
            <>
              <p className="text-xs mb-3" style={{ color: 'var(--ink-muted)' }}>
                Best 2 transfers planned together. Assumes 1 free transfer — 1 hit (−4 pts) if both are used.
              </p>
              <PlanSummary plan={plan2} isWildcard={false} />
            </>
          )}

          {activeTab === '3' && (
            <>
              <p className="text-xs mb-3" style={{ color: 'var(--ink-muted)' }}>
                Best 3 transfers planned together. Assumes 1 free transfer — 2 hits (−8 pts) if all 3 are used.
              </p>
              <PlanSummary plan={plan3} isWildcard={false} />
            </>
          )}

          {activeTab === 'wildcard' && (
            <>
              <p className="text-xs mb-3" style={{ color: 'var(--ink-muted)' }}>
                Wildcard mode — up to 8 greedy improvements with no points hit.
              </p>
              <PlanSummary plan={wildcard} isWildcard={true} />
            </>
          )}
        </div>

        {transfersLoading && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-b-lg"
            style={{
              zIndex: 'var(--z-sticky)',
              background: 'color-mix(in oklab, var(--color-ground) 88%, transparent)',
              backdropFilter: 'blur(2px)',
            }}
            role="status"
          >
            <div
              className="w-7 h-7 rounded-full border-2 animate-spin mb-2"
              style={{ borderColor: 'var(--color-accent) transparent transparent transparent' }}
            />
            <p className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>Refreshing suggestions…</p>
          </div>
        )}
      </div>
    </div>
  );
}
