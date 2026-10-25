import { useState } from "react";

// The short form signed-in carers use to add someone or edit their details.
// noun: "resident" for care homes, "person" for families.
export default function PersonForm({ initial, mode, noun, careHome, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const adding = mode === "new";

  function addLove() {
    const v = draft.trim();
    if (!v || form.loves.length >= 5 || form.loves.includes(v)) return;
    setForm({ ...form, loves: [...form.loves, v] });
    setDraft("");
  }

  async function save(prepare) {
    const loves = draft.trim() && form.loves.length < 5 ? [...form.loves, draft.trim()] : form.loves;
    if (!form.name.trim()) return setError(`Add the ${noun}’s name.`);
    if (!loves.length) return setError("Add at least one thing they love.");
    setBusy(true);
    setError("");
    try {
      await onSave({ ...form, name: form.name.trim(), loves }, { prepare });
    } catch (err) {
      setError(err.message || "Couldn’t save. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="person-form">
      <p className="eyebrow">{adding ? (careHome ? "New resident" : "Someone new") : "Edit details"}</p>
      <h1>{adding ? `Add a ${noun}` : form.name || "Edit details"}</h1>

      <form className="paper form" onSubmit={(e) => (e.preventDefault(), save(!careHome || !adding))}>
        <label className="field">
          <span>Name</span>
          <input value={form.name} onChange={set("name")} placeholder={careHome ? "Mrs Sen" : "Baba"} autoComplete="off" autoFocus={adding} />
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
        {error && <p className="error">{error}</p>}
        <div className="account-actions">
          {careHome && adding ? (
            <>
              <button className="primary" disabled={busy}>
                {busy ? "Saving…" : "Save resident"}
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => save(true)}>
                Save and prepare a session
              </button>
            </>
          ) : (
            <button className="primary" disabled={busy}>
              {busy ? "Preparing…" : adding ? "Save and prepare a session" : "Save and refresh the session"}
            </button>
          )}
          <button type="button" className="ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
