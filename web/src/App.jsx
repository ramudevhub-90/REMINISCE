import { useState } from "react";
import { buildGroup, buildKit, buildTimeline } from "./api.js";
import { computePortrait } from "./portrait.js";
import * as store from "./storage.js";
import Home from "./views/Home.jsx";
import Building from "./views/Building.jsx";
import Kit from "./views/Kit.jsx";
import Session from "./views/Session.jsx";
import Timeline from "./views/Timeline.jsx";
import GroupSetup from "./views/GroupSetup.jsx";
import GroupKit from "./views/GroupKit.jsx";

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
    if (journal.length && !window.confirm("Start with someone new? This clears the current journal on this device.")) return;
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
        {(inGroup || view === "timeline") && (
          <nav className="masthead-actions">
            <button className="ghost" onClick={() => setView(kit ? "kit" : "home")}>
              {kit ? `Back to ${profile.name || "your person"}` : "Home"}
            </button>
          </nav>
        )}
      </header>

      <main>
        {view === "home" && <Home initial={profile} onSubmit={start} onGroup={() => setView(groupKit ? "groupKit" : "groupSetup")} />}
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
        {view === "groupSetup" && <GroupSetup group={group} onChange={changeGroup} onSubmit={startGroup} />}
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
