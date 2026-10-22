export function ListLoader({
  label = "Loading…",
  variant = "block"
}: {
  label?: string;
  variant?: "block" | "cards" | "table";
}) {
  if (variant === "cards") {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label={label}>
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="animate-pulse rounded-3xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 rounded-2xl bg-slate-100" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-2/3 rounded bg-slate-100" />
                <div className="h-3 w-1/2 rounded bg-slate-100" />
              </div>
            </div>
            <div className="mt-4 h-3 w-3/4 rounded bg-slate-100" />
            <div className="mt-2 h-3 w-1/3 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className="overflow-hidden rounded-3xl border border-slate-200" aria-busy="true" aria-label={label}>
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </div>
        <div className="space-y-2 p-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-11 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-sm text-slate-600"
      role="status"
      aria-live="polite"
    >
      <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-blue-800" />
      {label}
    </div>
  );
}
