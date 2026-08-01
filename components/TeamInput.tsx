'use client';

import { useState } from 'react';

interface Props {
  onLoad: (managerId: string) => void;
  loading: boolean;
}

export default function TeamInput({ onLoad, loading }: Props) {
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) onLoad(value.trim());
  };

  return (
    // No panel border here — the input sits on the page ground so the three
    // stacked sections don't read as one repeated box.
    <div className="pt-2 pb-6">
      <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--ink)' }}>Load Your Team</h2>
      <p className="text-sm mb-4 max-w-prose" style={{ color: 'var(--ink-muted)' }}>
        Find your Manager ID in the FPL app under Points — it appears in the URL:{' '}
        <span
          className="num text-xs px-1 py-0.5 rounded"
          style={{ background: 'var(--fill-2)', color: 'var(--color-accent)' }}
        >
          fantasy.premierleague.com/entry/<strong>1234567</strong>/event/…
        </span>
      </p>
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="number"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Manager ID (e.g. 1234567)"
          className="num flex-1 min-w-0 rounded-lg px-4 py-2"
          style={{
            background: 'var(--fill-2)',
            border: '1px solid var(--rule-strong)',
            color: 'var(--ink)',
            transition: 'border-color var(--dur-short) var(--ease-out)',
          }}
          disabled={loading}
          min="1"
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="px-5 py-2 rounded-lg font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: 'var(--color-accent)',
            color: 'var(--color-ground)',
            transition: 'opacity var(--dur-short) var(--ease-out)',
          }}
        >
          {loading ? 'Loading…' : 'Load team'}
        </button>
      </form>
    </div>
  );
}
