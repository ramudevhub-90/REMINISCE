// Builds a session kit from a carer's seeds. Day 0: a fixed plan of Qloo calls
// with template wording. Day 1 swaps the planner and wording for Claude.
import * as qloo from "../qloo/index";
import type { QlooEntity, QlooResult } from "../qloo/index";

const OLDER_AUDIENCE = "55_and_older";

export interface KitInput {
  region: string;
  era: string;
  loves: string[];
}

export interface TraceStep {
  label: string;
  request?: string | undefined;
  found?: string | null;
  count?: number;
}

export interface KitItem {
  id: string;
  name: string;
  type: string;
  year?: number;
  tags: string[];
  image?: string;
  spotifyId?: string;
  description?: string;
  why: { statement: string; affinity?: number; request: string; source: string };
}

type OnStep = (step: TraceStep) => Promise<void> | void;

export async function buildKit({ region, era, loves }: KitInput, onStep: OnStep = () => {}) {
  const trace: TraceStep[] = [];
  const step = async (s: TraceStep) => {
    trace.push(s);
    await onStep(s);
  };

  // 1. Resolve each free-text seed. Look it up as an entity and as a tag in
  //    parallel: a dish like "fish curry" is a tag on places, not an entity.
  const resolved = await Promise.all(
    loves.map(async (love) => {
      // "Guide (1965)": the year means a film, and helps pick the right one.
      const year = love.match(/\((\d{4})\)\s*$/)?.[1];
      const query = love.replace(/\s*\(\d{4}\)\s*$/, "");
      const [res, tagRes] = await Promise.all([
        qloo.search({ query, type: year ? "movie" : undefined, take: 1 }),
        year ? undefined : qloo.findTags({ query, take: 5 }),
      ]);
      const entity = res.entities[0];
      const dish = tagRes?.tags?.find((t) => t.type?.includes("specialty_dish") && same(t.name, query));
      if (dish || !entity) {
        const tag = dish ?? tagRes?.tags?.[0];
        await step({ label: `Looked up “${love}” as a tag`, request: tagRes?.request, found: tag?.name ?? null });
        return { tag };
      }
      await step({ label: `Looked up “${love}”`, request: res.request, found: entity.name });
      return { entity };
    }),
  );
  const seeds = resolved.flatMap((r) => (r.entity ? [r.entity] : []));
  const seedTags = resolved.flatMap((r) => (r.tag ? [r.tag] : []));
  const seedNames = [...seeds.map((s) => s.name), ...seedTags.map((t) => t.name.toLowerCase())];

  // 2. Expand into each category from the seeds that speak to it. Music leans
  //    on the media seeds and their genres; films are kept to the years they
  //    grew up in; places come from the home region and any dishes, for the
  //    older audience. (Qloo's age signal pulled music and films towards what
  //    older people watch today rather than what they grew up with, so the era
  //    window does that job for media.)
  const decade = parseDecade(era);
  const media = seeds.filter((s) => /artist|movie|tv_show|book|person/.test(s.type));
  const mediaIds = (media.length ? media : seeds).map((s) => s.entity_id);
  const genreTags = unique(
    media.flatMap((s) => (s.tags ?? []).filter((t) => t.type === "urn:tag:genre").slice(0, 2).map((t) => t.id)),
  ).slice(0, 4);
  const dishTags = seedTags.filter((t) => t.type?.includes("specialty_dish"));

  const expand = async (type: string, take: number, opts: Partial<Parameters<typeof qloo.insights>[0]>) => {
    const res = await qloo.insights({ type, take, ...opts });
    const note = res.locationDropped ? ` (Qloo doesn't know “${region}”, so without location)` : "";
    await step({ label: `Expanded seeds into ${type}s${note}`, request: res.request, count: res.entities.length });
    // Places only make sense near where they grew up.
    if (type === "place" && res.locationDropped) return [];
    return res.entities.map((ent) => toItem(ent, seedNames, res));
  };
  const none = Promise.resolve([] as KitItem[]);
  const [music, films, places] = await Promise.all([
    mediaIds.length ? expand("artist", 8, { signalEntities: mediaIds, signalTags: genreTags }) : none,
    mediaIds.length
      ? expand("movie", 4, {
          signalEntities: mediaIds,
          releaseYears: decade ? { min: decade - 5, max: decade + 20 } : undefined,
        })
      : none,
    // Places need a location filter; dish tags steer them towards the food.
    region
      ? expand("place", 4, {
          filterLocation: region,
          ageGroup: OLDER_AUDIENCE,
          signalTags: dishTags.map((t) => t.id),
          signalEntities: dishTags.length ? [] : seeds.map((s) => s.entity_id),
        })
      : none,
  ]);

  // 3. Assemble the kit.
  const dish = dishTags[0]?.name;
  const cuisine = topTag(places) ?? "home-style";
  return {
    source: qloo.mode(),
    seeds: [...seeds.map((s) => ({ name: s.name, type: s.type })), ...seedTags.map((t) => ({ name: t.name, type: t.type }))],
    playlist: music,
    films,
    food: !dish && !places.length ? null : {
      title: dish ? `Cook ${dish.toLowerCase()} together` : `Cook something ${cuisine.toLowerCase()} together`,
      why: dish
        ? `Places${region ? ` around ${region}` : ""} known for ${dish.toLowerCase()} that are popular with people who share these tastes.`
        : `Places popular with people who share these tastes${region ? ` around ${region}` : ""} are often tagged “${cuisine}”.`,
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
    image: ent.properties?.image,
    spotifyId: ent.properties?.spotify_id,
    description: ent.properties?.description,
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

// "1960s", "60s" or "1965" → 1960. Returns undefined when there's no era.
function parseDecade(era: string) {
  const full = era.match(/(19|20)(\d)\d/);
  if (full) return Number(`${full[1]}${full[2]}0`);
  const short = era.match(/\b(\d)0s\b/);
  return short ? 1900 + Number(short[1]) * 10 : undefined;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const unique = <T,>(xs: T[]) => [...new Set(xs)];

function topTag(items: KitItem[]) {
  const counts = new Map<string, number>();
  for (const item of items) for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

const list = (names: string[]) =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
