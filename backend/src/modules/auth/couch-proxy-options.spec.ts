import { createCouchProxyOptions } from "./couch-proxy-options";

describe("createCouchProxyOptions", () => {
  it("uses server-side decoded Basic auth while stripping browser credentials", () => {
    const options = createCouchProxyOptions(
      "http://couch%40admin:p%40ss%3Aword@couchdb.internal:5984/"
    );

    expect(options.upstream).toBe("http://couchdb.internal:5984/");

    const headers = options.replyOptions.rewriteRequestHeaders({} as any, {
      accept: "application/json",
      authorization: "Bearer browser-controlled-token",
      cookie: "access_token=application-jwt; theme=dark",
    });

    expect(headers).toEqual({
      accept: "application/json",
      authorization: "Basic Y291Y2hAYWRtaW46cEBzczp3b3Jk",
    });
  });
});
