import { useState } from "react";
import { buildKit } from "./api.js";
import { loadJournal, loadKit, loadProfile, saveJournal, saveKit, saveProfile } from "./storage.js";
import Home from "./views/Home.jsx";
import Building from "./views/Building.jsx";
import Kit from "./views/Kit.jsx";
import Session from "./views/Session.jsx";

const EMPTY = { name: "", region: "", era: "", loves: [], learned: [], shown: [] };



export default function App() {
  const [profile, setProfile] = useState(() => loadProfile() ?? EMPTY);
  const [kit, setKit] = useState(() => loadKit());
  const [journal, setJournal] = useState(() => loadJournal());
  const [view, setView] = useState(() => (loadKit() ? "kit" : "home"));
  const [build, setBuild] = useState({ steps: [], error: "" });

  async function start({ fresh, ...p }) {
    if (fresh) {
      setJournal([]);
      saveJournal([]);
    }
    saveProfile(p);
    setProfile(p);
    setBuild({ steps: [], error: "" });
    setView("building");
    window.scrollTo({ top: 0 });
    try {
      // The name never leaves the device: only taste seeds are sent.
      const result = await buildKit({ region: p.region, era: p.era, loves: p.loves, learned: p.learned, shown: p.shown }, (message) =>
        setBuild((b) => ({ ...b, steps: [...b.steps, message] })),
      );
      setKit(result);
      saveKit(result);
      setView("kit");
    } catch (err) {
      setBuild((b) => ({ ...b, error: err.message }));
    }
  }

  // The weekly loop: what lit them up becomes a Qloo signal (and a favourite to
  // return to), what didn't land is left out, and films already shown make way
  // for new ones. Familiar songs may come back; that's part of reminiscence.
  function finishSession(entry) {
    const next = [entry, ...journal].slice(0, 50);
    setJournal(next);
    saveJournal(next);
    const hits = entry.items.filter((i) => i.reaction === "lit").map((i) => ({ ...i, date: entry.date }));
    const learned = [...hits, ...(profile.learned ?? [])].filter((x, i, all) => all.findIndex((y) => y.id === x.id) === i).slice(0, 8);
    const setAside = entry.items.filter((i) => i.reaction === "none").map((i) => i.id);
    const shown = [...new Set([...kit.films.map((f) => f.id), ...setAside, ...(profile.shown ?? [])])].slice(0, 40);
    const done = { ...kit, logged: true };
    setKit(done);
    saveKit(done);
    const updated = { ...profile, learned, shown };
    setProfile(updated);
    saveProfile(updated);
    setView("kit");
    window.scrollTo({ top: 0 });
  }

  function newPerson() {
    if (journal.length && !window.confirm("Start with someone new? This clears the current journal on this device.")) return;
    setProfile(EMPTY);
    saveProfile(EMPTY);
    setKit(null);
    saveKit(null);
    setJournal([]);
    saveJournal([]);
    setView("home");
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
      </header>

      <main>
        {view === "home" && <Home initial={profile} onSubmit={start} />}
        {view === "building" && (
          <Building name={profile.name} steps={build.steps} error={build.error} onBack={() => setView("home")} />
        )}
        {view === "kit" && kit && (
          <Kit kit={kit} profile={profile} journal={journal} onBegin={() => setView("session")} onNext={() => start(profile)} />
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
