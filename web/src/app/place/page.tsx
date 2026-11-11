import BinnedRateChart from "@/components/place/BinnedRateChart";
import DataStamp from "@/components/DataStamp";
import type { Factor } from "@/lib/place";

type Section = {
  factor: Factor;
  title: string;
  intro: string;
  note?: string;
};

const SECTIONS: Section[] = [
  {
    factor: "income",
    title: "Income",
    intro:
      "Income deprivation is the headline measure here: the share of residents on low incomes, ranked into national deciles.",
  },
  {
    factor: "employment",
    title: "Employment",
    intro:
      "The share of working-age residents involuntarily out of work, ranked into national deciles.",
  },
  {
    factor: "station",
    title: "Station distance",
    intro:
      "Straight-line distance from each LSOA's population-weighted centre to its nearest TfL or National Rail station.",
    note:
      "Being near a station partly just means being in central London, where residents are outnumbered by commuters, shoppers and visitors. Rates per resident are inflated there.",
  },
  {
    factor: "parkdist",
    title: "Park distance",
    intro:
      "Straight-line distance from each LSOA’s population-weighted centre to its nearest public park, garden or playing field entrance.",
    note:
      "A park nearby also tracks urban density, so this is an association, not an effect of the park itself.",
  },
  {
    factor: "park",
    title: "Park area",
    intro:
      "Hectares of public park, garden and playing field within 1 km of each LSOA's population-weighted centre.",
    note:
      "The amount of park within 1 km shows no clear relationship. Closeness matters here, not size.",
  },
  {
    factor: "imd",
    title: "Overall deprivation (IMD)",
    intro: "The Index of Multiple Deprivation 2025 combines seven domains into one ranking.",
    note:
      "One of those domains is crime, so part of this relationship is crime compared with itself. Use the income and employment sections above for a cleaner comparison.",
  },
];

const CAVEATS = [
  "Correlation is not causation. These charts show where crime rates are higher, not why.",
  "The IMD includes a crime domain, so income and employment are the cleaner comparison.",
  "Station proximity partly means “central London”, and per-resident rates are inflated where visitors outnumber residents.",
  "Distance to the nearest park shows a weak relationship; the amount of park nearby shows none.",
];

export default function PlacePage() {
  return (
    <main
      className="mx-auto max-w-5xl px-4 py-10"
      style={{
        paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
        paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
      }}
    >
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">
          Crime and place
        </h1>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          How LSOA crime rates vary with deprivation, transport and green space
        </p>
      </header>

      <aside
        aria-label="Caveats"
        className="mb-10 rounded-md border border-[var(--border)] bg-[var(--surface)] p-4"
      >
        <h2 className="text-sm font-medium text-[var(--fg)]">Read these first</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--fg-muted)]">
          {CAVEATS.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </aside>

      {SECTIONS.map(({ factor, title, intro, note }) => (
        <section key={factor} className="mb-12" aria-labelledby={`place-${factor}`}>
          <h2
            id={`place-${factor}`}
            className="text-xs font-semibold uppercase tracking-widest text-[var(--fg-muted)] mb-2"
          >
            {title}
          </h2>
          <p className="mb-4 max-w-prose text-sm text-[var(--fg)]">{intro}</p>
          {note && (
            <p className="mb-4 max-w-prose text-sm text-[var(--fg-muted)]">{note}</p>
          )}
          <BinnedRateChart factor={factor} />
        </section>
      ))}

      <DataStamp />
    </main>
  );
}
