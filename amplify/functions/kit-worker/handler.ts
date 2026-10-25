// Runs agent jobs from SQS: builds the kit, streams each step to the client
// over the onKitProgress subscription and stores the result on the job.
import type { SQSHandler } from "aws-lambda";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { env } from "$amplify/env/kit-worker";
import type { Schema } from "../../data/resource";
import { buildKit, type KitInput, type TraceStep } from "./agent/kit";
import { buildTimeline } from "./agent/timeline";
import { buildGroup, type Member } from "./agent/group";

type JobInput = KitInput & { kind?: "kit" | "timeline" | "group"; members?: Member[] };

// One queue, three agents: a person's session kit, their timeline, or a group session.
function runAgent(input: JobInput, onStep: (step: TraceStep) => Promise<void>) {
  if (input.kind === "timeline") return buildTimeline(input, onStep);
  if (input.kind === "group") return buildGroup({ members: input.members ?? [] }, onStep);
  return buildKit(input, onStep);
}
import { harnessCheck, probe } from "./qloo/index";

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>({ authMode: "iam" });
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });

type DirectEvent = { check: true } | { probe: string[] };

export const handler = async (event: Parameters<SQSHandler>[0] | DirectEvent) => {
  // Direct invocations (IAM only) to verify and tune the Qloo harness.
  if ("check" in event) return harnessCheck();
  if ("probe" in event) return probe(event.probe);

  for (const record of event.Records) {
    const { jobId, input } = JSON.parse(record.body) as { jobId: string; input: JobInput };
    await run(jobId, input);
  }
};

async function run(jobId: string, input: JobInput) {
  const steps: TraceStep[] = [];
  const publish = (status: string, message?: string, result?: unknown) =>
    client.mutations.publishProgress({ jobId, status, message, result: result === undefined ? undefined : JSON.stringify(result) });

  await save(jobId, { status: "running" });
  await publish("running", "Reading the taste graph…");
  try {
    const kit = await runAgent(input, async (step) => {
      steps.push(step);
      await publish("running", step.label);
    });
    await save(jobId, { status: "done", result: kit, steps });
    await publish("done", "Session kit ready", kit);
  } catch (err) {
    console.error("kit job failed", jobId, err);
    const message = err instanceof Error ? err.message : "Something went wrong.";
    await save(jobId, { status: "failed", error: message, steps });
    await publish("failed", message);
  }
}

async function save(jobId: string, fields: Record<string, unknown>) {
  const entries = Object.entries({ ...fields, updatedAt: new Date().toISOString() });
  await db.send(
    new UpdateCommand({
      TableName: process.env.KIT_JOB_TABLE,
      Key: { id: jobId },
      UpdateExpression: `SET ${entries.map((_, i) => `#k${i} = :v${i}`).join(", ")}`,
      ExpressionAttributeNames: Object.fromEntries(entries.map(([k], i) => [`#k${i}`, k])),
      ExpressionAttributeValues: Object.fromEntries(entries.map(([, v], i) => [`:v${i}`, v])),
    }),
  );
}
