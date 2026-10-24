// The only place the app talks to Qloo. Every other module calls these
// functions and never sees whether the data came from samples or the live API.
//
// QLOO_MODE=sample (default) returns built-in sample data.
// QLOO_MODE=live runs the @qloo/qloo-harness CLI (`qloo api ...`) with
// QLOO_API_KEY from the server environment. The key never leaves the server.

import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createCache } from "./cache.js";
import { INSIGHTS, SEED_ENTITIES, TAGS } from "./sample-data.js";

const MODE = process.env.QLOO_MODE === "live" ? "live" : "sample";
const QLOO_BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../node_modules/.bin/qloo");
const MAX_TAKE = 10;
const cache = createCache();

export class QlooError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function status() {
  return { mode: MODE, ready: MODE === "sample" || Boolean(process.env.QLOO_API_KEY), cached: cache.size };
}

/** Resolve a free-text seed ("Kishore Kumar") to a Qloo entity. */
export async function search({ query, type, take = 3 }) {
  const args = ["search", "--query", query, "--take", String(clamp(take))];
  if (type) args.push("--type", type);
  return cached(args, () => sampleSearch(query, type, take));
}

/**
 * Taste-graph expansion: entities of `type` with high affinity for the signals.
 * ageGroup and location narrow results to the audience the person belongs to.
 */
export async function insights({ type, signalEntities = [], signalTags = [], location, ageGroup, take = 6 }) {
  const args = ["insights", "--type", type, "--take", String(clamp(take))];
  if (signalEntities.length) args.push("--signal-entities", signalEntities.join(","));
  if (signalTags.length) args.push("--signal-tags", signalTags.join(","));
  if (location) args.push("--signal-location", location);
  if (ageGroup) args.push("--params", JSON.stringify({ "signal.demographics.age": ageGroup }));
  return cached(args, () => sampleInsights(type, signalEntities, take));
}

/** Find tag URNs for a concept such as "fish curry". */
export async function findTags({ query, take = 5 }) {
  const args = ["tags", "--query", query, "--take", String(clamp(take))];
  return cached(args, () => ({
    tags: TAGS.filter((t) => matches(t.name, query) || matches(query, t.name)).slice(0, take),
  }));
}

async function cached(args, sample) {
  const key = args.join("\u0000");
  const hit = cache.get(key);
  if (hit) return { ...hit, cached: true };
  const data = MODE === "live" ? await runCli(args) : sample();
  const result = { ...data, source: MODE, request: describe(args) };
  cache.set(key, result);
  return result;
}

function runCli(args) {
  if (!process.env.QLOO_API_KEY) {
    throw new QlooError("QLOO_KEY_MISSING", "QLOO_MODE is live but QLOO_API_KEY is not set on the server.", 503);
  }
  return new Promise((resolve, reject) => {
    execFile(QLOO_BIN, ["api", ...args, "--json", "--quiet"], { timeout: 20_000, env: process.env }, (err, stdout) => {
      let body;
      try {
        body = JSON.parse(stdout || "{}");
      } catch {
        return reject(new QlooError("QLOO_BAD_RESPONSE", "Qloo returned output that wasn't JSON."));
      }
      if (body.error || err) {
        const code = body.code || "QLOO_FAILED";
        const status = code === "RATE_LIMITED" ? 429 : code === "AUTH_FAILED" ? 503 : 502;
        return reject(new QlooError(code, body.message || err?.message || "Qloo request failed.", status));
      }
      resolve(normalize(body));
    });
  });
}

// The CLI wraps results differently per command; flatten to { entities } / { tags }.
function normalize(body) {
  const results = body.results ?? body;
  if (Array.isArray(results)) return { entities: results };
  return { entities: results.entities ?? [], tags: results.tags ?? body.tags };
}

function sampleSearch(query, type, take) {
  const found = SEED_ENTITIES.filter((ent) => matches(ent.name, query) && (!type || ent.type.endsWith(type)));
  return { entities: found.slice(0, take) };
}

function sampleInsights(type, signalEntities, take) {
  const pool = INSIGHTS[type] ?? [];
  return { entities: pool.filter((ent) => !signalEntities.includes(ent.entity_id)).slice(0, take) };
}

const matches = (a, b) => a.toLowerCase().includes(b.toLowerCase().trim());
const clamp = (n) => Math.max(1, Math.min(MAX_TAKE, Number(n) || 1));
const describe = (args) => `qloo api ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}`;
