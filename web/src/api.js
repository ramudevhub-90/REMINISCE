// AppSync client. Visitors get a guest (unauthenticated) identity, so the app
// works without signing up. Kits are built asynchronously: we subscribe to
// progress for a job id we generate, then start the job.
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import outputs from "./amplify_outputs.json";

Amplify.configure(outputs);
const client = generateClient({ authMode: "identityPool" });

const TIMEOUT_MS = 120_000;

export function buildKit({ region, era, loves }, onProgress) {
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
      else if (data?.status === "failed") finish(reject, new Error(data.error || "Couldn't build a kit."));
      else return false;
      return true;
    };
    const timer = setTimeout(async () => {
      if (!(await poll().catch(() => false))) finish(reject, new Error("This is taking too long. Please try again."));
    }, TIMEOUT_MS);

    const sub = client.subscriptions.onKitProgress({ jobId }).subscribe({
      next: (event) => {
        if (event.status === "done") finish(resolve, parse(event.result));
        else if (event.status === "failed") finish(reject, new Error(event.message || "Couldn't build a kit."));
        else if (event.message) onProgress(event.message);
      },
      error: () => poll().catch(() => {}),
    });

    client.mutations
      .startKit({ jobId, region, era, loves })
      .then(({ errors }) => errors?.length && finish(reject, new Error(errors[0].message)))
      .catch((err) => finish(reject, err));
  });
}

const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);
