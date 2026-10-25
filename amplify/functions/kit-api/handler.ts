// AppSync resolver for the custom operations:
// - startKit: validates the request, records a queued job and hands it to the
//   worker via SQS. Agent runs take longer than AppSync's resolver timeout, so
//   the work happens asynchronously and progress streams back over a subscription.
// - getKitJob: returns a job only to the identity that started it.
// - publishProgress: echoes the worker's progress event to subscribers.
// - onKitProgress: allows the subscription; AppSync filters events by jobId.
import type { AppSyncResolverEvent } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const sqs = new SQSClient({});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Identity = { cognitoIdentityId?: string | null } | null;
// Amplify's function handler passes fieldName at the top level of the event.
type Event = AppSyncResolverEvent<Record<string, any>> & { fieldName?: string };

export const handler = async (event: Event) => {
  const caller = (event.identity as Identity)?.cognitoIdentityId ?? null;
  const field = event.fieldName ?? event.info?.fieldName;
  switch (field) {
    case "startKit":
      return startKit(event.arguments, caller);
    case "getKitJob":
      return getKitJob(event.arguments.id, caller);
    case "publishProgress":
      // End users always carry a Cognito identity; the worker's IAM role doesn't.
      if (caller) throw new Error("Unauthorized");
      return event.arguments;
    case "onKitProgress":
      return null;
    default:
      throw new Error(`Unknown field ${field}`);
  }
};

async function startKit(args: Record<string, any>, requester: string | null) {
  const { jobId, region, era, loves, learned, avoidIds, portrait, kind, members } = args as {
    jobId: string;
    region?: string;
    era?: string;
    loves: string[];
    learned?: unknown;
    avoidIds?: string[] | null;
    portrait?: unknown;
    kind?: string | null;
    members?: unknown;
  };
  if (!requester) throw new Error("Unauthorized");
  if (!UUID.test(jobId)) throw new Error("jobId must be a UUID.");

  // Only aggregate taste seeds are accepted. Names stay on the carer's device.
  const input: Record<string, unknown> & { loves: string[] } = { ...cleanPerson({ region, era, loves }) };
  const jobKind = kind === "timeline" || kind === "group" ? kind : "kit";
  if (jobKind === "group") {
    const residents = parseJson(members);
    const list = (Array.isArray(residents) ? residents : []).map(cleanPerson).filter((m) => m.loves.length).slice(0, 8);
    if (list.length < 2) throw new Error("Add at least two residents, each with something they love.");
    Object.assign(input, { kind: "group", members: list });
  } else {
    if (!input.loves.length) throw new Error("Add at least one thing they love.");
    Object.assign(input, {
      kind: jobKind,
      learned: parseLearned(learned),
      avoid: (avoidIds ?? []).filter((id) => UUID.test(id)).slice(0, 40),
      portrait: parseTags(portrait),
    });
  }

  const now = new Date().toISOString();
  await db.send(
    new PutCommand({
      TableName: process.env.KIT_JOB_TABLE,
      Item: { id: jobId, __typename: "KitJob", requester, status: "queued", input, createdAt: now, updatedAt: now },
      ConditionExpression: "attribute_not_exists(id)",
    }),
  );
  await sqs.send(new SendMessageCommand({ QueueUrl: process.env.KIT_QUEUE_URL, MessageBody: JSON.stringify({ jobId, input }) }));
  return { id: jobId, status: "queued" };
}

async function getKitJob(id: string, caller: string | null) {
  const { Item: job } = await db.send(new GetCommand({ TableName: process.env.KIT_JOB_TABLE, Key: { id } }));
  if (!job) return null;
  if (!caller || job.requester !== caller) throw new Error("Unauthorized");
  const json = (v: unknown) => (v === undefined ? null : JSON.stringify(v));
  return { id: job.id, status: job.status, steps: json(job.steps), result: json(job.result), error: job.error ?? null };
}

function cleanPerson(p: { region?: unknown; era?: unknown; loves?: unknown }) {
  return {
    region: String(p?.region ?? "").trim().slice(0, 80),
    era: String(p?.era ?? "").trim().slice(0, 20),
    loves: (Array.isArray(p?.loves) ? p.loves : [])
      .map((s) => String(s ?? "").trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 5),
  };
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// Portrait tags are Qloo tag URNs with names, at most 4.
function parseTags(value: unknown) {
  const list = parseJson(value);
  if (!Array.isArray(list)) return [];
  return list
    .filter((t) => t && /^urn:tag:[a-z_:0-9.-]+$/i.test(String(t.id)) && typeof t.name === "string")
    .slice(0, 4)
    .map((t) => ({ id: String(t.id), name: String(t.name).slice(0, 60) }));
}

// Learned items are Qloo entity ids with names, at most 8; anything else is dropped.
function parseLearned(value: unknown) {
  const list = parseJson(value);
  if (!Array.isArray(list)) return [];
  return list
    .filter((x) => x && UUID.test(String(x.id)) && typeof x.name === "string")
    .slice(0, 8)
    .map((x) => ({ id: String(x.id), name: String(x.name).slice(0, 80), type: String(x.type ?? "").slice(0, 40) }));
}
