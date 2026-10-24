import Link from "next/link";

export default function NotFound() {
  return (
    <main className="rk-hero grid min-h-dvh place-items-center px-6 text-center">
      <div className="rk-rays" aria-hidden="true" />
      <div className="rk-dots" aria-hidden="true" />
      <div>
        <p className="rk-kicker justify-center text-white/85">Error 404</p>
        <h1 className="rk-display mt-4 text-[clamp(3rem,14vw,8rem)]">Lost</h1>
        <p className="rk-serif mt-4 text-3xl text-white">That page doesn’t exist.</p>
        <Link href="/" className="rk-btn rk-btn-honey mt-8">
          Back home
        </Link>
      </div>
    </main>
  );
}
