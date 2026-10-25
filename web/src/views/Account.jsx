import { useState } from "react";
import EmailCode from "./EmailCode.jsx";

// Guests see sign-in / create account. Signed-in carers see their people,
// can switch between them or add someone new, sign out, or delete everything.
export default function Account({ user, account, people, currentId, onChooseKind, onOpen, onAdd, onImport, onSignOut, onDeleteAll }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [orgName, setOrgName] = useState("");
  const careHome = account?.kind === "carehome";

  if (!user) {
    return (
      <div className="account">
        <section className="hero compact">
          <p className="eyebrow">Your account</p>
          <h1>
            Keep what you learn, <em>on every device.</em>
          </h1>
          <p className="lede">
            With an account, each person’s journal, favourites and taste portrait are saved securely, so only you can see
            them. Anything you’ve already done on this device comes with you.
          </p>
        </section>
        <div className="auth-box">
          <EmailCode />
        </div>
      </div>
    );
  }

  // First visit after signing up: family carer, or a care home?
  if (!account) {
    return (
      <div className="account">
        <section className="hero compact">
          <p className="eyebrow">Welcome</p>
          <h1>Who are you caring for?</h1>
          <p className="lede">This shapes how Reminisce is set up for you. You can still add more people later.</p>
        </section>
        <div className="kind-cards">
          <button className="kind-card" onClick={() => onChooseKind({ kind: "family" })}>
            <strong>A family member</strong>
            <span>For a parent, grandparent or partner. Keep each person’s journal, favourites and portrait.</span>
          </button>
          <div className="kind-card">
            <strong>Residents in a care home</strong>
            <span>Keep every resident’s profile in one place and run group sessions for the lounge.</span>
            <label className="field">
              <span>Name of your care home</span>
              <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Sunrise Care Home" />
            </label>
            <button className="primary" disabled={!orgName.trim()} onClick={() => onChooseKind({ kind: "carehome", orgName: orgName.trim() })}>
              Set up our care home
            </button>
          </div>
        </div>
        <div className="account-actions">
          <button className="ghost" onClick={onSignOut}>
            Sign out
          </button>
        </div>
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
