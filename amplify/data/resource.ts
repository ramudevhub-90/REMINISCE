import { a, defineData, type ClientSchema } from "@aws-amplify/backend";
import { kitApi } from "../functions/kit-api/resource";
import { kitWorker } from "../functions/kit-worker/resource";

// Callers: guests (unauthenticated identity pool) and signed-in carers, both
// over IAM. Jobs are read only by id through getKitJob, which checks the
// caller is the job's requester, so nobody can list other people's kits.
// Custom JS resolvers can't use identity-pool auth, so every operation is
// handled by the kit-api Lambda.
const callers = (allow: any) => [allow.guest(), allow.authenticated("identityPool")];

const schema = a
  .schema({
    KitJob: a
      .model({
        requester: a.string().required(),
        status: a.string().required(),
        input: a.json(),
        steps: a.json(),
        result: a.json(),
        error: a.string(),
      })
      .disableOperations(["queries", "mutations", "subscriptions"])
      .authorization((allow) => [allow.owner()]),

    KitJobView: a.customType({
      id: a.id().required(),
      status: a.string().required(),
      steps: a.json(),
      result: a.json(),
      error: a.string(),
    }),

    KitProgress: a.customType({
      jobId: a.id().required(),
      status: a.string().required(),
      message: a.string(),
      result: a.json(),
    }),

    startKit: a
      .mutation()
      .arguments({
        jobId: a.id().required(),
        region: a.string(),
        era: a.string(),
        loves: a.string().array().required(),
        // From the journal: Qloo entities that lit them up in past sessions,
        // and everything already shown (so the next kit brings new things).
        learned: a.json(),
        avoidIds: a.string().array(),
      })
      .returns(a.ref("KitJobView"))
      .authorization(callers)
      .handler(a.handler.function(kitApi)),

    getKitJob: a
      .query()
      .arguments({ id: a.id().required() })
      .returns(a.ref("KitJobView"))
      .authorization(callers)
      .handler(a.handler.function(kitApi)),

    // Only the worker may publish; kit-api rejects calls from end users.
    publishProgress: a
      .mutation()
      .arguments({
        jobId: a.id().required(),
        status: a.string().required(),
        message: a.string(),
        result: a.json(),
      })
      .returns(a.ref("KitProgress"))
      .authorization((allow) => [allow.authenticated("identityPool")])
      .handler(a.handler.function(kitApi)),

    onKitProgress: a
      .subscription()
      .for(a.ref("publishProgress"))
      .arguments({ jobId: a.id().required() })
      .authorization(callers)
      .handler(a.handler.function(kitApi)),
  })
  .authorization((allow) => [allow.resource(kitApi), allow.resource(kitWorker)]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: "identityPool" },
});
