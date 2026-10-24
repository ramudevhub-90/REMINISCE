import { defineFunction } from "@aws-amplify/backend";

export const kitApi = defineFunction({
  name: "kit-api",
  entry: "./handler.ts",
  runtime: 22,
  timeoutSeconds: 10,
  resourceGroupName: "data",
});
