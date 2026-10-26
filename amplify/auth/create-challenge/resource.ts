import { defineFunction } from "@aws-amplify/backend";

// Email settings are set at deploy time (see backend.ts): the From address and,
// optionally, a send-only role in another account whose SES has production access.
export const createChallenge = defineFunction({
  name: "create-challenge",
  entry: "./handler.ts",
  resourceGroupName: "auth",
  timeoutSeconds: 15,
});
