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
    PUBLIC_BASE_URL: 'https://example.com'
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.prompts, []);
  assert.equal(body.models, undefined);
  assert.equal(body.momentPlans, undefined);
  assert.equal(body.update.latestVersion, '0.1.4');
});

test('admin writes require username and password', async () => {
  const response = await worker.fetch(new Request('https://example.com/api/admin/config', {
    method: 'PUT',
    body: '{}'
  }), {
    CONFIG: createKv(),
    PUBLIC_BASE_URL: 'https://example.com'
  });
  assert.equal(response.status, 401);
});

test('admin page uses browser basic auth challenge', async () => {
  const unauthorized = await worker.fetch(new Request('https://example.com/admin'), {
    CONFIG: createKv(),
    PUBLIC_BASE_URL: 'https://example.com'
  });
  assert.equal(unauthorized.status, 401);
  assert.match(unauthorized.headers.get('www-authenticate') || '', /Basic realm="Peilian Cat Admin"/);

  const authorized = await worker.fetch(new Request('https://example.com/admin', {
    headers: {
      authorization: `Basic ${btoa('admin:12345678')}`
    }
  }), {
    CONFIG: createKv(),
    PUBLIC_BASE_URL: 'https://example.com'
  });
  assert.equal(authorized.status, 200);
  const html = await authorized.text();
  assert.match(html, /陪练猫云后台/);
  assert.match(html, /href="\/admin\/moments"/);
  assert.match(html, /更新及授权/);
  assert.match(html, /提示词管理/);
  assert.match(html, /用户授权/);
  assert.match(html, /用户使用记录/);
  assert.match(html, /朋友圈规划页面/);
  assert.match(html, /iframe src="\/admin\/moments"/);
  assert.doesNotMatch(html, /planList/);
  assert.doesNotMatch(html, /materialUpload/);
  assert.match(html, /moments-rewrite/);
  assert.match(html, /moments-generate/);
  assert.match(html, /video-script-generate/);
  assert.doesNotMatch(html, /image-generate/);
  assert.doesNotMatch(html, /video-topic-generate/);
  assert.doesNotMatch(html, /id="username"/);
  assert.doesNotMatch(html, /id="password"/);
  assert.doesNotMatch(html, /后台登录/);
});

test('phone authorization controls app login and usage records', async () => {
  const kv = createKv();
  const env = {
    CONFIG: kv,
    PUBLIC_BASE_URL: 'https://example.com'
  };
  const adminHeaders = {
    'x-admin-username': 'admin',
    'x-admin-password': '12345678',
    'content-type': 'application/json'
  };

  const denied = await worker.fetch(new Request('https://example.com/api/auth/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '13800138000' })
  }), env);
  assert.equal(denied.status, 403);

  const save = await worker.fetch(new Request('https://example.com/api/admin/config', {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({
      authorizedUsers: [
        { phone: '13800138000', name: '测试用户', enabled: true }
      ]
    })
  }), env);
  assert.equal(save.status, 200);

  const allowed = await worker.fetch(new Request('https://example.com/api/auth/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '13800138000' })
  }), env);
  assert.equal(allowed.status, 200);
  const authBody = await allowed.json();
  assert.equal(authBody.authorized, true);
  assert.equal(authBody.user.phone, '13800138000');

  const usage = await worker.fetch(new Request('https://example.com/api/usage/record', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '13800138000', module: 'scripts', action: 'generate-script', summary: '测试脚本' })
  }), env);
  assert.equal(usage.status, 200);

  const configResponse = await worker.fetch(new Request('https://example.com/api/admin/config', {
    headers: adminHeaders
  }), env);
  const config = await configResponse.json();
  assert.equal(config.usageRecords.length, 1);
  assert.equal(config.usageRecords[0].phone, '13800138000');
  assert.equal(config.authorizedUsers[0].lastUsedAt, config.usageRecords[0].createdAt);
});

test('moment planner page renders standalone calendar manager', async () => {
  const response = await worker.fetch(new Request('https://example.com/admin/moments', {
    headers: {
      authorization: `Basic ${btoa('admin:12345678')}`
    }
  }), {
    CONFIG: createKv(),
    PUBLIC_BASE_URL: 'https://example.com'
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /朋友圈规划/);
  assert.match(html, /id="calendar"/);
  assert.match(html, /添加一条朋友圈/);
  assert.match(html, /保存成功/);
});

test('admin can update editable prompts and filters built-in prompt scenarios', async () => {
  const kv = createKv();
  const response = await worker.fetch(new Request('https://example.com/api/admin/config', {
    method: 'PUT',
    headers: {
      'x-admin-username': 'admin',
      'x-admin-password': '12345678',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      prompts: [
        { id: 'p1', scenario: 'moments-rewrite', name: '?????', template: 'rewrite {{originalText}}', enabled: true },
        { id: 'p2', scenario: 'moments-generate', name: 'generate', template: 'generate {{idea}}', enabled: true },
        { id: 'p3', scenario: 'image-generate', name: '?????', template: 'image prompt', enabled: true }
      ],
      models: [{ id: 'm1', kind: 'language', apiKey: 'sk-secret' }],
      update: { latestVersion: '0.2.0', downloadUrl: 'https://example.com/app.exe', releaseNotes: '??', force: false }
    })
  }), {
    CONFIG: kv,
    PUBLIC_BASE_URL: 'https://example.com'
  });
  assert.equal(response.status, 200);

  const publicResponse = await worker.fetch(new Request('https://example.com/api/config'), {
    CONFIG: kv,
    PUBLIC_BASE_URL: 'https://example.com'
  });
  const publicBody = await publicResponse.json();
  assert.equal(publicBody.models, undefined);
  assert.equal(publicBody.momentPlans, undefined);
  assert.equal(publicBody.prompts.length, 2);
  assert.equal(publicBody.prompts[0].scenario, 'moments-rewrite');
  assert.equal(publicBody.prompts[0].name, '?????');
  assert.equal(publicBody.prompts[1].scenario, 'moments-generate');
  assert.equal(publicBody.prompts[1].name, 'generate');
  assert.equal(publicBody.update.latestVersion, '0.2.0');
});

test('admin can create and app can read active today moment plan', async () => {
  const kv = createKv();
  const env = {
    CONFIG: kv,
    PUBLIC_BASE_URL: 'https://example.com'
  };
  const headers = {
    'x-admin-username': 'admin',
    'x-admin-password': '12345678',
    'content-type': 'application/json'
  };

  const createResponse = await worker.fetch(new Request('https://example.com/api/admin/moments/plans', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      date: '2026-06-16',
      rawContent: '今天陪孩子读完了一本英文绘本。',
      materials: [
        { id: 'm1', name: '绘本照片', type: 'image', url: 'https://example.com/book.jpg' },
        { id: 'm2', name: '课堂视频', type: 'video', url: 'https://example.com/class.mp4' }
      ],
      status: 'active',
      remark: '测试规划'
    })
  }), env);
  assert.equal(createResponse.status, 200);

  const todayResponse = await worker.fetch(new Request('https://example.com/api/moments/plans/today?date=2026-06-16'), env);
  assert.equal(todayResponse.status, 200);
  const today = await todayResponse.json();
  assert.equal(today.date, '2026-06-16');
  assert.equal(today.plans.length, 1);
  assert.equal(today.plans[0].rawContent, '今天陪孩子读完了一本英文绘本。');
  assert.equal(today.plans[0].materials.length, 2);
  assert.equal(today.plans[0].materials[1].type, 'video');
});

test('same day can have multiple active moment plans', async () => {
  const kv = createKv();
  const env = {
    CONFIG: kv,
    PUBLIC_BASE_URL: 'https://example.com'
  };
  const headers = {
    'x-admin-username': 'admin',
    'x-admin-password': '12345678',
    'content-type': 'application/json'
  };

  const payload = {
    date: '2026-06-16',
    rawContent: '第一条朋友圈规划',
    materials: [],
    status: 'active'
  };
  const first = await worker.fetch(new Request('https://example.com/api/admin/moments/plans', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  }), env);
  assert.equal(first.status, 200);

  const second = await worker.fetch(new Request('https://example.com/api/admin/moments/plans', {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...payload, rawContent: '第二条朋友圈规划' })
  }), env);
  assert.equal(second.status, 200);

  const todayResponse = await worker.fetch(new Request('https://example.com/api/moments/plans/today?date=2026-06-16'), env);
  assert.equal(todayResponse.status, 200);
  const today = await todayResponse.json();
  assert.equal(today.plans.length, 2);
  assert.deepEqual(
    today.plans.map((item) => item.rawContent).sort(),
    ['第一条朋友圈规划', '第二条朋友圈规划'].sort()
  );
});

test('today moment plan returns clear 404 when not configured', async () => {
  const response = await worker.fetch(new Request('https://example.com/api/moments/plans/today?date=2026-06-18'), {
    CONFIG: createKv(),
    PUBLIC_BASE_URL: 'https://example.com'
  });
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.match(body.error, /今天暂未配置朋友圈内容/);
});
