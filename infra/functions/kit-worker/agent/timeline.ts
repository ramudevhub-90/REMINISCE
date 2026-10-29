// "Their world": the years they grew up in, five at a time. Qloo dates films,
// so each chapter holds the films of those years that suit their tastes,
// with the sound of the era alongside.
import * as qloo from "../qloo/index";
import { findEraGenres, list, parseDecade, resolveSeeds, toItem, tracer, unique, type Learned, type OnStep } from "./shared";

export interface TimelineInput {
  region: string;
  era: string;
  loves: string[];
  learned?: Learned[];
}

const SPAN = 5;
const CHAPTERS = 4;

export async function buildTimeline({ region, era, loves, learned = [] }: TimelineInput, onStep: OnStep = () => {}) {
  const decade = parseDecade(era);
  if (!decade) throw new Error("Add roughly when they grew up, such as 1960s, to see their timeline.");
  const { trace, step } = tracer(onStep);

  const { mediaIds, genres, names } = await resolveSeeds(loves, step);
  const signals = unique([...mediaIds, ...learned.map((l) => l.id)]);
  if (!signals.length) throw new Error("Add a singer, song or film they love so we can find the films of their years.");
  const because = `Chosen for people who love ${list(names)}.`;

  const genreIds = unique(genres.map((t) => t.id)).slice(0, 4);
  const windows = Array.from({ length: CHAPTERS }, (_, i) => ({ from: decade + i * SPAN, to: decade + i * SPAN + SPAN - 1 }));
  const eraTags = decade <= 1985 ? await findEraGenres(unique(genres.map((t) => t.name)).slice(0, 2)) : [];

  const [sound, ...chapters] = await Promise.all([
    (async () => {
      const res = await qloo.insights({
        type: "artist",
        signalEntities: signals,
        signalTags: genreIds,
        filterTags: eraTags.map((t) => t.id),
        take: 6,
      });
      await step({ label: `Found the sound of the ${era}${eraTags.length ? ` in Qloo’s “${eraTags[0].name}” genre` : ""}`, request: res.request, count: res.entities.length });
      return res.entities.map((e) => toItem(e, res, `${because} Part of the sound of their ${era}.`));
    })(),
    ...windows.map(async (w) => {
      // Their seeds' own genres keep each window in their film culture. (A
      // location signal pulled in globally popular films instead.)
      const res = await qloo.insights({
        type: "movie",
        signalEntities: signals,
        signalTags: genreIds,
        releaseYears: { min: w.from, max: w.to },
        take: 4,
      });
      await step({ label: `Found films from ${w.from} to ${w.to}`, request: res.request, count: res.entities.length });
      return {
        ...w,
        films: res.entities.map((e) => toItem(e, res, `${because} Released ${e.properties?.release_year ?? `between ${w.from} and ${w.to}`}.`)),
        prompt: `These came out between ${w.from} and ${w.to}. Ask which ones they saw at the cinema, who they went with, and what they wore.`,
      };
    }),
  ]);

  return {
    kind: "timeline",
    source: qloo.mode(),
    from: decade,
    to: decade + SPAN * CHAPTERS - 1,
    region,
    sound,
    chapters: chapters.filter((c) => c.films.length),
    trace,
  };
}
