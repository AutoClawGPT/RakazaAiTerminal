/** Browser-only "My studio" store: recent images and self launches, kept in this device's localStorage. No sign-in, nothing leaves the browser. */
export interface MyLaunch { mint: string; name: string; symbol: string; creator: string; network: "devnet" | "mainnet-beta"; sigs: { create?: string; split?: string; buy?: string }; at: number }
export interface MyImage { thumb: string; prompt: string; at: number }
const K_L = "rakaza.me.launches", K_I = "rakaza.me.images";

function read<T>(k: string): T[] {
  if (typeof window === "undefined") return [];
  try { const v = JSON.parse(window.localStorage.getItem(k) ?? "[]"); return Array.isArray(v) ? (v as T[]) : []; } catch { return []; }
}
function write(k: string, v: unknown[]) { try { window.localStorage.setItem(k, JSON.stringify(v)); window.dispatchEvent(new Event("rakaza-me")); } catch { /* storage full or blocked */ } }

export const loadLaunches = () => read<MyLaunch>(K_L);
export const loadImages = () => read<MyImage>(K_I);
export function saveLaunch(l: MyLaunch) { write(K_L, [l, ...loadLaunches().filter((x) => x.mint !== l.mint)].slice(0, 30)); }
export function saveImage(i: MyImage) { write(K_I, [i, ...loadImages()].slice(0, 12)); }
export function clearMine() { try { window.localStorage.removeItem(K_L); window.localStorage.removeItem(K_I); window.dispatchEvent(new Event("rakaza-me")); } catch { /* ignore */ } }

/** Scale any image data URL / object URL down to a small JPEG (for the upload and for tiny thumbnails). */
export function shrinkImage(src: string, max: number, quality = 0.9): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * r)); c.height = Math.max(1, Math.round(img.height * r));
      const g = c.getContext("2d");
      if (!g) return reject(new Error("canvas unavailable"));
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("That file is not an image the browser can read."));
    img.src = src;
  });
}
