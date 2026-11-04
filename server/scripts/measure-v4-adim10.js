/**
 * V4 Adım 10 — homepage first-load bytes.
 * Headless Chrome, cache disabled, desktop viewport.
 * Stops shortly after window load so slides deferred until load+1.2s
 * are not counted as the first load.
 *
 * Usage: node server/scripts/measure-v4-adim10.js [baseUrl]
 * Default baseUrl: http://127.0.0.1:3107
 */
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const base = (process.argv[2] || process.env.MEASURE_BASE || 'http://127.0.0.1:3107').replace(/\/$/, '');
const outPath = process.argv[3] || process.env.MEASURE_OUT || '';
const SETTLE_MS = 800;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? require('https') : http;
    const req = lib.get(url, { timeout: 8000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

async function waitForJson(url, max = 50) {
  let last = '';
  for (let i = 0; i < max; i += 1) {
    try {
      const res = await httpGet(url);
      if (res.status && res.status < 500) return JSON.parse(res.body);
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = err.message;
    }
    await sleep(200);
  }
  throw new Error(`devtools not ready: ${last}`);
}

function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = [];
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', () => reject(new Error('devtools websocket failed')));
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result || {});
    } else if (msg.method) {
      listeners.forEach((fn) => fn(msg));
    }
  });
  return {
    ready: opened,
    send(method, params = {}) {
      const msgId = ++id;
      return new Promise((resolve, reject) => {
        pending.set(msgId, { resolve, reject });
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    },
    on(fn) { listeners.push(fn); },
    close() { try { ws.close(); } catch { /* ignore */ } },
  };
}

async function measure(pageUrl) {
  const debugPort = 9333 + Math.floor(Math.random() * 500);
  const profile = fs.mkdtempSync(path.join('/tmp', 'adim10-chrome-'));
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: 'ignore' });

  const requests = new Map();
  let cdp;
  try {
    const version = await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
    const browser = connectCdp(version.webSocketDebuggerUrl);
    await browser.ready;
    const created = await browser.send('Target.createTarget', { url: 'about:blank' });
    const targets = JSON.parse((await httpGet(`http://127.0.0.1:${debugPort}/json/list`)).body);
    const page = targets.find((t) => t.id === created.targetId) || targets.find((t) => t.type === 'page');
    if (!page) throw new Error('no page target');
    cdp = connectCdp(page.webSocketDebuggerUrl);
    await cdp.ready;

    cdp.on((msg) => {
      if (msg.method === 'Network.requestWillBeSent') {
        const { requestId, request, type, initiator } = msg.params;
        requests.set(requestId, {
          url: request.url,
          method: request.method,
          type: type || '',
          initiator: initiator && initiator.type,
          status: 0,
          bytes: 0,
          mime: '',
          failed: '',
        });
      } else if (msg.method === 'Network.responseReceived') {
        const row = requests.get(msg.params.requestId);
        if (!row) return;
        row.status = msg.params.response.status;
        row.mime = msg.params.response.mimeType || '';
        const cc = msg.params.response.headers || {};
        row.cacheControl = cc['cache-control'] || cc['Cache-Control'] || '';
      } else if (msg.method === 'Network.loadingFinished') {
        const row = requests.get(msg.params.requestId);
        if (!row) return;
        row.bytes = msg.params.encodedDataLength || 0;
      } else if (msg.method === 'Network.loadingFailed') {
        const row = requests.get(msg.params.requestId);
        if (!row) return;
        row.failed = msg.params.errorText || 'failed';
      }
    });

    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1366,
      height: 768,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const loaded = new Promise((resolve) => {
      cdp.on((msg) => {
        if (msg.method === 'Page.loadEventFired') resolve();
      });
    });
    await cdp.send('Page.navigate', { url: pageUrl });
    await Promise.race([
      loaded,
      sleep(20000).then(() => { throw new Error('load timeout'); }),
    ]);
    await sleep(SETTLE_MS);

    const rows = [...requests.values()].filter((r) => r.url && !r.url.startsWith('data:'));
    const okRows = rows.filter((r) => !r.failed);
    const bytes = okRows.reduce((sum, r) => sum + (r.bytes || 0), 0);
    const interesting = okRows.filter((r) => /leaflet|unsplash|hero|markercluster/i.test(r.url));
    return {
      base: pageUrl,
      measuredAt: new Date().toISOString(),
      viewport: '1366x768',
      cacheDisabled: true,
      settleAfterLoadMs: SETTLE_MS,
      requestCount: okRows.length,
      failedCount: rows.length - okRows.length,
      totalBytes: bytes,
      interesting: interesting.map((r) => ({
        url: r.url,
        type: r.type,
        status: r.status,
        bytes: r.bytes,
        cacheControl: r.cacheControl,
      })),
      requests: okRows.map((r) => ({
        url: r.url,
        type: r.type,
        status: r.status,
        bytes: r.bytes,
        mime: r.mime,
        cacheControl: r.cacheControl,
      })).sort((a, b) => b.bytes - a.bytes),
    };
  } finally {
    if (cdp) cdp.close();
    chrome.kill('SIGTERM');
    setTimeout(() => { try { chrome.kill('SIGKILL'); } catch { /* ignore */ } }, 500);
  }
}

(async () => {
  const result = await measure(`${base}/`);
  const text = JSON.stringify(result, null, 2);
  if (outPath) fs.writeFileSync(outPath, text);
  const summary = {
    base: result.base,
    requestCount: result.requestCount,
    totalBytes: result.totalBytes,
    failedCount: result.failedCount,
    interesting: result.interesting,
  };
  console.log(JSON.stringify(summary, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
