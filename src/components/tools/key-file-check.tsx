"use client";
import { Keypair } from "@solana/web3.js";
import { useState } from "react";
import { fieldCls, labelCls } from "./tool-frame";

/** Reads a 64-byte keypair JSON in the browser (never sent anywhere) and shows its address. */
export function KeyFileCheck() {
  const [text, setText] = useState("");
  let out: { addr?: string; err?: string } = {};
  if (text.trim()) {
    try {
      const arr = JSON.parse(text);
      if (!Array.isArray(arr) || arr.length !== 64 || arr.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) throw new Error("Expected a JSON array of 64 numbers.");
      out = { addr: Keypair.fromSecretKey(Uint8Array.from(arr)).publicKey.toBase58() };
    } catch (e) {
      out = { err: e instanceof Error && e.message.startsWith("Expected") ? e.message : "That is not a valid key file." };
    }
  }
  return (
    <div className="rk-card-flat grid gap-2 rounded-xl border-2 border-[var(--rk-line)] p-3">
      <label className={labelCls} htmlFor="kf">Check a key file (stays in your browser)</label>
      <textarea id="kf" data-testid="key-file" rows={3} className={`${fieldCls} py-2 font-mono text-xs`} value={text} onChange={(e) => setText(e.target.value)} placeholder="[12,34,...64 numbers]" autoComplete="off" spellCheck={false} />
      {out.addr ? <p className="text-sm" data-testid="key-addr">Address: <b className="break-all font-mono">{out.addr}</b></p> : null}
      {out.err ? <p role="alert" className="text-sm text-red-600">{out.err}</p> : null}
    </div>
  );
}
