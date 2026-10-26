import { defineFunction } from "@aws-amplify/backend";

export const defineChallenge = defineFunction({ name: "define-challenge", entry: "./handler.ts", resourceGroupName: "auth" });
