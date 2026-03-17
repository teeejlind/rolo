export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      if (!env.API_ORIGIN) {
        return Response.json(
          {
            error:
              "Cloudflare API proxy is missing API_ORIGIN. Point it at the public Transito Bogota API host."
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

    return new Response("Not found", { status: 404 });
  }
};

function withTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}
