"use client";
import { useEffect, useState } from "react";
import { fieldCls, labelCls, SlidePanel } from "./tool-frame";
import { newEntry, open, parseSealed, passphraseProblem, seal, type Sealed, type VaultDoc } from "@/lib/tools/vaultcrypto";

const KEY = "rk.vault";
const PENDING = "rk.pending";

export function KeyVaultTool() {
  const [sealed, setSealed] = useState<Sealed | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [doc, setDoc] = useState<VaultDoc | null>(null);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [unlocked, setUnlocked] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [addr, setAddr] = useState("");
  const [secret, setSecret] = useState("");
  const [pending, setPending] = useState<{ address: string; secret: string } | null>(null);
  const [confirmErase, setConfirmErase] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setSealed(parseSealed(raw));
      const p = sessionStorage.getItem(PENDING);
      if (p) setPending(JSON.parse(p));
    } catch {
      /* ignore damaged storage */
    }
    setHydrated(true);
  }, []);

  const persist = async (next: VaultDoc, pw: string) => {
    const s = await seal(next, pw);
    localStorage.setItem(KEY, JSON.stringify(s));
    setSealed(s);
    setDoc(next);
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(""); setMsg("");
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong."); }
    setBusy(false);
  };

  const create = () => run(async () => {
    const bad = passphraseProblem(pass);
    if (bad) throw new Error(bad);
    if (pass !== pass2) throw new Error("The two passphrases do not match.");
    await persist({ entries: [] }, pass);
    setUnlocked(pass); setPass(""); setPass2("");
    setMsg("Vault created. There is no recovery if you lose the passphrase, so keep a backup file too.");
  });
  const unlock = () => run(async () => {
    if (!sealed) return;
    const d = await open(sealed, pass);
    setDoc(d); setUnlocked(pass); setPass("");
  });
  const lock = () => { setDoc(null); setUnlocked(""); setShown(null); setMsg("Locked."); };
  const add = (l: string, a: string, s: string) => run(async () => {
    if (!doc) return;
    if (!a.trim() || !s.trim()) throw new Error("Address and secret key are both needed.");
    await persist({ entries: [...doc.entries, newEntry(l, a.trim(), s.trim())] }, unlocked);
    setLabel(""); setAddr(""); setSecret(""); setMsg("Saved and encrypted.");
  });
  const savePending = () => run(async () => {
    if (!doc || !pending) return;
    await persist({ entries: [...doc.entries, newEntry("Vanity " + pending.address.slice(0, 6), pending.address, pending.secret)] }, unlocked);
    sessionStorage.removeItem(PENDING); setPending(null); setMsg("Grinder key saved and encrypted.");
  });
  const remove = (id: string) => run(async () => {
    if (!doc) return;
    await persist({ entries: doc.entries.filter((e) => e.id !== id) }, unlocked);
  });
  const backup = () => {
    if (!sealed) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(sealed)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = "rakaza-vault-backup.json"; a.click();
    URL.revokeObjectURL(url);
  };
  const restore = (f: File | undefined) => run(async () => {
    if (!f) return;
    const s = parseSealed(await f.text());
    localStorage.setItem(KEY, JSON.stringify(s));
    setSealed(s); setDoc(null); setUnlocked("");
    setMsg("Backup loaded. Enter its passphrase to unlock.");
  });
  const erase = () => {
    localStorage.removeItem(KEY);
    setSealed(null); setDoc(null); setUnlocked(""); setConfirmErase(false); setMsg("Vault erased from this browser.");
  };

  if (!hydrated) return <div className="rk-card text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="grid gap-5">
      {msg ? <p role="status" className="rk-card text-sm" data-testid="kv-msg">{msg}</p> : null}
      {err ? <p role="alert" className="rk-card text-sm font-semibold text-red-700" data-testid="kv-err">{err}</p> : null}

      {!sealed ? (
        <SlidePanel title="Create your vault" hint="Pick a passphrase. It never leaves this browser." defaultOpen>
          <label className={labelCls} htmlFor="kv-p1">Passphrase (8+ characters)</label>
          <input id="kv-p1" type="password" className={fieldCls} value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" />
          <label className={`${labelCls} mt-3`} htmlFor="kv-p2">Repeat passphrase</label>
          <input id="kv-p2" type="password" className={fieldCls} value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" />
          <button type="button" className="rk-btn rk-btn-mint mt-4" onClick={create} disabled={busy}>Create vault</button>
        </SlidePanel>
      ) : !doc ? (
        <SlidePanel title="Unlock" hint="Encrypted vault found in this browser" defaultOpen>
          <label className={labelCls} htmlFor="kv-unlock">Passphrase</label>
          <input id="kv-unlock" type="password" className={fieldCls} value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && unlock()} autoComplete="current-password" />
          <button type="button" className="rk-btn rk-btn-mint mt-4" onClick={unlock} disabled={busy}>Unlock</button>
        </SlidePanel>
      ) : (
        <>
          {pending ? (
            <div className="rk-card" data-testid="kv-pending">
              <p className="text-sm font-semibold">A grinder key is waiting to be saved</p>
              <p className="mt-1 break-all font-mono text-xs">{pending.address}</p>
              <button type="button" className="rk-btn rk-btn-mint rk-btn-sm mt-3" onClick={savePending} disabled={busy}>Encrypt and save it</button>
            </div>
          ) : null}
          <SlidePanel title={`Keys (${doc.entries.length})`} hint="Secrets stay hidden until you reveal them" defaultOpen>
            {doc.entries.length === 0 ? <p className="text-sm text-muted-foreground">No keys yet. Add one below or send one from the Vanity lab.</p> : null}
            <ul className="grid gap-3">
              {doc.entries.map((e) => (
                <li key={e.id} className="rounded-xl border border-black/10 p-3" data-testid="kv-entry">
                  <p className="text-sm font-bold">{e.label}</p>
                  <p className="break-all font-mono text-xs">{e.address}</p>
                  {shown === e.id ? <pre className="mt-2 overflow-x-auto break-all whitespace-pre-wrap rounded-xl bg-[var(--rk-ink)] p-3 font-mono text-xs text-white" data-testid="kv-secret">{e.secret}</pre> : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className="rk-btn rk-btn-white rk-btn-sm" onClick={() => setShown(shown === e.id ? null : e.id)}>{shown === e.id ? "Hide secret" : "Reveal secret"}</button>
                    <button type="button" className="rk-btn rk-btn-white rk-btn-sm" onClick={() => remove(e.id)} disabled={busy}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </SlidePanel>
          <SlidePanel title="Add a key" hint="Paste an address and its secret key">
            <label className={labelCls} htmlFor="kv-l">Label</label>
            <input id="kv-l" className={fieldCls} value={label} onChange={(e) => setLabel(e.target.value)} />
            <label className={`${labelCls} mt-3`} htmlFor="kv-a">Address</label>
            <input id="kv-a" className={`${fieldCls} font-mono`} value={addr} onChange={(e) => setAddr(e.target.value)} spellCheck={false} autoComplete="off" />
            <label className={`${labelCls} mt-3`} htmlFor="kv-s">Secret key</label>
            <input id="kv-s" type="password" className={`${fieldCls} font-mono`} value={secret} onChange={(e) => setSecret(e.target.value)} spellCheck={false} autoComplete="off" />
            <button type="button" className="rk-btn rk-btn-mint mt-4" onClick={() => add(label, addr, secret)} disabled={busy}>Encrypt and save</button>
          </SlidePanel>
          <button type="button" className="rk-btn rk-btn-white" onClick={lock}>Lock vault</button>
        </>
      )}

      <SlidePanel title="Backup, restore, erase" hint="The backup file is encrypted with your passphrase">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rk-btn rk-btn-mint rk-btn-sm" onClick={backup} disabled={!sealed}>Download backup</button>
          <label className="rk-btn rk-btn-white rk-btn-sm cursor-pointer">
            Restore from file
            <input type="file" accept="application/json,.json" className="sr-only" data-testid="kv-restore" onChange={(e) => { restore(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {!confirmErase ? (
            <button type="button" className="rk-btn rk-btn-white rk-btn-sm" onClick={() => setConfirmErase(true)} disabled={!sealed}>Erase vault…</button>
          ) : (
            <button type="button" className="rk-btn rk-btn-sm bg-red-600 text-white" onClick={erase}>Yes, erase everything here</button>
          )}
        </div>
      </SlidePanel>
    </div>
  );
}
