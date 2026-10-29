// Custom auth, step 2: email a 6-digit code. A retry after a wrong answer reuses
// the same code instead of sending another email. Sends through SES, either in
// this account or by assuming a send-only role in an account with production SES
// (SES_ROLE_ARN), so codes reach any inbox even while this account is in the sandbox.
// The judges' demo account (DEMO_EMAIL) always takes DEMO_CODE and gets no email.
import type { CreateAuthChallengeTriggerHandler } from "aws-lambda";
import { randomInt } from "node:crypto";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";

const { SES_ROLE_ARN, SES_REGION = "us-east-1", FROM_ADDRESS = "", DEMO_EMAIL, DEMO_CODE } = process.env;
let ses: SESv2Client | undefined;

async function client() {
  if (ses) return ses;
  if (!SES_ROLE_ARN) return (ses = new SESv2Client({ region: SES_REGION }));
  const { Credentials: c } = await new STSClient({}).send(
    new AssumeRoleCommand({ RoleArn: SES_ROLE_ARN, RoleSessionName: "reminisce-sign-in", DurationSeconds: 900 }),
  );
  // Credentials last 15 minutes; a fresh client is made on the next cold start.
  return (ses = new SESv2Client({
    region: SES_REGION,
    credentials: { accessKeyId: c!.AccessKeyId!, secretAccessKey: c!.SecretAccessKey!, sessionToken: c!.SessionToken! },
  }));
}

const html = (code: string) => `<!doctype html><html><body style="margin:0;background:#f6f0e6;font-family:Georgia,serif;color:#2a221c">
<div style="max-width:480px;margin:0 auto;padding:40px 24px">
<p style="font:600 12px/1 Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#a9823a;margin:0 0 16px">Reminisce</p>
<h1 style="font-weight:500;font-size:26px;margin:0 0 12px">Your sign-in code</h1>
<p style="font:16px/1.5 Arial,sans-serif;color:#54483e;margin:0 0 24px">Enter this code to continue:</p>
<p style="font:600 34px/1 'Courier New',monospace;letter-spacing:.3em;background:#fffaf2;border:1px solid #e2d5c1;border-radius:12px;padding:18px 0;text-align:center;margin:0 0 24px">${code}</p>
<p style="font:14px/1.5 Arial,sans-serif;color:#7d7064;margin:0">It works for 3 minutes. If you didn’t ask for it, you can ignore this email.</p>
</div></body></html>`;

async function sendCode(to: string, code: string) {
  await (await client()).send(
    new SendEmailCommand({
      FromEmailAddress: `Reminisce <${FROM_ADDRESS}>`,
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: `${code} is your Reminisce code` },
          Body: { Html: { Data: html(code) }, Text: { Data: `Your Reminisce code is ${code}. It works for 3 minutes.` } },
        },
      },
    }),
  );
}

export const handler: CreateAuthChallengeTriggerHandler = async (event) => {
  const previous = [...event.request.session].reverse().find((s) => s.challengeName === "CUSTOM_CHALLENGE");
  let code = previous?.challengeMetadata?.startsWith("CODE-") ? previous.challengeMetadata.slice(5) : null;
  const email = event.request.userAttributes.email;
  if (DEMO_EMAIL && DEMO_CODE && email.toLowerCase() === DEMO_EMAIL) {
    code = DEMO_CODE;
  } else if (!code) {
    code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await sendCode(email, code);
  }
  event.response.publicChallengeParameters = { email: email.replace(/^(.)[^@]*(@.*)$/, "$1•••$2") };
  event.response.privateChallengeParameters = { answer: code };
  event.response.challengeMetadata = `CODE-${code}`;
  return event;
};
