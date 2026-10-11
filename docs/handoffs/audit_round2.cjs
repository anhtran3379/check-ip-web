// 2026-10-12 independent re-audit against actual ESM source, synthetic data only.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
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
  const failures = [];
  const requestFor = (ip, signal) => new Request('https://example.test/api/info', { headers: { 'cf-connecting-ip': ip }, signal });
  for (const [ip, expected] of [['3fff::1', false], ['100:0:0:1::1', false], ['2001:1::1', true], ['2001:1::3', true], ['64:ff9b::808:808', true]]) {
    info.resetPagesLookupState();
    let calls = 0;
    const res = await info.onRequest({ request: requestFor(ip), fetch: async () => {
      calls++;
      return new Response(JSON.stringify({ status: 'success', proxy: false }));
    } });
    const data = await res.json();
    const actual = lib.classifyIP(ip).lookup_eligible;
    const passed = actual === expected && calls === Number(expected);
    console.log(JSON.stringify({ case: 'F2', ip, expected_public: expected, actual_public: actual, upstream_calls: calls, security_status: data.security.detection_status, passed }));
    if (!passed) failures.push(ip);
  }
  info.resetPagesLookupState();
  const ctl = new AbortController();
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const promise = info.onRequest({ request: requestFor('8.8.8.8', ctl.signal), fetch: async (_, opts) => ({
    status: 200, headers: new Headers(),
    json: async () => {
      entered();
      return new Promise((resolve, reject) => opts.signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true }));
    }
  }) });
  await started;
  ctl.abort();
  let propagated = false;
  try { await promise; } catch (err) { propagated = err.name === 'AbortError'; }
  let afterAbortCalls = 0;
  await info.onRequest({ request: requestFor('8.8.8.8'), fetch: async () => {
    afterAbortCalls++;
    return new Response(JSON.stringify({status: 'success', proxy: false}));
  } });
  const passed = propagated && afterAbortCalls === 1;
  console.log(JSON.stringify({ case: 'F3', propagated, after_abort_upstream_calls: afterAbortCalls, passed }));
  if (!passed) failures.push('F3');
  console.log(JSON.stringify({failures}));
  process.exitCode = failures.length ? 1 : 0;
})().catch(err => { console.error(err); process.exitCode = 1; });
