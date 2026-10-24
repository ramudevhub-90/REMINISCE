import { defineAuth } from "@aws-amplify/backend";

// Carers can sign in with email; judges and first-time visitors use guest
// (unauthenticated identity pool) access, so there's no sign-up wall.
export const auth = defineAuth({
  loginWith: { email: true },
});
