import { useState } from "react";
import { buildKit } from "./api.js";
import { loadProfile, saveProfile } from "./storage.js";

const EXAMPLE = { name: "Baba", region: "Kolkata", era: "1960s", loves: ["Kishore Kumar", "Fish curry", "Guide (1965)"] };

export default function App() {
  const [profile, setProfile] = useState(() => loadProfile() ?? { name: "", region: "", era: "", loves: [] });
  const [kit, setKit] = useState(null);
  const [status, setStatus] = useState({ loading: false, error: "", steps: [] });

  async function build(p) {
    saveProfile(p);
    setProfile(p);
    setStatus({ loading: true, error: "", steps: [] });
    try {
      // The name never leaves the device: only taste seeds are sent.
      const result = await buildKit({ region: p.region, era: p.era, loves: p.loves }, (message) =>
        setStatus((s) => ({ ...s, steps: [...s.steps, message] })),
      );
      setKit(result);
      setStatus({ loading: false, error: "", steps: [] });
      window.scrollTo({ top: 0 });
    } catch (err) {
      setStatus({ loading: false, error: err.message, steps: [] });
    }
  }

  return (
    <div className="app">
      <header className="top">
        <span className="logo" aria-hidden="true" />
        <span className="brand">Reminisce</span>
        {kit && (
          <button className="link" onClick={() => setKit(null)}>
            Edit profile
          </button>
        )}
      </header>
      <main>
        {kit ? (
          <Kit kit={kit} name={profile.name} />
        ) : (
          <Onboarding initial={profile} onSubmit={build} status={status} />
        )}
      </main>
      <footer className="foot">
        Suggestions describe what people with similar tastes tend to enjoy, not facts about any one person.
      </footer>
    </div>
  );
}

function Onboarding({ initial, onSubmit, status }) {
  const [form, setForm] = useState(initial);
  const [draft, setDraft] = useState("");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function addLove() {
    const v = draft.trim();
    if (!v || form.loves.length >= 5 || form.loves.includes(v)) return;
    setForm({ ...form, loves: [...form.loves, v] });
    setDraft("");
  }

  const submit = (e) => {
    e.preventDefault();
    const loves = draft.trim() && form.loves.length < 5 ? [...form.loves, draft.trim()] : form.loves;
    setDraft("");
    onSubmit({ ...form, loves });
  };

  return (
    <form className="card stack" onSubmit={submit}>
      <div>
        <h1>Who are we remembering with?</h1>
        <p className="muted">A few details are enough. Everything you type stays on this device.</p>
      </div>
      <label>
        Their name or what you call them
        <input value={form.name} onChange={set("name")} placeholder="e.g. Baba, Mum, Mr Iyer" autoComplete="off" />
      </label>
      <div className="row">
        <label>
          Where they grew up
          <input value={form.region} onChange={set("region")} placeholder="e.g. Kolkata" />
        </label>
        <label className="narrow">
          Roughly when
          <input value={form.era} onChange={set("era")} placeholder="e.g. 1960s" />
        </label>
      </div>
      <label>
        Things they love <span className="muted">(3–5: songs, singers, films, dishes, places)</span>
        <div className="adder">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLove())}
            placeholder="e.g. Kishore Kumar"
          />
          <button type="button" className="secondary" onClick={addLove} disabled={!draft.trim()}>
            Add
          </button>
        </div>
      </label>
      {form.loves.length > 0 && (
        <ul className="chips">
          {form.loves.map((l) => (
            <li key={l}>
              {l}
              <button
                type="button"
                aria-label={`Remove ${l}`}
                onClick={() => setForm({ ...form, loves: form.loves.filter((x) => x !== l) })}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {status.loading && status.steps.length > 0 && (
        <ol className="progress" aria-live="polite">
          {status.steps.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ol>
      )}
      {status.error && <p className="error">{status.error}</p>}
      <button className="primary" disabled={status.loading || (!form.loves.length && !draft.trim())}>
        {status.loading ? "Building the session kit…" : "Build a session kit"}
      </button>
      {!form.loves.length && (
        <button type="button" className="link" onClick={() => setForm(EXAMPLE)}>
          Try an example
        </button>
      )}
    </form>
  );
}

function Kit({ kit, name }) {
  return (
    <div className="stack">
      {kit.source === "sample" && (
        <p className="banner">Sample data: live Qloo results will replace these once the event key is connected.</p>
      )}
      <section className="card">
        <h1>Today’s session{name ? ` with ${name}` : ""}</h1>
        <p className="muted">Built from: {kit.seeds.map((s) => s.name).join(" · ")}</p>
      </section>
      <Section title="Playlist" hint="Start with music. It often reaches furthest.">
        {kit.playlist.map((item) => (
          <Item key={item.id} item={item} />
        ))}
      </Section>
      <Section title="Film clips" hint="A short scene or song is plenty.">
        {kit.films.map((item) => (
          <Item key={item.id} item={item} />
        ))}
      </Section>
      <Section title={kit.food.title} hint={kit.food.why}>
        {kit.food.places.map((item) => (
          <Item key={item.id} item={item} />
        ))}
      </Section>
      <section className="card">
        <h2>Conversation prompts</h2>
        <ol className="prompts">
          {kit.prompts.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>
      </section>
      <details className="card trace">
        <summary>How the agent built this ({kit.trace.length} steps)</summary>
        <ol>
          {kit.trace.map((t, i) => (
            <li key={i}>
              {t.label}
              {t.found ? ` → ${t.found}` : ""}
              {t.count !== undefined ? ` → ${t.count} results` : ""}
              <code>{t.request}</code>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {hint && <p className="muted">{hint}</p>}
      <ul className="items">{children}</ul>
    </section>
  );
}

function Item({ item }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="item">
      <div className="item-head">
        <div>
          <strong>{item.name}</strong>
          {item.year && <span className="muted"> ({item.year})</span>}
          {item.tags.length > 0 && <div className="tags">{item.tags.join(" · ")}</div>}
        </div>
        <button className="why-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
          Why this?
        </button>
      </div>
      {open && (
        <div className="why">
          <p>{item.why.statement}</p>
          {item.why.affinity !== undefined && (
            <p className="muted">
              Qloo affinity score: {item.why.affinity.toFixed(2)} (how strongly this audience leans towards it)
            </p>
          )}
          <code>{item.why.request}</code>
        </div>
      )}
    </li>
  );
}
