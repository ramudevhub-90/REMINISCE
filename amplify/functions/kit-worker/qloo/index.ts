// The only place the app talks to Qloo. Every other module calls these
// functions and never sees whether the data came from samples or the live API.
//
// QLOO_MODE=sample (default) returns built-in sample data.
// QLOO_MODE=live runs the @qloo/qloo-harness CLI (`qloo api ...`, shipped in a
// Lambda layer) with the key read from SSM at runtime. The key never leaves
// the server and is never logged.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { INSIGHTS, SEED_ENTITIES, TAGS } from "./sample-data";
import type { QlooEntity, QlooResult, QlooTag } from "./types";

export type { QlooEntity, QlooResult, QlooTag };

const MODE: "sample" | "live" = process.env.QLOO_MODE === "live" ? "live" : "sample";
export const QLOO_BIN = process.env.QLOO_BIN ?? "/opt/nodejs/node_modules/@qloo/qloo-harness/dist/bin.js";
const MAX_TAKE = 10;
const CACHE_TTL_S = 7 * 24 * 60 * 60;

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const memory = new Map<string, QlooResult>();
let apiKey: Promise<string> | undefined;

export class QlooError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const mode = () => MODE;

/** Resolve a free-text seed ("Kishore Kumar") to a Qloo entity. */
export async function search({ query, type, take = 3 }: { query: string; type?: string; take?: number }) {
  const args = ["search", "--query", query, "--take", String(clamp(take))];
  if (type) args.push("--type", type);
  return cached(args, () => sampleSearch(query, type, take));
}

/**
 * Taste-graph expansion: entities of `type` with high affinity for the signals.
 * ageGroup and location narrow results to the audience the person belongs to;
 * releaseYears keeps films to the years they'd remember.
 */
export async function insights(opts: {
  type: string;
  signalEntities?: string[];
  signalTags?: string[];
  location?: string;
  filterLocation?: string;
  ageGroup?: string;
  releaseYears?: { min?: number; max?: number };
  take?: number;
}) {
  try {
    return await runInsights(opts);
  } catch (err) {
    // Small towns may not be in Qloo's location index; that's a 400. Retry
    // without the location rather than failing the whole kit.
    const hasLocation = Boolean(opts.location || opts.filterLocation);
    if (!hasLocation || !(err instanceof QlooError) || !/400/.test(err.message)) throw err;
    const res = await runInsights({ ...opts, location: undefined, filterLocation: undefined });
    return { ...res, locationDropped: true };
  }
}

async function runInsights(opts: Parameters<typeof insights>[0]) {
  const { type, signalEntities = [], signalTags = [], location, filterLocation, ageGroup, releaseYears, take = 6 } = opts;
  const args = ["insights", "--type", type, "--take", String(clamp(take))];
  if (signalEntities.length) args.push("--signal-entities", signalEntities.join(","));
  if (signalTags.length) args.push("--signal-tags", signalTags.join(","));
  if (location) args.push("--signal-location", location);
  if (filterLocation) args.push("--filter-location", filterLocation);
  const params: Record<string, string | number> = {};
  if (ageGroup) params["signal.demographics.age"] = ageGroup;
  if (releaseYears?.min) params["filter.release_year.min"] = releaseYears.min;
  if (releaseYears?.max) params["filter.release_year.max"] = releaseYears.max;
  if (Object.keys(params).length) args.push("--params", JSON.stringify(params));
  return cached(args, () => sampleInsights(type, signalEntities, take));
}

/** Find tag URNs for a concept such as "fish curry". */
export async function findTags({ query, take = 5 }: { query: string; take?: number }) {
  const args = ["tags", "--query", query, "--take", String(clamp(take))];
  return cached(args, () => ({
    entities: [],
    tags: TAGS.filter((t) => matches(t.name, query) || matches(query, t.name)).slice(0, take),
  }));
}

/** Runs the harness without a key to prove it starts inside Lambda. */
export async function harnessCheck() {
  const out = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    execFile(process.execPath, [QLOO_BIN, "--version"], { timeout: 20_000 }, (err, stdout, stderr) =>
      resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, stdout, stderr }),
    );
  });
  return { node: process.version, binExists: existsSync(QLOO_BIN), ...out };
}

/**
 * Runs one read-only harness command with the real key and returns its raw
 * output. Only reachable by invoking the Lambda directly (IAM), for tuning.
 */
export async function probe(args: string[]) {
  if (!["search", "insights", "tags", "types", "entity"].includes(args[0])) throw new Error("Unsupported probe");
  apiKey = undefined; // re-read, in case the key was just rotated
  const key = await loadKey();
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [QLOO_BIN, "api", ...args, "--json", "--quiet"],
      { timeout: 25_000, env: { ...process.env, QLOO_API_KEY: key }, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        let summary: unknown;
        try {
          const body = JSON.parse(stdout);
          summary = body.error ? body : normalize(body);
        } catch {
          summary = stdout.slice(0, 4_000);
        }
        resolve({ hasKey: Boolean(key), code: err ? ((err as { code?: number }).code ?? 1) : 0, summary, stderr: stderr.slice(0, 1_000) });
      },
    );
  });
}

async function cached(args: string[], sample: () => Pick<QlooResult, "entities" | "tags">): Promise<QlooResult> {
  const key = `${MODE}:${args.join("\u0000")}`;
  const hit = memory.get(key) ?? (await readCache(key));
  if (hit) return { ...hit, cached: true };
  const data = MODE === "live" ? await runCli(args) : sample();
  const result: QlooResult = { ...data, source: MODE, request: describe(args) };
  memory.set(key, result);
  await writeCache(key, result);
  return result;
}

async function readCache(key: string): Promise<QlooResult | undefined> {
  if (!process.env.QLOO_CACHE_TABLE) return undefined;
  const res = await db.send(new GetCommand({ TableName: process.env.QLOO_CACHE_TABLE, Key: { key } }));
  const item = res.Item;
  if (!item || item.expiresAt < Date.now() / 1000) return undefined;
  memory.set(key, item.value);
  return item.value as QlooResult;
}

async function writeCache(key: string, value: QlooResult) {
  if (!process.env.QLOO_CACHE_TABLE) return;
  const expiresAt = Math.floor(Date.now() / 1000) + CACHE_TTL_S;
  await db.send(new PutCommand({ TableName: process.env.QLOO_CACHE_TABLE, Item: { key, value, expiresAt } }));
}

function loadKey() {
  apiKey ??= new SSMClient({})
    .send(new GetParameterCommand({ Name: process.env.QLOO_KEY_PARAM, WithDecryption: true }))
    .then((r) => r.Parameter?.Value ?? "")
    .catch(() => "");
  return apiKey;
}

async function runCli(args: string[]): Promise<Pick<QlooResult, "entities" | "tags">> {
  const key = await loadKey();
  if (!key) throw new QlooError("QLOO_KEY_MISSING", "Qloo is in live mode but no API key is configured.");
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [QLOO_BIN, "api", ...args, "--json", "--quiet"],
      { timeout: 20_000, env: { ...process.env, QLOO_API_KEY: key }, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        let body: any;
        try {
          body = JSON.parse(stdout || "{}");
        } catch {
          return reject(new QlooError("QLOO_BAD_RESPONSE", "Qloo returned output that wasn't JSON."));
        }
        if (body.error || err) {
          return reject(new QlooError(body.code || "QLOO_FAILED", body.message || err?.message || "Qloo request failed."));
        }
        resolve(normalize(body));
      },
    );
  });
}

// The CLI returns bare arrays whose items differ per command (search uses
// `types`, insights uses `subtype`, tags use `tag_id`). Flatten to the small
// shape the agent uses, dropping the bulky fields (akas, websites, ...).
function normalize(body: any): Pick<QlooResult, "entities" | "tags"> {
  const results = body.results ?? body;
  const items: any[] = Array.isArray(results) ? results : (results.entities ?? results.tags ?? []);
  const isTag = (item: any) => !item.entity_id && (item.tag_id || item.id);
  return {
    entities: items.filter((item) => !isTag(item)).map(toEntity),
    tags: items.filter(isTag).map((t) => ({ id: t.tag_id ?? t.id, name: t.name, type: t.type ?? t.subtype })),
  };
}

function toEntity(item: any): QlooEntity {
  const p = item.properties ?? {};
  return {
    entity_id: item.entity_id,
    name: item.name,
    type: item.subtype ?? item.types?.[0] ?? item.type,
    popularity: item.popularity,
    query: item.query?.affinity === undefined ? undefined : { affinity: item.query.affinity },
    tags: (item.tags ?? []).slice(0, 8).map((t: any) => ({ id: t.tag_id ?? t.id, name: t.name, type: t.type })),
    properties: {
      release_year: p.release_year,
      address: p.address,
      image: p.image?.url,
      spotify_id: p.external?.spotify?.id ?? p.external?.spotify?.[0]?.id,
      description: p.short_description ?? p.description,
    },
  };
}

function sampleSearch(query: string, type: string | undefined, take: number) {
  const found = SEED_ENTITIES.filter((ent) => matches(ent.name, query) && (!type || ent.type.endsWith(type)));
  return { entities: found.slice(0, take) };
}

function sampleInsights(type: string, signalEntities: string[], take: number) {
  const pool = INSIGHTS[type] ?? [];
  return { entities: pool.filter((ent) => !signalEntities.includes(ent.entity_id)).slice(0, take) };
}

const matches = (a: string, b: string) => a.toLowerCase().includes(b.toLowerCase().trim());
const clamp = (n: number) => Math.max(1, Math.min(MAX_TAKE, Number(n) || 1));
const describe = (args: string[]) => `qloo api ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}`;
