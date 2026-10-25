// Cloud copies of a signed-in carer's people and care-home group. Records are
// owner-only: AppSync lets only the account that created them read or change
// them. Guests never touch this module; their data stays on the device.
import { generateClient } from "aws-amplify/data";

const db = generateClient({ authMode: "userPool" });

const enc = (v) => (v === undefined || v === null ? null : JSON.stringify(v));
function dec(v) {
  let value = v;
  for (let i = 0; i < 3 && typeof value === "string"; i++) value = JSON.parse(value);
  return value ?? null;
}
function ok({ data, errors }) {
  if (errors?.length) throw new Error(errors[0].message);
  return data;
}

async function listAll(model) {
  const all = [];
  let nextToken;
  do {
    const res = await model.list({ nextToken, limit: 100 });
    all.push(...ok(res));
    nextToken = res.nextToken;
  } while (nextToken);
  return all.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

// People ------------------------------------------------------------------

const fromPerson = (p) => ({
  id: p.id,
  name: p.name,
  updatedAt: p.updatedAt,
  profile: { ...(dec(p.profile) ?? {}), cloudId: p.id },
  kit: dec(p.kit),
  journal: dec(p.journal) ?? [],
  timeline: dec(p.timeline),
});

const toPerson = ({ profile, kit, journal, timeline }) => ({
  name: profile?.name || "Someone",
  profile: enc(profile),
  kit: enc(kit),
  journal: enc(journal ?? []),
  timeline: enc(timeline),
});

export const listPeople = async () => (await listAll(db.models.Person)).map(fromPerson);
export const createPerson = async (data) => fromPerson(ok(await db.models.Person.create(toPerson(data))));
export const savePerson = async (id, data) => ok(await db.models.Person.update({ id, ...toPerson(data) }));
export const deletePerson = async (id) => ok(await db.models.Person.delete({ id }));

// Care-home group (one per account for now) --------------------------------

const fromGroup = (g) => ({
  id: g.id,
  group: { ...(dec(g.group) ?? { name: g.name ?? "", residents: [] }), cloudId: g.id },
  kit: dec(g.kit),
  journal: dec(g.journal) ?? [],
});

const toGroup = ({ group, kit, journal }) => ({
  name: group?.name || "My group",
  group: enc(group),
  kit: enc(kit),
  journal: enc(journal ?? []),
});

export const latestGroup = async () => {
  const groups = await listAll(db.models.CareGroup);
  return groups[0] ? fromGroup(groups[0]) : null;
};
export const createGroup = async (data) => fromGroup(ok(await db.models.CareGroup.create(toGroup(data))));
export const saveGroup = async (id, data) => ok(await db.models.CareGroup.update({ id, ...toGroup(data) }));

// The account's kind: "family" or "carehome" (with the home's name).
export async function getAccount() {
  const all = await listAll(db.models.CarerAccount);
  return all[0] ? { id: all[0].id, kind: all[0].kind, orgName: all[0].orgName ?? "" } : null;
}
export const createAccount = async ({ kind, orgName }) => {
  const a = ok(await db.models.CarerAccount.create({ kind, orgName }));
  return { id: a.id, kind: a.kind, orgName: a.orgName ?? "" };
};

// Everything this account has stored, for "Delete my data".
export async function deleteEverything() {
  const [people, groups, accounts] = await Promise.all([
    listAll(db.models.Person),
    listAll(db.models.CareGroup),
    listAll(db.models.CarerAccount),
  ]);
  await Promise.all([
    ...people.map((p) => db.models.Person.delete({ id: p.id })),
    ...groups.map((g) => db.models.CareGroup.delete({ id: g.id })),
    ...accounts.map((a) => db.models.CarerAccount.delete({ id: a.id })),
  ]);
}
