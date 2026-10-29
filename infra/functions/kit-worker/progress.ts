// Progress events to the browser. The worker calls AppSync's publishProgress
// (IAM-signed with its own role, the only one allowed to), and AppSync pushes
// the event to onKitProgress subscribers for that job.
import { Sha256 } from "@aws-crypto/sha256-js";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { HttpRequest } from "@smithy/protocol-http";
import { SignatureV4 } from "@smithy/signature-v4";

const PUBLISH = `mutation Publish($jobId: ID!, $status: String!, $message: String, $result: AWSJSON) {
  publishProgress(jobId: $jobId, status: $status, message: $message, result: $result) { jobId status message result }
}`;

const endpoint = new URL(process.env.API_URL ?? "https://invalid.localhost/graphql");
const signer = new SignatureV4({ credentials: defaultProvider(), region: process.env.AWS_REGION ?? "us-east-1", service: "appsync", sha256: Sha256 });

export async function publishProgress(variables: { jobId: string; status: string; message?: string; result?: string }) {
  const body = JSON.stringify({ query: PUBLISH, variables });
  const req = await signer.sign(
    new HttpRequest({
      method: "POST",
      protocol: endpoint.protocol,
      hostname: endpoint.hostname,
      path: endpoint.pathname,
      headers: { host: endpoint.hostname, "content-type": "application/json" },
      body,
    }),
  );
  const res = await fetch(endpoint, { method: "POST", headers: req.headers, body });
  const out = (await res.json()) as { errors?: { message: string }[] };
  if (!res.ok || out.errors?.length) throw new Error(`publishProgress failed: ${out.errors?.[0]?.message ?? res.status}`);
}
