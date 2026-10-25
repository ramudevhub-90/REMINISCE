import { useEffect, useState } from "react";
import { playLink } from "../media.js";

export default function Kit({ kit, profile, journal, onBegin, onRebuild }) {
  const [why, setWhy] = useState(null);
  const name = profile.name || "your person";

  return (
    <div className="kit">
      {kit.source === "sample" && (
        <p className="banner">Sample data: live Qloo results will replace these once the event key is connected.</p>
      )}

      <section className="kit-hero">
        <p className="eyebrow">
          {[profile.region, profile.era].filter(Boolean).join(" · ") || "Today’s session"}
        </p>
        <h1>
          A session for <em>{name}</em>
        </h1>
        <p className="seeds">
          Built from what they love: {kit.seeds.map((s) => s.name).join(", ")}
        </p>
        <div className="kit-actions">
          <button className="primary large" onClick={onBegin}>
            Begin the session
          </button>
          <button className="ghost" onClick={onRebuild}>
            Refresh suggestions
          </button>
        </div>
      </section>

      {kit.playlist.length > 0 && (
        <Shelf title="Music" hint="Start here. Familiar songs often reach furthest." items={kit.playlist} onWhy={setWhy} />
      )}
      {kit.films.length > 0 && (
        <Shelf title="Films" hint="A single song or scene is plenty." items={kit.films} onWhy={setWhy} poster />
      )}
      {kit.food && (
        <section className="shelf">
          <header className="shelf-head">
            <h2>{kit.food.title}</h2>
            {kit.food.places.length > 0 && <p className="muted">{kit.food.why}</p>}
          </header>
          {kit.food.places.length > 0 && (
            <ul className="place-list">
              {kit.food.places.map((p) => (
                <li key={p.id}>
                  <div>
                    <strong>{p.name}</strong>
                    {p.tags.length > 0 && <span className="muted">{p.tags.join(" · ")}</span>}
                  </div>
                  <button className="why-link" onClick={() => setWhy(p)}>
                    Why this?
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="shelf">
        <header className="shelf-head">
          <h2>Conversation starters</h2>
        </header>
        <ul className="starters">
          {kit.prompts.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </section>

      {journal.length > 0 && <Journal journal={journal} />}

      <details className="trace">
        <summary>How the agent built this · {kit.trace.length} steps</summary>
        <ol>
          {kit.trace.map((t, i) => (
            <li key={i}>
              <span>
                {t.label}
                {t.found ? ` → ${t.found}` : ""}
                {t.count !== undefined ? ` → ${t.count} results` : ""}
              </span>
              {t.request && <code>{t.request}</code>}
            </li>
          ))}
        </ol>
      </details>

      {why && <WhySheet item={why} name={name} onClose={() => setWhy(null)} />}
    </div>
  );
}

function Shelf({ title, hint, items, onWhy, poster }) {
  return (
    <section className="shelf">
      <header className="shelf-head">
        <h2>{title}</h2>
        {hint && <p className="muted">{hint}</p>}
      </header>
      <ul className={`cards ${poster ? "posters" : ""}`}>
        {items.map((item) => (
          <li key={item.id} className="photo-card">
            <Photo item={item} />
            <div className="photo-meta">
              <strong>{item.name}</strong>
              <span className="muted">{[item.year, ...item.tags.slice(0, 2)].filter(Boolean).join(" · ")}</span>
            </div>
            <div className="photo-actions">
              <PlayLink item={item} />
              <button className="why-link" onClick={() => onWhy(item)}>
                Why this?
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Photo({ item, large }) {
  const [failed, setFailed] = useState(false);
  if (item.image && !failed) {
    return <img className={large ? "photo large" : "photo"} src={item.image} alt="" loading="lazy" onError={() => setFailed(true)} />;
  }
  return (
    <div className={large ? "photo monogram large" : "photo monogram"} aria-hidden="true">
      {item.name.slice(0, 1)}
    </div>
  );
}

export function PlayLink({ item }) {
  const link = playLink(item);
  if (!link) return null;
  return (
    <a className="play" href={link.href} target="_blank" rel="noreferrer">
      {link.label}
    </a>
  );
}

function WhySheet({ item, name, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const affinity = item.why.affinity;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="why-title" onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow">Why this?</p>
        <h2 id="why-title">{item.name}</h2>
        <p className="why-statement">{item.why.statement}</p>
        {affinity !== undefined && (
          <div className="affinity">
            <div className="affinity-bar">
              <span style={{ width: `${Math.round(affinity * 100)}%` }} />
            </div>
            <p className="muted">
              Qloo affinity {affinity.toFixed(2)}: how strongly people with these tastes lean towards it.
            </p>
          </div>
        )}
        <p className="muted small">
          This describes a group of people with similar tastes, not {name} personally. Source:{" "}
          {item.why.source === "live" ? "Qloo Taste AI (live)" : "sample data"}.
        </p>
        <details>
          <summary>The request we sent</summary>
          <code>{item.why.request}</code>
        </details>
        <button className="secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function Journal({ journal }) {
  return (
    <section className="shelf">
      <header className="shelf-head">
        <h2>Journal</h2>
        <p className="muted">What sparked in past sessions. These shape the next one.</p>
      </header>
      <ul className="journal">
        {journal.slice(0, 6).map((entry) => (
          <li key={entry.date}>
            <time>{new Date(entry.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</time>
            <span>
              {entry.sparked.length
                ? `Lit up at ${entry.sparked.join(", ")}`
                : "A quiet session"}
              {entry.note ? ` — “${entry.note}”` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
