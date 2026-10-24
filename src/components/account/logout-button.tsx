"use client";
export function LogoutButton() {
  return <button type="button" className="rk-btn rk-btn-white" data-testid="logout" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/login"); }}>Sign out</button>;
}
