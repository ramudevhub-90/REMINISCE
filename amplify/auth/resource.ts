import { defineAuth } from "@aws-amplify/backend";
import { preSignUp } from "./pre-sign-up/resource";
import { defineChallenge } from "./define-challenge/resource";
import { createChallenge } from "./create-challenge/resource";
import { verifyChallenge } from "./verify-challenge/resource";

// Passwordless with our own 6-digit email code (Cognito custom auth), the same
// for signing up and signing in. Guests can skip this and use the app with
// unauthenticated identity pool access.
export const auth = defineAuth({
  loginWith: { email: true },
  triggers: {
    preSignUp,
    defineAuthChallenge: defineChallenge,
    createAuthChallenge: createChallenge,
    verifyAuthChallengeResponse: verifyChallenge,
  },
});
