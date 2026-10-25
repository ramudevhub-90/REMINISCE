// The taste portrait: the mood and genre tags (from Qloo) that keep turning
// up in what lit them up, and the ones that came with what didn't land.
// Catch-all tags that say nothing about a person's taste.
const GENERIC = /^(all|other|misc|various|general)$/i;

export function computePortrait(journal) {
  const tally = new Map();
  for (const entry of journal) {
    for (const item of entry.items ?? []) {
      const weight = item.reaction === "lit" ? 2 : item.reaction === "some" ? 1 : item.reaction === "none" ? -1 : 0;
      if (!weight) continue;
      for (const tag of (item.tagRefs ?? []).filter((t) => t.name?.length > 2 && !GENERIC.test(t.name))) {
        const t = tally.get(tag.id) ?? { ...tag, score: 0, lit: 0, none: 0 };
        t.score += weight;
        if (weight === 2) t.lit++;
        if (weight === -1) t.none++;
        tally.set(tag.id, t);
      }
    }
  }
  const all = [...tally.values()];
  return {
    loves: all.filter((t) => t.lit && t.score >= 2).sort((a, b) => b.score - a.score).slice(0, 4).map(pick),
    less: all.filter((t) => t.none && !t.lit).sort((a, b) => b.none - a.none).slice(0, 3).map(pick),
  };
}

const pick = ({ id, name }) => ({ id, name });
