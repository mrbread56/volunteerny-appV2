import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

/**
 * A select you can type into.
 *
 * A plain `<select>` is fine for four grades. It is not fine for thirty-odd
 * organization types: a coordinator has to open it, scroll a native dropdown
 * that shows about eight rows on a phone, and read every one to find out
 * whether their kind of organization is in there at all.
 *
 * So this filters as you type, and stays a real listbox for anyone who does not
 * type — arrow keys, Home/End, Enter, Escape, and a click all work, which a
 * hand-rolled div-with-onClick usually breaks. The ARIA wiring is the
 * combobox/listbox pattern: `aria-expanded` and `aria-controls` on the input,
 * `aria-activedescendant` pointing at the highlighted option so a screen reader
 * announces the move without focus ever leaving the text field.
 *
 * Filtering is accent- and case-insensitive, because "Metis" should find
 * "Métis" — a coordinator typing quickly on a phone will not reach for the
 * accent, and a list that hides a real answer over a diacritic is worse than no
 * search at all.
 */
export interface SearchableSelectOption {
  value: string;
  label: string;
}

/** "Métis" → "metis", so typing either one finds the other. */
const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function SearchableSelect({
  label,
  options,
  value,
  onChange,
  placeholder = 'Search or select…',
  required,
  id,
  emptyMessage = 'No matches. Choose "Other" to type your own.',
}: {
  label: string;
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  id?: string;
  emptyMessage?: string;
}) {
  const reactId = useId();
  const inputId = id || `searchable-${reactId}`;
  const listId = `${inputId}-list`;

  const [open, setOpen] = useState(false);
  const [queryText, setQueryText] = useState('');
  const [active, setActive] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value) || null;

  const filtered = useMemo(() => {
    const q = fold(queryText.trim());
    if (!q) return options;
    // Matches beginning a word rank above matches buried mid-label, so typing
    // "com" offers "Community group" before "Business improvement area or
    // chamber of commerce".
    const scored = options
      .map((o) => {
        const f = fold(o.label);
        const at = f.indexOf(q);
        if (at === -1) return null;
        const startsWord = at === 0 || /\s|\(/.test(f[at - 1]);
        return { o, rank: (startsWord ? 0 : 1) * 1000 + at };
      })
      .filter(Boolean) as { o: SearchableSelectOption; rank: number }[];
    return scored.sort((a, b) => a.rank - b.rank).map((s) => s.o);
  }, [options, queryText]);

  // Close when focus or a click leaves the component entirely. `pointerdown`
  // rather than `click`, so the list is gone before a click elsewhere lands.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // Keep the highlighted row in view when arrowing past the visible window.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const commit = (opt: SearchableSelectOption) => {
    onChange(opt.value);
    setQueryText('');
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      setActive(0);
      e.preventDefault();
      return;
    }
    if (!open) return;

    if (e.key === 'ArrowDown') {
      setActive((i) => Math.min(i + 1, filtered.length - 1));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setActive((i) => Math.max(i - 1, 0));
      e.preventDefault();
    } else if (e.key === 'Home') {
      setActive(0);
      e.preventDefault();
    } else if (e.key === 'End') {
      setActive(Math.max(0, filtered.length - 1));
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (filtered[active]) commit(filtered[active]);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQueryText('');
      e.preventDefault();
    }
  };

  return (
    <div className="space-y-1.5" ref={wrapRef}>
      <label htmlFor={inputId} className="text-sm font-medium text-ink-soft block">
        {label}
        {required && <span className="text-red-600" aria-hidden="true"> *</span>}
      </label>

      <div className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          // The input shows the SELECTION when closed and the QUERY while
          // searching, so the field always reads as the current answer rather
          // than going blank the moment it is touched.
          value={open ? queryText : selected?.label || ''}
          placeholder={selected ? selected.label : placeholder}
          onChange={(e) => {
            setQueryText(e.target.value);
            setActive(0);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full h-12 rounded-lg border border-line-control bg-white px-4 pr-10 text-sm font-medium text-ink outline-none focus:ring-2 focus:ring-blue-dark/30 focus:border-blue-dark transition-all"
        />
        {/* Decorative: the input already announces itself as a combobox. */}
        <span aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted text-xs">
          ▾
        </span>

        {/* A real form control behind the combobox, so `required` is enforced by
            the browser and the value submits with the form even though the
            visible control is a text input. */}
        <select
          aria-hidden="true"
          tabIndex={-1}
          required={required}
          value={value}
          onChange={() => {}}
          className="sr-only"
        >
          <option value="">{''}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {open && (
          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            aria-label={label}
            className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-lg"
          >
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-ink-muted">{emptyMessage}</li>
            ) : (
              filtered.map((o, i) => (
                <li
                  key={o.value}
                  id={`${listId}-${i}`}
                  data-idx={i}
                  role="option"
                  aria-selected={o.value === value}
                  // pointerdown, not click: click fires after blur, which would
                  // close the list before the selection registered.
                  onPointerDown={(e) => { e.preventDefault(); commit(o); }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    'cursor-pointer px-4 py-2.5 text-sm',
                    i === active ? 'bg-blue-dark text-white' : 'text-ink',
                    o.value === value && i !== active && 'font-semibold',
                  )}
                >
                  {o.label}
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
