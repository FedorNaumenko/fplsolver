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
    <div className="rounded-xl shadow-lg p-6" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}>
      <h2 className="text-lg font-semibold mb-1 text-white">Load Your Team</h2>
      <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.6)' }}>
        Find your Manager ID in the FPL app under Points — it appears in the URL:{' '}
        <span className="font-mono text-xs px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.1)', color: '#04f5ff' }}>
          fantasy.premierleague.com/entry/<strong>1234567</strong>/event/...
        </span>
      </p>
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="number"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Manager ID (e.g. 1234567)"
          className="flex-1 rounded-lg px-4 py-2 focus:outline-none text-white placeholder-gray-400"
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = '#04f5ff')}
          onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')}
          disabled={loading}
          min="1"
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="px-6 py-2 rounded-lg font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'linear-gradient(135deg, #04f5ff, #00d2ff)', color: '#1a0025' }}
        >
          {loading ? 'Loading…' : 'Load Team'}
        </button>
      </form>
    </div>
  );
}
