/** Bonding curve progress bar. 100% means the token has graduated and trades on a DEX. */
export function GradBar({ pct, complete, big = false }: { pct: number; complete: boolean; big?: boolean }) {
  const v = complete ? 100 : Math.max(0, Math.min(100, pct));
  const soon = !complete && v >= 60;
  return (
    <div>
      <div className={`flex items-center justify-between gap-2 ${big ? "text-sm" : "text-[0.7rem]"} font-bold uppercase tracking-wide`}>
        <span>{complete ? "Graduated" : soon ? "Graduating soon" : "Bonding curve"}</span>
        <span className="tabular-nums" data-testid="grad-pct">{v.toFixed(v >= 99.95 || v === 0 ? 0 : 1)}%</span>
      </div>
      <div
        role="progressbar"
        aria-label="Bonding curve progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v)}
        className={`mt-1 overflow-hidden rounded-full border-2 border-[var(--rk-line)] bg-black/25 ${big ? "h-5" : "h-3"}`}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(v, v > 0 ? 3 : 0)}%`,
            background: complete ? "var(--rk-mint)" : soon ? "linear-gradient(90deg, var(--rk-honey), var(--rk-pink))" : "linear-gradient(90deg, var(--rk-violet), var(--rk-pink))",
          }}
        />
      </div>
    </div>
  );
}
