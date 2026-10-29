import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimeline } from "./timeline";
import { buildGroup } from "./group";

test("timeline splits the years they grew up in into chapters of films", async () => {
  const t = await buildTimeline({ region: "Kolkata", era: "1960s", loves: ["Kishore Kumar", "Guide (1965)"] });
  assert.equal(t.from, 1960);
  assert.equal(t.to, 1979);
  assert.deepEqual(t.chapters.map((c) => c.from), [1960, 1965, 1970, 1975]);
  assert.ok(t.chapters[0].films.length > 0);
  assert.ok(t.sound.length > 0);
});

test("timeline needs a decade", async () => {
  await assert.rejects(buildTimeline({ region: "Kolkata", era: "", loves: ["Kishore Kumar"] }), /roughly when/);
});

test("group ranks picks by how many residents they reach", async () => {
  const g = await buildGroup({
    members: [
      { region: "Kolkata", era: "1960s", loves: ["Kishore Kumar"] },
      { region: "Kolkata", era: "1950s", loves: ["Lata Mangeshkar"] },
      { region: "Kolkata", era: "1960s", loves: ["Guide (1965)"] },
    ],
  });
  assert.equal(g.size, 3);
  assert.ok(g.playlist.length > 0);
  const counts = g.playlist.map((i) => i.members.length);
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
  assert.match(g.playlist[0].why.statement, /of the 3 residents/);
});
