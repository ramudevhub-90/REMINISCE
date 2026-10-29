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
7. Optional: **Sign in**. No password; sign-in is an email plus a 6-digit code.
   - **Demo account:** email `ramu@mobil80.com`, code `061628`. It's shared by every judge, so others may see what you save there.
   - **Your own account:** enter any email you can read and use the code it receives. Your people and journals then sync across devices.

## What it does

- **Session kit for one person.** From a few things they love, the agent resolves each one in Qloo (singer, film, or dish tag), then expands across music, films and food. Films stay in the years they grew up in; music uses Qloo's own era genres (such as "Old Hindi"); food comes from places near home known for their dish.
- **Session mode and the weekly loop.** One big card at a time; the carer taps *Lit up*, *A little* or *Not today*. Hits return as favourites and become new Qloo signals, what didn't land is set aside, and new films arrive each week.
- **Taste portrait.** Qloo's mood and genre tags on what lit them up become a short portrait ("Baba tends to respond to Old Hindi, Emotive…") that the next kit leans on.
- **Their world.** A timeline of the years they grew up in, five at a time: the films of each window from Qloo, with the sound of the era.
- **Group sessions for care homes.** Each resident's tastes are expanded through Qloo separately; picks are ranked by how many residents they reach ("Reaches everyone"), with a combined query to fill gaps.
- **Accounts (optional).** Sign in with your email and a 6-digit code (no password) to keep several people, their learning and a care-home group in the cloud, on any device. Guest mode still works without signing up.
- **Why this?** Every suggestion shows its Qloo affinity, the request sent, and that it describes people with similar tastes, never the individual.

## Architecture

One CDK stack, `reminisce` ([`infra/stack.ts`](infra/stack.ts)), in us-east-1. Every resource has a `reminisce-…` name:

```
browser ─▶ CloudFront ─▶ S3 reminisce-web-<account>          (the React app + config.json)
   │  guest or carer identity (identity pool reminisce-visitors, IAM)
   ▼
AppSync reminisce-api ── startKit ──► λ reminisce-kit-api ──► SQS reminisce-jobs ──► λ reminisce-kit-worker ──► Qloo (harness CLI layer)
   ▲                                       └► DynamoDB reminisce-jobs                    │                       └► DynamoDB reminisce-qloo-cache
   └── onKitProgress subscription ◄──────────── publishProgress (worker role only) ◄──────┘

Cognito user pool reminisce-carers (email + 6-digit code, λ reminisce-auth-*) ─▶ AppSync ─▶ DynamoDB reminisce-people / -groups / -accounts
```

- Agent runs take longer than AppSync's resolver timeout, so `startKit` enqueues a job (`kit`, `timeline` or `group`). The worker streams each step back over a subscription.
- Carers' records are keyed by their Cognito `sub` in AppSync JS resolvers ([`infra/resolvers`](infra/resolvers)), so an account can only read its own.
- The worker runs at most four Qloo calls at once and caches every response in DynamoDB for a week, to protect the event quota.
- All Qloo access goes through [`infra/functions/kit-worker/qloo/index.ts`](infra/functions/kit-worker/qloo/index.ts). It runs the [`@qloo/qloo-harness`](https://www.npmjs.com/package/@qloo/qloo-harness) CLI from a Lambda layer.
- The front end uses the Amplify JS library only as a client for Cognito and AppSync; nothing is deployed with Amplify.

## Privacy

- **Guests** (no sign-up): each person's details, journal and portrait stay in the browser on that device.
- **With an account** (optional, email + a 6-digit code via Cognito custom auth and SES; no password): people, journals, portraits and care-home groups are saved to DynamoDB, keyed by the account, so only that account can read them, and follow the carer to any device. Anything done as a guest moves into the account on sign-in. *Delete my data* removes every record and the account itself.
- Qloo only ever receives taste seeds (e.g. "Kishore Kumar", "Kolkata", "1960s"), never a name.
- The Qloo key is an SSM SecureString read by the worker at runtime. It is never in the repo, the browser or logs.
- Agent jobs can only be read back by the identity that created them.

## Deploy your own

Requires Node 22.19 or newer and an AWS account bootstrapped for CDK (`npx cdk bootstrap`).

1. Store the Qloo key as an SSM SecureString (CloudFormation can't create those):

   ```bash
   read -rs "K?Qloo key: " && aws ssm put-parameter --region us-east-1 --name /reminisce/qloo-api-key --type SecureString --overwrite --value "$K"; unset K
   ```

2. Set your own values in [`cdk.json`](cdk.json): `fromAddress` (an SES-verified sender for sign-in codes), and optionally `sesRoleArn` (a send-only role in an account with production SES), `domainName` and `hostedZoneId` (a Route 53 zone in this account). Leave `domainName` empty to use the CloudFront address.

3. Deploy the backend and the site together:

   ```bash
   npm install
   npm run deploy
   ```

Local UI development against the deployed stack: `npm run config` (writes `web/public/config.json`), then `npm run dev`. Tests: `npm test`.

## Licence

[MIT](LICENSE)
