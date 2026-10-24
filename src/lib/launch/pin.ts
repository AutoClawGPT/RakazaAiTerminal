import "server-only";

/** Pins token images and metadata to IPFS through Pinata (API key + secret, set in env by the owner). */
const API = "https://api.pinata.cloud";
const GATEWAY = "https://ipfs.io/ipfs";

export class PinError extends Error {}

function headers(): Record<string, string> {
  const k = process.env.PINATA_API_KEY, s = process.env.PINATA_API_SECRET;
  if (!k || !s) throw new PinError("Pinata is not set up. The owner needs PINATA_API_KEY and PINATA_API_SECRET from https://app.pinata.cloud/developers/api-keys");
  return { pinata_api_key: k, pinata_secret_api_key: s };
}

async function ok(r: Response): Promise<unknown> {
  if (r.status === 401 || r.status === 403) throw new PinError("Pinata rejected the key. Create a new API key at https://app.pinata.cloud/developers/api-keys");
  if (!r.ok) throw new PinError(`Pinata error ${r.status}`);
  return r.json();
}

export async function pinataStatus(): Promise<{ ok: boolean; note: string }> {
  try {
    const r = await fetch(`${API}/data/testAuthentication`, { headers: headers(), signal: AbortSignal.timeout(15000) });
    if (r.ok) return { ok: true, note: "Pinata accepted the key." };
    return { ok: false, note: `Pinata answered ${r.status}.` };
  } catch (e) {
    return { ok: false, note: e instanceof Error ? e.message : "Pinata check failed." };
  }
}

export async function pinImage(bytes: Uint8Array, filename: string, contentType: string): Promise<{ cid: string; url: string }> {
  if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024) throw new PinError("Image must be between 1 byte and 8 MB.");
  const form = new FormData();
  form.append("file", new Blob([bytes as BlobPart], { type: contentType }), filename);
  form.append("pinataMetadata", JSON.stringify({ name: `rakaza-${filename}` }));
  const j = (await ok(await fetch(`${API}/pinning/pinFileToIPFS`, { method: "POST", headers: headers(), body: form, signal: AbortSignal.timeout(60000) }))) as { IpfsHash: string };
  return { cid: j.IpfsHash, url: `${GATEWAY}/${j.IpfsHash}` };
}

export interface TokenMeta { name: string; symbol: string; description: string; image: string; website?: string; twitter?: string; telegram?: string }

export function metadataDoc(m: TokenMeta) {
  const clean = (v?: string) => (v && /^https:\/\//.test(v) ? v : undefined);
  return { name: m.name, symbol: m.symbol, description: m.description.slice(0, 1000), image: m.image, showName: true, createdOn: "https://rakaza.app", website: clean(m.website), twitter: clean(m.twitter), telegram: clean(m.telegram) };
}

export async function pinMetadata(m: TokenMeta): Promise<{ cid: string; uri: string }> {
  const j = (await ok(await fetch(`${API}/pinning/pinJSONToIPFS`, { method: "POST", headers: { ...headers(), "content-type": "application/json" }, body: JSON.stringify({ pinataContent: metadataDoc(m), pinataMetadata: { name: `rakaza-meta-${m.symbol}` } }), signal: AbortSignal.timeout(30000) }))) as { IpfsHash: string };
  return { cid: j.IpfsHash, uri: `${GATEWAY}/${j.IpfsHash}` };
}

export async function unpin(cid: string): Promise<void> {
  await fetch(`${API}/pinning/unpin/${encodeURIComponent(cid)}`, { method: "DELETE", headers: headers(), signal: AbortSignal.timeout(15000) });
}
