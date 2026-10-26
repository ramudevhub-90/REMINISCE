import { defineHosting } from "@aws-amplify/hosting";
import { App, Stack } from "aws-cdk-lib";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";

// Optional custom domain whose DNS lives elsewhere: set REMINISCE_DOMAIN and
// REMINISCE_CERT_ARN (an issued ACM certificate in us-east-1) at deploy time,
// then CNAME the domain to the CloudFront distribution. Only the certificate's
// ARN is used, so it is imported through a throwaway scope.
const domainName = process.env.REMINISCE_DOMAIN;
const certArn = process.env.REMINISCE_CERT_ARN;
const certificate =
  domainName && certArn ? Certificate.fromCertificateArn(new Stack(new App(), "CertRef"), "SiteCertificate", certArn) : undefined;

defineHosting({
  framework: "spa",
  buildCommand: "npm run build",
  buildOutputDir: "web/dist",
  ...(domainName && certificate ? { domain: { domainName, certificate } } : {}),
});
