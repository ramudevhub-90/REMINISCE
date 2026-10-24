# Reminisce

A reminiscence companion for people caring for someone with dementia.

A carer enters where the person grew up, roughly when, and 3–5 things they're known to love ("Kishore Kumar, fish curry, Guide (1965)"). An agent uses [Qloo](https://qloo.com)'s taste graph to expand those seeds across music, film, food and places, filtered towards older audiences and the person's home region. It then builds a **session kit**: a playlist, film clips, something to cook together, and conversation prompts. Every suggestion has a **Why this?** view showing the Qloo evidence behind it.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com).

> Results describe what people with similar tastes tend to enjoy (aggregate affinities). They are not claims about any individual.

## Status

Day 0 skeleton. Qloo calls currently return **sample data** (`QLOO_MODE=sample`) until the event API key is connected.

## Privacy

- Profiles (name, region, loves) are stored only in the carer's browser.
- The server receives only taste seeds (e.g. "Kishore Kumar", "Kolkata") and never a name.
- The Qloo key lives only in the server's environment. It is never in the repo or the browser.

## Run locally

Requires Node 22.19 or newer.

```bash
npm install
npm run build
npm start          # http://localhost:3000
```

For development with hot reload: `npm run dev` (API on :3000, UI on :5173).

### Using the live Qloo API

```bash
cp .env.example .env    # set QLOO_MODE=live and QLOO_API_KEY=...
node --env-file=.env server/index.js
```

All Qloo access goes through [`server/qloo/index.js`](server/qloo/index.js), which runs the [`@qloo/qloo-harness`](https://www.npmjs.com/package/@qloo/qloo-harness) CLI and caches results in memory.

## Deploy

[`render.yaml`](render.yaml) deploys the app as a single Node web service on Render. Set `QLOO_API_KEY` in the Render dashboard.

## Licence

[MIT](LICENSE)
