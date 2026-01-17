'use strict';

const ASSET_URL = 'https://404.mise.eu.org/';

// CF proxy all, 一切给CF代理，true/false
const CFproxy = true;

/**
 * @param {any} body
 * @param {number} status
 * @param {Object<string, string>} headers
 */
function makeRes(body, status = 200, headers = {}) {
  headers['Access-Control-Allow-Methods'] = 'GET,HEAD,POST,PUT,DELETE,CONNECT,OPTIONS,TRACE,PATCH';
  headers['Access-Control-Allow-Headers'] = '*,Authorization';
  headers['Access-Control-Allow-Origin'] = '*';
  return new Response(body, { status, headers });
}

export default {
  async fetch(request, env) {
    return fetchHandler(request).catch(err => makeRes('Function Error:\n' + err.stack, 502));
  },
};

/**
 * @param {FetchRequest} request
 */
async function fetchHandler(request) {
  const urlStr = request.url;
  const urlObj = new URL(urlStr);
  let path = urlObj.href.replace(urlObj.origin + '/', '');
  path = path.replace(/http:\/(?!\/)/g, 'http://');
  path = path.replace(/https:\/(?!\/)/g, 'https://');
  let redirect = false;

  if (request.method === 'OPTIONS' || path === 'generate_204') {
    return makeRes('', 204);
  }
  if (path.startsWith('generate_200')) {
    return makeRes('', 200);
  }
  // /all/:others
  if (path.startsWith('all/')) {
    path = path.slice(4);
    redirect = true;
  }
  // /:link
  if (path.startsWith('http')) {
    return fetchAndApply(path, request, { follow_redirect: redirect });
  }
  // /set_referer/:referer header/:link
  if (path.startsWith('set_referer/')) {
    let url_split = path.slice('set_referer/'.length);
    url_split = url_split.split('/http');
    const referer = url_split[0];
    const realUrl = 'http' + url_split[1];

    return fetchAndApply(realUrl, request, { follow_redirect: redirect, referer });
  }
  // /keep_referer/:link
  if (path.startsWith('keep_referer/')) {
    const realUrl = path.slice('keep_referer/'.length);
    const referer = request.headers.get('referer');
    return fetchAndApply(realUrl, request, { follow_redirect: redirect, referer });
  }

  try {
    return await fetch(ASSET_URL);
  } catch (error) {
    return makeRes('Error:\n' + error, 502);
  }
}

async function fetchAndApply(host, request, options = {}) {
  let new_url = new URL(host);

  let response = null;
  const referer = options.referer;
  const follow_redirect = options.follow_redirect !== undefined ? options.follow_redirect : true;
  if (!CFproxy) {
    response = await fetch(new_url, request);
  } else {
    let method = request.method;
    let body = request.body;
    let request_headers = request.headers;
    let new_request_headers = new Headers(request_headers);
    new_request_headers.set('Host', new_url.host);
    new_request_headers.delete('Origin');
    referer ? new_request_headers.set('Referer', referer) : new_request_headers.delete('Referer');

    response = await fetch(new_url.href, {
      method: method,
      body: body,
      headers: new_request_headers,
      redirect: follow_redirect ? 'follow' : 'manual',
    });
  }

  let out_headers = new Headers(response.headers);
  // if (out_headers.get('Content-Disposition') == 'attachment') out_headers.delete('Content-Disposition');
  let out_body = response.body;

  out_headers.set('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,DELETE,CONNECT,OPTIONS,TRACE,PATCH');
  out_headers.set('Access-Control-Allow-Headers', '*,Authorization');
  out_headers.set('Access-Control-Allow-Origin', '*');
  out_headers.set('Access-Control-Max-Age', '86400');
  let out_response = new Response(out_body, {
    status: response.status,
    headers: out_headers,
  });

  return out_response;
}
