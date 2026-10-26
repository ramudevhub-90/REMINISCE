import { defineBackend } from "@aws-amplify/backend";
import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Code, LayerVersion, Runtime, type Function as LambdaFunction } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { kitWorker } from "./functions/kit-worker/resource";
import { kitApi } from "./functions/kit-api/resource";
import { createChallenge } from "./auth/create-challenge/resource";

const backend = defineBackend({ auth, data, kitApi, kitWorker, createChallenge });

const stack = backend.data.stack;
const apiFn = backend.kitApi.resources.lambda as LambdaFunction;
const workerFn = backend.kitWorker.resources.lambda as LambdaFunction;
const kitJobTable = backend.data.resources.tables["KitJob"];

// Agent jobs: kit-api enqueues on startKit, the worker consumes one job at a time.
const deadLetters = new Queue(stack, "KitJobsDLQ", { retentionPeriod: Duration.days(4) });
const queue = new Queue(stack, "KitJobs", {
  visibilityTimeout: Duration.seconds(360),
  deadLetterQueue: { queue: deadLetters, maxReceiveCount: 2 },
});
queue.grantSendMessages(apiFn);
workerFn.addEventSource(new SqsEventSource(queue, { batchSize: 1 }));

kitJobTable.grantReadWriteData(apiFn);
kitJobTable.grantWriteData(workerFn);
apiFn.addEnvironment("KIT_QUEUE_URL", queue.queueUrl);
apiFn.addEnvironment("KIT_JOB_TABLE", kitJobTable.tableName);
workerFn.addEnvironment("KIT_JOB_TABLE", kitJobTable.tableName);

// Cache of Qloo responses, to protect the event quota.
const qlooCache = new Table(stack, "QlooCache", {
  partitionKey: { name: "key", type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: "expiresAt",
  removalPolicy: RemovalPolicy.DESTROY,
});
qlooCache.grantReadWriteData(workerFn);
workerFn.addEnvironment("QLOO_CACHE_TABLE", qlooCache.tableName);

// Qloo harness CLI as a layer (installed by `npm run layer`).
workerFn.addLayers(
  new LayerVersion(stack, "QlooHarness", {
    code: Code.fromAsset("amplify/layers/qloo-harness"),
    compatibleRuntimes: [Runtime.NODEJS_22_X],
    description: "@qloo/qloo-harness 0.1.26",
  }),
);

// Qloo key: an SSM SecureString created out of band, read at runtime.
const QLOO_KEY_PARAM = "/reminisce/qloo-api-key";
workerFn.addEnvironment("QLOO_KEY_PARAM", QLOO_KEY_PARAM);
workerFn.addToRolePolicy(
  new PolicyStatement({
    actions: ["ssm:GetParameter"],
    resources: [`arn:aws:ssm:${Stack.of(stack).region}:${Stack.of(stack).account}:parameter${QLOO_KEY_PARAM}`],
  }),
);

// Sign-in codes: emailed from REMINISCE_FROM_ADDRESS. With REMINISCE_SES_ROLE_ARN
// set, the Lambda assumes that send-only role in an account whose SES has
// production access; otherwise it sends with this account's SES (in the
// sandbox, only to verified addresses). Both are deploy-time settings so no
// account details live in the repo.
const challengeFn = backend.createChallenge.resources.lambda as LambdaFunction;
const sesRoleArn = process.env.REMINISCE_SES_ROLE_ARN ?? "";
challengeFn.addEnvironment("FROM_ADDRESS", process.env.REMINISCE_FROM_ADDRESS ?? "");
challengeFn.addEnvironment("SES_REGION", process.env.REMINISCE_SES_REGION ?? "us-east-1");
if (sesRoleArn) {
  challengeFn.addEnvironment("SES_ROLE_ARN", sesRoleArn);
  challengeFn.addToRolePolicy(new PolicyStatement({ actions: ["sts:AssumeRole"], resources: [sesRoleArn] }));
} else {
  challengeFn.addToRolePolicy(new PolicyStatement({ actions: ["ses:SendEmail", "ses:SendRawEmail"], resources: ["*"] }));
}

