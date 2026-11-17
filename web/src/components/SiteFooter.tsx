// Attribution wordings are copied verbatim from the "Data sources and
// attribution" table in the repo README. Keep the two in step.
const ATTRIBUTIONS = [
  "Contains public sector information licensed under the Open Government Licence v3.0.",
  "Contains public sector information licensed under the Open Government Licence v2.0.",
  "Source: Office for National Statistics licensed under the Open Government Licence v.3.0",
  "Contains OS data © Crown copyright and database right 2026",
  "Contains Royal Mail data © Royal Mail copyright and database right 2026",
  "Powered by TfL Open Data",
  "Contains OS data © Crown copyright and database rights 2016",
  "Geomni UK Map data © and database rights [2019]",
];

const SOURCES_URL =
  "https://github.com/ishaanjose/london-crime-medallion#data-sources-and-attribution";

export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-[var(--border)]">
      <p
        className="mx-auto max-w-5xl px-4 py-3 text-xs leading-5 text-[var(--fg-muted)] [overflow-wrap:anywhere]"
        style={{
          paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
          paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
          paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))",
        }}
      >
        {/* Some README wordings have no full stop, so a dot separates them */}
        {ATTRIBUTIONS.map((text) => (
          <span key={text}>
            {text}
            <span aria-hidden="true"> · </span>
          </span>
        ))}
        <a
          href={SOURCES_URL}
          className="text-[var(--fg)] underline underline-offset-2 hover:no-underline"
        >
          Data sources and licences
        </a>
      </p>
    </footer>
  );
}
