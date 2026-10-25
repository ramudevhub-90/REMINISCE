import { useState } from "react";
import { Photo, PlayLink, Shelf, WhySheet } from "./Kit.jsx";

// "Their world": the years they grew up in, five at a time.
export default function Timeline({ timeline, name, onBack }) {
  const [why, setWhy] = useState(null);
  const who = name || "Their";

  return (
    <div className="timeline-view">
      <section className="kit-hero">
        <p className="eyebrow">Their world{timeline.region ? ` · ${timeline.region}` : ""}</p>
        <h1>
          {name ? <>{name}’s world, </> : "Their world, "}
          <em>
            {timeline.from}–{timeline.to}
          </em>
        </h1>
        <p className="seeds">
          The films of each part of {name ? `${name}’s` : "their"} youth, chosen from Qloo for people who share their tastes, with
          the sound of the era alongside.
        </p>
        <div className="kit-actions">
          <button className="secondary" onClick={onBack}>
            Back to the session
          </button>
        </div>
      </section>

      {timeline.sound.length > 0 && (
        <Shelf title="The sound of their youth" hint="Singers from the era who suit their tastes." items={timeline.sound} onWhy={setWhy} />
      )}

      <ol className="years">
        {timeline.chapters.map((c) => (
          <li key={c.from} className="year-chapter">
            <div className="year-mark">
              <span>{c.from}</span>
              <span className="year-to">to {c.to}</span>
            </div>
            <div className="year-body">
              <ul className="year-films">
                {c.films.map((f) => (
                  <li key={f.id}>
                    <Photo item={f} />
                    <strong>{f.name}</strong>
                    <span className="muted">{f.year}</span>
                    <span className="year-actions">
                      <PlayLink item={f} />
                      <button className="why-link" onClick={() => setWhy(f)}>
                        Why this?
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="year-prompt">{c.prompt}</p>
            </div>
          </li>
        ))}
      </ol>

      <details className="trace">
        <summary>How the agent built this · {timeline.trace.length} steps</summary>
        <ol>
          {timeline.trace.map((t, i) => (
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

      {why && <WhySheet item={why} name={who} onClose={() => setWhy(null)} />}
    </div>
  );
}
