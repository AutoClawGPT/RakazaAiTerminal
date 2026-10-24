export default function TalkLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-full focus:bg-[var(--rk-honey)] focus:px-4 focus:py-2 focus:text-[var(--rk-ink)]">
        Skip to chat
      </a>
      <main id="main" className="h-dvh overflow-hidden bg-background">
        {children}
      </main>
    </>
  );
}
