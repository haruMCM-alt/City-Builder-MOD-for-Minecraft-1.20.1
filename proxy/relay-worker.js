// 自前の CORS 中継サーバー (Cloudflare Workers, 任意)
//
// 公開中継サーバーが不安定なときに使う。index.html の「カスタム中継」に
//   https://cors-relay.<アカウント>.workers.dev/?url={enc}
// を設定する。環境変数 ACCESS_KEY を設定した場合は
//   https://cors-relay.<アカウント>.workers.dev/?key=<キー>&url={enc}

const FORWARDED_REQUEST_HEADERS = ["accept", "accept-language", "content-type", "user-agent", "range"];
const STRIPPED_RESPONSE_HEADERS = [
  "content-security-policy",
  "content-security-policy-report-only",
  "x-frame-options",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "cross-origin-resource-policy",
  "strict-transport-security",
  "set-cookie",
];

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const params = new URL(request.url).searchParams;
    if (env.ACCESS_KEY && params.get("key") !== env.ACCESS_KEY) {
      return textResponse("Forbidden", 403);
    }

    let target;
    try {
      target = new URL(params.get("url"));
    } catch {
      return textResponse("使い方: ?url=https://example.com/", 400);
    }
    if (!["http:", "https:"].includes(target.protocol) || isBlockedHost(target.hostname)) {
      return textResponse("この URL には接続できません", 403);
    }

    const headers = new Headers();
    for (const name of FORWARDED_REQUEST_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    let upstream;
    try {
      upstream = await fetch(target.toString(), {
        method: request.method,
        headers,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        redirect: "follow",
      });
    } catch (err) {
      return textResponse(`接続に失敗しました: ${err.message}`, 502);
    }

    const out = new Headers(upstream.headers);
    for (const name of STRIPPED_RESPONSE_HEADERS) out.delete(name);
    for (const [k, v] of Object.entries(corsHeaders())) out.set(k, v);
    out.set("x-final-url", upstream.url);
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
  },
};

function isBlockedHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "::1" ||
    /^f[cd][0-9a-f]{2}:/.test(host) ||
    /^fe80:/.test(host)
  );
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, HEAD, OPTIONS",
    "access-control-allow-headers": "*",
    "access-control-expose-headers": "x-final-url, content-type",
  };
}

function textResponse(body, status) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", ...corsHeaders() },
  });
}
