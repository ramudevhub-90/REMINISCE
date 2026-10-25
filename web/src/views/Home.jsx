import { useState } from "react";
import { PERSONAS } from "../personas.js";

export default function Home({ initial, onSubmit, onGroup }) {
  const [form, setForm] = useState(initial);
  const [draft, setDraft] = useState("");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function addLove() {
    const v = draft.trim();
    if (!v || form.loves.length >= 5 || form.loves.includes(v)) return;
    setForm({ ...form, loves: [...form.loves, v] });
    setDraft("");
  }

  function submit(e) {
    e.preventDefault();
    const loves = draft.trim() && form.loves.length < 5 ? [...form.loves, draft.trim()] : form.loves;
    setDraft("");
    // A different person (name, place or decade) starts the learning afresh;
    // adding or removing loves keeps what past sessions taught us.
    const same = form.name === initial.name && form.region === initial.region && form.era === initial.era;
    if (loves.length) onSubmit({ ...form, loves, ...(same ? {} : { learned: [], shown: [], fresh: true }) });
  }

  return (
    <div className="home">
      <section className="hero">
        <p className="eyebrow">For people caring for someone with dementia</p>
        <h1>
          Small, familiar joys,
          <br />
          <em>chosen for them.</em>
        </h1>
        <p className="lede">
          Tell us where they grew up and a few things they’ve always loved. Reminisce uses Qloo’s taste graph to find the
          songs, films and food their generation cherished, and turns them into a gentle session you can share today.
        </p>
      </section>

      <section className="steps-strip" aria-label="How it works">
        <div>
          <span className="step-no">1</span>
          <p>Share a few things they love</p>
        </div>
        <div>
          <span className="step-no">2</span>
          <p>We find what people with the same tastes cherish</p>
        </div>
        <div>
          <span className="step-no">3</span>
          <p>Enjoy a session together and note what sparked</p>
        </div>
      </section>

      <section className="personas" aria-labelledby="try-heading">
        <h2 id="try-heading" className="section-label">
          Try it with someone
        </h2>
        <div className="persona-row">
          {PERSONAS.map((p) => (
            <button key={p.name} className="persona" onClick={() => onSubmit({ ...p, learned: [], shown: [], fresh: true })}>
              <span className="persona-initial" aria-hidden="true">
                {p.name[0]}
              </span>
              <span>
                <strong>{p.name}</strong>
                <span className="persona-blurb">{p.blurb}</span>
                <span className="persona-loves">{p.loves.join(" · ")}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="group-callout">
        <div>
          <h2 className="section-label">Running a group in a care home?</h2>
          <p className="muted">
            Add the residents joining today. Reminisce finds the songs and films the most of them are likely to share.
          </p>
        </div>
        <button className="secondary" onClick={onGroup}>
          Plan a group session
        </button>
      </section>

      <form className="paper form" onSubmit={submit}>
        <h2 className="section-label">Or tell us about your person</h2>
        <label className="field">
          <span>What do you call them?</span>
          <input value={form.name} onChange={set("name")} placeholder="Baba, Mum, Mr Iyer…" autoComplete="off" />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Where they grew up</span>
            <input value={form.region} onChange={set("region")} placeholder="Kolkata" />
          </label>
          <label className="field field-narrow">
            <span>Roughly when</span>
            <input value={form.era} onChange={set("era")} placeholder="1960s" />
          </label>
        </div>
        <label className="field">
          <span>Things they’ve always loved</span>
          <small>Singers, songs, films, dishes or places. Three to five is ideal.</small>
          <div className="adder">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLove())}
              placeholder="Kishore Kumar"
            />
            <button type="button" className="secondary" onClick={addLove} disabled={!draft.trim() || form.loves.length >= 5}>
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
        <button className="primary" disabled={!form.loves.length && !draft.trim()}>
          Prepare a session
        </button>
        <p className="privacy">
          Their name stays on this device. Only the things they love, the place and the decade are used to search Qloo.
        </p>
      </form>
    </div>
  );
}
