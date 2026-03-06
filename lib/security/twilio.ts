import twilio from "twilio";

function getPublicRequestUrl(url: URL, headers: Headers): string {
  const protocol = headers.get("x-forwarded-proto") ?? url.protocol.replace(/:$/, "");
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? url.host;
  const path = `${url.pathname}${url.search}`;
  return `${protocol}://${host}${path}`;
}

export function verifyTwilioWebhookSignature(params: {
  authToken: string;
  signature: string | null;
  url: URL;
  headers: Headers;
  form: Record<string, string>;
}): boolean {
  if (!params.signature) return false;

  const requestUrl = getPublicRequestUrl(params.url, params.headers);
  return twilio.validateRequest(params.authToken, params.signature, requestUrl, params.form);
}
