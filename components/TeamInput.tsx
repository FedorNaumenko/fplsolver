'use client';

import { useState } from 'react';

interface Props {
  onLoad: (managerId: string) => void;
  loading: boolean;
  /** Set once a squad is on screen — the form collapses so the squad leads the page. */
  loadedId?: string | null;
}

export default function TeamInput({ onLoad, loading, loadedId }: Props) {
  const [value, setValue] = useState('');
  const [reopened, setReopened] = useState(false);
  const collapsed = Boolean(loadedId) && !reopened;

  /**
   * Reads the field from the DOM as well as from state.
   *
   * After a reload the browser can refill the input from session history without firing
   * an input event, so React state stayed empty while a number was plainly visible — and
   * the submit button, disabled on empty state, refused to do anything until you retyped
   * it. autoComplete="off" asks the browser not to do that; this makes the form work even
   * when it does anyway, rather than trusting the request.
   */
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const field = e.currentTarget.elements.namedItem('managerId') as HTMLInputElement | null;
    const id = (value.trim() || field?.value.trim() || '').replace(/[^0-9]/g, '');
    if (id) onLoad(id);
  };

  // Once a squad is on screen the loader is admin, not the point of the page — it
  // collapses to a single line so the squad leads.
  if (collapsed) {
    return (
      <div className="pt-2 pb-3 flex items-center gap-3" style={{ fontSize: 'var(--text-sm)' }}>
        <span className="num" style={{ color: 'var(--ink-muted)' }}>
          Manager <strong style={{ color: 'var(--ink)' }}>{loadedId}</strong>
        </span>
        <button
          onClick={() => setReopened(true)}
          className="px-2.5 py-1 rounded"
          style={{
            background: 'var(--fill-2)',
            color: 'var(--ink-muted)',
            border: '1px solid var(--rule)',
            fontSize: 'var(--text-xs)',
          }}
        >
          Load a different team
        </button>
      </div>
    );
  }

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
          // text + numeric keypad rather than type=number: a number input draws grey
          // spinner arrows, and autoComplete off stops the browser refilling the field on
          // reload while React state is still empty (which left the button disabled).
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          name="managerId"
          value={value}
          onChange={e => setValue(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="Manager ID (e.g. 1234567)"
          className="num flex-1 min-w-0 rounded-lg px-4 py-2"
          style={{
            background: 'var(--fill-2)',
            border: '1px solid var(--rule-strong)',
            color: 'var(--ink)',
            transition: 'border-color var(--dur-short) var(--ease-out)',
          }}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading}
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
