// Connects the Amplify JS library to the reminisce CDK stack. config.json is
// written next to the app at deploy time (and by `npm run config` for local
// development), so the same build works against any deployment.
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/api";

const config = await fetch("/config.json").then((res) => {
  if (!res.ok) throw new Error("Missing config.json. For local development run: npm run config");
  return res.json();
});

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: config.userPoolId,
      userPoolClientId: config.userPoolClientId,
      identityPoolId: config.identityPoolId,
      allowGuestAccess: true,
      loginWith: { email: true },
    },
  },
  API: { GraphQL: { endpoint: config.apiUrl, region: config.region, defaultAuthMode: "iam" } },
});

const client = generateClient();

// Runs one GraphQL operation and returns its data. authMode "iam" (every
// visitor, guest or signed in) or "userPool" (a signed-in carer's own records).
export async function gql(query, variables, authMode = "iam") {
  const { data, errors } = await client.graphql({ query, variables, authMode });
  if (errors?.length) throw new Error(errors[0].message);
  return data;
}

export function subscribe(query, variables, handlers) {
  return client.graphql({ query, variables, authMode: "iam" }).subscribe(handlers);
}
