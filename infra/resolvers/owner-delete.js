import { util } from "@aws-appsync/utils";

// deletePerson / deleteGroup / deleteAccount: remove one of the caller's records.
export function request(ctx) {
  return { operation: "DeleteItem", key: util.dynamodb.toMapValues({ owner: ctx.identity.sub, id: ctx.args.id }) };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  return ctx.result;
}
