import { parentPort, workerData } from "node:worker_threads";
import { newKey, searchBatch } from "./grind.mjs";
import { compile } from "./pattern.mjs";

const match = compile(workerData.patterns);
let stop = false;
parentPort.on("message", (m) => { if (m === "stop") stop = true; });
(async () => {
  while (!stop) {
    const r = searchBatch(match, 4000, newKey);
    parentPort.postMessage({ type: "progress", tried: r.tried });
    for (const f of r.found) parentPort.postMessage({ type: "found", ...f });
    await new Promise((res) => setImmediate(res)); // lets the "stop" message in
  }
  parentPort.postMessage({ type: "done" });
  parentPort.close();
})();
