import Link from "next/link";

export function RakazaMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect x="4" y="4" width="56" height="56" rx="18" fill="#6b3bff" stroke="#170a36" strokeWidth="4" />
      <path d="M22 47V17h14c7 0 11 3.6 11 9.2 0 4.2-2.4 7.2-6.4 8.4L48 47h-7.6l-6-11H29v11z M29 30h6.4c2.6 0 4-1.2 4-3.4S38 23 35.4 23H29z" fill="#ffc933" stroke="#170a36" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="50" cy="14" r="5" fill="#ff4da6" stroke="#170a36" strokeWidth="2" />
    </svg>
  );
}

export function LogoPill({ href = "/", suffix }: { href?: string; suffix?: string }) {
  return (
    <Link href={href} className="rk-pill gap-2 font-display text-sm font-black tracking-wide" style={{ minHeight: "2.5rem" }} aria-label="Rakaza home">
      <RakazaMark className="size-5" />
      <span className="hidden min-[440px]:inline" style={{ fontVariationSettings: '"wdth" 125' }}>RAKAZA</span>
      {suffix ? <span className="rk-kicker !gap-0 opacity-70 before:hidden">{suffix}</span> : null}
    </Link>
  );
}
