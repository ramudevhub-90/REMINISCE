// The whole of Reminisce as one CDK stack. Every resource has an explicit
// reminisce-… name.
//
//   browser ─▶ CloudFront reminisce.revenuerush.in ─▶ S3 reminisce-web-<account>
//   browser ──IAM (identity pool reminisce-visitors)──▶ AppSync reminisce-api
//     startKit / getKitJob ─▶ λ reminisce-kit-api ─▶ table reminisce-jobs, SQS reminisce-jobs
//   SQS ─▶ λ reminisce-kit-worker ─▶ Qloo (harness layer), progress via publishProgress ─▶ onKitProgress
//   browser ──Cognito (user pool reminisce-carers)──▶ AppSync: people, groups, accounts tables
//   sign-in: email + 6-digit code, λ reminisce-auth-* triggers, sent by SES

import path from "node:path";
import { fileURLToPath } from "node:url";
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as appsync from "aws-cdk-lib/aws-appsync";
import { Certificate, CertificateValidation } from "aws-cdk-lib/aws-certificatemanager";
import { Distribution, HttpVersion, ResponseHeadersPolicy, ViewerProtocolPolicy } from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { AccountRecovery, CfnIdentityPool, CfnIdentityPoolRoleAttachment, UserPool } from "aws-cdk-lib/aws-cognito";
import { AttributeType, BillingMode, Table, type TableProps } from "aws-cdk-lib/aws-dynamodb";
import { FederatedPrincipal, ManagedPolicy, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Code, LayerVersion, Runtime } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { NodejsFunction, type NodejsFunctionProps, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { AaaaRecord, ARecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { Queue } from "aws-cdk-lib/aws-sqs";
import type { Construct } from "constructs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");

// SecureString, created by hand (CloudFormation can't create SecureStrings):
// read -rs "K?Qloo key: " && aws ssm put-parameter --name /reminisce/qloo-api-key --type SecureString --overwrite --value "$K"; unset K
const QLOO_KEY_PARAM = "/reminisce/qloo-api-key";

export interface ReminisceProps extends StackProps {
  // Custom domain for the site, in a Route 53 zone in this account. Without
  // it the site is served on its cloudfront.net address.
  domain?: { name: string; hostedZoneId: string };
  // Sender for sign-in codes, verified in SES.
  fromAddress: string;
  // Send-only role in an account whose SES has production access. Its trust
  // policy must name the reminisce-auth-create-challenge role.
  sesRoleArn?: string;
  // A shared account for judges: this email always takes this code, and no
  // email is sent. Leave it out for a deployment without one.
  demoLogin?: { email: string; code: string };
}

export class ReminisceStack extends Stack {
  constructor(scope: Construct, id: string, props: ReminisceProps) {
    super(scope, id, props);

    // ── Storage and queue ──
    const table = (name: string, props: Partial<TableProps>) =>
      new Table(this, name, {
        tableName: `reminisce-${name}`,
        partitionKey: { name: "id", type: AttributeType.STRING },
        billingMode: BillingMode.PAY_PER_REQUEST,
        removalPolicy: RemovalPolicy.DESTROY,
        ...props,
      });
    // Agent jobs, read back only by the identity that started them.
    const jobsTable = table("jobs", { timeToLiveAttribute: "expiresAt" });
    // Cached Qloo responses, to protect the event quota.
    const qlooCache = table("qloo-cache", { partitionKey: { name: "key", type: AttributeType.STRING }, timeToLiveAttribute: "expiresAt" });
    // Signed-in carers' records, keyed by owner (Cognito sub) so each account
    // reads only its own. Kept if the stack is deleted.
    const carerTable = (name: string) =>
      table(name, {
        partitionKey: { name: "owner", type: AttributeType.STRING },
        sortKey: { name: "id", type: AttributeType.STRING },
        pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
        removalPolicy: RemovalPolicy.RETAIN,
      });
    const peopleTable = carerTable("people");
    const groupsTable = carerTable("groups");
    const accountsTable = carerTable("accounts");

    const deadLetters = new Queue(this, "JobsDeadLetters", { queueName: "reminisce-jobs-dlq", retentionPeriod: Duration.days(4) });
    // Agent runs take 20–40 s, longer than an AppSync resolver may, hence the queue.
    const jobsQueue = new Queue(this, "JobsQueue", {
      queueName: "reminisce-jobs",
      visibilityTimeout: Duration.seconds(360),
      deadLetterQueue: { queue: deadLetters, maxReceiveCount: 2 },
    });

    // ── Lambdas ──
    const fn = (name: string, entry: string, props: Partial<NodejsFunctionProps>) =>
      new NodejsFunction(this, name, {
        functionName: `reminisce-${name}`,
        role: new Role(this, `${name}-role`, {
          roleName: `reminisce-${name}`,
          assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
          managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
        }),
        entry: path.join(HERE, "functions", entry),
        runtime: Runtime.NODEJS_22_X,
        projectRoot: ROOT,
        depsLockFilePath: path.join(ROOT, "package-lock.json"),
        logGroup: new LogGroup(this, `${name}-logs`, {
          logGroupName: `/aws/lambda/reminisce-${name}`,
          retention: RetentionDays.ONE_MONTH,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
        bundling: {
          format: OutputFormat.ESM,
          target: "node22",
          mainFields: ["module", "main"],
          // Some dependencies still call require(); give ESM bundles one.
          banner: "import { createRequire as __reminisceRequire } from 'module'; const require = __reminisceRequire(import.meta.url);",
        },
        ...props,
      });

    // ── Carers: passwordless sign-in with a 6-digit email code ──
    const authFn = (step: string, props: Partial<NodejsFunctionProps> = {}) =>
      fn(`auth-${step}`, `auth/${step}.ts`, { timeout: Duration.seconds(5), memorySize: 256, ...props });
    const createChallenge = authFn("create-challenge", {
      timeout: Duration.seconds(15),
      environment: {
        FROM_ADDRESS: props.fromAddress,
        SES_REGION: this.region,
        ...(props.sesRoleArn ? { SES_ROLE_ARN: props.sesRoleArn } : {}),
        ...(props.demoLogin ? { DEMO_EMAIL: props.demoLogin.email.toLowerCase(), DEMO_CODE: props.demoLogin.code } : {}),
      },
    });
    createChallenge.addToRolePolicy(
      props.sesRoleArn
        ? new PolicyStatement({ actions: ["sts:AssumeRole"], resources: [props.sesRoleArn] })
        : new PolicyStatement({ actions: ["ses:SendEmail"], resources: ["*"] }),
    );
    const carers = new UserPool(this, "Carers", {
      userPoolName: "reminisce-carers",
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      signInCaseSensitive: false,
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      lambdaTriggers: {
        preSignUp: authFn("pre-sign-up"),
        defineAuthChallenge: authFn("define-challenge"),
        createAuthChallenge: createChallenge,
        verifyAuthChallengeResponse: authFn("verify-challenge"),
      },
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const webClient = carers.addClient("WebClient", {
      userPoolClientName: "reminisce-web",
      authFlows: { custom: true },
      preventUserExistenceErrors: true,
    });

    // ── API ──
    const api = new appsync.GraphqlApi(this, "Api", {
      name: "reminisce-api",
      definition: appsync.Definition.fromFile(path.join(HERE, "schema.graphql")),
      authorizationConfig: {
        defaultAuthorization: { authorizationType: appsync.AuthorizationType.IAM },
        additionalAuthorizationModes: [{ authorizationType: appsync.AuthorizationType.USER_POOL, userPoolConfig: { userPool: carers } }],
      },
    });

    const kitApi = fn("kit-api", "kit-api/handler.ts", {
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: { KIT_JOB_TABLE: jobsTable.tableName, KIT_QUEUE_URL: jobsQueue.queueUrl },
    });
    jobsTable.grantReadWriteData(kitApi);
    jobsQueue.grantSendMessages(kitApi);

    const worker = fn("kit-worker", "kit-worker/handler.ts", {
      timeout: Duration.seconds(300),
      memorySize: 2048,
      environment: {
        KIT_JOB_TABLE: jobsTable.tableName,
        QLOO_CACHE_TABLE: qlooCache.tableName,
        API_URL: api.graphqlUrl,
        QLOO_MODE: "live",
        QLOO_KEY_PARAM,
        // Event keys only work against the hackathon server. The harness sends the
        // key to a non-production URL only when it's also marked as trusted.
        QLOO_BASE_URL: "https://hackathon.api.qloo.com",
        QLOO_TRUSTED_BASE_URL: "https://hackathon.api.qloo.com",
        // The harness writes config under $HOME; only /tmp is writable in Lambda.
        HOME: "/tmp",
      },
      // The Qloo harness CLI, installed by `npm run layer`.
      layers: [
        new LayerVersion(this, "QlooHarness", {
          layerVersionName: "reminisce-qloo-harness",
          code: Code.fromAsset(path.join(HERE, "layers", "qloo-harness")),
          compatibleRuntimes: [Runtime.NODEJS_22_X],
          description: "@qloo/qloo-harness CLI",
        }),
      ],
    });
    worker.addEventSource(new SqsEventSource(jobsQueue, { batchSize: 1 }));
    jobsTable.grantWriteData(worker);
    qlooCache.grantReadWriteData(worker);
    api.grantMutation(worker, "publishProgress");
    worker.addToRolePolicy(
      new PolicyStatement({ actions: ["ssm:GetParameter"], resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter${QLOO_KEY_PARAM}`] }),
    );

    // ── Resolvers ──
    const kitSource = api.addLambdaDataSource("KitApiFn", kitApi);
    kitSource.createResolver("MutationstartKit", { typeName: "Mutation", fieldName: "startKit" });
    kitSource.createResolver("QuerygetKitJob", { typeName: "Query", fieldName: "getKitJob" });
    api.addNoneDataSource("Progress").createResolver("MutationpublishProgress", {
      typeName: "Mutation",
      fieldName: "publishProgress",
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      code: appsync.Code.fromAsset(path.join(HERE, "resolvers", "publish-progress.js")),
    });
    const ownerResolvers = (source: appsync.DynamoDbDataSource, fields: { list: string; save: string; remove: string }) => {
      const js = (typeName: string, fieldName: string, file: string) =>
        source.createResolver(`${typeName}${fieldName}`, {
          typeName,
          fieldName,
          runtime: appsync.FunctionRuntime.JS_1_0_0,
          code: appsync.Code.fromAsset(path.join(HERE, "resolvers", file)),
        });
      js("Query", fields.list, "owner-list.js");
      js("Mutation", fields.save, "owner-save.js");
      js("Mutation", fields.remove, "owner-delete.js");
    };
    ownerResolvers(api.addDynamoDbDataSource("PeopleTable", peopleTable), { list: "listPeople", save: "savePerson", remove: "deletePerson" });
    ownerResolvers(api.addDynamoDbDataSource("GroupsTable", groupsTable), { list: "listGroups", save: "saveGroup", remove: "deleteGroup" });
    ownerResolvers(api.addDynamoDbDataSource("AccountsTable", accountsTable), { list: "listAccounts", save: "saveAccount", remove: "deleteAccount" });

    // ── Visitors ──
    // Every browser gets an identity from this pool: a guest one with no
    // sign-up, or a carer one after sign-in. Both may run agent jobs; neither
    // may publish progress.
    const visitors = new CfnIdentityPool(this, "Visitors", {
      identityPoolName: "reminisce-visitors",
      allowUnauthenticatedIdentities: true,
      allowClassicFlow: false,
      cognitoIdentityProviders: [{ clientId: webClient.userPoolClientId, providerName: carers.userPoolProviderName }],
    });
    const visitorRole = (name: string, amr: string) => {
      const role = new Role(this, `${name}-role`, {
        roleName: `reminisce-${name}`,
        assumedBy: new FederatedPrincipal(
          "cognito-identity.amazonaws.com",
          { StringEquals: { "cognito-identity.amazonaws.com:aud": visitors.ref }, "ForAnyValue:StringLike": { "cognito-identity.amazonaws.com:amr": amr } },
          "sts:AssumeRoleWithWebIdentity",
        ),
      });
      api.grantMutation(role, "startKit");
      api.grantQuery(role, "getKitJob");
      api.grantSubscription(role, "onKitProgress");
      return role;
    };
    new CfnIdentityPoolRoleAttachment(this, "VisitorRoles", {
      identityPoolId: visitors.ref,
      roles: { unauthenticated: visitorRole("guest", "unauthenticated").roleArn, authenticated: visitorRole("carer", "authenticated").roleArn },
    });

    // ── Website ──
    const siteBucket = new Bucket(this, "Site", {
      bucketName: `reminisce-web-${this.account}`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    const zone = props.domain && HostedZone.fromHostedZoneAttributes(this, "Zone", { hostedZoneId: props.domain.hostedZoneId, zoneName: props.domain.name });
    const certificate =
      props.domain && zone && new Certificate(this, "SiteCertificate", { certificateName: "reminisce-web", domainName: props.domain.name, validation: CertificateValidation.fromDns(zone) });
    const site = new Distribution(this, "Cdn", {
      comment: "reminisce-web",
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      defaultRootObject: "index.html",
      // A single-page app: unknown paths load the app, which routes itself.
      errorResponses: [403, 404].map((httpStatus) => ({ httpStatus, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: Duration.seconds(0) })),
      httpVersion: HttpVersion.HTTP2_AND_3,
      ...(props.domain && certificate ? { domainNames: [props.domain.name], certificate } : {}),
    });
    if (props.domain && zone) {
      const target = RecordTarget.fromAlias(new CloudFrontTarget(site));
      new ARecord(this, "SiteA", { zone, recordName: props.domain.name, target });
      new AaaaRecord(this, "SiteAaaa", { zone, recordName: props.domain.name, target });
    }

    // The built app (npm run build) plus config.json, which tells it where
    // the backend is, so one `cdk deploy` ships both.
    const config = {
      region: this.region,
      apiUrl: api.graphqlUrl,
      userPoolId: carers.userPoolId,
      userPoolClientId: webClient.userPoolClientId,
      identityPoolId: visitors.ref,
    };
    new BucketDeployment(this, "SiteFiles", {
      destinationBucket: siteBucket,
      sources: [Source.asset(path.join(ROOT, "web", "dist")), Source.jsonData("config.json", config)],
      distribution: site,
      distributionPaths: ["/*"],
      memoryLimit: 512,
    });

    const siteUrl = `https://${props.domain?.name ?? site.distributionDomainName}`;
    new CfnOutput(this, "SiteUrl", { value: siteUrl });
    new CfnOutput(this, "WorkerFunctionName", { value: worker.functionName });
    new CfnOutput(this, "CreateChallengeRoleArn", { value: createChallenge.role!.roleArn });
    // For local development: npm run config writes these to web/public/config.json.
    Object.entries(config).forEach(([key, value]) => new CfnOutput(this, key[0].toUpperCase() + key.slice(1), { value }));
  }
}
