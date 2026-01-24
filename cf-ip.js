export default {
  async fetch(request, env, ctx) {
    // List: https://developers.cloudflare.com/workers/runtime-apis/request/#incomingrequestcfproperties
    const info = Object.assign({}, request.cf);
    for (const k of Object.keys(info)) {
      if (/^(tls|client|edge|request|verified)/.test(k)) {
        delete info[k];
      }
    }
    info.clientIp = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For');
    const resp = new Response(JSON.stringify(info));
    resp.headers.set('Content-Type', 'application/json');
    return resp;
  }
};