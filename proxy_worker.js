'use strict';

const ASSET_URL = 'https://404.mise.eu.org/';
const DEFAULT_CACHE = 4 * 60 * 60;
const MAX_CACHE = 86400;

/* ================= utils ================= */
function matchPrefix(path, prefix) {
  if (!path.startsWith(prefix)) return { match: false };
  return {
    match: true,
    rest: path.slice(prefix.length),
    length: prefix.length,
  };
}

/* ================= headers ================= */
function addBaseHeaders(headers) {
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,DELETE,CONNECT,OPTIONS,TRACE,PATCH');
  headers.set('Access-Control-Allow-Headers', '*,Authorization');
  headers.set('Access-Control-Max-Age', '86400');
  headers.set('Timing-Allow-Origin', '*');
}

function makeRes(body, status = 200) {
  const h = new Headers();
  addBaseHeaders(h);
  return new Response(body, { status, headers: h });
}

/* ================= entry ================= */
export default {
  async fetch(request) {
    try {
      return await handler(request);
    } catch (e) {
      return makeRes('Worker Error:\n' + e.stack, 502);
    }
  },
};

async function handler(request) {
  const u = new URL(request.url);
  let path = u.href.slice(u.origin.length + 1);

  // 自动补全 http(s):/ → http(s)://
  path = path.replace(/^https?:\/(?!\/)/, m => m + '/');

  if (request.method === 'OPTIONS' || path === 'generate_204') {
    return makeRes('', 204);
  }
  if (path.startsWith('generate_200')) {
    return makeRes('', 200);
  }

  let m;

  /* ---------- cache_all ---------- */
  m = matchPrefix(path, 'cache_all/');
  if (m.match) return handleCacheAll(m.rest, request);

  /* ---------- cache ---------- */
  m = matchPrefix(path, 'cache/');
  if (m.match) return handleCache(m.rest, request);

  /* ---------- all ---------- */
  m = matchPrefix(path, 'all/');
  if (m.match) return proxyFetch(m.rest, request, { redirect: true });

  /* ---------- set_referer ---------- */
  m = matchPrefix(path, 'set_referer/');
  if (m.match) {
    const rest = m.rest;

    // referer = 前半段，realUrl = 最后一个 http(s):// 开始
    const match = rest.match(/(https?:\/\/[^]+)$/);
    if (!match) return makeRes('Bad Request', 400);

    const realUrl = match[1];
    const referer = rest.slice(0, rest.length - realUrl.length).replace(/\/$/, '');

    return proxyFetch(realUrl, request, { referer });
  }

  /* ---------- keep_referer ---------- */
  m = matchPrefix(path, 'keep_referer/');
  if (m.match) {
    return proxyFetch(m.rest, request, {
      referer: request.headers.get('Referer'),
    });
  }

  /* ---------- normal proxy ---------- */
  if (path.startsWith('http')) {
    return proxyFetch(path, request, {});
  }

  return fetch(ASSET_URL);
}

/* ================= cache helpers ================= */
async function handleCache(rest, request) {
  let ttl = DEFAULT_CACHE;
  let realUrl = rest;

  const m = rest.match(/^(\d+)\/(http.*)$/);
  if (m) {
    ttl = Math.min(parseInt(m[1], 10) || DEFAULT_CACHE, MAX_CACHE);
    realUrl = m[2];
  }

  return fetchWithCache(realUrl, request, ttl, false);
}

async function handleCacheAll(rest, request) {
  let ttl = DEFAULT_CACHE;
  let realUrl = rest;

  const m = rest.match(/^(\d+)\/(http.*)$/);
  if (m) {
    ttl = Math.min(parseInt(m[1], 10) || DEFAULT_CACHE, MAX_CACHE);
    realUrl = m[2];
  }

  return fetchWithCache(realUrl, request, ttl, true);
}

async function fetchWithCache(url, request, ttl, followRedirect) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return proxyFetch(url, request, { redirect: followRedirect });
  }

  const cache = caches.default;
  const cacheKey = new Request(url, { method: 'GET' });

  const cached = await cache.match(cacheKey);
  if (cached) return handleETag(request, cached);

  const upstream = await fetch(url, buildFetchInit(request, { redirect: followRedirect }));

  if (!upstream.ok) {
    return buildDownstreamResponse(request, upstream);
  }

  const buf = await upstream.arrayBuffer();
  const etag = await genETag(buf);

  const headers = new Headers(upstream.headers);
  headers.set('ETag', etag);
  headers.set('Cache-Control', `public, max-age=${ttl}`);

  forwardSetCookie(headers);
  stripCookies(headers);
  addBaseHeaders(headers);

  const res = new Response(buf, {
    status: upstream.status,
    headers,
  });

  await cache.put(cacheKey, res.clone());

  return handleETag(request, res);
}

/* ================= proxy ================= */
async function proxyFetch(url, request, opt) {
  const upstream = await fetch(url, buildFetchInit(request, opt));
  return buildDownstreamResponse(request, upstream);
}

function buildFetchInit(request, opt) {
  const headers = new Headers(request.headers);
  headers.delete('Origin');
  headers.delete('Cookie');
  headers.delete('Referer');

  const xCookie = request.headers.get('x-cookie');
  if (xCookie) headers.set('Cookie', xCookie);

  if (opt.referer) headers.set('Referer', opt.referer);

  const body = ['GET', 'HEAD'].includes(request.method) ? null : request.body;

  return {
    method: request.method,
    headers,
    body,
    redirect: opt.redirect ? 'follow' : 'manual',
  };
}

function buildDownstreamResponse(request, res) {
  const headers = new Headers(res.headers);

  forwardSetCookie(headers);
  stripCookies(headers);
  addBaseHeaders(headers);

  return new Response(res.body, {
    status: res.status,
    headers,
  });
}

/* ================= cookie rules ================= */
function stripCookies(headers) {
  headers.delete('Cookie');
  headers.delete('Set-Cookie');
}

function forwardSetCookie(headers) {
  const sc = headers.get('Set-Cookie');
  if (sc) headers.set('x-set-cookie', sc);
}

/* ================= etag ================= */
function handleETag(request, response) {
  const inm = request.headers.get('If-None-Match');
  const etag = response.headers.get('ETag');

  if (etag && inm === etag) {
    return new Response(null, {
      status: 304,
      headers: response.headers,
    });
  }
  return response;
}

async function genETag(buf) {
  const hash = await crypto.subtle.digest('SHA-1', buf);
  return `"${[...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')}"`;
}
