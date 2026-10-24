import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as qloo from "./qloo/index.js";
import { buildKit } from "./agent/kit.js";

const app = express();
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web/dist");

app.use(express.json({ limit: "20kb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, qloo: qloo.status() }));

// Only aggregate taste seeds reach the server. Names and personal details
// stay on the carer's device.
app.post("/api/kit", async (req, res, next) => {
  try {
    const { region = "", era = "", loves = [] } = req.body ?? {};
    const seeds = (Array.isArray(loves) ? loves : [])
      .map((s) => String(s).trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 5);
    if (!seeds.length) return res.status(400).json({ error: "Add at least one thing they love." });
    res.json(await buildKit({ region: String(region).slice(0, 80), era: String(era).slice(0, 20), loves: seeds }));
  } catch (err) {
    next(err);
  }
});

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
app.use(express.static(dist));
app.get("/{*splat}", (_req, res) => res.sendFile(path.join(dist, "index.html")));

app.use((err, _req, res, _next) => {
  if (err instanceof qloo.QlooError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong." });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Reminisce on http://localhost:${port} (Qloo ${qloo.status().mode})`));
