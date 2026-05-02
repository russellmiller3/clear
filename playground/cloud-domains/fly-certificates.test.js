// CC-5c Fly certificate provisioner helper tests.
//
// Run: node playground/cloud-domains/fly-certificates.test.js

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ok ${msg}`); }
  else { failed++; console.log(`  not ok ${msg}`); }
}

function makeFetchStub(routes) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    const route = routes.shift();
    if (!route) throw new Error(`unexpected fetch: ${opts.method || 'GET'} ${url}`);
    const body = typeof route.body === 'string' ? route.body : JSON.stringify(route.body);
    return {
      ok: route.status >= 200 && route.status < 300,
      status: route.status,
      text: async () => body,
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

console.log('\nCC-5c Fly certificate helper\n');

{
  const {
    createFlyCertificate,
    getFlyCertificateStatus,
    pollFlyCertificateReady,
    provisionFlyCertificateForDomain,
  } = await import('./fly-certificates.js');

  const fetchImpl = makeFetchStub([
    {
      status: 201,
      body: {
        data: {
          id: 'cert_123',
          hostname: 'deals.acme.com',
          configured: false,
          acme_dns_configured: true,
          certificate_authority: 'lets_encrypt',
        },
      },
    },
  ]);
  const created = await createFlyCertificate({
    appName: 'clear-acme-deals',
    domain: 'deals.acme.com',
    token: 'fly-token',
    fetchImpl,
  });
  assert(created.ok === true, 'create returns ok=true');
  assert(created.certId === 'cert_123', 'create normalizes cert id');
  assert(created.domain === 'deals.acme.com', 'create normalizes domain');
  assert(created.state === 'pending', 'create maps not-yet-configured to pending');
  assert(fetchImpl.calls[0].url.endsWith('/apps/clear-acme-deals/certificates'),
    `create uses app certificates endpoint (${fetchImpl.calls[0].url})`);
  assert(fetchImpl.calls[0].opts.method === 'POST', 'create uses POST');
  assert(fetchImpl.calls[0].opts.headers.Authorization === 'Bearer fly-token',
    'create sends bearer token');

  const statusFetch = makeFetchStub([
    {
      status: 200,
      body: {
        data: {
          id: 'cert_123',
          hostname: 'deals.acme.com',
          configured: true,
          acme_dns_configured: true,
          client_status: 'Ready',
        },
      },
    },
  ]);
  const status = await getFlyCertificateStatus({
    appName: 'clear-acme-deals',
    certId: 'cert_123',
    token: 'fly-token',
    fetchImpl: statusFetch,
  });
  assert(status.ok === true, 'status returns ok=true');
  assert(status.state === 'ready', 'status maps configured certificate to ready');
  assert(statusFetch.calls[0].opts.method === 'GET', 'status uses GET');

  const pendingFetch = makeFetchStub([
    { status: 200, body: { data: { id: 'cert_123', hostname: 'deals.acme.com', configured: false } } },
    { status: 200, body: { data: { id: 'cert_123', hostname: 'deals.acme.com', configured: true } } },
  ]);
  const polled = await pollFlyCertificateReady({
    appName: 'clear-acme-deals',
    certId: 'cert_123',
    token: 'fly-token',
    fetchImpl: pendingFetch,
    maxAttempts: 2,
    intervalMs: 0,
  });
  assert(polled.ok === true, 'poll returns ok=true once ready');
  assert(polled.state === 'ready', 'poll ends at ready');
  assert(polled.attempts === 2, 'poll reports attempts');

  const integratedFetch = makeFetchStub([
    { status: 201, body: { data: { id: 'cert_456', hostname: 'crm.acme.com', configured: false } } },
    { status: 200, body: { data: { id: 'cert_456', hostname: 'crm.acme.com', configured: true } } },
  ]);
  const provisioned = await provisionFlyCertificateForDomain({
    domainRow: { id: 77, domain: 'crm.acme.com', fly_app_name: 'clear-acme-crm' },
    token: 'fly-token',
    fetchImpl: integratedFetch,
    maxAttempts: 1,
    intervalMs: 0,
  });
  assert(provisioned.ok === true, 'integration helper provisions and polls');
  assert(provisioned.domainId === 77, 'integration helper keeps domain row id');
  assert(provisioned.certId === 'cert_456', 'integration helper returns cert id for DB writeback');
  assert(provisioned.state === 'ready', 'integration helper returns normalized ready state');

  const failedFetch = makeFetchStub([
    { status: 422, body: { errors: [{ message: 'Hostname already exists' }] } },
  ]);
  const failedCreate = await createFlyCertificate({
    appName: 'clear-acme-deals',
    domain: 'deals.acme.com',
    token: 'fly-token',
    fetchImpl: failedFetch,
  });
  assert(failedCreate.ok === false, 'create failure returns ok=false');
  assert(failedCreate.state === 'failed', 'create failure maps to failed state');
  assert(/Hostname already exists/.test(failedCreate.error), 'create failure carries Fly error text');
}

console.log('\nCC-5c app_domains writeback columns\n');

{
  const fs = await import('fs');
  const sql = fs.readFileSync(new URL('./migrations/001-domains.sql', import.meta.url), 'utf8');
  for (const col of [
    'fly_certificate_id',
    'certificate_status',
    'certificate_ready_at',
    'certificate_last_checked_at',
    'certificate_error',
  ]) {
    assert(new RegExp(`\\b${col}\\b`, 'i').test(sql),
      `migration declares app_domains.${col}`);
  }
  assert(/certificate_status[\s\S]{0,240}pending[\s\S]{0,240}ready[\s\S]{0,240}failed/i.test(sql),
    'certificate_status CHECK constraint encodes pending|ready|failed');
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
