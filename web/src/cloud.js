// Cloud copies of a signed-in carer's people and care-home group. Records are
// owner-only: AppSync keys every read and write on the caller's account, so
// only that account can see or change them. Guests never touch this module;
// their data stays on the device.
import { gql } from "./backend.js";

const enc = (v) => (v === undefined || v === null ? null : JSON.stringify(v));
function dec(v) {
  let value = v;
  for (let i = 0; i < 3 && typeof value === "string"; i++) value = JSON.parse(value);
  return value ?? null;
}

// One kind of record: its list, save and delete operations, all as the carer.
function records({ type, single, plural, fields }) {
  const selection = `id ${fields} createdAt updatedAt`;
  const call = (query, variables) => gql(query, variables, "userPool");
  return {
    async list() {
      const all = [];
      let nextToken = null;
      do {
        const page = (await call(`query List($nextToken: String) { list${plural}(nextToken: $nextToken) { items { ${selection} } nextToken } }`, { nextToken }))[`list${plural}`];
        all.push(...page.items);
        nextToken = page.nextToken;
      } while (nextToken);
      return all.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    },
    save: async (input) => (await call(`mutation Save($input: ${type}Input!) { save${single}(input: $input) { ${selection} } }`, { input }))[`save${single}`],
    remove: async (id) => (await call(`mutation Delete($id: ID!) { delete${single}(id: $id) { id } }`, { id }))[`delete${single}`],
  };
}

const People = records({ type: "Person", single: "Person", plural: "People", fields: "name profile kit journal timeline" });
const Groups = records({ type: "CareGroup", single: "Group", plural: "Groups", fields: "name group kit journal" });
const Accounts = records({ type: "CarerAccount", single: "Account", plural: "Accounts", fields: "kind orgName" });

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

export const listPeople = async () => (await People.list()).map(fromPerson);
export const createPerson = async (data) => fromPerson(await People.save(toPerson(data)));
export const savePerson = (id, data) => People.save({ id, ...toPerson(data) });
export const deletePerson = (id) => People.remove(id);

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
  const groups = await Groups.list();
  return groups[0] ? fromGroup(groups[0]) : null;
};
export const createGroup = async (data) => fromGroup(await Groups.save(toGroup(data)));
export const saveGroup = (id, data) => Groups.save({ id, ...toGroup(data) });

// The account's kind: "family" or "carehome" (with the home's name).
export async function getAccount() {
  const all = await Accounts.list();
  return all[0] ? { id: all[0].id, kind: all[0].kind, orgName: all[0].orgName ?? "" } : null;
}
export const updateAccount = async ({ id, kind, orgName }) => {
  const a = await Accounts.save({ id, kind, orgName });
  return { id: a.id, kind: a.kind, orgName: a.orgName ?? "" };
};
export const createAccount = async ({ kind, orgName }) => {
  const a = await Accounts.save({ kind, orgName });
  return { id: a.id, kind: a.kind, orgName: a.orgName ?? "" };
};

// Everything this account has stored, for "Delete my data".
export async function deleteEverything() {
  const [people, groups, accounts] = await Promise.all([People.list(), Groups.list(), Accounts.list()]);
  await Promise.all([
    ...people.map((p) => People.remove(p.id)),
    ...groups.map((g) => Groups.remove(g.id)),
    ...accounts.map((a) => Accounts.remove(a.id)),
  ]);
}
