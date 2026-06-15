import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/worker.js';

function createKv(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    async get(key, type) {
      const value = store.get(key);
      if (value == null) return null;
      return type === 'json' ? JSON.parse(value) : value;
    },
    async put(key, value) {
      store.set(key, value);
    }
  };
}

test('public config endpoint returns prompts-only defaults', async () => {
  const response = await worker.fetch(new Request('https://example.com/api/config'), {
    CONFIG: createKv(),
    ADMIN_TOKEN: 'secret',
    PUBLIC_BASE_URL: 'https://example.com'
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.prompts, []);
  assert.equal(body.models, undefined);
  assert.equal(body.update.latestVersion, '0.1.0');
});

test('admin writes require bearer token', async () => {
  const response = await worker.fetch(new Request('https://example.com/api/admin/config', {
    method: 'PUT',
    body: '{}'
  }), {
    CONFIG: createKv(),
    ADMIN_TOKEN: 'secret',
    PUBLIC_BASE_URL: 'https://example.com'
  });
  assert.equal(response.status, 401);
});

test('admin can update prompts and update metadata only', async () => {
  const kv = createKv();
  const response = await worker.fetch(new Request('https://example.com/api/admin/config', {
    method: 'PUT',
    headers: {
      authorization: 'Bearer secret',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      prompts: [{ id: 'p1', scenario: 'moments-generate', name: '朋友圈', template: 'hello', enabled: true }],
      models: [{ id: 'm1', kind: 'language', apiKey: 'sk-secret' }],
      update: { latestVersion: '0.2.0', downloadUrl: 'https://example.com/app.exe', releaseNotes: '更新', force: false }
    })
  }), {
    CONFIG: kv,
    ADMIN_TOKEN: 'secret',
    PUBLIC_BASE_URL: 'https://example.com'
  });
  assert.equal(response.status, 200);

  const publicResponse = await worker.fetch(new Request('https://example.com/api/config'), {
    CONFIG: kv,
    ADMIN_TOKEN: 'secret',
    PUBLIC_BASE_URL: 'https://example.com'
  });
  const publicBody = await publicResponse.json();
  assert.equal(publicBody.models, undefined);
  assert.equal(publicBody.prompts[0].name, '朋友圈');
  assert.equal(publicBody.update.latestVersion, '0.2.0');
});
