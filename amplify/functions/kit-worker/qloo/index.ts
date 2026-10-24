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
 * ageGroup and location narrow results to the audience the person belongs to.
 */
export async function insights(opts: {
  type: string;
  signalEntities?: string[];
  signalTags?: string[];
  location?: string;
  ageGroup?: string;
  take?: number;
}) {
  const { type, signalEntities = [], signalTags = [], location, ageGroup, take = 6 } = opts;
  const args = ["insights", "--type", type, "--take", String(clamp(take))];
  if (signalEntities.length) args.push("--signal-entities", signalEntities.join(","));
  if (signalTags.length) args.push("--signal-tags", signalTags.join(","));
  if (location) args.push("--signal-location", location);
  if (ageGroup) args.push("--params", JSON.stringify({ "signal.demographics.age": ageGroup }));
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
      { timeout: 20_000, env: { ...process.env, QLOO_API_KEY: key } },
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

// The CLI wraps results differently per command; flatten to { entities, tags }.
function normalize(body: any): Pick<QlooResult, "entities" | "tags"> {
  const results = body.results ?? body;
  if (Array.isArray(results)) return { entities: results };
  return { entities: results.entities ?? [], tags: results.tags ?? body.tags };
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
