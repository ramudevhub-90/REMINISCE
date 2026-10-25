import { useState } from "react";
import { Shelf, WhySheet } from "./Kit.jsx";

// The group kit: each pick shows which residents it is likely to reach.
export default function GroupKit({ kit, group, journal, saved, onBegin, onEdit, onRebuild }) {
  const [why, setWhy] = useState(null);
  const names = group.residents.map((r) => r.name);
  const reaches = (item) =>
    item.members?.length ? (
      <span className="reaches">
        Reaches {item.members.length === names.length ? "everyone" : item.members.map((m) => names[m]).filter(Boolean).join(", ")}
      </span>
    ) : (
      <span className="reaches quiet">Loved by this group’s combined tastes</span>
    );

  return (
    <div className="kit">
      <section className="kit-hero">
        <p className="eyebrow">
          Group session · {kit.size} residents{group.name ? ` · ${group.name}` : ""}
        </p>
        <h1>
          Songs and films <em>the room shares</em>
        </h1>
        <p className="seeds">
          For {names.join(", ")}. Reminisce expanded each resident’s tastes through Qloo and ranked what turned up for the most
          of them.
        </p>
        <div className="kit-actions">
          <button className="primary large" onClick={onBegin}>
            Begin the group session
          </button>
          <button className="ghost" onClick={onEdit}>
            Edit residents
          </button>
          <button className="ghost" onClick={onRebuild}>
            Refresh
          </button>
        </div>
        {saved && <p className="next-note">Saved. {saved}</p>}
      </section>

      {kit.playlist.length > 0 && (
        <Shelf title="Sing-along" hint="Ranked by how many residents each singer is likely to reach." items={kit.playlist} onWhy={setWhy} meta={reaches} />
      )}
      {kit.films.length > 0 && (
        <Shelf title="Films to share" hint="A song or a scene, then ask the room." items={kit.films} onWhy={setWhy} meta={reaches} poster />
      )}

      <section className="shelf">
        <header className="shelf-head">
          <h2>Leading the group</h2>
        </header>
        <ul className="starters">
          {kit.prompts.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </section>

      {journal.length > 0 && (
        <section className="shelf">
          <header className="shelf-head">
            <h2>Group journal</h2>
          </header>
          <ul className="journal">
            {journal.slice(0, 6).map((e) => (
              <li key={e.date}>
                <time>{new Date(e.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</time>
                <span>
                  {e.sparked.length ? `Lit up the room: ${e.sparked.join(", ")}` : "A quiet session"}
                  {e.note ? ` — “${e.note}”` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

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

      {why && <WhySheet item={why} name="any one resident" onClose={() => setWhy(null)} />}
    </div>
  );
}
