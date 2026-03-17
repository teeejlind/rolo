import { maybeHandleEmbeddedApi } from "./cloudflare/embedded-api.js";

export default {
  async fetch(request, env) {
    const embeddedResponse = await maybeHandleEmbeddedApi(request, env);
    if (embeddedResponse) {
      return embeddedResponse;
    }

    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404 });
    }

    if (!env.API_ORIGIN) {
      return Response.json(
        {
          error:
            "Cloudflare API proxy is missing API_ORIGIN and no embedded API route matched this request."
        },
        { status: 500 }
      );
    }

    const upstreamBase = new URL(withTrailingSlash(env.API_ORIGIN));
    const upstreamPath = url.pathname.replace(/^\/api/, "") || "/";
    const upstreamUrl = new URL(upstreamPath, upstreamBase);
    upstreamUrl.search = url.search;

    const headers = new Headers(request.headers);
    headers.set("x-forwarded-host", url.host);

    return fetch(
      new Request(upstreamUrl.toString(), {
        method: request.method,
        headers,
        body: request.body,
        redirect: "follow"
      })
    );
  }
};

function withTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}
