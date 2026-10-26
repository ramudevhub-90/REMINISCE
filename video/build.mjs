// Builds out/reminisce-demo.mp4 (1920x1080) and out/reminisce-demo.srt.
//   node build.mjs            everything
//   node build.mjs intro      one part: voice | intro | demo | outro | assemble
import { chromium } from "playwright";
import ffmpeg from "ffmpeg-static";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// VLANG=hi renders the Hindi version (script.hi.mjs) into separate files.
const LANG = process.env.VLANG === "hi" ? "hi" : "en";
const { DEMO, INTRO, OUTRO, VOICE } = await import(LANG === "hi" ? "./script.hi.mjs" : "./script.mjs");
const SUFFIX = LANG === "en" ? "" : `-${LANG}`;
// On-screen captions are always English, so the Hindi version reads for everyone.
const EN = await import("./script.mjs");
const englishFor = (part, line, i) => (part === "demo" ? EN.DEMO.find((l) => l.id === line.id) : EN[part.toUpperCase()][i])?.text ?? line.text;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "out");
const TMP = path.join(OUT, "tmp");
const APP = process.env.APP ?? "https://d32wwoinn0chhg.cloudfront.net/";
const SIZE = { width: 1920, height: 1080 };
const PAD = 0.9; // seconds of quiet after each line
mkdirSync(TMP, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---- Voice -------------------------------------------------------------

function duration(file) {
  const out = (() => {
    try {
      return execFileSync(ffmpeg, ["-i", file], { stdio: ["ignore", "pipe", "pipe"] }).toString();
    } catch (e) {
      return String(e.stderr);
    }
  })();
  const m = out.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
}

function voice(baseKey, text) {
  const key = `${baseKey}${SUFFIX}`;
  const wav = path.join(TMP, `${key}.wav`);
  const stamp = path.join(TMP, `${key}.txt`);
  const id = `${JSON.stringify(VOICE)}|${text}`;
  if (!existsSync(wav) || !existsSync(stamp) || readFileSync(stamp, "utf8") !== id) {
    const raw = path.join(TMP, `${key}.${VOICE.engine === "polly" ? "mp3" : "aiff"}`);
    const spoken = text.replace(/’/g, "'");
    if (VOICE.engine === "polly") {
      execFileSync("aws", [
        "polly", "synthesize-speech", "--region", "us-east-1", "--profile", "default",
        "--engine", VOICE.polly, "--voice-id", VOICE.name, "--output-format", "mp3", "--sample-rate", "24000",
        ...(VOICE.lang ? ["--language-code", VOICE.lang] : []),
        "--text", spoken, raw,
      ], { stdio: "ignore" });
    } else {
      execFileSync("say", ["-v", VOICE.name, "-r", String(VOICE.rate), "-o", raw, spoken]);
    }
    execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-i", raw, "-ar", "48000", "-ac", "2", wav]);
    writeFileSync(stamp, id);
  }
  return { key, text, wav, dur: duration(wav) };
}

const lines = () => ({
  intro: INTRO.map((l, i) => ({ ...l, ...voice(`intro-${i}`, l.text), caption: englishFor("intro", l, i) })),
  demo: DEMO.map((l, i) => ({ ...l, ...voice(`demo-${l.id}`, l.text), caption: englishFor("demo", l, i) })),
  outro: OUTRO.map((l, i) => ({ ...l, ...voice(`outro-${i}`, l.text), caption: englishFor("outro", l, i) })),
});

// ---- Recording helpers -------------------------------------------------

async function recorder(browser, name) {
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: TMP, size: SIZE } });
  const page = await context.newPage();
  const born = Date.now();
  return {
    page,
    now: () => (Date.now() - born) / 1000,
    async finish() {
      const video = page.video();
      await context.close();
      const file = path.join(TMP, `${name}${SUFFIX}.webm`);
      renameSync(await video.path(), file);
      return file;
    },
  };
}

// Explainer scenes: each scene lasts as long as its line plus a pause.
async function recordScenes(browser, name, items) {
  const rec = await recorder(browser, name);
  await rec.page.addInitScript((r) => (window.__REC = r), {
    scenes: items.map((l) => l.scene),
    durs: items.map((l) => l.dur + PAD),
    caps: items.map((l) => l.caption),
  });
  await rec.page.goto(`file://${path.join(HERE, "explainer.html")}`);
  await rec.page.evaluate(() => document.fonts.ready);
  await sleep(600);
  const start = rec.now();
  await rec.page.evaluate(() => window.__START());
  await rec.page.waitForFunction(() => window.__DONE === true, null, { timeout: 600_000 });
  const video = await rec.finish();
  let t = 0;
  const cues = items.map((l) => {
    const cue = { at: t, ...l };
    t += l.dur + PAD;
    return cue;
  });
  return { video, start, length: t, cues };
}

// ---- The live app ------------------------------------------------------

const OVERLAY = `
  (() => {
    document.documentElement.style.zoom = "1.5";
    const s = document.createElement("style");
    s.textContent = \`
      #vcap { position: fixed; left: 0; right: 0; bottom: 0; z-index: 99; padding: 18px 9vw 22px;
        background: linear-gradient(180deg, transparent, rgb(10 8 6 / .86) 30%); color: #f4ece0;
        font: 500 19.5px/1.45 Inter, "Noto Sans Devanagari", system-ui, sans-serif; text-align: center; text-wrap: balance; pointer-events: none; }
      #vtag { position: fixed; top: 14px; right: 18px; z-index: 99; padding: 6px 12px; border-radius: 99px;
        background: rgb(10 8 6 / .7); color: #d4b06a; font: 600 11px Inter, system-ui, sans-serif;
        letter-spacing: .1em; text-transform: uppercase; pointer-events: none; }
      html { scroll-behavior: smooth; }
      .session { padding-bottom: 96px !important; }
      .session-card { gap: 9px !important; padding-top: 0 !important; }
      .session .photo.large { width: 150px !important; border-radius: 16px !important; }
      .session-desc { -webkit-line-clamp: 2 !important; font-size: 14px !important; }
      .session-prompt { font-size: 18px !important; }\`;
    document.head.appendChild(s);
    const c = document.createElement("div"); c.id = "vcap"; document.body.appendChild(c);
    const t = document.createElement("div"); t.id = "vtag"; t.textContent = "Live app · d32wwoinn0chhg.cloudfront.net";
    document.body.appendChild(t);
  })();`;

async function scrollTo(page, selector, offset = 90) {
  await page.evaluate(
    ([sel, off]) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const zoom = parseFloat(document.documentElement.style.zoom || "1");
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - off / zoom, behavior: "smooth" });
    },
    [selector, offset],
  );
  await sleep(900);
}

const button = (page, name) => page.getByRole("button", { name, exact: true }).first();
// Clicks inside the page itself: mouse coordinates can miss under the 1.5x zoom.
const press = (page, selector, text) =>
  page.evaluate(
    ([sel, txt]) => {
      const el = [...document.querySelectorAll(sel)].find((e) => !txt || e.textContent.includes(txt));
      if (!el) throw new Error(`Nothing matches ${sel} ${txt ?? ""}`);
      el.click();
    },
    [selector, text],
  );

// The same steps run twice: once quickly to warm Qloo's cache, then for real.
const ACTIONS = {
  async home(page) {
    await page.getByText("Try it with someone").waitFor();
    await sleep(1500);
    await scrollTo(page, ".personas", 140);
  },
  async building(page) {
    await page.locator("button.persona", { hasText: "Baba" }).click();
    await page.locator(".kit-hero").waitFor({ timeout: 120_000 });
  },
  async kit(page) {
    await page.evaluate(() => window.scrollTo({ top: 0 }));
  },
  async music(page) {
    await scrollTo(page, ".shelf");
  },
  async films(page) {
    await scrollTo(page, ".cards.posters", 170);
    await sleep(2500);
    await scrollTo(page, ".place-list", 260);
  },
  async why(page) {
    await scrollTo(page, ".shelf");
    await page.locator(".photo-card .why-link").first().click();
  },
  async session(page) {
    await page.keyboard.press("Escape");
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await sleep(500);
    await button(page, "Begin the session").click();
    await page.evaluate(() => window.scrollTo({ top: 0 }));
  },
  async react(page) {
    const plan = ["Lit up", "A little", null, "Not today", "Lit up", null, null];
    for (const choice of plan) {
      if (await page.locator(".summary").count()) break;
      if (choice) {
        await button(page, choice).click();
        await sleep(choice === "Lit up" ? 1700 : 700);
      }
      await button(page, "Next").click();
      await page.evaluate(() => window.scrollTo({ top: 0 }));
      await sleep(choice === "Lit up" ? 900 : 450);
    }
    while (!(await page.locator(".summary").count())) {
      await button(page, "Next").click();
      await sleep(300);
    }
  },
  async summary(page) {
    await page.locator("textarea").pressSequentially("Hummed along and tapped his foot. Talked about his brother.", { delay: 35 });
  },
  async learning(page) {
    await button(page, "Save to journal").click();
    await page.locator(".kit-hero").waitFor();
    await sleep(800);
    await scrollTo(page, ".portrait, .learning", 200);
  },
  async next(page) {
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await sleep(600);
    await button(page, "Plan the next session").click();
    await page.locator(".kit-hero").waitFor({ timeout: 120_000 });
  },
  async week2(page) {
    await sleep(2500);
    await scrollTo(page, ".shelf");
    await sleep(3500);
    await scrollTo(page, ".cards.posters", 170);
  },
  async timeline(page) {
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await sleep(900);
    await press(page, ".world-link");
    await page.locator(".years").waitFor({ timeout: 180_000 });
    await sleep(1200);
  },
  async years(page) {
    await scrollTo(page, ".years", 110);
    await sleep(3200);
    await scrollTo(page, ".year-chapter:nth-child(3)", 110);
  },
  async group(page) {
    await press(page, "button", "Back to Baba");
    await sleep(500);
    await press(page, "button", "Edit details");
    await sleep(500);
    await scrollTo(page, ".group-callout", 220);
    await sleep(1400);
    await press(page, "button", "Plan a group session");
    await sleep(900);
    await press(page, ".demo-group");
    await sleep(700);
    await scrollTo(page, ".residents", 170);
  },
  async groupKit(page) {
    await press(page, "button", "Prepare the group session");
    await page.locator(".kit-hero").waitFor({ timeout: 240_000 });
    await sleep(1500);
    await scrollTo(page, ".shelf");
  },
};

async function freshApp(page) {
  await page.goto(APP);
  await page.evaluate(() => localStorage.clear());
  await page.goto(APP);
}

async function recordDemo(browser, items) {
  log("rehearsing the app flow to warm the cache");
  const warm = await browser.newContext({ viewport: SIZE });
  const wp = await warm.newPage();
  await freshApp(wp);
  for (const l of items) await ACTIONS[l.id](wp);
  await warm.close();

  log("recording the app");
  const rec = await recorder(browser, "demo");
  const { page } = rec;
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(`${e.message} ${(e.stack ?? "").split("\n").slice(1, 4).join(" | ")}`));
  page.on("console", (m) => m.type() === "error" && pageErrors.push(m.text()));
  await freshApp(page);
  await page.evaluate(OVERLAY);
  await sleep(800);
  const start = rec.now();
  const cues = [];
  for (const l of items) {
    const at = rec.now() - start;
    await page.evaluate((text) => (document.getElementById("vcap").textContent = text), l.caption);
    const t0 = Date.now();
    try {
      await ACTIONS[l.id](page);
    } catch (err) {
      await page.screenshot({ path: path.join(TMP, `fail-${l.id}.png`) });
      const state = await page.evaluate(() => ({
        scrollY: window.scrollY,
        height: document.documentElement.scrollHeight,
        root: document.getElementById("root")?.innerHTML.length,
        h1: document.querySelector("h1")?.textContent,
      }));
      console.log("FAILED at", l.id, JSON.stringify(state), "page errors:", JSON.stringify(pageErrors.slice(-5)));
      throw err;
    }
    const left = (l.dur + PAD) * 1000 - (Date.now() - t0);
    if (left > 0) await sleep(left);
    cues.push({ at, ...l });
    log(`  ${l.id} at ${at.toFixed(1)}s`);
  }
  const length = rec.now() - start;
  return { video: await rec.finish(), start, length, cues };
}

// ---- Assembly ----------------------------------------------------------

function encode(part, name) {
  const out = path.join(TMP, `${name}${SUFFIX}.mp4`);
  const inputs = ["-ss", part.start.toFixed(3), "-i", part.video];
  const mix = [];
  part.cues.forEach((c, i) => {
    inputs.push("-i", c.wav);
    mix.push(`[${i + 1}:a]adelay=delays=${Math.round(c.at * 1000)}:all=1[a${i}]`);
  });
  const filter = `${mix.join(";")};${part.cues.map((_, i) => `[a${i}]`).join("")}amix=inputs=${part.cues.length}:normalize=0[a]`;
  execFileSync(ffmpeg, [
    "-y", "-loglevel", "error", ...inputs,
    "-filter_complex", filter, "-map", "0:v", "-map", "[a]",
    "-t", part.length.toFixed(3), "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", out,
  ]);
  return out;
}

const srtTime = (t) => {
  const ms = Math.round(t * 1000);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

function assemble(parts) {
  const files = parts.map((p, i) => encode(p, `part-${i}`));
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = path.join(OUT, `reminisce-demo${SUFFIX}.mp4`);
  const ins = files.flatMap((f) => ["-i", f]);
  const cat = files.map((_, i) => `[${i}:v][${i}:a]`).join("") + `concat=n=${files.length}:v=1:a=1[v0][a0]`;
  // Normalise the voice to YouTube's loudness target, then fade in and out.
  const fades = `[v0]fade=t=in:st=0:d=0.8,fade=t=out:st=${(total - 1).toFixed(2)}:d=1[v];[a0]loudnorm=I=-16:TP=-1.5:LRA=11,aformat=sample_rates=48000:channel_layouts=stereo,afade=t=out:st=${(total - 1).toFixed(2)}:d=1[a]`;
  execFileSync(ffmpeg, [
    "-y", "-loglevel", "error", ...ins, "-filter_complex", `${cat};${fades}`, "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "192k", out,
  ]);
  let offset = 0;
  const srt = [];
  const spoken = [];
  for (const p of parts) {
    for (const c of p.cues) {
      srt.push(`${srt.length + 1}\n${srtTime(offset + c.at)} --> ${srtTime(offset + c.at + c.dur)}\n${c.caption ?? c.text}\n`);
      spoken.push(`${spoken.length + 1}\n${srtTime(offset + c.at)} --> ${srtTime(offset + c.at + c.dur)}\n${c.text}\n`);
    }
    offset += p.length;
  }
  writeFileSync(path.join(OUT, `reminisce-demo${SUFFIX}.srt`), srt.join("\n"));
  // For the Hindi version, also keep subtitles in the spoken language.
  if (LANG !== "en") writeFileSync(path.join(OUT, `reminisce-demo${SUFFIX}.${LANG}.srt`), spoken.join("\n"));
  return { out, total };
}

// ---- Main --------------------------------------------------------------

const step = process.argv[2] ?? "all";
const saved = path.join(TMP, `parts${SUFFIX}.json`);
const parts = existsSync(saved) ? JSON.parse(readFileSync(saved, "utf8")) : {};
const save = () => writeFileSync(saved, JSON.stringify(parts, null, 2));

log("preparing narration");
const L = lines();
log(`narration: ${[...L.intro, ...L.demo, ...L.outro].reduce((a, l) => a + l.dur, 0).toFixed(0)}s of speech`);
if (step === "voice") process.exit(0);

const browser = ["all", "intro", "demo", "outro"].includes(step) ? await chromium.launch() : null;
if (step === "all" || step === "intro") {
  log("recording intro scenes");
  parts.intro = await recordScenes(browser, "intro", L.intro);
  save();
}
if (step === "all" || step === "demo") {
  parts.demo = await recordDemo(browser, L.demo);
  save();
}
if (step === "all" || step === "outro") {
  log("recording outro scenes");
  parts.outro = await recordScenes(browser, "outro", L.outro);
  save();
}
await browser?.close();

if (step === "all" || step === "assemble") {
  log("assembling");
  const { out, total } = assemble([parts.intro, parts.demo, parts.outro]);
  log(`done: ${out} (${Math.floor(total / 60)}m ${Math.round(total % 60)}s)`);
}
