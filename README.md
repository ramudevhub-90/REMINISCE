# Reminisce

A reminiscence companion for people caring for someone with dementia.

A carer enters where the person grew up, roughly when, and 3–5 things they're known to love ("Kishore Kumar, fish curry, Guide (1965)"). An agent uses [Qloo](https://qloo.com)'s taste graph to expand those seeds across music, film, food and places, filtered towards older audiences and the person's home region. It then builds a **session kit**: a playlist, film clips, something to cook together, and conversation prompts. Every suggestion has a **Why this?** view showing the Qloo evidence behind it.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com). **Live demo:** https://d32wwoinn0chhg.cloudfront.net (no sign-up needed). Try *Baba*, *Margaret* or *Abuela Rosa*, or *Plan a group session* → *Sunrise Care Home*.

> Results describe what people with similar tastes tend to enjoy (aggregate affinities). They are not claims about any individual.

## What it does

- **Session kit for one person.** From a few things they love, the agent resolves each one in Qloo (singer, film, or dish tag), then expands across music, films and food. Films stay in the years they grew up in; music uses Qloo's own era genres (such as "Old Hindi"); food comes from places near home known for their dish.
- **Session mode and the weekly loop.** One big card at a time; the carer taps *Lit up*, *A little* or *Not today*. Hits return as favourites and become new Qloo signals, what didn't land is set aside, and new films arrive each week.
- **Taste portrait.** Qloo's mood and genre tags on what lit them up become a short portrait ("Baba tends to respond to Old Hindi, Emotive…") that the next kit leans on.
- **Their world.** A timeline of the years they grew up in, five at a time: the films of each window from Qloo, with the sound of the era.
- **Group sessions for care homes.** Each resident's tastes are expanded through Qloo separately; picks are ranked by how many residents they reach ("Reaches everyone"), with a combined query to fill gaps.
- **Why this?** Every suggestion shows its Qloo affinity, the request sent, and that it describes people with similar tastes, never the individual.

## Architecture

Serverless on AWS with [Amplify Gen 2](https://docs.amplify.aws/react/):

```
React (CloudFront + S3)
  │  guest or signed-in Cognito identity (IAM)
  ▼
AppSync ── startKit ──► Lambda start-kit ──► SQS ──► Lambda kit-worker ──► Qloo (harness CLI layer)
  ▲                                                     │                   └► DynamoDB QlooCache
  └──── onKitProgress subscription ◄── publishProgress ─┘──► DynamoDB KitJob
```

- Agent runs take longer than AppSync's resolver timeout, so `startKit` enqueues a job (`kit`, `timeline` or `group`). The worker streams each step back over a subscription.
- The worker runs at most four Qloo calls at once and caches every response in DynamoDB for a week, to protect the event quota.
- All Qloo access goes through [`amplify/functions/kit-worker/qloo/index.ts`](amplify/functions/kit-worker/qloo/index.ts). It runs the [`@qloo/qloo-harness`](https://www.npmjs.com/package/@qloo/qloo-harness) CLI from a Lambda layer and caches responses in DynamoDB.

## Privacy

- Visitors use the app as guests. No sign-up is needed.
- The person's name and profile stay in the carer's browser. The backend receives only taste seeds (e.g. "Kishore Kumar", "Kolkata").
- The Qloo key is an SSM SecureString read by the worker at runtime. It is never in the repo, the browser or logs.
- Jobs can only be read back by the identity that created them.

## Deploy your own

Requires Node 22.19 or newer and an AWS account bootstrapped for CDK.

```bash
npm install
npm run deploy:backend    # Cognito, AppSync, DynamoDB, SQS, Lambdas; writes web/src/amplify_outputs.json
npm run deploy:frontend   # builds the SPA and serves it from CloudFront
```

To use live Qloo data:

```bash
aws ssm put-parameter --name /reminisce/qloo-api-key --type SecureString --value "<key>"
```

Then set `QLOO_MODE` to `live` in [`amplify/functions/kit-worker/resource.ts`](amplify/functions/kit-worker/resource.ts) and redeploy the backend.

Local UI development against the deployed backend: `npm run dev`. Tests: `npm test`.

## Licence

[MIT](LICENSE)
