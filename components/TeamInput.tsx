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
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-1">Load Your Team</h2>
      <p className="text-sm text-gray-500 mb-4">
        Find your Manager ID in the FPL app under Points — it appears in the URL:{' '}
        <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">
          fantasy.premierleague.com/entry/<strong>1234567</strong>/event/...
        </span>
      </p>
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="number"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Manager ID (e.g. 1234567)"
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
          disabled={loading}
          min="1"
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
        >
          {loading ? 'Loading...' : 'Load Team'}
        </button>
      </form>
    </div>
  );
}
