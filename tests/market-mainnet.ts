import { dexMarket, geckoCandles } from "../src/lib/market/mainnet";
(async () => {
  const m = await dexMarket("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263");
  console.log(JSON.stringify(m));
  if (m) { const c = await geckoCandles(m.pair, "1h", 5); console.log(JSON.stringify(c)); console.log(JSON.stringify(await geckoCandles(m.pair, "15s", 5))); }
})();
