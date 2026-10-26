import { defineFunction } from "@aws-amplify/backend";

export const verifyChallenge = defineFunction({ name: "verify-challenge", entry: "./handler.ts", resourceGroupName: "auth" });
