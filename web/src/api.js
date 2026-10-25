// AppSync client. Visitors get a guest (unauthenticated) identity, so the app
// works without signing up. Jobs run asynchronously: we subscribe to progress
// for a job id we generate, then start the job.
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import outputs from "./amplify_outputs.json";

Amplify.configure(outputs);
const client = generateClient({ authMode: "identityPool" });

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
      sub.unsubscribe();
      fn(value);
    };

    // If the subscription drops, fall back to reading the stored job.
    const poll = async () => {
      const { data } = await client.queries.getKitJob({ id: jobId });
      if (data?.status === "done") finish(resolve, parse(data.result));
      else if (data?.status === "failed") finish(reject, new Error(data.error || "Couldn't finish this."));
      else return false;
      return true;
    };
    const timer = setTimeout(async () => {
      if (!(await poll().catch(() => false))) finish(reject, new Error("This is taking too long. Please try again."));
    }, TIMEOUT_MS);

    const sub = client.subscriptions.onKitProgress({ jobId }).subscribe({
      next: (event) => {
        if (event.status === "done") finish(resolve, parse(event.result));
        else if (event.status === "failed") finish(reject, new Error(event.message || "Couldn't finish this."));
        else if (event.message) onProgress(event.message);
      },
      error: () => poll().catch(() => {}),
    });

    client.mutations
      .startKit({ jobId, ...args })
      .then(({ errors }) => errors?.length && finish(reject, new Error(errors[0].message)))
      .catch((err) => finish(reject, err));
  });
}

const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);
