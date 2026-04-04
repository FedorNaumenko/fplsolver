'use client';

import { useState } from 'react';
import type { Player, TransferSuggestion, MultiTransferPlan, PlannedTransfer } from '@/lib/types';
import { formatPrice, getPositionName } from '@/lib/utils';

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
    high: { background: 'rgba(0,255,135,0.15)', color: '#00ff87', border: '1px solid rgba(0,255,135,0.3)' },
    medium: { background: 'rgba(255,200,0,0.15)', color: '#ffc800', border: '1px solid rgba(255,200,0,0.3)' },
    low: { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.12)' },
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
  index,
  localSquad,
  localBudget,
  onApply,
  isApplied,
}: {
  s: TransferSuggestion;
  index: number;
  localSquad: Player[];
  localBudget: number;
  onApply: () => void;
  isApplied: boolean;
}) {
  const playerStillOut = localSquad.some(p => p.id === s.playerOut.id);
  const playerAlreadyIn = localSquad.some(p => p.id === s.playerIn.id);
  const maxSpend = s.playerOut.now_cost + localBudget;
  const affordable = s.playerIn.now_cost <= maxSpend;
  const sameTeamCount = localSquad.filter(p => p.team === s.playerIn.team && p.id !== s.playerOut.id).length;
  const teamOk = sameTeamCount < 3;

  const canApply = playerStillOut && !playerAlreadyIn && affordable && teamOk;
  let applyReason = '';
  if (!playerStillOut) applyReason = 'Already transferred';
  else if (playerAlreadyIn) applyReason = 'Already in squad';
  else if (!affordable) applyReason = 'Over budget';
  else if (!teamOk) applyReason = 'Max 3 per club';

  return (
    <div
      className="rounded-lg p-4 transition-colors"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <PriorityBadge priority={s.priority} />
          <span className="text-sm font-medium">
            <span style={{ color: '#ff6b6b' }}>{s.playerOut.web_name}</span>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}> → </span>
            <span style={{ color: '#00ff87' }}>{s.playerIn.web_name}</span>
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
          >
            {getPositionName(s.playerIn.element_type)}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex gap-3 text-sm">
            <div className="text-right">
              <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>xPts</div>
              <div className="font-bold" style={{ color: '#00ff87' }}>+{s.expectedPointsGain}</div>
            </div>
            <div className="text-right">
              <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Cost</div>
              <div
                className="font-medium"
                style={{
                  color: s.cost > 0 ? '#ff6b6b' : s.cost < 0 ? '#00ff87' : 'rgba(255,255,255,0.4)',
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
              style={{ background: 'rgba(0,255,135,0.15)', color: '#00ff87', border: '1px solid rgba(0,255,135,0.3)', cursor: 'default' }}
            >
              Applied ✓
            </button>
          ) : canApply ? (
            <button
              onClick={onApply}
              className="text-xs font-semibold px-2 py-1 rounded transition-colors"
              style={{ background: '#04f5ff', color: '#1a0025' }}
            >
              Apply →
            </button>
          ) : (
            <div
              className="text-[10px] font-medium px-2 py-1 rounded text-center"
              style={{ background: 'rgba(255,107,107,0.1)', color: 'rgba(255,107,107,0.7)', border: '1px solid rgba(255,107,107,0.2)', minWidth: '60px' }}
            >
              {applyReason}
            </div>
          )}
        </div>
      </div>
      <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.reasoning}</p>
    </div>
  );
}

function PlannedTransferRow({ t, index }: { t: PlannedTransfer; index: number }) {
  return (
    <div
      className="flex items-center justify-between py-3"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-bold w-5 shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }}>
          #{index + 1}
        </span>
        <span
          className="text-xs px-1.5 py-0.5 rounded shrink-0"
          style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
        >
          {getPositionName(t.playerIn.element_type)}
        </span>
        <span className="text-sm font-medium truncate">
          <span style={{ color: '#ff6b6b' }}>{t.playerOut.web_name}</span>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}> → </span>
          <span style={{ color: '#00ff87' }}>{t.playerIn.web_name}</span>
        </span>
      </div>
      <div className="flex gap-3 text-sm shrink-0 ml-2">
        <div className="text-right">
          <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>xPts</div>
          <div className="font-bold" style={{ color: '#00ff87' }}>+{t.xPtsGain}</div>
        </div>
        <div className="text-right">
          <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Price</div>
          <div
            className="font-medium text-xs"
            style={{
              color: t.costDiff > 0 ? '#ff6b6b' : t.costDiff < 0 ? '#00ff87' : 'rgba(255,255,255,0.35)',
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
      <p className="text-sm py-4 text-center" style={{ color: 'rgba(255,255,255,0.4)' }}>
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
        style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="flex gap-4 text-sm">
          <div>
            <span className="text-xs block" style={{ color: 'rgba(255,255,255,0.4)' }}>xPts gain</span>
            <span className="font-bold" style={{ color: '#00ff87' }}>+{plan.totalXPtsGain}</span>
          </div>
          {!isWildcard && (
            <div>
              <span className="text-xs block" style={{ color: 'rgba(255,255,255,0.4)' }}>Points hit</span>
              <span className="font-bold" style={{ color: plan.pointsHit > 0 ? '#ff6b6b' : 'rgba(255,255,255,0.35)' }}>
                {plan.pointsHit > 0 ? `-${plan.pointsHit}` : 'None'}
              </span>
            </div>
          )}
          <div>
            <span className="text-xs block" style={{ color: 'rgba(255,255,255,0.4)' }}>Net gain</span>
            <span className="font-bold" style={{ color: plan.netGain > 0 ? '#00ff87' : '#ff6b6b' }}>
              {plan.netGain > 0 ? `+${plan.netGain}` : plan.netGain}
            </span>
          </div>
        </div>
        {!isWildcard && plan.pointsHit > 0 && (
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
            −{plan.pointsHit} pts hit ({plan.transfers.length - 1} extra transfer{plan.transfers.length - 1 > 1 ? 's' : ''})
          </p>
        )}
        {isWildcard && (
          <p className="text-xs italic" style={{ color: 'rgba(255,255,255,0.35)' }}>Wildcard — no points hit</p>
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
    <div
      className="rounded-xl shadow-xl overflow-hidden"
      style={{ border: '1px solid rgba(255,255,255,0.12)' }}
    >
      {/* Tab bar */}
      <div className="flex" style={{ background: 'rgba(0,0,0,0.5)' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 py-3 text-sm font-medium transition-colors"
            style={
              activeTab === tab.id
                ? { color: '#ffffff', borderBottom: '2px solid #04f5ff' }
                : { color: 'rgba(255,255,255,0.4)', borderBottom: '2px solid transparent' }
            }
          >
            {tab.label}
            {tab.id === 'wildcard' && (
              <span
                className="ml-1 text-[10px] px-1 py-0.5 rounded font-semibold"
                style={{ background: 'rgba(168,85,247,0.2)', color: '#c084fc' }}
              >
                CHIP
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="relative">
        <div className="p-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
          {activeTab === 'single' && (
            <>
              <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Best individual transfers — ranked by expected points gain over the next 3 gameweeks.
              </p>
              {suggestions.length === 0 ? (
                <p className="text-sm py-4 text-center" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  No beneficial transfers found within your budget.
                </p>
              ) : (
                <div className="space-y-3">
                  {suggestions.map((s, i) => (
                    <SingleTransferCard
                      key={i}
                      s={s}
                      index={i}
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
                style={{ color: 'rgba(255,255,255,0.3)', borderTop: '1px solid rgba(255,255,255,0.08)' }}
              >
                Based on form × fixture difficulty × avg minutes/GW over next 3 weeks. Assumes 1 free transfer.
              </p>
            </>
          )}

          {activeTab === '2' && (
            <>
              <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Best 2 transfers planned together. Assumes 1 free transfer — 1 hit (−4 pts) if both are used.
              </p>
              <PlanSummary plan={plan2} isWildcard={false} />
            </>
          )}

          {activeTab === '3' && (
            <>
              <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Best 3 transfers planned together. Assumes 1 free transfer — 2 hits (−8 pts) if all 3 are used.
              </p>
              <PlanSummary plan={plan3} isWildcard={false} />
            </>
          )}

          {activeTab === 'wildcard' && (
            <>
              <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Wildcard mode — up to 8 greedy improvements with no points hit.
              </p>
              <PlanSummary plan={wildcard} isWildcard={true} />
            </>
          )}
        </div>

        {transfersLoading && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-b-xl z-20"
            style={{ background: 'rgba(26,0,37,0.85)', backdropFilter: 'blur(2px)' }}
          >
            <div
              className="w-7 h-7 rounded-full border-2 animate-spin mb-2"
              style={{ borderColor: '#04f5ff transparent transparent transparent' }}
            />
            <p className="text-xs font-semibold" style={{ color: '#04f5ff' }}>Refreshing suggestions…</p>
          </div>
        )}
      </div>
    </div>
  );
}
