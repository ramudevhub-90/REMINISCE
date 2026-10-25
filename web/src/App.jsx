import { useEffect, useRef, useState } from "react";
import { deleteUser, fetchUserAttributes, getCurrentUser, signOut } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import { buildGroup, buildKit, buildTimeline } from "./api.js";
import * as cloud from "./cloud.js";
import { computePortrait } from "./portrait.js";
import * as store from "./storage.js";
import Home from "./views/Home.jsx";
import Building from "./views/Building.jsx";
import Kit from "./views/Kit.jsx";
import Session from "./views/Session.jsx";
import Timeline from "./views/Timeline.jsx";
import GroupSetup from "./views/GroupSetup.jsx";
import GroupKit from "./views/GroupKit.jsx";
import Account from "./views/Account.jsx";

const EMPTY = { name: "", region: "", era: "", loves: [], learned: [], shown: [], portrait: { loves: [], less: [] } };
const NO_GROUP = { name: "", residents: [] };

// "1960s" → "1960–1979", the span the timeline covers.
function timelineYears(era) {
  const m = era?.match(/(19|20)(\d)\d/) ?? era?.match(/\b(\d)0s\b/);
  if (!m) return null;
  const start = m.length === 3 ? Number(`${m[1]}${m[2]}0`) : 1900 + Number(m[1]) * 10;
  return `${start}–${start + 19}`;
}

export default function App() {
  const [profile, setProfile] = useState(() => store.loadProfile() ?? EMPTY);
  const [kit, setKit] = useState(() => store.loadKit());
  const [journal, setJournal] = useState(() => store.loadJournal());
  const [timeline, setTimeline] = useState(() => store.loadTimeline());
  const [group, setGroup] = useState(() => store.loadGroup() ?? NO_GROUP);
  const [groupKit, setGroupKit] = useState(() => store.loadGroupKit());
  const [groupJournal, setGroupJournal] = useState(() => store.loadGroupJournal());
  const [groupSaved, setGroupSaved] = useState("");
  const [view, setView] = useState(() => (store.loadKit() ? "kit" : "home"));
  const [build, setBuild] = useState({ steps: [], error: "", title: "", back: "home" });
  const [user, setUser] = useState(null);
  const [people, setPeople] = useState([]);
  const [account, setAccount] = useState(null);
  const careHome = account?.kind === "carehome";

  // Latest state for async auth handlers, which outlive the render they started in.
  const live = useRef({});
  live.current = { profile, kit, journal, timeline, group, groupKit, groupJournal };
  const creating = useRef({ person: false, group: false });

  useEffect(() => {
    getCurrentUser()
      .then(() => signedIn())
      .catch(() => {});
    return Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signedIn") signedIn();
      if (payload.event === "signedOut") forgetDevice();
    });
  }, []);

  // On sign-in, this device's work moves into the account; otherwise the most
  // recent person in the account opens here.
  async function signedIn() {
    const attrs = await fetchUserAttributes().catch(() => ({}));
    setUser({ email: attrs.email ?? "" });
    const acct = await cloud.getAccount().catch(() => null);
    setAccount(acct);
    if (!acct) setView("account");
    const local = live.current;
    let list = await cloud.listPeople();
    if (local.profile?.loves?.length && !local.profile.cloudId) {
      const created = await cloud.createPerson(local);
      adoptPerson(created);
      list = [created, ...list];
    } else if (!list.some((p) => p.id === local.profile?.cloudId) && list[0]) {
      adoptPerson(list[0]);
    }
    setPeople(list);
    const saved = await cloud.latestGroup();
    if (local.group?.residents?.length && !local.group.cloudId) {
      adoptGroup(await cloud.createGroup({ group: local.group, kit: local.groupKit, journal: local.groupJournal }));
    } else if (saved) {
      adoptGroup(saved);
    }
  }

  function adoptPerson(p) {
    setProfile(p.profile);
    store.saveProfile(p.profile);
    setKit(p.kit);
    store.saveKit(p.kit);
    setJournal(p.journal);
    store.saveJournal(p.journal);
    setTimeline(p.timeline);
    store.saveTimeline(p.timeline);
  }

  function adoptGroup(g) {
    setGroup(g.group);
    store.saveGroup(g.group);
    setGroupKit(g.kit);
    store.saveGroupKit(g.kit);
    setGroupJournal(g.journal);
    store.saveGroupJournal(g.journal);
  }

  // Signed out or deleted: nothing personal stays on this device.
  function forgetDevice() {
    setUser(null);
    setAccount(null);
    setPeople([]);
    adoptPerson({ profile: EMPTY, kit: null, journal: [], timeline: null });
    adoptGroup({ group: NO_GROUP, kit: null, journal: [] });
    setView("home");
  }

  // Keep the cloud copy of the open person and group up to date.
  useEffect(() => {
    if (!user || !profile.loves?.length) return;
    const data = { profile, kit, journal, timeline };
    if (!profile.cloudId) {
      if (creating.current.person) return;
      creating.current.person = true;
      cloud
        .createPerson(data)
        .then((p) => {
          setProfile((cur) => {
            const next = { ...cur, cloudId: p.id };
            store.saveProfile(next);
            return next;
          });
          setPeople((list) => [p, ...list]);
        })
        .catch((err) => console.error("Couldn't save to your account", err))
        .finally(() => (creating.current.person = false));
      return;
    }
    const t = setTimeout(() => cloud.savePerson(profile.cloudId, data).catch((err) => console.error("Couldn't save", err)), 800);
    return () => clearTimeout(t);
  }, [user, profile, kit, journal, timeline]);

  useEffect(() => {
    if (!user || !group.residents?.length) return;
    const data = { group, kit: groupKit, journal: groupJournal };
    if (!group.cloudId) {
      if (creating.current.group) return;
      creating.current.group = true;
      cloud
        .createGroup(data)
        .then((g) => changeGroup({ ...group, cloudId: g.id }))
        .catch((err) => console.error("Couldn't save the group", err))
        .finally(() => (creating.current.group = false));
      return;
    }
    const t = setTimeout(() => cloud.saveGroup(group.cloudId, data).catch((err) => console.error("Couldn't save", err)), 800);
    return () => clearTimeout(t);
  }, [user, group, groupKit, groupJournal]);

  async function openAccount() {
    setView("account");
    if (user) setPeople(await cloud.listPeople().catch(() => people));
  }

  async function chooseKind(choice) {
    const acct = await cloud.createAccount(choice);
    setAccount(acct);
    if (acct.kind === "carehome" && !group.name) changeGroup({ ...group, name: acct.orgName });
    setView(acct.kind === "carehome" ? "account" : kit ? "kit" : "home");
  }

  async function deleteAll() {
    await cloud.deleteEverything();
    await deleteUser();
    forgetDevice();
  }

  // Runs an agent job, streaming its steps to the Building view.
  async function run(title, back, job, done) {
    setBuild({ steps: [], error: "", title, back });
    setView("building");
    window.scrollTo({ top: 0 });
    try {
      const result = await job((message) => setBuild((b) => ({ ...b, steps: [...b.steps, message] })));
      done(result);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setBuild((b) => ({ ...b, error: err.message }));
    }
  }

  function start({ fresh, ...p }) {
    if (fresh) {
      setJournal([]);
      store.saveJournal([]);
      setTimeline(null);
      store.saveTimeline(null);
    }
    store.saveProfile(p);
    setProfile(p);
    // The name never leaves the device: only taste seeds are sent.
    run(
      `Preparing a session${p.name ? ` for ${p.name}` : ""}`,
      "home",
      (onStep) =>
        buildKit({ region: p.region, era: p.era, loves: p.loves, learned: p.learned, shown: p.shown, portrait: p.portrait?.loves }, onStep),
      (result) => {
        setKit(result);
        store.saveKit(result);
        setView("kit");
      },
    );
  }

  function openTimeline() {
    const key = `${profile.region}|${profile.era}|${profile.loves.join()}`;
    if (timeline?.key === key) return setView("timeline");
    run(
      `Gathering ${profile.name ? `${profile.name}’s` : "their"} world`,
      "kit",
      (onStep) => buildTimeline({ region: profile.region, era: profile.era, loves: profile.loves, learned: profile.learned }, onStep),
      (result) => {
        const t = { ...result, key };
        setTimeline(t);
        store.saveTimeline(t);
        setView("timeline");
      },
    );
  }

  // The weekly loop: what lit them up becomes a Qloo signal (and a favourite to
  // return to), what didn't land is left out, and films already shown make way
  // for new ones. Familiar songs may come back; that's part of reminiscence.
  // The moods and genres their hits share become their taste portrait.
  function finishSession(entry) {
    const next = [entry, ...journal].slice(0, 50);
    setJournal(next);
    store.saveJournal(next);
    const hits = entry.items.filter((i) => i.reaction === "lit").map((i) => ({ ...i, date: entry.date }));
    const learned = [...hits, ...(profile.learned ?? [])].filter((x, i, all) => all.findIndex((y) => y.id === x.id) === i).slice(0, 8);
    const setAside = entry.items.filter((i) => i.reaction === "none").map((i) => i.id);
    const shown = [...new Set([...kit.films.map((f) => f.id), ...setAside, ...(profile.shown ?? [])])].slice(0, 40);
    const updated = { ...profile, learned, shown, portrait: computePortrait(next) };
    setProfile(updated);
    store.saveProfile(updated);
    const done = { ...kit, logged: true };
    setKit(done);
    store.saveKit(done);
    setView("kit");
    window.scrollTo({ top: 0 });
  }

  function newPerson() {
    // Signed-in carers keep everyone in their account, so nothing is lost.
    if (!user && journal.length && !window.confirm("Start with someone new? This clears the current journal on this device.")) return;
    setProfile(EMPTY);
    store.saveProfile(EMPTY);
    setKit(null);
    store.saveKit(null);
    setJournal([]);
    store.saveJournal([]);
    setTimeline(null);
    store.saveTimeline(null);
    setView("home");
  }

  function changeGroup(g) {
    setGroup(g);
    store.saveGroup(g);
  }

  function startGroup() {
    setGroupSaved("");
    run(
      `Preparing a group session${group.name ? ` for ${group.name}` : ""}`,
      "groupSetup",
      (onStep) => buildGroup(group.residents, onStep),
      (result) => {
        setGroupKit(result);
        store.saveGroupKit(result);
        setView("groupKit");
      },
    );
  }

  function finishGroupSession(entry) {
    const next = [entry, ...groupJournal].slice(0, 50);
    setGroupJournal(next);
    store.saveGroupJournal(next);
    setGroupSaved(entry.sparked.length ? `${entry.sparked.join(", ")} lit up the room.` : "A quiet session, noted.");
    setView("groupKit");
    window.scrollTo({ top: 0 });
  }

  if (view === "session" && kit) {
    return (
      <Session
        kit={kit}
        name={profile.name}
        favourites={kit.logged ? [] : (profile.learned ?? [])}
        onClose={() => setView("kit")}
        onFinish={finishSession}
      />
    );
  }
  if (view === "groupSession" && groupKit) {
    return <Session kit={groupKit} name={group.name || "the group"} group onClose={() => setView("groupKit")} onFinish={finishGroupSession} />;
  }

  const inGroup = view === "groupSetup" || view === "groupKit";
  return (
    <div className="app">
      <header className="masthead">
        <button className="wordmark" onClick={() => setView(kit ? "kit" : "home")}>
          <span className="mark" aria-hidden="true" />
          Reminisce
        </button>
        {view === "kit" && (
          <nav className="masthead-actions">
            <button className="ghost" onClick={() => setView("home")}>
              Edit details
            </button>
            <button className="ghost" onClick={newPerson}>
              New person
            </button>
          </nav>
        )}
        {(inGroup || view === "timeline" || view === "account") && (
          <nav className="masthead-actions">
            <button className="ghost" onClick={() => setView(kit ? "kit" : "home")}>
              {kit ? `Back to ${profile.name || "your person"}` : "Home"}
            </button>
          </nav>
        )}
        {view !== "account" && (
          <button className="account-button" onClick={openAccount}>
            {user ? (careHome ? "Residents" : "Your people") : "Sign in"}
          </button>
        )}
      </header>

      <main>
        {view === "home" && (
          <Home
            initial={profile}
            onSubmit={start}
            onGroup={() => setView(groupKit ? "groupKit" : "groupSetup")}
            onAccount={openAccount}
            signedIn={Boolean(user)}
          />
        )}
        {view === "building" && (
          <Building title={build.title} steps={build.steps} error={build.error} onBack={() => setView(build.back)} />
        )}
        {view === "kit" && kit && (
          <Kit
            kit={kit}
            profile={profile}
            journal={journal}
            onBegin={() => setView("session")}
            onNext={() => start(profile)}
            onTimeline={openTimeline}
            timelineYears={timelineYears(profile.era)}
          />
        )}
        {view === "timeline" && timeline && <Timeline timeline={timeline} name={profile.name} onBack={() => setView("kit")} />}
        {view === "groupSetup" && <GroupSetup group={group} people={people} onChange={changeGroup} onSubmit={startGroup} />}
        {view === "account" && (
          <Account
            user={user}
            account={account}
            onChooseKind={chooseKind}
            people={people}
            currentId={profile.cloudId}
            onOpen={(p) => {
              adoptPerson(p);
              setView(p.kit ? "kit" : "home");
            }}
            onAdd={() => {
              newPerson();
              setView("home");
            }}
            onSignOut={() => signOut()}
            onDeleteAll={deleteAll}
          />
        )}
        {view === "groupKit" && groupKit && (
          <GroupKit
            kit={groupKit}
            group={group}
            journal={groupJournal}
            saved={groupSaved}
            onBegin={() => setView("groupSession")}
            onEdit={() => setView("groupSetup")}
            onRebuild={startGroup}
          />
        )}
      </main>

      <footer className="colophon">
        <p>
          Suggestions describe what people with similar tastes tend to enjoy, not facts about any one person.
          Taste data from <a href="https://www.qloo.com" target="_blank" rel="noreferrer">Qloo</a>.
        </p>
      </footer>
    </div>
  );
}
