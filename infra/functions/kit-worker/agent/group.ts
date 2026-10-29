// A group session for a care-home lounge: find the songs and films that the
// most residents are likely to share. Each resident's tastes are expanded
// through Qloo separately; what turns up for several of them is the overlap.
// A combined query over everyone's seeds fills the gaps.
import * as qloo from "../qloo/index";
import { findEraGenres, list, parseDecade, resolveSeeds, toItem, tracer, unique, type KitItem, type OnStep } from "./shared";

export interface Member {
  region: string;
  era: string;
  loves: string[];
}

interface Candidate {
  item: KitItem;
  members: Set<number>;
  affinity: number;
}

const PER_MEMBER = 12;

export async function buildGroup({ members }: { members: Member[] }, onStep: OnStep = () => {}) {
  const { trace, step } = tracer(onStep);
  const n = members.length;

  // 1. Each resident's seeds, then their own expansion into singers and films.
  const people = await Promise.all(members.map((m, i) => resolveSeeds(m.loves, step, ` for resident ${i + 1}`)));
  const genres = unique(people.flatMap((p) => p.genres.map((t) => t.name))).slice(0, 2);
  const decades = members.map((m) => parseDecade(m.era)).filter((d): d is number => Boolean(d));
  const oldest = decades.length ? Math.min(...decades) : undefined;
  const eraTags = oldest && oldest <= 1985 ? await findEraGenres(genres) : [];

  const music = new Map<string, Candidate>();
  const films = new Map<string, Candidate>();
  const add = (pool: Map<string, Candidate>, item: KitItem, member: number | null) => {
    const c = pool.get(item.id) ?? { item, members: new Set<number>(), affinity: 0 };
    if (member !== null) c.members.add(member);
    c.affinity = Math.max(c.affinity, item.why.affinity ?? 0);
    pool.set(item.id, c);
  };

  await Promise.all(
    people.map(async (p, i) => {
      if (!p.mediaIds.length) return;
      const decade = parseDecade(members[i].era);
      const [a, f] = await Promise.all([
        qloo.insights({ type: "artist", signalEntities: p.mediaIds, signalTags: unique(p.genres.map((t) => t.id)).slice(0, 4), take: PER_MEMBER }),
        qloo.insights({
          type: "movie",
          signalEntities: p.mediaIds,
          releaseYears: decade ? { min: decade - 5, max: decade + 20 } : undefined,
          take: PER_MEMBER,
        }),
      ]);
      await step({ label: `Expanded resident ${i + 1}’s tastes`, request: a.request, count: a.entities.length + f.entities.length });
      a.entities.forEach((e) => add(music, toItem(e, a, ""), i));
      f.entities.forEach((e) => add(films, toItem(e, f, ""), i));
      // Their own seeds count too: a resident who loves Lata Mangeshkar shares her.
      p.media.forEach((s) => add(s.type.endsWith("movie") ? films : music, toItem(s, a, ""), i));
    }),
  );

  // 2. A combined query over everyone's seeds, in the era genre where Qloo has one.
  const everyone = unique(people.flatMap((p) => p.mediaIds));
  const [roomMusic, roomFilms] = await Promise.all([
    qloo.insights({ type: "artist", signalEntities: everyone, filterTags: eraTags.map((t) => t.id), take: 8 }),
    qloo.insights({
      type: "movie",
      signalEntities: everyone,
      releaseYears: oldest ? { min: oldest - 5, max: Math.max(...decades) + 20 } : undefined,
      take: 8,
    }),
  ]);
  await step({ label: `Looked for what the whole room shares${eraTags.length ? ` in Qloo’s “${eraTags[0].name}” genre` : ""}`, request: roomMusic.request, count: roomMusic.entities.length + roomFilms.entities.length });
  roomMusic.entities.forEach((e) => add(music, toItem(e, roomMusic, ""), null));
  roomFilms.entities.forEach((e) => add(films, toItem(e, roomFilms, ""), null));

  // 3. Rank by how many residents each pick reaches, then by affinity.
  const rank = (pool: Map<string, Candidate>, take: number) =>
    [...pool.values()]
      .sort((x, y) => y.members.size - x.members.size || y.affinity - x.affinity)
      .slice(0, take)
      .map((c) => ({
        ...c.item,
        members: [...c.members].sort(),
        why: {
          ...c.item.why,
          statement:
            c.members.size >= 2
              ? `${c.item.name} turned up in Qloo for ${c.members.size} of the ${n} residents: people with each of their tastes tend to love it.`
              : `People who share this group’s combined tastes tend to love ${c.item.name}.`,
        },
      }));
  const playlist = rank(music, 6);
  const filmList = rank(films, 4);
  const shared = playlist.filter((i) => i.members.length >= 2).length + filmList.filter((i) => i.members.length >= 2).length;
  await step({ label: `Found ${shared} picks shared by two or more residents` });

  return {
    kind: "group",
    source: qloo.mode(),
    size: n,
    playlist,
    films: filmList,
    food: null,
    seeds: people.flatMap((p) => p.seeds.map((s) => ({ name: s.name, type: s.type }))),
    prompts: [
      playlist[0] ? `Start a sing-along with a song by ${playlist[0].name}. Watch who joins in, and invite them to lead the next one.` : "",
      filmList[0] ? `Play a song from ${filmList[0].name}. Ask the room who saw it at the cinema, and where.` : "",
      "Go around the circle: what was your favourite street food when you were young?",
      "Keep it light. Celebrate every memory, and let quieter residents simply listen.",
    ].filter(Boolean),
    trace,
    summary: `Built from ${list(people.flatMap((p) => p.names).slice(0, 6))}${people.flatMap((p) => p.names).length > 6 ? " and more" : ""}.`,
  };
}
