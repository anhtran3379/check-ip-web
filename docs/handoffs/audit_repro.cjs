// Independent audit probes against actual ESM source; no external requests.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const ctx = vm.createContext({ Request, Response, Headers, AbortController, DOMException, URL, Intl, setTimeout, clearTimeout, Date, console });
const modules = new Map();
async function moduleAt(filename) {
  if (modules.has(filename)) return modules.get(filename);
  const mod = new vm.SourceTextModule(fs.readFileSync(filename, 'utf8'), { identifier: filename, context: ctx });
  modules.set(filename, mod);
  await mod.link((specifier, ref) => moduleAt(path.resolve(path.dirname(ref.identifier), specifier)));
  return mod;
}
(async () => {
  const mod = await moduleAt(path.join(root, 'functions/api/info.js'));
  await mod.evaluate();
  const info = mod.namespace;
  const lib = modules.get(path.join(root, 'lib/ip.js')).namespace;
  console.log('IP classification:', JSON.stringify(['3fff::1', '100:0:0:1::1', '2001:1::1'].map(ip => lib.classifyIP(ip))));
  info.resetPagesLookupState();
  const ctl = new AbortController();
  const request = new Request('https://example.test/api/info', { headers: { 'cf-connecting-ip': '8.8.8.8' }, signal: ctl.signal });
  let bodyStarted;
  const started = new Promise(resolve => { bodyStarted = resolve; });
  const result = info.onRequest({ request, fetch: async (_, opts) => ({
    status: 200, headers: new Headers(),
    json: async () => {
      bodyStarted();
      return new Promise((resolve, reject) => opts.signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true }));
    }
  }) });
  await started;
  ctl.abort();
  try {
    const res = await result;
    const body = await res.json();
    console.log('cancel during response body:', JSON.stringify({ status: res.status, reason: body.security.reason, request_aborted: request.signal.aborted }));
    assert.equal(body.security.reason, 'lookup_invalid_json');
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Repro no longer holds: cancellation propagated');
    throw err;
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
