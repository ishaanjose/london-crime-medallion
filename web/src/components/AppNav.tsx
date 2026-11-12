"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";
import {
  THEME_STORAGE_KEY,
  applyThemePreference,
  readThemePreference,
  type ThemePreference,
} from "@/lib/themePreference";

const links = [
  { href: "/", label: "Overview" },
  { href: "/map", label: "Map" },
  { href: "/place", label: "Place" },
  { href: "/area", label: "Area" },
  { href: "/concentration", label: "Concentration" },
  { href: "/trust", label: "Data trust" },
];

export default function AppNav() {
  const pathname = usePathname();

  return (
    <nav
      className="border-b border-[var(--border)] bg-[var(--bg)]"
      aria-label="Site navigation"
    >
      <div
        className="mx-auto max-w-5xl px-4 flex gap-3 h-10 items-center"
        style={{
          paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
          paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
        }}
      >
        {/* Links scroll on their own so the theme toggle stays in view on phones */}
        <div className="flex flex-1 min-w-0 gap-4 sm:gap-6 h-full items-center overflow-x-auto whitespace-nowrap">
          {/* Hidden on phones so the links fit at 375px */}
          <span className="hidden sm:inline text-sm font-semibold text-[var(--fg)] mr-2">
            London Crime
          </span>
          {links.map(({ href, label }) => {
            const current = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={current ? "page" : undefined}
                className={`text-sm transition-colors ${
                  current
                    ? "text-[var(--fg)] font-medium"
                    : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
        <ThemeToggle />
      </div>
    </nav>
  );
}

// ---- Theme toggle -------------------------------------------------------------

// Fired on this tab's own changes; "storage" only fires for other tabs
const CHANGE_EVENT = "themepreferencechange";

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_STORAGE_KEY && e.key !== null) return;
    // Another tab changed the choice: apply it here too
    applyThemePreference(readThemePreference());
    onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

// The server can't see localStorage, so it renders "system"; React then
// re-renders with the stored value after hydration without a mismatch.
const getServerSnapshot = (): ThemePreference => "system";

const OPTIONS: { value: ThemePreference; label: string; icon: ReactNode }[] = [
  {
    value: "system",
    label: "System",
    icon: (
      <>
        <rect x="2" y="3" width="12" height="8.5" rx="1.25" />
        <path d="M5.5 14h5M8 11.5V14" />
      </>
    ),
  },
  {
    value: "light",
    label: "Light",
    icon: (
      <>
        <circle cx="8" cy="8" r="2.75" />
        <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06" />
      </>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z" />,
  },
];

function ThemeToggle() {
  const pref = useSyncExternalStore(subscribe, readThemePreference, getServerSnapshot);

  const choose = (next: ThemePreference) => {
    applyThemePreference(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return (
    <fieldset className="shrink-0 flex items-center rounded-md border border-[var(--border)] p-0.5">
      <legend className="sr-only">Colour theme</legend>
      {OPTIONS.map(({ value, label, icon }) => {
        const checked = pref === value;
        return (
          <label
            key={value}
            title={label}
            className={`relative flex h-6 w-7 cursor-pointer items-center justify-center rounded transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--chart-1)] ${
              checked
                ? "bg-[var(--border)] text-[var(--fg)]"
                : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
            }`}
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={checked}
              onChange={() => choose(value)}
              className="sr-only"
            />
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {icon}
            </svg>
            <span className="sr-only">{label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
