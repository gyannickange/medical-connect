import type { IncomingHttpHeaders } from "node:http";

export function createCouchProxyOptions(couchDbUrl: string) {
  const upstreamUrl = new URL(couchDbUrl);
  const hasCredentials = Boolean(upstreamUrl.username || upstreamUrl.password);
  const authorization = hasCredentials
    ? `Basic ${Buffer.from(
        `${decodeURIComponent(upstreamUrl.username)}:${decodeURIComponent(
          upstreamUrl.password
        )}`
      ).toString("base64")}`
    : undefined;

  upstreamUrl.username = "";
  upstreamUrl.password = "";

  return {
    upstream: upstreamUrl.toString(),
    // @fastify/http-proxy@9.x (the Fastify-4-compatible line this project is
    // pinned to) only forwards rewriteRequestHeaders to the real per-request
    // proxy call when it's nested under replyOptions — a top-level
    // rewriteRequestHeaders is silently ignored by @fastify/reply-from@9.x's
    // per-call options. Confirmed empirically: without this nesting, every
    // proxied request reached CouchDB with no Authorization header and
    // CouchDB itself returned 401.
    replyOptions: {
      rewriteRequestHeaders: (
        _request: unknown,
        headers: IncomingHttpHeaders
      ): IncomingHttpHeaders => {
        const upstreamHeaders = { ...headers };
        delete upstreamHeaders.authorization;
        delete upstreamHeaders.cookie;

        if (authorization) {
          upstreamHeaders.authorization = authorization;
        }

        return upstreamHeaders;
      },
    },
  };
}
