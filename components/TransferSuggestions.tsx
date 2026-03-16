import type { TransferSuggestion } from '@/lib/types';
import { formatPrice, getPositionName } from '@/lib/utils';

interface Props {
  suggestions: TransferSuggestion[];
}

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

export default function TransferSuggestions({ suggestions }: Props) {
  if (suggestions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-2">Transfer Suggestions</h2>
        <p className="text-gray-500 text-sm">No beneficial transfers found for your current squad.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Transfer Suggestions</h2>
      <div className="space-y-3">
        {suggestions.map((s, i) => (
          <div key={i} className="border border-gray-100 rounded-lg p-4 hover:border-green-200 transition-colors">
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
                  <div
                    className={`font-medium ${
                      s.cost > 0 ? 'text-red-500' : s.cost < 0 ? 'text-green-500' : 'text-gray-500'
                    }`}
                  >
                    {s.cost > 0
                      ? `+${formatPrice(s.cost)}`
                      : s.cost < 0
                      ? `-${formatPrice(Math.abs(s.cost))}`
                      : 'Free'}
                  </div>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">{s.reasoning}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
        Suggestions based on player form × fixture difficulty over the next 3 gameweeks.
      </p>
    </div>
  );
}
