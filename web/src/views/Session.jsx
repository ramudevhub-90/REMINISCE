import { useEffect, useMemo, useState } from "react";
import { Photo, PlayLink } from "./Kit.jsx";

const REACTIONS = [
  { id: "lit", label: "Lit up" },
  { id: "some", label: "A little" },
  { id: "none", label: "Not today" },
];

const KIND_LABEL = { music: "Song", film: "Film", place: "Food", food: "Food" };

// One calm card at a time, large enough to share the screen with the person.
export default function Session({ kit, name, favourites, group, onClose, onFinish }) {
  const cards = useMemo(() => buildCards(kit, favourites, group), [kit, favourites, group]);
  const [index, setIndex] = useState(0);
  const [reactions, setReactions] = useState({});
  const [note, setNote] = useState("");
  const done = index >= cards.length;

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, cards.length));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cards.length, onClose]);

  const react = (card, id) => setReactions((r) => ({ ...r, [card.key]: r[card.key] === id ? undefined : id }));

  function save() {
    const pick = (id) => cards.filter((c) => reactions[c.key] === id).map((c) => c.title);
    // Keep the Qloo ids of songs and films so the next kit can build on them.
    const items = cards
      .filter((c) => c.kind !== "food")
      .map((c) => ({
        id: c.item.id,
        name: c.item.name,
        type: c.item.type,
        image: c.item.image,
        tagRefs: c.item.tagRefs ?? [],
        reaction: reactions[c.key] ?? null,
      }));
    onFinish({ date: new Date().toISOString(), sparked: pick("lit"), some: pick("some"), quiet: pick("none"), note: note.trim(), items });
  }

  return (
    <div className="session">
      <header className="session-bar">
        <button className="ghost on-dark" onClick={onClose} aria-label="Leave the session">
          ✕ Leave
        </button>
        <ol className="dots" aria-label={`Card ${Math.min(index + 1, cards.length + 1)} of ${cards.length + 1}`}>
          {[...cards, { key: "end" }].map((c, i) => (
            <li key={c.key} className={i === index ? "on" : reactions[c.key] === "lit" ? "lit" : ""} />
          ))}
        </ol>
      </header>

      {done ? (
        <section className="session-card summary">
          <p className="eyebrow">How did it go{name ? ` with ${name}` : ""}?</p>
          <h1>Gently note what sparked</h1>
          <ul className="summary-list">
            {cards.map((c) => (
              <li key={c.key}>
                <span>{c.title}</span>
                <span className={`badge ${reactions[c.key] ?? "unset"}`}>
                  {REACTIONS.find((r) => r.id === reactions[c.key])?.label ?? "—"}
                </span>
              </li>
            ))}
          </ul>
          <label className="field on-dark">
            <span>Anything they said or remembered?</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Talked about her brother’s cycle…" />
          </label>
          <p className="muted on-dark small">Saved on this device only. What sparked will shape the next session.</p>
          <div className="session-nav">
            <button className="ghost on-dark" onClick={() => setIndex(cards.length - 1)}>
              Back
            </button>
            <button className="primary large" onClick={save}>
              Save to journal
            </button>
          </div>
        </section>
      ) : (
        <SessionCard
          card={cards[index]}
          reaction={reactions[cards[index].key]}
          onReact={(id) => react(cards[index], id)}
          onBack={index > 0 ? () => setIndex(index - 1) : null}
          onNext={() => setIndex(index + 1)}
        />
      )}
    </div>
  );
}

function SessionCard({ card, reaction, onReact, onBack, onNext }) {
  return (
    <section className="session-card" key={card.key}>
      <Photo item={card.item} large />
      <p className="eyebrow">{card.favourite ? "A favourite" : (KIND_LABEL[card.kind] ?? "")}</p>
      <h1>{card.title}</h1>
      {card.item?.description && <p className="session-desc">{card.item.description}</p>}
      <p className="session-prompt">{card.prompt}</p>
      {card.item && <PlayLink item={card.item} />}
      <div className="reactions" role="group" aria-label="How did they respond?">
        {REACTIONS.map((r) => (
          <button key={r.id} className={`reaction ${reaction === r.id ? "chosen" : ""}`} aria-pressed={reaction === r.id} onClick={() => onReact(r.id)}>
            {r.label}
          </button>
        ))}
      </div>
      <div className="session-nav">
        {onBack ? (
          <button className="ghost on-dark" onClick={onBack}>
            Back
          </button>
        ) : (
          <span />
        )}
        <button className="primary large" onClick={onNext}>
          Next
        </button>
      </div>
    </section>
  );
}

const GROUP_PROMPTS = {
  music: "Play a song the room might know. Watch who sings along, and invite them to say where they first heard it.",
  film: "Play a song or a short scene. Ask the room who saw it at the cinema, and with whom.",
};

function buildCards(kit, favourites = [], group = false) {
  const cards = [];
  // Familiar favourites are worth returning to: open with the ones that lit them up.
  for (const item of favourites.slice(0, 2)) {
    cards.push({
      key: `fav-${item.id}`,
      kind: item.type?.endsWith("movie") ? "film" : "music",
      title: item.name,
      item,
      favourite: true,
      prompt: "A favourite from last time. Play it again and see if it still sparks.",
    });
  }
  for (const item of kit.playlist.slice(0, favourites.length ? 3 : 4)) {
    cards.push({
      key: item.id,
      kind: "music",
      title: item.name,
      item,
      prompt: group
        ? GROUP_PROMPTS.music
        : "Play a favourite song. Watch for a smile, humming or a tapping foot. If they light up, ask where they first heard it.",
    });
  }
  for (const item of kit.films.slice(0, 2)) {
    cards.push({
      key: item.id,
      kind: "film",
      title: item.year ? `${item.name} (${item.year})` : item.name,
      item,
      prompt: group ? GROUP_PROMPTS.film : "Play a song or short scene. Ask who they used to go to the pictures with, and what they wore.",
    });
  }
  if (kit.food) {
    // "Cook fish curry together" → "fish curry", for a recipe link.
    const dish = kit.food.title.replace(/^Cook (something )?/, "").replace(/ together$/, "");
    cards.push({
      key: "food",
      kind: "food",
      title: kit.food.title,
      item: { id: "food", name: dish, type: "food", image: kit.food.places[0]?.image, tags: [] },
      prompt: "Let them smell the spices, stir the pot, have a taste. Ask who used to cook it at home.",
    });
  }
  return cards;
}
