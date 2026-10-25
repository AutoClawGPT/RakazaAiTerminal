import { integrationsHealth, healthText } from "../src/lib/health";
integrationsHealth().then((h) => { console.log(healthText(h)); }).catch((e) => console.log("ERR", e.message));
