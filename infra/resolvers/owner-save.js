import { util } from "@aws-appsync/utils";

// savePerson / saveGroup / saveAccount: create (no id) or update one of the
// caller's records. The owner always comes from the token, never the input,
// and an update must name a record this owner already has.
export function request(ctx) {
  const { id, ...fields } = ctx.args.input;
  const now = util.time.nowISO8601();
  const sets = ["#updatedAt = :now", "#createdAt = if_not_exists(#createdAt, :now)"];
  const names = { "#updatedAt": "updatedAt", "#createdAt": "createdAt" };
  const values = { ":now": now };
  Object.keys(fields).forEach((k) => {
    sets.push(`#${k} = :${k}`);
    names[`#${k}`] = k;
    values[`:${k}`] = fields[k];
  });
  return {
    operation: "UpdateItem",
    key: util.dynamodb.toMapValues({ owner: ctx.identity.sub, id: id ?? util.autoId() }),
    update: { expression: `SET ${sets.join(", ")}`, expressionNames: names, expressionValues: util.dynamodb.toMapValues(values) },
    condition: { expression: id ? "attribute_exists(id)" : "attribute_not_exists(id)" },
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  return ctx.result;
}
