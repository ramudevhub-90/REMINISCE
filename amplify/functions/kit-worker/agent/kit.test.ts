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
  assert.deepEqual(kit.seeds.map((s) => s.type), ["urn:entity:artist", "urn:entity:movie", "urn:tag:keyword:place"]);
  assert.ok(kit.trace.length >= 6);
});
