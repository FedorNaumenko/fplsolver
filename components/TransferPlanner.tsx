'use client';

import { useState } from 'react';
import type { TransferSuggestion, MultiTransferPlan, PlannedTransfer } from '@/lib/types';
import { formatPrice, getPositionName } from '@/lib/utils';

interface Props {
  suggestions: TransferSuggestion[];
  plan2: MultiTransferPlan;
  plan3: MultiTransferPlan;
  wildcard: MultiTransferPlan;
}

type Tab = 'single' | '2' | '3' | 'wildcard';

// ── Single transfer card ──────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: TransferSuggestion['priority'] }) {
  const styles = {
    high: 'bg-green-100 text-green-700 border-green-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    low: 'bg-gray-100 text-gray-500 border-gray-200',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-semibold uppercase ${styles[priority]}`}>
      {priority}
    </span>
  );
}

function SingleTransferCard({ s }: { s: TransferSuggestion }) {
  return (
    <div className="border border-gray-100 rounded-lg p-4 hover:border-green-200 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <PriorityBadge priority={s.priority} />
          <span className="text-sm font-medium">
            <span className="text-red-500">{s.playerOut.web_name}</span>
            {' → '}
            <span className="text-green-600">{s.playerIn.web_name}</span>
          </span>
          <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
            {getPositionName(s.playerIn.element_type)}
          </span>
        </div>
        <div className="flex gap-3 text-sm shrink-0">
          <div className="text-right">
            <div className="text-xs text-gray-400">xPts gain</div>
            <div className="font-bold text-green-600">+{s.expectedPointsGain}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">Cost</div>
            <div className={`font-medium ${s.cost > 0 ? 'text-red-500' : s.cost < 0 ? 'text-green-500' : 'text-gray-500'}`}>
              {s.cost > 0 ? `+${formatPrice(s.cost)}` : s.cost < 0 ? `-${formatPrice(Math.abs(s.cost))}` : 'Free'}
            </div>
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-2">{s.reasoning}</p>
    </div>
  );
}

// ── Multi-transfer plan card ──────────────────────────────────────────────────

function PlannedTransferRow({ t, index, isWildcard }: { t: PlannedTransfer; index: number; isWildcard: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-bold text-gray-400 w-5 shrink-0">#{index + 1}</span>
        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded shrink-0">
          {getPositionName(t.playerIn.element_type)}
        </span>
        <span className="text-sm font-medium truncate">
          <span className="text-red-500">{t.playerOut.web_name}</span>
          {' → '}
          <span className="text-green-600">{t.playerIn.web_name}</span>
        </span>
      </div>
      <div className="flex gap-3 text-sm shrink-0 ml-2">
        <div className="text-right">
          <div className="text-xs text-gray-400">xPts</div>
          <div className="font-bold text-green-600">+{t.xPtsGain}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400">Price</div>
          <div className={`font-medium text-xs ${t.costDiff > 0 ? 'text-red-500' : t.costDiff < 0 ? 'text-green-500' : 'text-gray-400'}`}>
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
      <p className="text-sm text-gray-400 py-4 text-center">
        No beneficial transfers found within your budget.
      </p>
    );
  }

  return (
    <div>
      <div className="divide-y divide-gray-50">
        {plan.transfers.map((t, i) => (
          <PlannedTransferRow key={i} t={t} index={i} isWildcard={isWildcard} />
        ))}
      </div>

      {/* Summary row */}
      <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-4 text-sm">
          <div>
            <span className="text-gray-400 text-xs block">xPts gain</span>
            <span className="font-bold text-green-600">+{plan.totalXPtsGain}</span>
          </div>
          {!isWildcard && (
            <div>
              <span className="text-gray-400 text-xs block">Points hit</span>
              <span className={`font-bold ${plan.pointsHit > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                {plan.pointsHit > 0 ? `-${plan.pointsHit}` : 'None'}
              </span>
            </div>
          )}
          <div>
            <span className="text-gray-400 text-xs block">Net gain</span>
            <span className={`font-bold ${plan.netGain > 0 ? 'text-green-600' : 'text-red-500'}`}>
              {plan.netGain > 0 ? `+${plan.netGain}` : plan.netGain}
            </span>
          </div>
        </div>
        {!isWildcard && plan.pointsHit > 0 && (
          <p className="text-xs text-gray-400">
            −{plan.pointsHit} pts hit ({plan.transfers.length - 1} extra transfer{plan.transfers.length - 1 > 1 ? 's' : ''})
          </p>
        )}
        {isWildcard && (
          <p className="text-xs text-gray-400 italic">Wildcard — no points hit</p>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: 'single', label: 'Best 1' },
  { id: '2', label: 'Plan 2' },
  { id: '3', label: 'Plan 3' },
  { id: 'wildcard', label: 'Wildcard' },
];

export default function TransferPlanner({ suggestions, plan2, plan3, wildcard }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('single');

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Tab bar */}
      <div className="flex border-b">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-green-700 border-b-2 border-green-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.id === 'wildcard' && (
              <span className="ml-1 text-[10px] bg-purple-100 text-purple-600 px-1 py-0.5 rounded font-semibold">
                CHIP
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="p-4">
        {activeTab === 'single' && (
          <>
            <p className="text-xs text-gray-400 mb-3">
              Best individual transfers — ranked by expected points gain over the next 3 gameweeks.
            </p>
            {suggestions.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">
                No beneficial transfers found within your budget.
              </p>
            ) : (
              <div className="space-y-3">
                {suggestions.map((s, i) => (
                  <SingleTransferCard key={i} s={s} />
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
              Based on form × fixture difficulty × avg minutes/GW over next 3 weeks. Assumes 1 free transfer.
            </p>
          </>
        )}

        {activeTab === '2' && (
          <>
            <p className="text-xs text-gray-400 mb-3">
              Best 2 transfers planned together. Each transfer accounts for the budget freed or spent by the previous one.
              Assumes 1 free transfer — 1 hit (−4 pts) if both are used.
            </p>
            <PlanSummary plan={plan2} isWildcard={false} />
          </>
        )}

        {activeTab === '3' && (
          <>
            <p className="text-xs text-gray-400 mb-3">
              Best 3 transfers planned together. Assumes 1 free transfer — 2 hits (−8 pts) if all 3 are used.
            </p>
            <PlanSummary plan={plan3} isWildcard={false} />
          </>
        )}

        {activeTab === 'wildcard' && (
          <>
            <p className="text-xs text-gray-400 mb-3">
              Wildcard mode — up to 8 greedy improvements with no points hit. Uses a sequential greedy approach
              (not guaranteed globally optimal, but a strong starting point for a wildcard).
            </p>
            <PlanSummary plan={wildcard} isWildcard={true} />
          </>
        )}
      </div>
    </div>
  );
}
