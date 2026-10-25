// Shown while the agent works; each step streams in from the backend.
export default function Building({ name, steps, error, onBack }) {
  return (
    <section className="building paper" aria-live="polite">
      <p className="eyebrow">Preparing a session{name ? ` for ${name}` : ""}</p>
      <h1>{error ? "Something went wrong" : "Gathering what their generation loved…"}</h1>
      <ol className="timeline">
        {steps.map((s, i) => (
          <li key={i} className={i === steps.length - 1 && !error ? "current" : "done"}>
            {s}
          </li>
        ))}
        {!steps.length && !error && <li className="current">Connecting to the taste graph…</li>}
      </ol>
      {error ? (
        <>
          <p className="error">{error}</p>
          <button className="secondary" onClick={onBack}>
            Back to details
          </button>
        </>
      ) : (
        <p className="muted">This usually takes about half a minute.</p>
      )}
    </section>
  );
}
