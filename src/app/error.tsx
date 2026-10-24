"use client";

export default function GlobalRouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="rk-hero grid min-h-dvh place-items-center px-6 text-center">
      <div className="rk-rays" aria-hidden="true" />
      <div>
        <p className="rk-kicker justify-center text-white/85">Something broke</p>
        <h1 className="rk-display mt-4 text-[clamp(2.5rem,12vw,6rem)]">Oops</h1>
        <p className="rk-serif mt-4 text-2xl text-white">Please try again.</p>
        <button type="button" onClick={reset} className="rk-btn rk-btn-honey mt-8">
          Try again
        </button>
      </div>
    </main>
  );
}
