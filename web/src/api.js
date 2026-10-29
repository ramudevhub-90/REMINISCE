// AppSync client. Visitors get a guest (unauthenticated) identity, so the app
// works without signing up. Jobs run asynchronously: we subscribe to progress
// for a job id we generate, then start the job.
import { gql, subscribe } from "./backend.js";

const JOB_FIELDS = "id status steps result error";
const START_KIT = `mutation StartKit($jobId: ID!, $region: String, $era: String, $loves: [String!]!, $learned: AWSJSON, $avoidIds: [String], $portrait: AWSJSON, $kind: String, $members: AWSJSON) {
  startKit(jobId: $jobId, region: $region, era: $era, loves: $loves, learned: $learned, avoidIds: $avoidIds, portrait: $portrait, kind: $kind, members: $members) { ${JOB_FIELDS} }
}`;
const GET_KIT_JOB = `query GetKitJob($id: ID!) { getKitJob(id: $id) { ${JOB_FIELDS} } }`;
const ON_KIT_PROGRESS = `subscription OnKitProgress($jobId: ID!) { onKitProgress(jobId: $jobId) { jobId status message result } }`;

const TIMEOUT_MS = 240_000;

// A person's session kit.
export const buildKit = ({ region, era, loves, learned = [], shown = [], portrait = [] }, onProgress) =>
  startJob(
    {
      kind: "kit",
      region,
      era,
      loves,
      learned: JSON.stringify(learned.map(({ id, name, type }) => ({ id, name, type }))),
      avoidIds: shown,
      portrait: JSON.stringify(portrait.map(({ id, name }) => ({ id, name }))),
    },
    onProgress,
  );

// The films and sound of the years they grew up in.
export const buildTimeline = ({ region, era, loves, learned = [] }, onProgress) =>
  startJob(
    { kind: "timeline", region, era, loves, learned: JSON.stringify(learned.map(({ id, name, type }) => ({ id, name, type }))) },
    onProgress,
  );

// A group session: residents' names stay here; only their tastes are sent.
export const buildGroup = (residents, onProgress) =>
  startJob(
    { kind: "group", loves: [], members: JSON.stringify(residents.map(({ region, era, loves }) => ({ region, era, loves }))) },
    onProgress,
  );

function startJob(args, onProgress) {
  const jobId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(checker);
      sub.unsubscribe();
      fn(value);
    };

    // Also read the stored job every few seconds: a cached job can finish
    // before the subscription is connected, and its "done" event would be missed.
    const poll = async () => {
      const data = (await gql(GET_KIT_JOB, { id: jobId })).getKitJob;
      if (data?.status === "done") finish(resolve, parse(data.result));
      else if (data?.status === "failed") finish(reject, new Error(data.error || "Couldn't finish this."));
      else return false;
      return true;
    };
    const checker = setInterval(() => poll().catch(() => {}), 2500);
    const timer = setTimeout(async () => {
      if (!(await poll().catch(() => false))) finish(reject, new Error("This is taking too long. Please try again."));
    }, TIMEOUT_MS);

    const sub = subscribe(ON_KIT_PROGRESS, { jobId }, {
      next: ({ data }) => {
        const event = data.onKitProgress;
        if (event.status === "done") finish(resolve, parse(event.result));
        else if (event.status === "failed") finish(reject, new Error(event.message || "Couldn't finish this."));
        else if (event.message) onProgress(event.message);
      },
      error: () => poll().catch(() => {}),
    });

    gql(START_KIT, { jobId, ...args }).catch((err) => finish(reject, err));
  });
}

// Results arrive as JSON text: once over the subscription, twice when read
// back through getKitJob. Decode until it's an object.
function parse(v) {
  let value = v;
  for (let i = 0; i < 3 && typeof value === "string"; i++) value = JSON.parse(value);
  return value;
}
