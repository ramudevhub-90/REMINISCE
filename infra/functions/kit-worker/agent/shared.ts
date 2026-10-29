// Building blocks shared by the kit, timeline and group agents.
import * as qloo from "../qloo/index";
import type { QlooEntity, QlooResult, QlooTag } from "../qloo/index";

export const OLDER_AUDIENCE = "55_and_older";

export interface Learned {
  id: string;
  name: string;
  type?: string;
}

export interface TraceStep {
  label: string;
  request?: string | undefined;
  found?: string | null;
  count?: number;
}

export interface TagRef {
  id: string;
  name: string;
}

export interface KitItem {
  id: string;
  name: string;
  type: string;
  year?: number;
  tags: string[];
  // Mood and genre tags, used to build the person's taste portrait.
  tagRefs: TagRef[];
  image?: string;
  spotifyId?: string;
  description?: string;
  members?: number[];
  why: { statement: string; affinity?: number; request: string; source: string };
}

export type OnStep = (step: TraceStep) => Promise<void> | void;
export type Step = (step: TraceStep) => Promise<void>;

export function tracer(onStep: OnStep) {
  const trace: TraceStep[] = [];
  const step: Step = async (s) => {
    trace.push(s);
    await onStep(s);
  };
  return { trace, step };
}

// Resolve each free-text seed. Look it up as an entity and as a tag in
// parallel: a dish like "fish curry" is a tag on places, not an entity.
export async function resolveSeeds(loves: string[], step: Step, who = "") {
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
      // A film or singer with exactly this name wins over a dish tag of the
      // same name ("Sholay" is both a 1975 film and a dish). Places don't:
      // "Fish Curry" is also a restaurant.
      const exact = entity && /artist|movie|tv_show|book|person/.test(entity.type) && same(entity.name, query);
      const dish = exact ? undefined : tagRes?.tags?.find((t) => t.type?.includes("specialty_dish") && same(t.name, query));
      if (dish || !entity) {
        const tag = dish ?? tagRes?.tags?.[0];
        await step({ label: `Looked up “${love}”${who} as a tag`, request: tagRes?.request, found: tag?.name ?? null });
        return { tag };
      }
      await step({ label: `Looked up “${love}”${who}`, request: res.request, found: entity.name });
      return { entity };
    }),
  );
  const seeds = resolved.flatMap((r) => (r.entity ? [r.entity] : []));
  const seedTags = resolved.flatMap((r) => (r.tag ? [r.tag] : []));
  const media = seeds.filter((s) => /artist|movie|tv_show|book|person/.test(s.type));
  // Singers' genres first: callers take the first two to find era genres
  // such as "Old Hindi", which a film's "Action" never leads to.
  const byMusic = [...media].sort((a, b) => Number(b.type.includes("artist")) - Number(a.type.includes("artist")));
  const genres = byMusic.flatMap((s) => (s.tags ?? []).filter((t) => t.type === "urn:tag:genre").slice(0, 2));
  return {
    seeds,
    seedTags,
    media,
    mediaIds: (media.length ? media : seeds).map((s) => s.entity_id),
    genres,
    dishTags: seedTags.filter((t) => t.type?.includes("specialty_dish")),
    names: [...seeds.map((s) => s.name), ...seedTags.map((t) => t.name.toLowerCase())],
  };
}

// "1960s", "60s" or "1965" → 1960. Returns undefined when there's no era.
export function parseDecade(era: string) {
  const full = era.match(/(19|20)(\d)\d/);
  if (full) return Number(`${full[1]}${full[2]}0`);
  const short = era.match(/\b(\d)0s\b/);
  return short ? 1900 + Number(short[1]) * 10 : undefined;
}

// Qloo can't filter singers by era, but its vocabulary has era genres such as
// "Old Hindi" or "Classic Jazz". Look them up from the seeds' genres.
export async function findEraGenres(genreNames: string[]): Promise<QlooTag[]> {
  const queries = genreNames.flatMap((g) => [`old ${g}`, `classic ${g}`]);
  const results = await Promise.all(queries.map((query) => qloo.findTags({ query, take: 5 })));
  const found = results.flatMap((r, i) => {
    const genre = genreNames[Math.floor(i / 2)].toLowerCase();
    return (r.tags ?? []).filter(
      (t) => t.id.startsWith("urn:tag:genre:music:") && /\b(old|classic|golden|retro)\b/i.test(t.name) && t.name.toLowerCase().includes(genre),
    );
  });
  return found.filter((t, i) => found.findIndex((x) => x.id === t.id) === i).slice(0, 2);
}

// Tag types that describe taste (moods, themes, genres) rather than plot details.
const PORTRAIT_TYPES = /^urn:tag:(theme|style|subgenre|genre):(qloo|music|media)$/;

export function toItem(ent: QlooEntity, res: QlooResult, statement: string): KitItem {
  return {
    id: ent.entity_id,
    name: ent.name,
    type: ent.type,
    year: ent.properties?.release_year,
    tags: (ent.tags ?? []).slice(0, 3).map((t) => t.name),
    tagRefs: (ent.tags ?? [])
      .filter((t) => PORTRAIT_TYPES.test(t.type ?? ""))
      .slice(0, 5)
      .map((t) => ({ id: t.id, name: t.name })),
    image: ent.properties?.image,
    spotifyId: ent.properties?.spotify_id,
    description: ent.properties?.description,
    why: { statement, affinity: ent.query?.affinity, request: res.request, source: res.source },
  };
}

export const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
export const unique = <T,>(xs: T[]) => [...new Set(xs)];
export const list = (names: string[]) =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
