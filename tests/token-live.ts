import { fetchToken } from "../src/lib/launch/token-fetch";
(async () => {
  for (const m of ["AQBTDs9tw2Qf1Mk2NGC6xyrHPpXDLZyh2xigsynzpump", "8HGxoR3NBgs9tNyntcTwVuDM5K9gyaFTvQVwdrNdGQCt", "notanaddress"]) {
    const r = await fetchToken(m);
    console.log(m.slice(0, 8), r.ok ? { ...r.token, description: r.token.description.slice(0, 60) } : r);
  }
})();
