import { fetchToken } from "../src/lib/launch/token-fetch";
import { optimizeToken, parseDraft } from "../src/lib/launch/optimize";
(async () => {
  const r = await fetchToken("AQBTDs9tw2Qf1Mk2NGC6xyrHPpXDLZyh2xigsynzpump");
  if (!r.ok) throw new Error(r.error);
  console.log("parse bad:", parseDraft("nope", r.token), "parse same-name:", parseDraft('{"name":"BIBICOIN","ticker":"BB","description":"x","imagePrompt":"y"}', r.token));
  const t0 = Date.now();
  const d = await optimizeToken(r.token);
  console.log(Date.now() - t0, "ms", d);
})();
