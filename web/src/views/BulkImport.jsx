import { useMemo, useState } from "react";

const TEMPLATE = [
  "Name,Where they grew up,Roughly when,Things they love",
  'Mrs Sen,Kolkata,1950s,"Hemanta Mukherjee; Lata Mangeshkar; Pather Panchali (1955)"',
  'Mr Das,Kolkata,1960s,"Mohammed Rafi; Mughal-E-Azam (1960); Fish curry"',
].join("\n");
const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`;
const MAX_ROWS = 100;

// Care homes add many residents at once: paste rows from a spreadsheet, or
// upload a CSV. Columns: name, where they grew up, roughly when, things they
// love (separated by ; or |).
export default function BulkImport({ onImport, onDone }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const rows = useMemo(() => parseResidents(text), [text]);
  const good = rows.filter((r) => !r.problem);

  async function readFile(e) {
    const file = e.target.files?.[0];
    if (file) setText(await file.text());
  }

  async function runImport() {
    setBusy(true);
    setError("");
    try {
      const n = await onImport(
        good.map(({ name, region, era, loves }) => ({ name, region, era, loves })),
        setProgress,
      );
      setResult(`Imported ${n} ${n === 1 ? "resident" : "residents"}.`);
      setText("");
    } catch (err) {
      setError(`Stopped after ${Math.max(0, progress - 1)}: ${err.message || "something went wrong"}. Try again for the rest.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="person-form bulk-import">
      <p className="eyebrow">Residents</p>
      <h1>Import residents</h1>
      <p className="lede">
        Paste rows from Excel or Google Sheets, or upload a CSV. One resident per row: name, where they grew up, roughly
        when, and the things they love separated by semicolons.
      </p>

      <div className="paper form">
        <div className="account-actions">
          <label className="secondary file-button">
            Upload a CSV
            <input type="file" accept=".csv,text/csv,.tsv,text/tab-separated-values,.txt" onChange={readFile} hidden />
          </label>
          <a className="link" href={TEMPLATE_HREF} download="reminisce-residents-template.csv">
            Download the template
          </a>
        </div>
        <label className="field">
          <span>Or paste rows here</span>
          <textarea
            rows={7}
            value={text}
            onChange={(e) => (setText(e.target.value), setResult(""))}
            placeholder={"Mrs Sen\tKolkata\t1950s\tHemanta Mukherjee; Lata Mangeshkar\nMr Das\tKolkata\t1960s\tMohammed Rafi; Fish curry"}
          />
        </label>

        {rows.length > 0 && (
          <div className="import-preview">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Grew up</th>
                  <th>When</th>
                  <th>Things they love</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={r.problem ? "bad" : ""}>
                    <td>{r.name || "—"}</td>
                    <td>{r.region || "—"}</td>
                    <td>{r.era || "—"}</td>
                    <td>{r.problem ? <span className="error">{r.problem}</span> : r.loves.join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && <p className="error">{error}</p>}
        {result && <p className="next-note">{result}</p>}
        <div className="account-actions">
          <button className="primary" disabled={busy || !good.length} onClick={runImport}>
            {busy ? `Importing ${progress} of ${good.length}…` : `Import ${good.length || ""} ${good.length === 1 ? "resident" : "residents"}`}
          </button>
          <button className="ghost" disabled={busy} onClick={onDone}>
            {result ? "Back to residents" : "Cancel"}
          </button>
        </div>
        {rows.length > good.length && <p className="muted small">Rows with a problem are skipped.</p>}
      </div>
    </div>
  );
}

// Tab-separated (pasted from a spreadsheet) or comma-separated with quotes.
function parseResidents(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const delimiter = lines.some((l) => l.includes("\t")) ? "\t" : ",";
  let cells = lines.map((l) => (delimiter === "\t" ? l.split("\t") : splitCsv(l)).map((c) => c.trim()));
  // Map columns by header when there is one, else by position.
  let cols = { name: 0, region: 1, era: 2, loves: 3 };
  if (/name/i.test(cells[0][0] ?? "")) {
    const h = cells[0].map((c) => c.toLowerCase());
    const find = (re, fallback) => {
      const i = h.findIndex((c) => re.test(c));
      return i === -1 ? fallback : i;
    };
    cols = { name: find(/name/, 0), region: find(/grew|where|place|region|city|town/, 1), era: find(/when|era|decade|year/, 2), loves: find(/love|like|favou?rite|things/, 3) };
    cells = cells.slice(1);
  }
  return cells.slice(0, MAX_ROWS).map((c) => {
    // With commas and no quotes, extra cells are more favourites.
    const lovesCell = delimiter === "," && c.length > 4 && cols.loves === 3 ? c.slice(3).join(";") : (c[cols.loves] ?? "");
    const loves = lovesCell
      .split(/[;|]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5);
    const row = { name: (c[cols.name] ?? "").slice(0, 80), region: (c[cols.region] ?? "").slice(0, 80), era: (c[cols.era] ?? "").slice(0, 20), loves };
    row.problem = !row.name ? "Missing a name" : !loves.length ? "Add at least one thing they love" : "";
    return row;
  });
}

function splitCsv(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") out.push(cur), (cur = "");
    else cur += ch;
  }
  out.push(cur);
  return out;
}
