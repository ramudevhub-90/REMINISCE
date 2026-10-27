# Reminisce

A reminiscence companion for people caring for someone with dementia.

A carer enters where the person grew up, roughly when, and 3–5 things they're known to love ("Kishore Kumar, fish curry, Guide (1965)"). An agent uses [Qloo](https://qloo.com)'s taste graph to expand those seeds across music, film, food and places, filtered towards older audiences and the person's home region. It then builds a **session kit**: a playlist, film clips, something to cook together, and conversation prompts. Every suggestion has a **Why this?** view showing the Qloo evidence behind it.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com). **Live demo:** https://reminisce.revenuerush.in (no sign-up needed). **Video:** https://www.youtube.com/watch?v=VTSqE3CEDQg

> Results describe what people with similar tastes tend to enjoy (aggregate affinities). They are not claims about any individual.

## Try it (for judges)

Everything works as a guest. A kit takes about 20–40 seconds while the agent's steps stream in.

1. Open https://reminisce.revenuerush.in and pick **Baba**, **Margaret** or **Abuela Rosa**, or enter your own person (where they grew up, roughly when, 3–5 things they love).
2. On the kit, open **Why this?** on any song, film or place to see the Qloo request and affinity behind it.
3. Tap **Begin the session** and mark a few items *Lit up*, *A little* or *Not today*, then finish.
4. Back on the kit, see the **taste portrait**, then **Plan the next session** to watch the hits become Qloo signals.
5. Tap **See {name}'s world** for the timeline of the years they grew up in.
6. Try **Group session** → *Sunrise Care Home* for picks ranked by how many residents they reach.
7. Optional: **Sign in** with any email. You'll get a 6-digit code (no password), and your people and journals then sync across devices.

## What it does

- **Session kit for one person.** From a few things they love, the agent resolves each one in Qloo (singer, film, or dish tag), then expands across music, films and food. Films stay in the years they grew up in; music uses Qloo's own era genres (such as "Old Hindi"); food comes from places near home known for their dish.
- **Session mode and the weekly loop.** One big card at a time; the carer taps *Lit up*, *A little* or *Not today*. Hits return as favourites and become new Qloo signals, what didn't land is set aside, and new films arrive each week.
- **Taste portrait.** Qloo's mood and genre tags on what lit them up become a short portrait ("Baba tends to respond to Old Hindi, Emotive…") that the next kit leans on.
- **Their world.** A timeline of the years they grew up in, five at a time: the films of each window from Qloo, with the sound of the era.
- **Group sessions for care homes.** Each resident's tastes are expanded through Qloo separately; picks are ranked by how many residents they reach ("Reaches everyone"), with a combined query to fill gaps.
- **Accounts (optional).** Sign in with your email and a 6-digit code (no password) to keep several people, their learning and a care-home group in the cloud, on any device. Guest mode still works without signing up.
- **Why this?** Every suggestion shows its Qloo affinity, the request sent, and that it describes people with similar tastes, never the individual.

## Architecture

Serverless on AWS with [Amplify Gen 2](https://docs.amplify.aws/react/):

```
React (CloudFront + S3)
  │  guest or signed-in Cognito identity (IAM)
  ▼
AppSync ── startKit ──► Lambda kit-api ─ ──► SQS ──► Lambda kit-worker ──► Qloo (harness CLI layer)
  ▲                                                     │                   └► DynamoDB QlooCache
  └──── onKitProgress subscription ◄── publishProgress ─┘──► DynamoDB KitJob
```

- Agent runs take longer than AppSync's resolver timeout, so `startKit` enqueues a job (`kit`, `timeline` or `group`). The worker streams each step back over a subscription.
- The worker runs at most four Qloo calls at once and caches every response in DynamoDB for a week, to protect the event quota.
- All Qloo access goes through [`amplify/functions/kit-worker/qloo/index.ts`](amplify/functions/kit-worker/qloo/index.ts). It runs the [`@qloo/qloo-harness`](https://www.npmjs.com/package/@qloo/qloo-harness) CLI from a Lambda layer and caches responses in DynamoDB.

## Privacy

- **Guests** (no sign-up): each person's details, journal and portrait stay in the browser on that device.
- **With an account** (optional, email + a 6-digit code via Cognito custom auth and SES; no password): people, journals, portraits and care-home groups are saved to DynamoDB with owner-only access, so only that account can read them, and follow the carer to any device. Anything done as a guest moves into the account on sign-in. *Delete my data* removes every record and the account itself.
- Qloo only ever receives taste seeds (e.g. "Kishore Kumar", "Kolkata", "1960s"), never a name.
- The Qloo key is an SSM SecureString read by the worker at runtime. It is never in the repo, the browser or logs.
- Agent jobs can only be read back by the identity that created them.

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

Deploy-time settings live in an untracked `.deploy.env`, loaded by both deploy scripts:

```bash
export REMINISCE_FROM_ADDRESS=no-reply@example.com   # SES-verified sender for sign-in codes
export REMINISCE_SES_ROLE_ARN=...                    # optional: send via a role in an account with production SES
export REMINISCE_DOMAIN=reminisce.example.com        # optional custom domain (DNS elsewhere)
export REMINISCE_CERT_ARN=arn:aws:acm:us-east-1:...  # its issued ACM certificate
```

## Licence

[MIT](LICENSE)
