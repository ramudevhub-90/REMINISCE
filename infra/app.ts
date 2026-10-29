// CDK app: one stack, "reminisce", in us-east-1. Deploy with `npm run deploy`.
import { existsSync } from "node:fs";
import { App, Tags } from "aws-cdk-lib";
import { ReminisceStack } from "./stack.ts";

if (!existsSync(new URL("../web/dist/index.html", import.meta.url))) {
  throw new Error("Build the web app first: npm run build (npm run deploy does both).");
}

const app = new App();
const ctx = (key: string) => app.node.tryGetContext(key) || undefined;
const domainName = ctx("domainName");
const stack = new ReminisceStack(app, "reminisce", {
  stackName: "reminisce",
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-1" },
  description: "Reminisce: reminiscence session kits for dementia carers (Qloo)",
  domain: domainName ? { name: domainName, hostedZoneId: ctx("hostedZoneId") } : undefined,
  fromAddress: ctx("fromAddress"),
  sesRoleArn: ctx("sesRoleArn"),
  demoLogin: ctx("demoLogin"),
});
Tags.of(stack).add("project", "reminisce");
