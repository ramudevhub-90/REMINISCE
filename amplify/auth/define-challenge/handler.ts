// Custom auth, step 1: one email-code challenge, up to three tries.
import type { DefineAuthChallengeTriggerHandler } from "aws-lambda";

const MAX_TRIES = 3;

export const handler: DefineAuthChallengeTriggerHandler = async (event) => {
  const tries = event.request.session.filter((s) => s.challengeName === "CUSTOM_CHALLENGE");
  const last = tries.at(-1);
  if (last?.challengeResult) {
    event.response.issueTokens = true;
    event.response.failAuthentication = false;
  } else if (tries.length >= MAX_TRIES) {
    event.response.issueTokens = false;
    event.response.failAuthentication = true;
  } else {
    event.response.issueTokens = false;
    event.response.failAuthentication = false;
    event.response.challengeName = "CUSTOM_CHALLENGE";
  }
  return event;
};
