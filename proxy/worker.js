// Web プロキシ中継サーバー (Cloudflare Workers 用)
//
// 使い方: https://<worker>.workers.dev/proxy/https://example.com/
// 環境変数 ACCESS_KEY を設定すると https://<worker>.workers.dev/<ACCESS_KEY>/proxy/... の形式でのみ利用可能になる。

const PROXY_SEGMENT = "/proxy/";

// 中継しないレスポンスヘッダー (iframe 表示やリンク書き換えを妨げるもの)
const STRIPPED_RESPONSE_HEADERS = [
  "content-security-policy",
  "content-security-policy-report-only",
  "x-frame-options",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "cross-origin-resource-policy",
  "strict-transport-security",
  "content-length",
];

// 中継しないリクエストヘッダー
const STRIPPED_REQUEST_HEADERS = [
  "host",
  "origin",
  "referer",
  "cookie",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-real-ip",
];

// 書き換え対象の属性
const URL_ATTRIBUTES = {
  a: ["href"],
  area: ["href"],
  link: ["href"],
  img: ["src", "srcset"],
  source: ["src", "srcset"],
  script: ["src"],
  iframe: ["src"],
  frame: ["src"],
  embed: ["src"],
  video: ["src", "poster"],
  audio: ["src"],
  track: ["src"],
  form: ["action"],
  input: ["src"],
  button: ["formaction"],
  object: ["data"],
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const prefix = env.ACCESS_KEY ? `/${env.ACCESS_KEY}` : "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (prefix && !url.pathname.startsWith(prefix + "/")) {
      return textResponse("Forbidden", 403);
    }

    const rest = url.pathname.slice(prefix.length);
    if (!rest.startsWith(PROXY_SEGMENT)) {
      return textResponse(
        `使い方: ${url.origin}${prefix}${PROXY_SEGMENT}https://example.com/`,
        200,
      );
    }

    const target = parseTarget(rest.slice(PROXY_SEGMENT.length) + url.search);
    if (!target) {
      return textResponse("URL が不正です (http:// または https:// で始めてください)", 400);
    }
    if (isBlockedHost(target.hostname)) {
      return textResponse("このホストへの接続は許可されていません", 403);
    }

    const proxyBase = `${url.origin}${prefix}${PROXY_SEGMENT}`;
    const toProxy = (raw, base = target) => rewriteUrl(raw, base, proxyBase);

    let upstream;
    try {
      upstream = await fetch(target.toString(), {
        method: request.method,
        headers: buildRequestHeaders(request.headers),
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        redirect: "manual",
      });
    } catch (err) {
      return textResponse(`接続に失敗しました: ${err.message}`, 502);
    }

    const headers = new Headers(upstream.headers);
    for (const name of STRIPPED_RESPONSE_HEADERS) headers.delete(name);
    for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v);

    const location = headers.get("location");
    if (location) headers.set("location", toProxy(location));

    const init = { status: upstream.status, statusText: upstream.statusText, headers };
    const contentType = headers.get("content-type") || "";
    if (upstream.body && contentType.includes("text/css")) {
      return new Response(rewriteCss(await upstream.text(), toProxy), init);
    }

    const response = new Response(upstream.body, init);
    if (contentType.includes("text/html")) {
      return rewriteHtml(response, target, toProxy);
    }
    return response;
  },
};

function parseTarget(raw) {
  // ブラウザやプロキシが "https://" を "https:/" に潰すことがあるので補正する
  const fixed = decodeIfEncoded(raw).replace(/^(https?):\/+/i, "$1://");
  try {
    const target = new URL(fixed);
    return ["http:", "https:"].includes(target.protocol) ? target : null;
  } catch {
    return null;
  }
}

function decodeIfEncoded(raw) {
  if (!/^https?%3A/i.test(raw)) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

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

function buildRequestHeaders(original) {
  const headers = new Headers(original);
  for (const name of STRIPPED_REQUEST_HEADERS) headers.delete(name);
  return headers;
}

function rewriteUrl(raw, base, proxyBase) {
  const value = raw.trim();
  if (!value || /^(#|data:|blob:|javascript:|mailto:|tel:|about:)/i.test(value)) return raw;
  let absolute;
  try {
    absolute = new URL(value, base);
  } catch {
    return raw;
  }
  if (!["http:", "https:"].includes(absolute.protocol)) return raw;
  if (absolute.href.startsWith(proxyBase)) return absolute.href;
  return proxyBase + absolute.href;
}

function rewriteSrcset(value, toProxy) {
  return value
    .split(",")
    .map((part) => {
      const [src, ...descriptor] = part.trim().split(/\s+/);
      return [toProxy(src), ...descriptor].join(" ");
    })
    .join(", ");
}

function rewriteCss(css, toProxy) {
  return css
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (_, quote, u) => `url(${quote}${toProxy(u)}${quote})`)
    .replace(/@import\s+(['"])([^'"]+)\1/gi, (_, quote, u) => `@import ${quote}${toProxy(u)}${quote}`);
}

function rewriteHtml(response, target, toProxy) {
  // <base href> があれば以降の相対 URL はそこを基準に解決する
  let base = target;
  const resolve = (value) => toProxy(value, base);

  let rewriter = new HTMLRewriter()
    .on("base[href]", {
      element(el) {
        try {
          base = new URL(el.getAttribute("href"), target);
        } catch {}
        el.remove();
      },
    })
    .on("meta[http-equiv]", {
      element(el) {
        const equiv = el.getAttribute("http-equiv").toLowerCase();
        if (equiv === "content-security-policy") {
          el.remove();
        } else if (equiv === "refresh") {
          const content = el.getAttribute("content") || "";
          el.setAttribute(
            "content",
            content.replace(/(url\s*=\s*)(['"]?)([^'";]+)\2/i, (_, p, q, u) => `${p}${q}${resolve(u)}${q}`),
          );
        }
      },
    })
    .on("[integrity]", {
      element(el) {
        // 書き換えでハッシュが合わなくなるため削除
        el.removeAttribute("integrity");
      },
    })
    .on("[style]", {
      element(el) {
        el.setAttribute("style", rewriteCss(el.getAttribute("style"), resolve));
      },
    });

  for (const [tag, attributes] of Object.entries(URL_ATTRIBUTES)) {
    for (const attr of attributes) {
      rewriter = rewriter.on(`${tag}[${attr}]`, {
        element(el) {
          const value = el.getAttribute(attr);
          el.setAttribute(attr, attr === "srcset" ? rewriteSrcset(value, resolve) : resolve(value));
        },
      });
    }
  }

  let cssBuffer = "";
  rewriter = rewriter.on("style", {
    text(chunk) {
      cssBuffer += chunk.text;
      if (chunk.lastInTextNode) {
        chunk.replace(rewriteCss(cssBuffer, resolve), { html: true });
        cssBuffer = "";
      } else {
        chunk.remove();
      }
    },
  });

  return rewriter.transform(response);
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
    "access-control-allow-headers": "*",
  };
}

function textResponse(body, status) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", ...corsHeaders() },
  });
}
