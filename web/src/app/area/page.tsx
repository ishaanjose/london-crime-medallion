"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { loadIndex } from "@/lib/data";
import { lookupPostcode, normalisePostcode, isValidPostcode, type PostcodeLookup } from "@/lib/postcode";
import PostcodeSearch from "@/components/area/PostcodeSearch";
import AreaSummary from "@/components/area/AreaSummary";
import AreaTrend from "@/components/area/AreaTrend";
import AreaCrimeMix from "@/components/area/AreaCrimeMix";
import DataStamp from "@/components/DataStamp";
import SectionBoundary from "@/components/SectionBoundary";

const mainStyle = {
  paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
  paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
};

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="text-xs font-semibold uppercase tracking-widest text-[var(--fg-muted)] mb-4"
    >
      {children}
    </h2>
  );
}

function Header() {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">Your area</h1>
      <p className="mt-1 text-sm text-[var(--fg-muted)]">
        Crime in the LSOA around a postcode, compared with London. An LSOA is a small
        statistical area of roughly 1,500 residents.
      </p>
    </header>
  );
}

function LookupSkeleton() {
  return (
    <div className="animate-pulse space-y-2" aria-hidden="true">
      <div className="h-7 w-64 max-w-full rounded bg-[var(--skeleton)]" />
      <div className="h-4 w-48 rounded bg-[var(--skeleton)]" />
    </div>
  );
}

// Result of the lookup for one URL value. Kept with the value it answers so a
// stale result is never shown for a new postcode.
type Lookup = { input: string; result: PostcodeLookup | { status: "error"; message: string } };

function AreaPageInner() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const input = (sp.get("postcode") ?? "").trim();
  const [lookup, setLookup] = useState<Lookup | null>(null);

  useEffect(() => {
    if (!input) return;
    let cancelled = false;
    loadIndex()
      .then((index) => lookupPostcode(index, input))
      .then((result) => {
        if (!cancelled) setLookup({ input, result });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLookup({
            input,
            result: { status: "error", message: err instanceof Error ? err.message : String(err) },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [input]);

  // pushState updates useSearchParams without a navigation request, so the
  // postcode stays in the browser.
  function search(value: string) {
    const key = normalisePostcode(value);
    const shown = isValidPostcode(key) ? key : value;
    const url = shown ? `${pathname}?postcode=${encodeURIComponent(shown)}` : pathname;
    window.history.pushState(null, "", url);
  }

  const current = input && lookup?.input === input ? lookup.result : null;
  const pending = input !== "" && current == null;
  const inputKey = normalisePostcode(input);
  const shownInput = isValidPostcode(inputKey) ? `${inputKey.slice(0, -3)} ${inputKey.slice(-3)}` : input;

  return (
    <>
      {/* key: reset the box when the URL changes (back/forward) */}
      <PostcodeSearch key={input} initial={shownInput} onSearch={search} busy={pending} />

      <div className="mt-8" aria-live="polite">
        {pending && <LookupSkeleton />}
        {current && current.status !== "found" && (
          <p
            className={
              current.status === "error"
                ? "text-xs whitespace-pre-wrap rounded border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-3 text-red-700 dark:text-red-300"
                : "max-w-prose text-sm text-[var(--fg)]"
            }
          >
            {current.message}
          </p>
        )}
      </div>

      {current?.status === "found" && (
        <div key={current.lsoa21Code}>
          <section aria-label="Area summary" className="mb-12">
            {/* key: the distance cards depend on the postcode, not just the LSOA */}
            <AreaSummary
              key={current.postcode}
              postcode={current.postcode}
              lsoa={current.lsoa21Code}
              latitude={current.latitude}
              longitude={current.longitude}
            />
          </section>

          <section className="mb-12" aria-labelledby="area-trend">
            <SectionHeading id="area-trend">Last 24 months</SectionHeading>
            <AreaTrend lsoa={current.lsoa21Code} />
          </section>

          <section className="mb-12" aria-labelledby="area-mix">
            <SectionHeading id="area-mix">Crime mix</SectionHeading>
            <AreaCrimeMix lsoa={current.lsoa21Code} />
          </section>
        </div>
      )}
    </>
  );
}

export default function AreaPage() {
  return (
    <main className="mx-auto max-w-5xl w-full px-4 py-10" style={mainStyle}>
      <Header />
      <SectionBoundary>
        <Suspense
          fallback={
            <div className="animate-pulse max-w-md space-y-2" aria-hidden="true">
              <div className="h-4 w-32 rounded bg-[var(--skeleton)]" />
              <div className="h-10 w-full rounded bg-[var(--skeleton)]" />
            </div>
          }
        >
          <AreaPageInner />
        </Suspense>
      </SectionBoundary>
      <DataStamp />
    </main>
  );
}
