// Builds a session kit for one person from a carer's seeds, what lit them up
// in past sessions, and the moods and genres that tend to reach them.
import * as qloo from "../qloo/index";
import {
  OLDER_AUDIENCE,
  findEraGenres,
  list,
  parseDecade,
  resolveSeeds,
  toItem,
  tracer,
  unique,
  type KitItem,
  type Learned,
  type OnStep,
  type TagRef,
} from "./shared";

export type { KitItem, Learned, TraceStep } from "./shared";

export interface KitInput {
  region: string;
  era: string;
  loves: string[];
  // From the carer's journal: what lit them up before, what to leave out, and
  // the mood and genre tags their hits share (their taste portrait).
  learned?: Learned[];
  avoid?: string[];
  portrait?: TagRef[];
}

export async function buildKit(
  { region, era, loves, learned = [], avoid = [], portrait = [] }: KitInput,
  onStep: OnStep = () => {},
) {
  const { trace, step } = tracer(onStep);

  if (learned.length) {
    await step({ label: `Remembered from the journal: ${list(learned.map((l) => l.name))} lit them up` });
  }
  if (portrait.length) {
    await step({ label: `Leaning on what reaches them: ${list(portrait.map((t) => t.name))}` });
  }

  // 1. Resolve each free-text seed.
  const { seeds, seedTags, mediaIds: seedIds, genres, dishTags, names: seedNames } = await resolveSeeds(loves, step);
  const learnedNames = learned.map((l) => l.name);

  // 2. Expand into each category from the seeds that speak to it. Music leans
  //    on the media seeds and their genres; films are kept to the years they
  //    grew up in; places come from the home region and any dishes, for the
  //    older audience. (Qloo's age signal pulled music and films towards what
  //    older people watch today rather than what they grew up with, so the era
  //    window does that job for media.)
  const decade = parseDecade(era);
  // Past hits are Qloo entities already, so they join the signals directly.
  const mediaIds = unique([...seedIds, ...learned.map((l) => l.id)]);
  // Don't repeat what was set aside, or the hits themselves (shown as favourites).
  const exclude = unique([...avoid, ...learned.map((l) => l.id)]);
  const genreTags = unique([...genres.map((t) => t.id), ...portrait.map((t) => t.id)]).slice(0, 6);
  const eraTags = decade && decade <= 1985 ? await findEraGenres(unique(genres.map((t) => t.name)).slice(0, 2)) : [];
  if (eraTags.length) {
    await step({ label: `Found Qloo’s “${list(eraTags.map((t) => t.name))}” genre for music from the ${era}`, found: eraTags[0].name });
  }

  const sparked = learnedNames.length ? `, and ${list(learnedNames)}, who lit them up in past sessions,` : "";
  const LABEL: Record<string, string> = { artist: "songs", movie: "films", place: "places" };
  const expand = async (type: string, take: number, opts: Partial<Parameters<typeof qloo.insights>[0]>) => {
    // One category failing shouldn't cost the whole kit: note it and carry on.
    let res;
    try {
      res = await qloo.insights({ type, take, ...opts });
    } catch (err) {
      console.error(`Skipping ${type}s:`, err instanceof qloo.QlooError ? err.detail : err);
      await step({ label: `Couldn’t reach Qloo for ${LABEL[type] ?? type} this time` });
      return [] as KitItem[];
    }
    const note = res.locationDropped ? ` (Qloo doesn't know “${region}”, so without location)` : "";
    await step({ label: `Expanded seeds into ${type}s${note}`, request: res.request, count: res.entities.length });
    // Places only make sense near where they grew up.
    if (type === "place" && res.locationDropped) return [];
    return res.entities.map((ent) => toItem(ent, res, `People who love ${list(seedNames)}${sparked} tend to also love ${ent.name}.`));
  };
  const none = Promise.resolve([] as KitItem[]);
  // Era-genre singers first. Qloo's era genres can be small, so top up from
  // the wider list only as far as six, keeping later decades from crowding in.
  const expandMusic = async () => {
    const songs = await expandSongs(genreTags);
    if (songs.length || !portrait.length) return songs;
    // Portrait tags can make the request too heavy for Qloo to answer in time;
    // their past hits still steer a lighter one.
    await step({ label: "Asked Qloo again for songs, without the taste portrait" });
    return expandSongs(unique(genres.map((t) => t.id)).slice(0, 6));
  };
  const expandSongs = async (signalTags: string[]) => {
    const base = { signalEntities: mediaIds, signalTags, exclude };
    if (!eraTags.length) return expand("artist", 8, base);
    const picks = await expand("artist", 8, { ...base, filterTags: eraTags.map((t) => t.id) });
    if (picks.length >= 6) return picks;
    const wider = await expand("artist", 8, base);
    return [...picks, ...wider.filter((w) => !picks.some((p) => p.id === w.id))].slice(0, Math.max(6, picks.length));
  };
  const [music, films, places] = await Promise.all([
    mediaIds.length ? expandMusic() : none,
    mediaIds.length
      ? expand("movie", 4, {
          signalEntities: mediaIds,
          signalTags: portrait.map((t) => t.id),
          exclude,
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
          exclude,
        })
      : none,
  ]);

  // 3. Assemble the kit.
  const dish = dishTags[0]?.name;
  const cuisine = topTag(places) ?? "home-style";
  return {
    kind: "kit",
    source: qloo.mode(),
    learned: learnedNames,
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
