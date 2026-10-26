import { defineHosting } from "@aws-amplify/hosting";
import { App, Stack } from "aws-cdk-lib";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";

// Optional custom domain, set at deploy time: REMINISCE_DOMAIN plus
// REMINISCE_CERT_ARN (an issued ACM certificate in us-east-1). With
// REMINISCE_HOSTED_ZONE / _ID (a Route 53 zone in this account) the alias
// records are created automatically; without them, CNAME the domain to the
// distribution yourself. Only the certificate's ARN is used, so it is
// imported through a throwaway scope.
const domainName = process.env.REMINISCE_DOMAIN;
const certArn = process.env.REMINISCE_CERT_ARN;
const hostedZone = process.env.REMINISCE_HOSTED_ZONE;
const hostedZoneId = process.env.REMINISCE_HOSTED_ZONE_ID;
const certificate =
  domainName && certArn ? Certificate.fromCertificateArn(new Stack(new App(), "CertRef"), "SiteCertificate", certArn) : undefined;

defineHosting({
  framework: "spa",
  buildCommand: "npm run build",
  buildOutputDir: "web/dist",
  ...(domainName && certificate
    ? { domain: { domainName, certificate, ...(hostedZone && hostedZoneId ? { hostedZone, hostedZoneId } : {}) } }
    : {}),
});
