import { useState } from "react";
import EmailCode from "./EmailCode.jsx";

// Guests see sign-in / create account. Signed-in carers see their people,
// can switch between them or add someone new, sign out, or delete everything.
export default function Account({
  user,
  account,
  accountLoaded,
  onRetry,
  people,
  currentId,
  onChooseKind,
  onOpen,
  onAdd,
  onImport,
  onSignOut,
  onDeleteAll,
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [orgName, setOrgName] = useState(account?.orgName ?? "");
  const [kind, setKind] = useState(account?.kind ?? "");
  const [choosing, setChoosing] = useState(false);
  const [kindError, setKindError] = useState("");
  const careHome = account?.kind === "carehome";

  async function saveKind(e) {
    e.preventDefault();
    if (!kind) return setKindError("Choose one to continue.");
    if (kind === "carehome" && !orgName.trim()) return setKindError("Add the name of your care home.");
    setBusy(true);
    setKindError("");
    try {
      await onChooseKind({ kind, orgName: kind === "carehome" ? orgName.trim() : "" });
      setChoosing(false);
    } catch (err) {
      setKindError(err.message || "Couldn’t save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <div className="auth-page">
        <span className="mark auth-mark" aria-hidden="true" />
        <h1>Sign in to Reminisce</h1>
        <p className="muted">New here? The same steps create your free account.</p>
        <EmailCode />
        <p className="muted small auth-note">
          Your people, journals and favourites are saved privately to your account and follow you to any device.
        </p>
      </div>
    );
  }

  if (!accountLoaded && !choosing) {
    return (
      <div className="auth-page">
        <span className="mark auth-mark" aria-hidden="true" />
        <h1>Loading your account…</h1>
        <p className="muted">This takes a moment.</p>
        <button className="link" onClick={onRetry}>
          Taking too long? Try again
        </button>
      </div>
    );
  }

  // First visit after signing up (or "Change account type"): family or care home?
  if (!account || choosing) {
    return (
      <div className="account">
        <section className="hero compact">
          <p className="eyebrow">{account ? "Account type" : "Welcome"}</p>
          <h1>Who are you caring for?</h1>
          <p className="lede">This shapes how Reminisce is set up for you. You can change it later.</p>
        </section>
        <form className="kind-form" onSubmit={saveKind}>
          <div className="kind-cards" role="radiogroup" aria-label="Who are you caring for?">
            <label className={`kind-card ${kind === "family" ? "selected" : ""}`}>
              <input type="radio" name="kind" value="family" checked={kind === "family"} onChange={() => setKind("family")} />
              <strong>A family member</strong>
              <span>For a parent, grandparent or partner. Keep each person’s journal, favourites and portrait.</span>
            </label>
            <label className={`kind-card ${kind === "carehome" ? "selected" : ""}`}>
              <input type="radio" name="kind" value="carehome" checked={kind === "carehome"} onChange={() => setKind("carehome")} />
              <strong>Residents in a care home</strong>
              <span>Keep every resident’s profile in one place and run group sessions for the lounge.</span>
            </label>
          </div>
          {kind === "carehome" && (
            <label className="field kind-org">
              <span>Name of your care home</span>
              <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Sunrise Care Home" autoFocus />
            </label>
          )}
          {kindError && <p className="error">{kindError}</p>}
          <div className="account-actions">
            <button className="primary" disabled={busy || !kind}>
              {busy ? "Saving…" : "Continue"}
            </button>
            {account ? (
              <button type="button" className="ghost" onClick={() => setChoosing(false)}>
                Cancel
              </button>
            ) : (
              <button type="button" className="ghost" onClick={onSignOut}>
                Sign out
              </button>
            )}
          </div>
        </form>
      </div>
    );
  }

  async function deleteAll() {
    setBusy(true);
    try {
      await onDeleteAll();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="account">
      <section className="hero compact">
        <p className="eyebrow">{careHome ? account.orgName : "Your account"}</p>
        <h1>{careHome ? "Residents" : "Your people"}</h1>
        <p className="lede">
          {careHome
            ? "Each resident keeps their own journal, favourites and taste portrait. Group sessions can draw on all of them."
            : "Each person keeps their own journal, favourites and taste portrait. Open one to continue."}
        </p>
      </section>

      <div className="account-actions top">
        <button className="primary" onClick={onAdd}>
          + {careHome ? "Add a resident" : "Add someone"}
        </button>
        {careHome && (
          <button className="secondary" onClick={onImport}>
            Import residents
          </button>
        )}
      </div>

      <ul className="residents people-list">
        {people.map((p) => (
          <li key={p.id} className={`resident ${p.id === currentId ? "current" : ""}`}>
            <span className="persona-initial" aria-hidden="true">
              {(p.name || "?")[0]}
            </span>
            <div>
              <strong>{p.name || "Someone"}</strong>
              <span className="muted">
                {[p.profile?.region, p.profile?.era].filter(Boolean).join(" · ")}
                {p.journal?.length ? ` · ${p.journal.length} ${p.journal.length === 1 ? "session" : "sessions"}` : ""}
              </span>
            </div>
            {p.id === currentId ? (
              <span className="muted small">Open now</span>
            ) : (
              <button className="secondary" onClick={() => onOpen(p)}>
                Open
              </button>
            )}
          </li>
        ))}
        {!people.length && <li className="muted">{careHome ? "No residents yet. Add your first resident." : "No one saved yet. Add someone to begin."}</li>}
      </ul>

      <div className="account-actions">
        <span className="muted small">Signed in as {user.email}</span>
        <button className="ghost" onClick={() => setChoosing(true)}>
          Change account type
        </button>
        <button className="ghost" onClick={onSignOut}>
          Sign out
        </button>
      </div>

      <section className="danger-zone">
        <h2 className="section-label">Delete my data</h2>
        <p className="muted">Removes every person, journal and group saved to this account, and the account itself.</p>
        {confirming ? (
          <div className="account-actions">
            <button className="danger" onClick={deleteAll} disabled={busy}>
              {busy ? "Deleting…" : "Yes, delete everything"}
            </button>
            <button className="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Keep my data
            </button>
          </div>
        ) : (
          <button className="secondary" onClick={() => setConfirming(true)}>
            Delete my data…
          </button>
        )}
      </section>
    </div>
  );
}
