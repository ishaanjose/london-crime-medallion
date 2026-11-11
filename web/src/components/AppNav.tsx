"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Overview" },
  { href: "/map", label: "Map" },
  { href: "/place", label: "Place" },
  { href: "/area", label: "Area" },
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
        className="mx-auto max-w-5xl px-4 flex gap-4 sm:gap-6 h-10 items-center overflow-x-auto whitespace-nowrap"
        style={{
          paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
          paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
        }}
      >
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
    </nav>
  );
}
