import { defineFunction } from "@aws-amplify/backend";

export const kitWorker = defineFunction({
  name: "kit-worker",
  entry: "./handler.ts",
  runtime: 22,
  timeoutSeconds: 300,
  memoryMB: 1024,
  resourceGroupName: "data",
  environment: {
    QLOO_MODE: "sample",
    // The harness writes config under $HOME; only /tmp is writable in Lambda.
    HOME: "/tmp",
  },
});
