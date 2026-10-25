import { defineAuth } from "@aws-amplify/backend";

// Passwordless: carers enter their email and a 6-digit code, for both signing
// up and signing in. Judges and first-time visitors can skip this entirely and
// use guest (unauthenticated identity pool) access.
export const auth = defineAuth({
  loginWith: {
    email: { otpLogin: true },
  },
});
