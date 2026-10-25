import { defineFunction } from "@aws-amplify/backend";

export const kitWorker = defineFunction({
  name: "kit-worker",
  entry: "./handler.ts",
  runtime: 22,
  timeoutSeconds: 300,
  memoryMB: 2048,
  resourceGroupName: "data",
  environment: {
    QLOO_MODE: "live",
    // Event keys only work against the hackathon server. The harness sends the
    // key to a non-production URL only when it's also marked as trusted.
    QLOO_BASE_URL: "https://hackathon.api.qloo.com",
    QLOO_TRUSTED_BASE_URL: "https://hackathon.api.qloo.com",
    // The harness writes config under $HOME; only /tmp is writable in Lambda.
    HOME: "/tmp",
  },
});
