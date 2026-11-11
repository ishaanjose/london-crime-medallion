"use client";

import { useId, useState, type FormEvent } from "react";

type Props = {
  // The postcode currently in the URL, shown in the box on load.
  initial: string;
  onSearch: (value: string) => void;
  busy?: boolean;
};

export default function PostcodeSearch({ initial, onSearch, busy = false }: Props) {
  const [value, setValue] = useState(initial);
  const inputId = useId();
  const hintId = useId();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSearch(value.trim());
  }

  return (
    <form role="search" onSubmit={submit} className="max-w-md">
      <label htmlFor={inputId} className="block text-sm font-medium text-[var(--fg)]">
        London postcode
      </label>
      <p id={hintId} className="mt-0.5 text-xs text-[var(--fg-muted)]">
        Looked up in your browser. The postcode isn’t sent anywhere.
      </p>
      <div className="mt-2 flex gap-2">
        <input
          id={inputId}
          aria-describedby={hintId}
          type="text"
          inputMode="text"
          autoComplete="postal-code"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="e.g. SW1A 1AA"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-base sm:text-sm text-[var(--fg)] placeholder:text-[var(--fg-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chart-1)]"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-md border border-[var(--chart-1)] bg-[var(--chart-1)] px-4 py-2 text-sm font-medium text-[var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--chart-1)] focus-visible:ring-offset-[var(--bg)]"
        >
          Look up
        </button>
      </div>
    </form>
  );
}
