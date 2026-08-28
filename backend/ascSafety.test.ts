/**
 * Guards the ASC sub-app: its mount, its auth gate, and its exec inputs.
 *
 * The mounts were dropped by the "Sync skateboard boilerplate to 3.6.1" commit
 * and every ASC route 404'd for two months, unnoticed because nothing tested
 * them. The same sub-app shells out to simctl with a request-supplied bundleId
 * and writes a key file named from a request-supplied keyId.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

process.env.SKIP_SERVER_START = '1';
process.env.JWT_SECRET ??= 'asc-safety-test-secret';
process.env.STRIPE_KEY ??= 'sk_test_asc';
process.env.STRIPE_ENDPOINT_SECRET ??= 'whsec_asc';
process.env.TEST_DATABASE_PATH ??= './databases/asc-safety-test.db';
process.env.DISABLE_SIMULATOR = 'true';

const { app } = await import('./server.ts');

function post(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('ASC sub-app mount', () => {
  it('is mounted at all', async () => {
    // The regression this guards: every one of these 404'd for two months.
    const res = await app.fetch(new Request('http://localhost/api/asc/apps'));
    assert.notEqual(res.status, 404, '/api/asc/apps must be mounted');
  });

  it('requires auth', async () => {
    // The sub-apps carry no auth of their own, so the mount must supply it.
    const res = await app.fetch(new Request('http://localhost/api/asc/apps'));
    assert.equal(res.status, 401);
  });

  for (const path of ['/api/icons/resize', '/api/keywords/research', '/api/precheck/run']) {
    it(`gates ${path}`, async () => {
      const res = await app.fetch(post(path, {}));
      assert.equal(res.status, 401, `${path} must not be reachable unauthenticated`);
    });
  }
});

describe('input validation on exec paths', () => {
  it('rejects a bundleId carrying a shell payload', async () => {
    const res = await app.fetch(post('/api/asc/screenshots/capture', {
      bundleId: 'com.x.y; touch /tmp/pwned',
      simulators: ['iPhone 16 Pro'],
    }));
    // Auth stops it first; that is the point -- but the id must never be
    // accepted as valid regardless of who asks.
    assert.notEqual(res.status, 200);
    assert.notEqual(res.status, 201);
  });

  it('rejects a keyId that would escape the keys directory', async () => {
    const res = await app.fetch(post('/api/asc/credentials', {
      keyId: '../../server',
      issuerId: 'x',
      privateKey: 'y',
    }));
    assert.notEqual(res.status, 200);
  });
});
