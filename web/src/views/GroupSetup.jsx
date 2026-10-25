import { useState } from "react";
import { DEMO_GROUP } from "../personas.js";

const BLANK = { name: "", region: "", era: "", loves: [] };

// Who's in the lounge today. Signed-in care homes tick residents from their
// list; guests type them in (names stay on this device).
export default function GroupSetup({ signedIn, ...props }) {
  return signedIn ? <PickResidents {...props} /> : <GuestSetup {...props} />;
}

function GuestSetup({ group, onChange, onSubmit }) {
  const [form, setForm] = useState({ ...BLANK, region: group.residents.at(-1)?.region ?? "" });
  const [draft, setDraft] = useState("");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function addLove() {
    const v = draft.trim();
    if (!v || form.loves.length >= 5 || form.loves.includes(v)) return;
    setForm({ ...form, loves: [...form.loves, v] });
    setDraft("");
  }

  function addResident(e) {
    e.preventDefault();
    const loves = draft.trim() && form.loves.length < 5 ? [...form.loves, draft.trim()] : form.loves;
    if (!loves.length) return;
    onChange({ ...group, residents: [...group.residents, { ...form, name: form.name.trim() || `Resident ${group.residents.length + 1}`, loves }] });
    setForm({ ...BLANK, region: form.region, era: form.era });
    setDraft("");
  }

  const remove = (i) => onChange({ ...group, residents: group.residents.filter((_, j) => j !== i) });
  const ready = group.residents.length >= 2;

  return (
    <div className="group-setup">
      <section className="hero compact">
        <p className="eyebrow">Group session</p>
        <h1>
          One session, <em>a whole lounge.</em>
        </h1>
        <p className="lede">
          Add the residents joining today. Reminisce expands each person’s tastes through Qloo and finds the songs and films
          the most of them are likely to share.
        </p>
      </section>

      {!group.residents.length && (
        <button className="persona demo-group" onClick={() => onChange(DEMO_GROUP)}>
          <span className="persona-initial" aria-hidden="true">
            S
          </span>
          <span>
            <strong>Try: {DEMO_GROUP.name}</strong>
            <span className="persona-blurb">{DEMO_GROUP.residents.length} residents who grew up in and around Kolkata</span>
          </span>
        </button>
      )}

      <label className="field group-name">
        <span>Group or care home</span>
        <input value={group.name} onChange={(e) => onChange({ ...group, name: e.target.value })} placeholder="Sunrise Care Home, Ward B" />
      </label>

      {group.residents.length > 0 && (
        <ul className="residents">
          {group.residents.map((r, i) => (
            <li key={i} className="resident">
              <span className="persona-initial" aria-hidden="true">
                {r.name[0]}
              </span>
              <div>
                <strong>{r.name}</strong>
                <span className="muted">{[r.region, r.era].filter(Boolean).join(" · ")}</span>
                <span className="persona-loves">{r.loves.join(" · ")}</span>
              </div>
              <button className="ghost" onClick={() => remove(i)} aria-label={`Remove ${r.name}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="paper form" onSubmit={addResident}>
        <h2 className="section-label">Add a resident</h2>
        <label className="field">
          <span>Name</span>
          <input value={form.name} onChange={set("name")} placeholder="Mrs Sen" autoComplete="off" />
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
          <div className="adder">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLove())}
              placeholder="Hemanta Mukherjee"
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
                <button type="button" aria-label={`Remove ${l}`} onClick={() => setForm({ ...form, loves: form.loves.filter((x) => x !== l) })}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <button className="secondary" disabled={!form.loves.length && !draft.trim()}>
          Add resident
        </button>
      </form>

      <div className="group-go">
        <button className="primary large" disabled={!ready} onClick={onSubmit}>
          Prepare the group session
        </button>
        {!ready && <p className="muted small">Add at least two residents.</p>}
      </div>
    </div>
  );
}

function PickResidents({ group, people = [], onAddResident, onChange, onSubmit }) {
  const residents = people.filter((p) => p.profile?.loves?.length);
  const inGroup = (p) => group.residents.some((r) => r.personId === p.id);
  const toggle = (p) =>
    onChange({
      ...group,
      residents: inGroup(p)
        ? group.residents.filter((r) => r.personId !== p.id)
        : [...group.residents, { personId: p.id, name: p.name, region: p.profile.region, era: p.profile.era, loves: p.profile.loves }],
    });
  const count = group.residents.length;

  return (
    <div className="group-setup">
      <section className="hero compact">
        <p className="eyebrow">Group session{group.name ? ` · ${group.name}` : ""}</p>
        <h1>Who’s joining today?</h1>
        <p className="lede">Tick the residents in the lounge. Reminisce finds the songs and films the most of them are likely to share.</p>
      </section>

      <ul className="pick-list paper form">
        {residents.map((p) => (
          <li key={p.id}>
            <label>
              <input type="checkbox" checked={inGroup(p)} onChange={() => toggle(p)} />
              <span>
                <strong>{p.name}</strong>
                <span className="muted">{p.profile.loves.join(" · ")}</span>
              </span>
            </label>
          </li>
        ))}
        {!residents.length && <li className="muted">No residents yet. Add your first resident below.</li>}
      </ul>
      <button className="link" onClick={onAddResident}>
        + Add a new resident
      </button>

      <div className="group-go">
        <button className="primary large" disabled={count < 2} onClick={onSubmit}>
          Prepare the group session{count ? ` for ${count}` : ""}
        </button>
        {count < 2 && <p className="muted small">Tick at least two residents.</p>}
      </div>
    </div>
  );
}
