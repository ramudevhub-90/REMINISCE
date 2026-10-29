import { test } from "node:test";
import assert from "node:assert/strict";
import { buildKit } from "./kit";

test("builds a kit with evidence from sample Qloo data", async () => {
  const kit = await buildKit({ region: "Kolkata", era: "1960s", loves: ["Kishore Kumar", "Guide (1965)", "Fish curry"] });
  assert.equal(kit.source, "sample");
  assert.ok(kit.playlist.length > 0);
  assert.ok(kit.films.length > 0);
  assert.match(kit.playlist[0].why.statement, /People who love Kishore Kumar, Guide and fish curry tend to also love/);
  assert.match(kit.playlist[0].why.request, /^qloo api insights --type artist/);
  assert.deepEqual(kit.seeds.map((s) => s.type), ["urn:entity:artist", "urn:entity:movie", "urn:tag:specialty_dish:place"]);
  assert.ok(kit.trace.length >= 6);
});

test("uses journal hits as signals and leaves out what was already shown", async () => {
  const first = await buildKit({ region: "Kolkata", era: "1960s", loves: ["Kishore Kumar"] });
  const hit = first.playlist[0];
  const shown = [...first.playlist, ...first.films].map((i) => i.id);
  const next = await buildKit({
    region: "Kolkata",
    era: "1960s",
    loves: ["Kishore Kumar"],
    learned: [{ id: hit.id, name: hit.name, type: hit.type }],
    avoid: shown,
  });
  const nextIds = [...next.playlist, ...next.films].map((i) => i.id);
  assert.deepEqual(next.learned, [hit.name]);
  assert.ok(nextIds.every((id) => !shown.includes(id)), "repeats an item already shown");
  assert.match(next.trace[0].label, /Remembered from the journal/);
  assert.match(next.playlist[0]?.why.statement ?? next.films[0].why.statement, /lit them up in past sessions/);
});
