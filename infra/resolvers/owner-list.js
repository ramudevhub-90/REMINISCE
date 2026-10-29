import { util } from "@aws-appsync/utils";

// listPeople / listGroups / listAccounts: the caller's own records, a page at
// a time. Tables are keyed by owner (the carer's Cognito sub) and id.
export function request(ctx) {
  return {
    operation: "Query",
    query: { expression: "#owner = :owner", expressionNames: { "#owner": "owner" }, expressionValues: util.dynamodb.toMapValues({ ":owner": ctx.identity.sub }) },
    limit: 100,
    nextToken: ctx.args.nextToken,
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  return { items: ctx.result.items, nextToken: ctx.result.nextToken };
}
