type KpiCardProps =
  | { loading: true }
  | {
      loading?: false;
      label: string;
      value: string;
      sublabel?: string;
      change?: number; // fraction, e.g. 0.042 → +4.2%
    };

function Skeleton({ className }: { className: string }) {
  return (
    <div
      className={`rounded animate-pulse bg-[var(--skeleton)] ${className}`}
      aria-hidden="true"
    />
  );
}

export default function KpiCard(props: KpiCardProps) {
  if (props.loading) {
    return (
      <div
        className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4 flex flex-col h-full gap-2"
        aria-hidden="true"
      >
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-3 w-28" />
      </div>
    );
  }

  const { label, value, sublabel, change } = props;
  const changeText =
    change !== undefined
      ? `${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)}% vs last year`
      : null;

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4 flex flex-col h-full">
      <p className="text-xs text-[var(--fg-muted)] mb-1 leading-none">{label}</p>
      <p className="text-2xl font-semibold tabular-nums mt-auto">{value}</p>
      {changeText && (
        <p className="text-xs text-[var(--fg-muted)] mt-1 tabular-nums">{changeText}</p>
      )}
      {sublabel && (
        <p className="text-xs text-[var(--fg-muted)] mt-1">{sublabel}</p>
      )}
    </div>
  );
}
