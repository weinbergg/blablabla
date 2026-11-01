/* eslint-disable @typescript-eslint/no-require-imports */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, timingSafeEqual } = require('node:crypto');
const { testRoot } = require('./paths.cjs');
const sha = value => createHash('sha256').update(value).digest();
const hop = ['connection', 'proxy-connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'proxy-authorization', 'proxy-authenticate'];
function cleanHeaders(headers) {
  const clean = { ...headers };
  for (const name of [...hop, ...(headers.connection || '').split(',').map(x => x.trim().toLowerCase())]) delete clean[name];
  return clean;
}
function createGate({ accounts, upstreamPort = 3001 }) {
  if (!accounts.length || accounts.some(a => !/^[a-z0-9]+$/.test(a.user) || !/^[a-f0-9]{64}$/.test(a.digest))) throw Error('Invalid gate credentials');
  const server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const auth = req.headers.authorization || '';
    const raw = /^Basic [A-Za-z0-9+/]+=*$/.test(auth) ? Buffer.from(auth.slice(6), 'base64').toString('utf8') : '';
    const digest = sha(raw);
    // All paths, including static assets, files, API and errors, require this gate.
    if (!raw || !accounts.some(a => timingSafeEqual(digest, Buffer.from(a.digest, 'hex')))) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Blabla private test", charset="UTF-8"' });
      res.end('Private Blabla test. Authentication required.'); return;
    }
    let url;
    try {
      if (!req.url?.startsWith('/') || req.url.startsWith('//')) throw Error('URL');
      url = new URL(req.url, 'http://local');
      // Fail closed on encoded routing delimiters and nested encoding.
      if (/%(?:25|2f|5c)|\\/i.test(url.pathname)) throw Error('URL');
      url.pathname = decodeURIComponent(url.pathname);
    } catch { res.writeHead(400); res.end('Invalid URL'); return; }
    if (/^\/api\/(?:billing|cron|admin\/billing|events\/checkout)(?:\/|$)/i.test(url.pathname)) { res.writeHead(403); res.end('Payments and scheduled jobs are disabled in this test.'); return; }
    const host = req.headers.host || '';
    const local = /^127\.0\.0\.1(?::\d+)?$/.test(host);
    if (!local && !/^[a-z0-9-]+\.trycloudflare\.com$/.test(host)) { res.writeHead(421); res.end('Unexpected host'); return; }
    const headers = cleanHeaders(req.headers);
    for (const key of Object.keys(headers)) if (key.startsWith('x-forwarded-') || key === 'forwarded' || key.startsWith('cf-')) delete headers[key];
    delete headers.authorization;
    headers.host = host; headers['x-forwarded-host'] = host;
    headers['x-forwarded-proto'] = local ? 'http' : 'https'; headers['x-forwarded-for'] = '127.0.0.1';
    const upstream = http.request({ hostname: '127.0.0.1', port: upstreamPort, method: req.method, path: url.pathname + url.search, headers }, reply => {
      const out = cleanHeaders(reply.headers);
      delete out['x-accel-redirect'];
      out['cache-control'] = 'private, no-store';
      out['x-robots-tag'] = 'noindex, nofollow, noarchive';
      reply.on('error', () => res.destroy());
      res.writeHead(reply.statusCode || 502, out); reply.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Test application unavailable'); });
    upstream.setTimeout(120000, () => upstream.destroy());
    req.on('aborted', () => upstream.destroy());
    req.on('error', () => upstream.destroy());
    res.on('error', () => upstream.destroy());
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  });
  server.on('upgrade', (_req, socket) => socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'));
  server.requestTimeout = 120000; server.headersTimeout = 15000;
  return server;
}
module.exports = { createGate };
if (require.main === module) {
  const root = testRoot(process.cwd());
  const accounts = JSON.parse(fs.readFileSync(path.join(root, 'data/gate-auth.json'), 'utf8'));
  createGate({ accounts }).listen(3301, '127.0.0.1', () => console.log('Private test gate listening on 127.0.0.1:3301'));
}
