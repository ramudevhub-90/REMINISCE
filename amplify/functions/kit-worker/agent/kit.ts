// Builds a session kit from a carer's seeds. Day 0: a fixed plan of Qloo calls
// with template wording. Day 1 swaps the planner and wording for Claude.
import * as qloo from "../qloo/index";
import type { QlooEntity, QlooResult, QlooTag } from "../qloo/index";

const OLDER_AUDIENCE = "55_and_older";

export interface KitInput {
  region: string;
  era: string;
  loves: string[];
}

export interface TraceStep {
  label: string;
  request?: string;
  found?: string | null;
  count?: number;
}

export interface KitItem {
  id: string;
  name: string;
  type: string;
  year?: number;
  tags: string[];
  why: { statement: string; affinity?: number; request: string; source: string };
}

type OnStep = (step: TraceStep) => Promise<void> | void;

export async function buildKit({ region, era, loves }: KitInput, onStep: OnStep = () => {}) {
  const trace: TraceStep[] = [];
  const step = async (s: TraceStep) => {
    trace.push(s);
    await onStep(s);
  };

  // 1. Resolve each free-text seed to a Qloo entity, or failing that to a tag
  //    (dishes like "fish curry" are tags on places, not entities).
  const seeds: QlooEntity[] = [];
  const seedTags: QlooTag[] = [];
  for (const love of loves) {
    const query = love.replace(/\s*\(\d{4}\)\s*$/, "");
    const res = await qloo.search({ query, take: 1 });
    const entity = res.entities[0];
    if (entity) {
      await step({ label: `Looked up “${love}”`, request: res.request, found: entity.name });
      seeds.push(entity);
      continue;
    }
    const tagRes = await qloo.findTags({ query, take: 1 });
    const tag = tagRes.tags?.[0];
    await step({ label: `Looked up “${love}” as a tag`, request: tagRes.request, found: tag?.name ?? null });
    if (tag) seedTags.push(tag);
  }
  const seedIds = seeds.map((s) => s.entity_id);
  const seedNames = [...seeds.map((s) => s.name), ...seedTags.map((t) => t.name.toLowerCase())];

  // 2. Expand the seeds across categories through the taste graph.
  const expand = async (type: string, take: number) => {
    const res = await qloo.insights({
      type,
      signalEntities: seedIds,
      signalTags: seedTags.map((t) => t.id),
      location: region || undefined,
      ageGroup: OLDER_AUDIENCE,
      take,
    });
    await step({ label: `Expanded seeds into ${type}s`, request: res.request, count: res.entities.length });
    return res.entities.map((ent) => toItem(ent, seedNames, res));
  };
  const [music, films, places] = await Promise.all([expand("artist", 5), expand("movie", 3), expand("place", 4)]);

  // 3. Assemble the kit.
  const cuisine = topTag(places) ?? "home-style";
  return {
    source: qloo.mode(),
    seeds: [...seeds.map((s) => ({ name: s.name, type: s.type })), ...seedTags.map((t) => ({ name: t.name, type: t.type }))],
    playlist: music,
    films,
    food: {
      title: `Cook something ${cuisine.toLowerCase()} together`,
      why: `Places popular with people who share these tastes${region ? ` around ${region}` : ""} are often tagged “${cuisine}”.`,
      places,
    },
    prompts: prompts({ music, films, region, era }),
    trace,
  };
}

function toItem(ent: QlooEntity, seedNames: string[], res: QlooResult): KitItem {
  return {
    id: ent.entity_id,
    name: ent.name,
    type: ent.type,
    year: ent.properties?.release_year,
    tags: (ent.tags ?? []).slice(0, 3).map((t) => t.name),
    why: {
      statement: `People who love ${list(seedNames)} tend to also love ${ent.name}.`,
      affinity: ent.query?.affinity,
      request: res.request,
      source: res.source,
    },
  };
}

function prompts({ music, films, region, era }: { music: KitItem[]; films: KitItem[]; region: string; era: string }) {
  const out: string[] = [];
  if (music[0]) out.push(`Play a song by ${music[0].name}. Ask: “Where were you when you first heard this?”`);
  if (films[0]) out.push(`Show a clip from ${films[0].name}${films[0].year ? ` (${films[0].year})` : ""}. Ask who they watched films with.`);
  if (region) out.push(`Ask about a street or market in ${region}${era ? ` in the ${era}` : ""}. What could you smell or hear there?`);
  out.push("Follow their lead. If a topic brings worry, gently move back to the music.");
  return out;
}

function topTag(items: KitItem[]) {
  const counts = new Map<string, number>();
  for (const item of items) for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

const list = (names: string[]) =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
