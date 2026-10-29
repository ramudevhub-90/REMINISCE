// For local development (npm run dev): writes web/public/config.json from the
// deployed reminisce stack's outputs. Deployed sites get theirs from CDK.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const KEYS = ["region", "apiUrl", "userPoolId", "userPoolClientId", "identityPoolId"];
const outputs = JSON.parse(
  execFileSync("aws", ["cloudformation", "describe-stacks", "--region", "us-east-1", "--stack-name", "reminisce", "--query", "Stacks[0].Outputs", "--output", "json"], {
    encoding: "utf8",
  }),
);
const byKey = Object.fromEntries(outputs.map((o) => [o.OutputKey, o.OutputValue]));
const config = Object.fromEntries(KEYS.map((k) => [k, byKey[k[0].toUpperCase() + k.slice(1)]]));
mkdirSync("web/public", { recursive: true });
writeFileSync("web/public/config.json", JSON.stringify(config, null, 2) + "\n");
console.log("Wrote web/public/config.json");
