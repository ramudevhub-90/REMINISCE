// Custom auth, step 3: does the answer match the emailed code?
import type { VerifyAuthChallengeResponseTriggerHandler } from "aws-lambda";

export const handler: VerifyAuthChallengeResponseTriggerHandler = async (event) => {
  const answer = String(event.request.challengeAnswer ?? "").replace(/\D/g, "");
  event.response.answerCorrect = answer.length === 6 && answer === event.request.privateChallengeParameters.answer;
  return event;
};
