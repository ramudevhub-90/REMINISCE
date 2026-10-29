// Mutation.publishProgress (the worker's role only): echo the event so
// AppSync pushes it to onKitProgress subscribers for that jobId.
export function request(ctx) {
  return { payload: ctx.args };
}

export function response(ctx) {
  return ctx.result;
}
