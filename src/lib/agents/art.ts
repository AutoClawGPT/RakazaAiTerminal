import { createHash } from "node:crypto";

/**
 * Unique default profile art, drawn from the handle alone. Every handle gets its own colors and shapes,
 * so no two profiles look the same and nothing is fetched from anywhere. Output is a plain SVG string
 * built only from numbers and fixed colors (no user text is placed in it).
 */
function seedOf(handle: string): Uint8Array {
  return createHash("sha256").update("rakaza-art:" + handle.toLowerCase()).digest();
}
const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(h)} ${s}% ${l}%)`;

function palette(b: Uint8Array) {
  const h = (b[0] / 255) * 360;
  return { a: hsl(h, 80, 62), b: hsl((h + 40 + b[1] / 6) % 360, 78, 58), c: hsl((h + 180 + b[2] / 8) % 360, 70, 70), d: hsl((h + 300) % 360, 60, 22) };
}

export function avatarSvg(handle: string): string {
  const b = seedOf(handle), p = palette(b);
  const shapes: string[] = [];
  for (let i = 0; i < 5; i++) {
    const cx = 12 + (b[4 + i * 3] % 76), cy = 12 + (b[5 + i * 3] % 76), r = 10 + (b[6 + i * 3] % 28);
    shapes.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${i % 2 ? p.c : p.b}" opacity="0.${55 + (i * 7) % 35}"/>`);
  }
  const eye = 6 + (b[20] % 4), gap = 12 + (b[21] % 6), mouth = 8 + (b[22] % 10);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="256" height="256" role="img" aria-label="Agent avatar"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.a}"/><stop offset="1" stop-color="${p.d}"/></linearGradient><clipPath id="c"><rect width="100" height="100" rx="22"/></clipPath></defs><g clip-path="url(#c)"><rect width="100" height="100" fill="url(#g)"/>${shapes.join("")}<rect x="0" y="62" width="100" height="40" fill="${p.d}" opacity="0.28"/></g><circle cx="${50 - gap}" cy="46" r="${eye}" fill="#fff"/><circle cx="${50 + gap}" cy="46" r="${eye}" fill="#fff"/><circle cx="${50 - gap}" cy="46" r="${eye / 2.2}" fill="#1b1230"/><circle cx="${50 + gap}" cy="46" r="${eye / 2.2}" fill="#1b1230"/><path d="M ${50 - mouth} 66 Q 50 ${72 + (b[23] % 8)} ${50 + mouth} 66" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;
}

export function bannerSvg(handle: string): string {
  const b = seedOf(handle), p = palette(b);
  const waves: string[] = [];
  for (let i = 0; i < 4; i++) {
    const y = 60 + i * 38 + (b[8 + i] % 20), amp = 18 + (b[12 + i] % 36), off = b[16 + i] % 80;
    waves.push(`<path d="M0 ${y} C ${200 + off} ${y - amp}, ${480 - off} ${y + amp}, 720 ${y} S 1100 ${y - amp}, 1200 ${y + 6} L1200 300 L0 300 Z" fill="${[p.b, p.c, p.a, p.d][i]}" opacity="0.${30 + i * 12}"/>`);
  }
  const dots: string[] = [];
  for (let i = 0; i < 18; i++) dots.push(`<circle cx="${(b[(i * 2) % 32] / 255) * 1200}" cy="${(b[(i * 2 + 1) % 32] / 255) * 120}" r="${1 + (b[(i + 7) % 32] % 4)}" fill="#fff" opacity="0.${3 + (i % 6)}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 300" width="1200" height="300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Agent banner"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.a}"/><stop offset="0.55" stop-color="${p.b}"/><stop offset="1" stop-color="${p.d}"/></linearGradient></defs><rect width="1200" height="300" fill="url(#g)"/>${waves.join("")}${dots.join("")}</svg>`;
}
