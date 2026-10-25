import { useState } from "react";
import { buildKit } from "./api.js";
import { loadJournal, loadKit, loadProfile, saveJournal, saveKit, saveProfile } from "./storage.js";
import Home from "./views/Home.jsx";
import Building from "./views/Building.jsx";
import Kit from "./views/Kit.jsx";
import Session from "./views/Session.jsx";

const EMPTY = { name: "", region: "", era: "", loves: [] };

export default function App() {
  const [profile, setProfile] = useState(() => loadProfile() ?? EMPTY);
  const [kit, setKit] = useState(() => loadKit());
  const [journal, setJournal] = useState(() => loadJournal());
  const [view, setView] = useState(() => (loadKit() ? "kit" : "home"));
  const [build, setBuild] = useState({ steps: [], error: "" });

  async function start(p) {
    saveProfile(p);
    setProfile(p);
    setBuild({ steps: [], error: "" });
    setView("building");
    window.scrollTo({ top: 0 });
    try {
      // The name never leaves the device: only taste seeds are sent.
      const result = await buildKit({ region: p.region, era: p.era, loves: p.loves }, (message) =>
        setBuild((b) => ({ ...b, steps: [...b.steps, message] })),
      );
      setKit(result);
      saveKit(result);
      setView("kit");
    } catch (err) {
      setBuild((b) => ({ ...b, error: err.message }));
    }
  }

  function finishSession(entry) {
    const next = [entry, ...journal].slice(0, 50);
    setJournal(next);
    saveJournal(next);
    setView("kit");
  }

  function newPerson() {
    setProfile(EMPTY);
    setKit(null);
    saveKit(null);
    setView("home");
  }

  if (view === "session" && kit) {
    return <Session kit={kit} name={profile.name} onClose={() => setView("kit")} onFinish={finishSession} />;
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
          <Kit kit={kit} profile={profile} journal={journal} onBegin={() => setView("session")} onRebuild={() => start(profile)} />
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
