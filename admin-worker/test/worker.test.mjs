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
    },
    dump() {
      return store;
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
  assert.equal(body.momentPool, undefined);
  assert.equal(body.update.latestVersion, '0.1.10');
  assert.match(body.update.downloadUrl, /v0\.1\.10\/Setup\.0\.1\.10\.exe/);
});

test('saved stale update config is promoted to current app release', async () => {
  const kv = createKv({
    'app:config': JSON.stringify({
      prompts: [],
      update: {
        latestVersion: '0.1.2',
        downloadUrl: 'https://github.com/1wanganshi/peilian-cat-toolkit/releases/download/v0.1.2/Setup.0.1.2.exe',
        releaseNotes: 'old',
        force: true,
        publishedAt: '2026-06-16T08:39:01.630Z'
      }
    })
  });
  const env = {
    CONFIG: kv,
    PUBLIC_BASE_URL: 'https://example.com'
  };

  const configResponse = await worker.fetch(new Request('https://example.com/api/config'), env);
  const configBody = await configResponse.json();
  assert.equal(configBody.update.latestVersion, '0.1.10');
  assert.match(configBody.update.downloadUrl, /v0\.1\.10\/Setup\.0\.1\.10\.exe/);
  assert.equal(configBody.update.force, true);

  const checkResponse = await worker.fetch(new Request('https://example.com/api/update/check?currentVersion=0.1.2'), env);
  const checkBody = await checkResponse.json();
  assert.equal(checkBody.latestVersion, '0.1.10');
  assert.equal(checkBody.hasUpdate, true);
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
  assert.match(html, /更新及授权/);
  assert.match(html, /提示词管理/);
  assert.match(html, /用户授权/);
  assert.match(html, /用户使用记录/);
  assert.match(html, /大模型模块/);
  assert.match(html, /id="panel-models"/);
  assert.match(html, /id="panel-moments"/);
  assert.match(html, /id="momentCalendar"/);
  assert.match(html, /id="momentPoolList"/);
  assert.match(html, /x-admin-config-scope/);
  assert.doesNotMatch(html, /target="_blank"/);
  assert.doesNotMatch(html, /iframe src="\/admin\/moments"/);
  assert.match(html, /moments-rewrite/);
  assert.match(html, /moments-generate/);
  assert.match(html, /video-script-generate/);
  assert.match(html, /withButtonFeedback/);
  assert.match(html, /提示词已保存并发布/);
  assert.match(html, /当前提示词已保存到待发布/);
  assert.match(html, /is-loading/);
  assert.match(html, /status-pop/);
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

test('partial admin config update keeps authorization and usage data', async () => {
  const existing = {
    prompts: [],
    authorizedUsers: [
      { id: 'u1', phone: '13800138000', name: '测试用户', enabled: true, createdAt: '2026-06-16T00:00:00.000Z', updatedAt: '2026-06-16T00:00:00.000Z' }
    ],
    usageRecords: [
      { id: 'r1', phone: '13800138000', module: 'scripts', action: 'generate-script', summary: '旧记录', createdAt: '2026-06-16T01:00:00.000Z' }
    ],
    update: {
      latestVersion: '0.1.5',
      downloadUrl: 'https://example.com/old.exe',
      releaseNotes: 'old',
      force: false,
      publishedAt: '2026-06-16T01:00:00.000Z'
    }
  };
  const kv = createKv({ 'app:config': JSON.stringify(existing) });
  const headers = {
    'x-admin-username': 'admin',
    'x-admin-password': '12345678',
    'content-type': 'application/json'
  };

  const save = await worker.fetch(new Request('https://example.com/api/admin/config', {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      update: {
        latestVersion: '0.1.10',
        downloadUrl: 'https://example.com/new.exe',
        releaseNotes: 'new'
      }
    })
  }), {
    CONFIG: kv,
    PUBLIC_BASE_URL: 'https://example.com'
  });
  assert.equal(save.status, 200);

  const body = await save.json();
  assert.equal(body.config.update.latestVersion, '0.1.10');
  assert.equal(body.config.authorizedUsers.length, 1);
  assert.equal(body.config.authorizedUsers[0].phone, '13800138000');
  assert.equal(body.config.usageRecords.length, 1);
  assert.equal(body.config.usageRecords[0].summary, '旧记录');
});

test('admin config update stores a recoverable backup before saving', async () => {
  const kv = createKv({
    'app:config': JSON.stringify({
      prompts: [],
      authorizedUsers: [
        { id: 'u1', phone: '13800138000', name: 'backup-user', enabled: true }
      ],
      update: {
        latestVersion: '0.1.5',
        downloadUrl: 'https://example.com/old.exe',
        releaseNotes: 'old',
        force: false,
        publishedAt: '2026-06-16T01:00:00.000Z'
      }
    })
  });

  const save = await worker.fetch(new Request('https://example.com/api/admin/config', {
    method: 'PUT',
    headers: {
      'x-admin-username': 'admin',
      'x-admin-password': '12345678',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ update: { latestVersion: '0.1.10' } })
  }), {
    CONFIG: kv,
    PUBLIC_BASE_URL: 'https://example.com'
  });
  assert.equal(save.status, 200);

  const latestBackup = JSON.parse(kv.dump().get('app:config:backup:latest'));
  assert.equal(latestBackup.config.authorizedUsers[0].phone, '13800138000');
  assert.equal(latestBackup.config.update.latestVersion, '0.1.10');

  const timestampedBackupKeys = [...kv.dump().keys()].filter((key) => key.startsWith('app:config:backup:20'));
  assert.equal(timestampedBackupKeys.length, 1);
});

test('moment planner route redirects into main admin moments tab', async () => {
  const response = await worker.fetch(new Request('https://example.com/admin/moments', {
    headers: {
      authorization: `Basic ${btoa('admin:12345678')}`
    }
  }), {
    CONFIG: createKv(),
    PUBLIC_BASE_URL: 'https://example.com'
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin?tab=moments');
});

test('admin can save moment pool while public config hides it', async () => {
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

  const savePool = await worker.fetch(new Request('https://example.com/api/admin/moments/pool', {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      momentPool: [
        {
          rawContent: '池子里的可复用朋友圈文案',
          materials: [
            { id: 'pool-m1', name: '孩子作品照', type: 'image', url: 'https://example.com/work.jpg' }
          ],
          remark: '可加入任意日期'
        },
        { rawContent: '', materials: [] }
      ]
    })
  }), env);
  assert.equal(savePool.status, 200);
  const saveBody = await savePool.json();
  assert.equal(saveBody.momentPool.length, 1);
  assert.equal(saveBody.momentPool[0].materials.length, 1);

  const adminConfig = await worker.fetch(new Request('https://example.com/api/admin/config', {
    headers
  }), env);
  const adminBody = await adminConfig.json();
  assert.equal(adminBody.momentPool.length, 1);
  assert.equal(adminBody.momentPool[0].rawContent, '池子里的可复用朋友圈文案');

  const publicConfig = await worker.fetch(new Request('https://example.com/api/config'), env);
  const publicBody = await publicConfig.json();
  assert.equal(publicBody.momentPool, undefined);
  assert.equal(publicBody.momentPlans, undefined);
});

test('general admin config save preserves moment planning data', async () => {
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

  const seedResponse = await worker.fetch(new Request('https://example.com/api/admin/config', {
    method: 'PUT',
    headers: {
      ...headers,
      'x-admin-config-scope': 'moments'
    },
    body: JSON.stringify({
      momentPlans: [
        {
          id: 'plan-1',
          date: '2026-06-17',
          rawContent: '今日朋友圈规划',
          materials: [{ id: 'plan-m1', name: '规划图片', type: 'image', url: 'https://example.com/plan.jpg' }],
          status: 'active'
        }
      ],
      momentPool: [
        {
          id: 'pool-1',
          rawContent: '池子内容',
          materials: [{ id: 'pool-m1', name: '池子图', type: 'image', url: 'https://example.com/pool.jpg' }]
        }
      ]
    })
  }), env);
  assert.equal(seedResponse.status, 200);

  const saveGeneral = await worker.fetch(new Request('https://example.com/api/admin/config', {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      prompts: [
        { id: 'p1', scenario: 'moments-generate', name: 'generate', template: 'generate {{idea}}', enabled: true }
      ],
      momentPlans: [],
      momentPool: [],
      update: { latestVersion: '0.2.0', downloadUrl: 'https://example.com/app.exe', releaseNotes: 'new' }
    })
  }), env);
  assert.equal(saveGeneral.status, 200);

  const configResponse = await worker.fetch(new Request('https://example.com/api/admin/config', { headers }), env);
  const config = await configResponse.json();
  assert.equal(config.update.latestVersion, '0.2.0');
  assert.equal(config.momentPlans.length, 1);
  assert.equal(config.momentPlans[0].materials[0].url, 'https://example.com/plan.jpg');
  assert.equal(config.momentPool.length, 1);
  assert.equal(config.momentPool[0].materials[0].url, 'https://example.com/pool.jpg');
});

test('moment scoped config save preserves general admin data', async () => {
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

  const saveGeneral = await worker.fetch(new Request('https://example.com/api/admin/config', {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      prompts: [
        { id: 'p1', scenario: 'moments-generate', name: 'generate', template: 'generate {{idea}}', enabled: true }
      ],
      authorizedUsers: [{ phone: '13800138000', name: '测试用户', enabled: true }],
      update: { latestVersion: '0.2.0', downloadUrl: 'https://example.com/app.exe', releaseNotes: 'new' }
    })
  }), env);
  assert.equal(saveGeneral.status, 200);

  const saveMoments = await worker.fetch(new Request('https://example.com/api/admin/config', {
    method: 'PUT',
    headers: {
      ...headers,
      'x-admin-config-scope': 'moments'
    },
    body: JSON.stringify({
      prompts: [],
      authorizedUsers: [],
      update: { latestVersion: '0.0.1' },
      momentPool: [
        {
          rawContent: '池子新内容',
          materials: [{ id: 'pool-m1', name: '池子图', type: 'image', url: 'https://example.com/pool.jpg' }]
        }
      ]
    })
  }), env);
  assert.equal(saveMoments.status, 200);

  const configResponse = await worker.fetch(new Request('https://example.com/api/admin/config', { headers }), env);
  const config = await configResponse.json();
  assert.equal(config.update.latestVersion, '0.2.0');
  assert.equal(config.authorizedUsers.length, 1);
  assert.equal(config.prompts.length, 1);
  assert.equal(config.momentPool.length, 1);
  assert.equal(config.momentPool[0].materials[0].url, 'https://example.com/pool.jpg');
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
        { id: 'p1', scenario: 'moments-rewrite', name: '朋友圈改写', template: 'rewrite {{originalText}}', enabled: true },
        { id: 'p2', scenario: 'moments-generate', name: 'generate', template: 'generate {{idea}}', enabled: true },
        { id: 'p3', scenario: 'image-generate', name: '图片生成', template: 'image prompt', enabled: true }
      ],
      models: [{ id: 'm1', kind: 'language', apiKey: 'sk-secret' }],
      update: { latestVersion: '0.2.0', downloadUrl: 'https://example.com/app.exe', releaseNotes: 'new', force: false }
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
  assert.equal(publicBody.momentPool, undefined);
  assert.equal(publicBody.prompts.length, 2);
  assert.equal(publicBody.prompts[0].scenario, 'moments-rewrite');
  assert.equal(publicBody.prompts[0].name, '朋友圈改写');
  assert.equal(publicBody.prompts[1].scenario, 'moments-generate');
  assert.equal(publicBody.prompts[1].name, 'generate');
  assert.equal(publicBody.update.latestVersion, '0.2.0');
});

test('private model admin config is stored but hidden from public config and status is sanitized', async () => {
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

  const save = await worker.fetch(new Request('https://example.com/api/admin/private-models', {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      privateModels: [
        {
          id: 'pm-language',
          name: '王安实文字模型',
          kind: 'language',
          provider: 'custom',
          model: 'text-model',
          baseUrl: 'https://models.example.com/v1',
          apiKey: 'sk-secret',
          enabled: true
        },
        {
          id: 'pm-image',
          name: '王安实生图模型',
          kind: 'image',
          provider: 'custom',
          model: 'image-model',
          baseUrl: 'https://images.example.com/v1',
          apiKey: 'img-secret',
          enabled: true
        }
      ]
    })
  }), env);
  assert.equal(save.status, 200);
  const saveBody = await save.json();
  assert.equal(saveBody.privateModels[0].apiKey, '********');
  assert.equal(saveBody.status.languageAvailable, true);
  assert.equal(saveBody.status.imageAvailable, true);

  const publicResponse = await worker.fetch(new Request('https://example.com/api/config'), env);
  const publicBody = await publicResponse.json();
  assert.equal(publicBody.privateModels, undefined);
  assert.equal(JSON.stringify(publicBody).includes('sk-secret'), false);

  const statusResponse = await worker.fetch(new Request('https://example.com/api/models/private/status'), env);
  const statusBody = await statusResponse.json();
  assert.equal(statusBody.languageAvailable, true);
  assert.equal(statusBody.imageAvailable, true);
  assert.equal(JSON.stringify(statusBody).includes('secret'), false);
});

test('private model generation proxy requires an authorized phone', async () => {
  const kv = createKv({
    'app:config': JSON.stringify({
      privateModels: [
        {
          id: 'pm-language',
          name: '王安实文字模型',
          kind: 'language',
          provider: 'custom',
          model: 'text-model',
          baseUrl: 'https://models.example.com/v1',
          apiKey: 'sk-secret',
          enabled: true
        }
      ],
      authorizedUsers: [{ phone: '13800138000', enabled: true }]
    })
  });

  const denied = await worker.fetch(new Request('https://example.com/api/models/private/language/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-phone': '13900139000' },
    body: JSON.stringify({ prompt: 'hello' })
  }), {
    CONFIG: kv,
    PUBLIC_BASE_URL: 'https://example.com'
  });

  assert.equal(denied.status, 403);
});

test('moment plan can be saved with materials only', async () => {
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
      date: '2026-06-17',
      rawContent: '',
      materials: [
        { id: 'm1', name: '朋友圈图片', type: 'image', url: 'https://example.com/photo.jpg' }
      ],
      status: 'active'
    })
  }), env);
  assert.equal(createResponse.status, 200);

  const todayResponse = await worker.fetch(new Request('https://example.com/api/moments/plans/today?date=2026-06-17'), env);
  assert.equal(todayResponse.status, 200);
  const today = await todayResponse.json();
  assert.equal(today.plans.length, 1);
  assert.equal(today.plans[0].rawContent, '');
  assert.equal(today.plans[0].materials[0].url, 'https://example.com/photo.jpg');
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
