const CONFIG_KEY = 'app:config';
const CURRENT_APP_RELEASE = {
  latestVersion: '0.1.6',
  downloadUrl: 'https://github.com/1wanganshi/peilian-cat-toolkit/releases/download/v0.1.6/Setup.0.1.6.exe',
  releaseNotes: '新增 APP 端检查更新和立刻更新按钮；立刻更新会在软件内下载安装包并打开安装程序，不再跳转网页。',
  force: false,
  publishedAt: '2026-06-16T11:51:49.674Z'
};

const DEFAULT_CONFIG = {
  prompts: [],
  momentPlans: [],
  momentPool: [],
  authorizedUsers: [],
  usageRecords: [],
  update: CURRENT_APP_RELEASE,
  meta: {
    promptRevision: 0,
    promptsUpdatedAt: '2026-06-15T00:00:00.000Z',
    promptCount: 0
  }
};

const EDITABLE_PROMPT_CATALOG = [
  {
    scenario: 'moments-rewrite',
    name: '\u670b\u53cb\u5708\u6539\u5199',
    appBinding: 'APP \u7aef AI\u670b\u53cb\u5708 > \u4eca\u65e5\u670b\u53cb\u5708\u5efa\u8bae / \u670b\u53cb\u5708\u6539\u5199',
    description: '\u63a7\u5236\u540e\u53f0\u4eca\u65e5\u670b\u53cb\u5708\u539f\u6587\u7684\u4e8c\u521b\uff0c\u4ee5\u53ca\u7528\u6237\u8f93\u5165\u670b\u53cb\u5708\u539f\u6587\u540e\u7684 AI \u6539\u5199\u7ed3\u679c\u3002',
    requiredVariables: ['originalText', 'style']
  },
  {
    scenario: 'moments-generate',
    name: '\u670b\u53cb\u5708\u751f\u6210',
    appBinding: 'APP \u7aef AI\u670b\u53cb\u5708 > \u670b\u53cb\u5708\u751f\u6210',
    description: '\u63a7\u5236\u7528\u6237\u8f93\u5165\u670b\u53cb\u5708\u60f3\u6cd5\u540e\uff0cAI \u5982\u4f55\u751f\u6210\u81ea\u7136\u771f\u5b9e\u7684\u670b\u53cb\u5708\u6587\u6848\u3002',
    requiredVariables: ['idea', 'style']
  },
  {
    scenario: 'video-script-generate',
    name: '\u77ed\u89c6\u9891\u811a\u672c\u751f\u6210',
    appBinding: 'APP \u7aef \u77ed\u89c6\u9891\u811a\u672c\u751f\u6210 > \u9009\u62e9\u9009\u9898\u540e\u751f\u6210\u5185\u5bb9',
    description: '\u63a7\u5236\u7528\u6237\u9009\u62e9\u9009\u9898\u540e\uff0cAI \u5982\u4f55\u751f\u6210\u5b8c\u6574\u77ed\u89c6\u9891\u811a\u672c\u3002',
    requiredVariables: ['topic', 'duration', 'requirements']
  }
];

const EDITABLE_PROMPT_SCENARIOS = new Set(EDITABLE_PROMPT_CATALOG.map((item) => item.scenario));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));

    try {
      if (url.pathname === '/' || url.pathname === '/admin') {
        assertAdmin(request, env);
        return htmlResponse(renderAdminHtml(env.PUBLIC_BASE_URL || url.origin));
      }

      if (url.pathname === '/admin/moments') {
        assertAdmin(request, env);
        return htmlResponse(renderMomentPlannerHtml(env.PUBLIC_BASE_URL || url.origin));
      }

      if (url.pathname === '/api/health') {
        return jsonResponse({ ok: true, service: 'peilian-cat-admin', now: new Date().toISOString() });
      }

      if (url.pathname === '/api/config' && request.method === 'GET') {
        return jsonResponse(publicConfig(await readConfig(env)));
      }

      if (url.pathname === '/api/auth/check' && request.method === 'POST') {
        const input = await request.json();
        const phone = normalizePhone(input?.phone);
        const config = await readConfig(env);
        const user = config.authorizedUsers.find((item) => item.phone === phone && item.enabled);
        if (!user) {
          return jsonResponse({ phone, authorized: false, message: '该手机号未授权，请联系管理员' }, 403);
        }
        user.lastLoginAt = new Date().toISOString();
        user.updatedAt = user.updatedAt || user.lastLoginAt;
        await env.CONFIG.put(CONFIG_KEY, JSON.stringify(config, null, 2));
        return jsonResponse({ phone, authorized: true, user: publicUser(user), message: '授权通过' });
      }

      if (url.pathname === '/api/usage/record' && request.method === 'POST') {
        const input = await request.json();
        const config = await readConfig(env);
        const phone = normalizePhone(input?.phone);
        const user = config.authorizedUsers.find((item) => item.phone === phone && item.enabled);
        if (!user) return jsonResponse({ error: '手机号未授权' }, 403);
        const record = normalizeUsageRecord({
          ...input,
          phone,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString()
        });
        config.usageRecords = [record, ...config.usageRecords].slice(0, 1200);
        user.lastUsedAt = record.createdAt;
        user.updatedAt = record.createdAt;
        await env.CONFIG.put(CONFIG_KEY, JSON.stringify(config, null, 2));
        return jsonResponse({ ok: true, record });
      }

      if (url.pathname === '/api/prompts/meta' && request.method === 'GET') {
        const config = await readConfig(env);
        return jsonResponse(config.meta);
      }

      if (url.pathname === '/api/update/check' && request.method === 'GET') {
        const config = await readConfig(env);
        const currentVersion = url.searchParams.get('currentVersion') || '0.0.0';
        const latestVersion = config.update?.latestVersion || '0.1.1';
        return jsonResponse({
          currentVersion,
          latestVersion,
          hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
          downloadUrl: config.update?.downloadUrl || '',
          releaseNotes: config.update?.releaseNotes || '',
          force: Boolean(config.update?.force),
          publishedAt: config.update?.publishedAt || ''
        });
      }

      if (url.pathname === '/api/moments/plans/today' && request.method === 'GET') {
        const config = await readConfig(env);
        const date = text(url.searchParams.get('date')) || todayDateString();
        const plans = config.momentPlans
          .filter((item) => item.date === date && item.status === 'active')
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.updatedAt.localeCompare(b.updatedAt));
        if (!plans.length) return jsonResponse({ error: '今天暂未配置朋友圈内容，请联系管理员。' }, 404);
        return jsonResponse({ date, plans });
      }

      if (url.pathname === '/api/admin/config' && request.method === 'GET') {
        assertAdmin(request, env);
        return jsonResponse(await readConfig(env));
      }

      if (url.pathname === '/api/admin/config' && request.method === 'PUT') {
        assertAdmin(request, env);
        const input = await request.json();
        const config = publishConfig(input);
        await env.CONFIG.put(CONFIG_KEY, JSON.stringify(config, null, 2));
        return jsonResponse({ ok: true, config });
      }

      if (url.pathname === '/api/admin/moments/plans' && request.method === 'GET') {
        assertAdmin(request, env);
        const config = await readConfig(env);
        const date = text(url.searchParams.get('date'));
        const status = text(url.searchParams.get('status'));
        const plans = config.momentPlans
          .filter((item) => !date || item.date === date)
          .filter((item) => !status || item.status === status)
          .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
        return jsonResponse({ plans });
      }

      if (url.pathname === '/api/admin/moments/plans' && request.method === 'POST') {
        assertAdmin(request, env);
        const config = await readConfig(env);
        const plan = normalizeMomentPlan(await request.json());
        validateMomentPlan(plan);
        config.momentPlans = [plan, ...config.momentPlans.filter((item) => item.id !== plan.id)];
        await env.CONFIG.put(CONFIG_KEY, JSON.stringify(config, null, 2));
        return jsonResponse({ ok: true, plan });
      }

      const planMatch = url.pathname.match(/^\/api\/admin\/moments\/plans\/([^/]+)$/);
      if (planMatch && request.method === 'GET') {
        assertAdmin(request, env);
        const config = await readConfig(env);
        const plan = config.momentPlans.find((item) => item.id === planMatch[1]);
        if (!plan) return jsonResponse({ error: 'Moment plan not found' }, 404);
        return jsonResponse(plan);
      }

      if (planMatch && request.method === 'PUT') {
        assertAdmin(request, env);
        const config = await readConfig(env);
        const existing = config.momentPlans.find((item) => item.id === planMatch[1]);
        if (!existing) return jsonResponse({ error: 'Moment plan not found' }, 404);
        const plan = normalizeMomentPlan({ ...existing, ...(await request.json()), id: existing.id, createdAt: existing.createdAt });
        validateMomentPlan(plan);
        config.momentPlans = config.momentPlans.map((item) => item.id === plan.id ? plan : item);
        await env.CONFIG.put(CONFIG_KEY, JSON.stringify(config, null, 2));
        return jsonResponse({ ok: true, plan });
      }

      if (planMatch && request.method === 'DELETE') {
        assertAdmin(request, env);
        const config = await readConfig(env);
        const nextPlans = config.momentPlans.filter((item) => item.id !== planMatch[1]);
        if (nextPlans.length === config.momentPlans.length) return jsonResponse({ error: 'Moment plan not found' }, 404);
        config.momentPlans = nextPlans;
        await env.CONFIG.put(CONFIG_KEY, JSON.stringify(config, null, 2));
        return jsonResponse({ ok: true });
      }

      if (url.pathname === '/api/admin/moments/materials/upload' && request.method === 'POST') {
        assertAdmin(request, env);
        return jsonResponse({ material: await parseUploadedMaterial(request) });
      }

      if (url.pathname === '/api/admin/moments/pool' && request.method === 'PUT') {
        assertAdmin(request, env);
        const input = await request.json();
        const config = await readConfig(env);
        const poolInput = Array.isArray(input?.momentPool) ? input.momentPool : Array.isArray(input?.items) ? input.items : [];
        config.momentPool = poolInput.map(normalizeMomentPoolItem).filter(Boolean);
        await env.CONFIG.put(CONFIG_KEY, JSON.stringify(config, null, 2));
        return jsonResponse({ ok: true, momentPool: config.momentPool, config });
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonResponse({ error: error?.message || 'Server error' }, error?.status || 500);
    }
  }
};

async function readConfig(env) {
  const saved = await env.CONFIG.get(CONFIG_KEY, 'json');
  return normalizeConfig(saved || DEFAULT_CONFIG);
}

function normalizeConfig(input) {
  const now = new Date().toISOString();
  const prompts = uniquePromptsByScenario(Array.isArray(input?.prompts) ? input.prompts.map(normalizePrompt).filter(Boolean) : []);
  const meta = normalizeMeta(input?.meta);
  const momentPlans = Array.isArray(input?.momentPlans) ? input.momentPlans.map(normalizeMomentPlan).filter(Boolean) : [];
  const momentPool = Array.isArray(input?.momentPool) ? input.momentPool.map(normalizeMomentPoolItem).filter(Boolean) : [];
  const authorizedUsers = Array.isArray(input?.authorizedUsers) ? input.authorizedUsers.map(normalizeAuthorizedUser).filter(Boolean) : [];
  const usageRecords = Array.isArray(input?.usageRecords) ? input.usageRecords.map(normalizeUsageRecord).filter(Boolean) : [];
  const savedUpdate = {
    latestVersion: text(input?.update?.latestVersion) || DEFAULT_CONFIG.update.latestVersion,
    downloadUrl: text(input?.update?.downloadUrl),
    releaseNotes: text(input?.update?.releaseNotes),
    force: Boolean(input?.update?.force),
    publishedAt: text(input?.update?.publishedAt) || now
  };
  const update = compareVersions(savedUpdate.latestVersion, CURRENT_APP_RELEASE.latestVersion) < 0
    ? { ...CURRENT_APP_RELEASE, force: savedUpdate.force || CURRENT_APP_RELEASE.force }
    : savedUpdate;

  return {
    prompts,
    momentPlans,
    momentPool,
    authorizedUsers,
    usageRecords,
    update,
    meta: {
      promptRevision: meta.promptRevision,
      promptsUpdatedAt: meta.promptsUpdatedAt || now,
      promptCount: prompts.length
    }
  };
}

function publishConfig(input) {
  const current = normalizeConfig(input);
  return {
    ...current,
    meta: {
      promptRevision: current.meta.promptRevision + 1,
      promptsUpdatedAt: new Date().toISOString(),
      promptCount: current.prompts.length
    }
  };
}

function publicConfig(config) {
  return {
    prompts: config.prompts,
    update: config.update,
    meta: config.meta
  };
}

function normalizeAuthorizedUser(input) {
  const phone = normalizePhone(input?.phone);
  if (!/^1\d{10}$/u.test(phone)) return undefined;
  const now = new Date().toISOString();
  return {
    id: text(input?.id) || crypto.randomUUID(),
    phone,
    name: text(input?.name),
    enabled: input?.enabled !== false,
    remark: text(input?.remark),
    createdAt: text(input?.createdAt) || now,
    updatedAt: text(input?.updatedAt) || now,
    lastLoginAt: text(input?.lastLoginAt),
    lastUsedAt: text(input?.lastUsedAt)
  };
}

function normalizeUsageRecord(input) {
  const phone = normalizePhone(input?.phone);
  if (!/^1\d{10}$/u.test(phone)) return undefined;
  const now = new Date().toISOString();
  return {
    id: text(input?.id) || crypto.randomUUID(),
    phone,
    module: text(input?.module) || 'app',
    action: text(input?.action) || 'use',
    summary: text(input?.summary).slice(0, 180),
    createdAt: text(input?.createdAt) || now
  };
}

function publicUser(user) {
  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    enabled: user.enabled,
    remark: user.remark,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
    lastUsedAt: user.lastUsedAt
  };
}

function normalizeMeta(input) {
  return {
    promptRevision: Number.isFinite(Number(input?.promptRevision)) ? Number(input.promptRevision) : 0,
    promptsUpdatedAt: text(input?.promptsUpdatedAt) || '',
    promptCount: Number.isFinite(Number(input?.promptCount)) ? Number(input.promptCount) : 0
  };
}

function normalizePrompt(input) {
  const scenario = text(input?.scenario);
  if (!EDITABLE_PROMPT_SCENARIOS.has(scenario)) return undefined;
  const catalog = EDITABLE_PROMPT_CATALOG.find((item) => item.scenario === scenario);
  const name = text(input?.name) || catalog?.name;
  const template = text(input?.template);
  if (!scenario || !name || !template) return undefined;
  const now = new Date().toISOString();
  return {
    id: text(input?.id) || `remote-${scenario}`,
    scenario,
    name,
    description: text(input?.description) || catalog?.description || '',
    requiredVariables: catalog?.requiredVariables || [],
    template,
    enabled: input?.enabled !== false,
    builtIn: false,
    createdAt: text(input?.createdAt) || now,
    updatedAt: now
  };
}

function uniquePromptsByScenario(prompts) {
  const map = new Map();
  for (const prompt of prompts) {
    if (!prompt || !EDITABLE_PROMPT_SCENARIOS.has(prompt.scenario)) continue;
    map.set(prompt.scenario, prompt);
  }
  return EDITABLE_PROMPT_CATALOG.map((item) => map.get(item.scenario)).filter(Boolean);
}

function normalizeMomentPlan(input) {
  const date = text(input?.date);
  const rawContent = typeof input?.rawContent === 'string' ? input.rawContent.trim() : '';
  const now = new Date().toISOString();
  return {
    id: text(input?.id) || crypto.randomUUID(),
    date,
    rawContent,
    materials: Array.isArray(input?.materials) ? input.materials.map(normalizeMomentMaterial).filter((item) => item.url) : [],
    status: normalizePlanStatus(input?.status),
    remark: text(input?.remark),
    createdAt: text(input?.createdAt) || now,
    updatedAt: text(input?.updatedAt) || now
  };
}

function normalizeMomentPoolItem(input) {
  const rawContent = typeof input?.rawContent === 'string' ? input.rawContent.trim() : '';
  const materials = Array.isArray(input?.materials) ? input.materials.map(normalizeMomentMaterial).filter((item) => item.url) : [];
  const remark = text(input?.remark);
  if (!rawContent && !materials.length && !remark) return undefined;
  const now = new Date().toISOString();
  return {
    id: text(input?.id) || crypto.randomUUID(),
    rawContent,
    materials,
    remark,
    createdAt: text(input?.createdAt) || now,
    updatedAt: text(input?.updatedAt) || now
  };
}

function normalizeMomentMaterial(input) {
  const type = normalizeMaterialType(input?.type);
  return {
    id: text(input?.id) || crypto.randomUUID(),
    name: text(input?.name) || '朋友圈素材',
    type,
    url: text(input?.url)
  };
}

function normalizePlanStatus(value) {
  const status = text(value);
  return ['draft', 'active', 'inactive'].includes(status) ? status : 'draft';
}

function normalizeMaterialType(value) {
  const type = text(value);
  return ['image', 'video', 'file'].includes(type) ? type : 'image';
}

function validateMomentPlan(plan) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(plan.date)) {
    const error = new Error('日期不能为空，格式应为 YYYY-MM-DD');
    error.status = 400;
    throw error;
  }
  const hasMaterial = Array.isArray(plan.materials) && plan.materials.some((material) => material.url);
  if (!plan.rawContent && !hasMaterial) {
    const error = new Error('朋友圈文字和素材不能同时为空');
    error.status = 400;
    throw error;
  }
  for (const material of plan.materials) {
    if (!material.url) {
      const error = new Error('素材 URL 不能为空');
      error.status = 400;
      throw error;
    }
  }
}

function enforceActivePlanUniqueness(plans, plan) {
  if (plan.status !== 'active') return;
  const conflict = plans.find((item) => item.id !== plan.id && item.date === plan.date && item.status === 'active');
  if (!conflict) return;
  const error = new Error('同一天已有启用中的朋友圈规划，请先停用旧内容');
  error.status = 409;
  throw error;
}

async function parseUploadedMaterial(request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      const error = new Error('请上传素材文件');
      error.status = 400;
      throw error;
    }
    const bytes = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(bytes);
    return {
      id: crypto.randomUUID(),
      name: file.name || '朋友圈素材',
      type: inferMaterialType(file.type, file.name),
      url: `data:${file.type || 'application/octet-stream'};base64,${base64}`
    };
  }

  const input = await request.json();
  const material = normalizeMomentMaterial(input);
  if (!material.url) {
    const error = new Error('素材 URL 不能为空');
    error.status = 400;
    throw error;
  }
  return material;
}

function inferMaterialType(mime, name) {
  if (String(mime).startsWith('image/')) return 'image';
  if (String(mime).startsWith('video/')) return 'video';
  if (/\.(png|jpe?g|webp|gif|svg)$/iu.test(name || '')) return 'image';
  if (/\.(mp4|mov|webm|m4v)$/iu.test(name || '')) return 'video';
  return 'file';
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function todayDateString() {
  return localDateString(new Date());
}

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function assertAdmin(request, env) {
  const username = env.ADMIN_USERNAME || 'admin';
  const password = env.ADMIN_PASSWORD || '12345678';
  const auth = request.headers.get('authorization') || '';
  if (auth.startsWith('Basic ')) {
    try {
      const decoded = atob(auth.slice(6));
      const separator = decoded.indexOf(':');
      const incomingUsername = decoded.slice(0, separator);
      const incomingPassword = decoded.slice(separator + 1);
      if (incomingUsername === username && incomingPassword === password) return;
    } catch {
      // Fall through to header auth for API clients.
    }
  }
  const incomingUsername = request.headers.get('x-admin-username') || '';
  const incomingPassword = request.headers.get('x-admin-password') || '';
  if (incomingUsername === username && incomingPassword === password) return;
  const error = new Error('Unauthorized');
  error.status = 401;
  throw error;
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePhone(value) {
  return String(value || '').replace(/[^\d]/gu, '');
}

function compareVersions(a, b) {
  const left = String(a).split('.').map((item) => Number.parseInt(item, 10) || 0);
  const right = String(b).split('.').map((item) => Number.parseInt(item, 10) || 0);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function jsonResponse(body, status = 200) {
  const headers = { 'content-type': 'application/json; charset=utf-8' };
  if (status === 401) headers['www-authenticate'] = 'Basic realm="Peilian Cat Admin", charset="UTF-8"';
  return withCors(new Response(JSON.stringify(body), {
    status,
    headers
  }));
}

function htmlResponse(html) {
  return withCors(new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' }
  }));
}

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
  headers.set('access-control-allow-headers', 'content-type,accept,x-admin-username,x-admin-password');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function renderMomentPlannerHtml(publicBaseUrl) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>朋友圈规划 - 陪练猫内容后台</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; background: #f7f5ef; color: #26312f; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    header { padding: 22px clamp(18px, 4vw, 44px); background: #fff; border-bottom: 1px solid #e6ded1; display: flex; justify-content: space-between; gap: 16px; align-items: center; }
    h1, h2, h3 { margin: 0; }
    h1 { font-size: 24px; }
    h2 { font-size: 18px; }
    h3 { font-size: 16px; }
    main { padding: 22px clamp(18px, 4vw, 44px); display: grid; gap: 18px; }
    a { color: #2e7869; font-weight: 700; text-decoration: none; }
    button { border: 0; border-radius: 6px; padding: 10px 14px; font: inherit; font-weight: 700; cursor: pointer; background: #2e7869; color: #fff; }
    button.secondary { background: #e8efe9; color: #25453e; }
    button.danger { background: #b85045; }
    input, textarea, select { width: 100%; border: 1px solid #cfc6b8; border-radius: 6px; padding: 10px 11px; font: inherit; background: #fff; }
    textarea { min-height: 112px; resize: vertical; line-height: 1.55; }
    label { display: grid; gap: 6px; font-weight: 700; font-size: 13px; }
    .muted { color: #68726f; font-size: 13px; line-height: 1.5; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .toolbar { background: #fffefa; border: 1px solid #e5ded1; border-radius: 8px; padding: 16px; display: flex; justify-content: space-between; gap: 14px; align-items: center; flex-wrap: wrap; }
    .status { color: #2e7869; font-weight: 800; min-height: 24px; }
    .planner { display: grid; grid-template-columns: minmax(300px, 380px) minmax(0, 1fr) minmax(320px, 420px); gap: 18px; align-items: start; }
    .panel { background: #fffefa; border: 1px solid #e5ded1; border-radius: 8px; padding: 16px; display: grid; gap: 14px; }
    .calendar-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
    .weekday-grid, .calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
    .weekday-grid span { color: #68726f; font-size: 12px; text-align: center; font-weight: 800; }
    .day { min-height: 76px; border: 1px solid #e0d7c8; border-radius: 8px; background: #fff; padding: 8px; display: grid; align-content: start; gap: 6px; color: #26312f; text-align: left; }
    .day.blank { visibility: hidden; }
    .day.selected { border-color: #2e7869; box-shadow: inset 0 0 0 1px #2e7869; background: #f5fbf7; }
    .day.today { border-color: #a15b2f; }
    .day strong { font-size: 15px; }
    .badge { display: inline-flex; width: fit-content; padding: 2px 7px; border-radius: 999px; background: #eef5ef; color: #25453e; font-size: 12px; }
    .entry-list { display: grid; gap: 12px; }
    .entry-card { border: 1px solid #e0d7c8; background: #fff; border-radius: 8px; padding: 14px; display: grid; gap: 12px; }
    .entry-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; }
    .grid2 { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 10px; }
    .material-list { display: grid; gap: 10px; }
    .material-row { display: grid; grid-template-columns: 120px 120px minmax(0, 1fr) auto; gap: 8px; align-items: center; }
    .hidden-file-input { display: none; }
    .drop-zone { border: 1px dashed #b9c8bf; border-radius: 8px; background: #f5fbf7; padding: 14px; color: #2e7869; text-align: center; cursor: pointer; }
    .drop-zone.drag-over, .entry-card.drag-over { border-color: #2e7869; background: #eef9f3; }
    .pool-panel { max-height: calc(100vh - 190px); overflow: auto; }
    .pool-list { display: grid; gap: 10px; }
    .pool-card { border: 1px solid #e0d7c8; border-radius: 8px; background: #fff; padding: 12px; display: grid; gap: 10px; }
    .pool-card textarea { min-height: 74px; }
    .pool-card-head { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
    .pool-meta { color: #68726f; font-size: 12px; }
    .empty { border: 1px dashed #c9d7cd; border-radius: 8px; padding: 18px; color: #68726f; background: #f9fbf7; }
    @media (max-width: 1180px) { .planner, .grid2, .material-row { grid-template-columns: 1fr; } .day { min-height: 62px; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>朋友圈规划</h1>
      <div class="muted">按日期维护多条朋友圈文案和素材，APP 点击今日朋友圈时会实时二创。</div>
    </div>
    <div class="row">
      <a href="/admin">返回后台</a>
      <span class="muted">${publicBaseUrl}</span>
    </div>
  </header>
  <main>
    <section class="toolbar">
      <div>
        <h2 id="selectedTitle">请选择日期</h2>
        <div class="muted">点击日历日期后，在右侧添加一条或多条朋友圈内容。每条可以单独配文字和素材。</div>
      </div>
      <div class="row">
        <button class="secondary" id="reload">读取后台</button>
        <button id="addEntry">添加一条朋友圈</button>
        <button id="save">保存</button>
      </div>
      <div class="status" id="status"></div>
    </section>
    <div class="planner">
      <section class="panel">
        <div class="calendar-head">
          <button class="secondary" id="prevMonth">上个月</button>
          <h2 id="monthTitle"></h2>
          <button class="secondary" id="nextMonth">下个月</button>
        </div>
        <div class="weekday-grid"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>
        <div class="calendar-grid" id="calendar"></div>
      </section>
      <section class="panel">
        <div class="entry-head">
          <div>
            <h2>当天朋友圈内容</h2>
            <div class="muted" id="entrySummary">还没有读取数据</div>
          </div>
          <button class="secondary" id="activateAll">全部启用</button>
        </div>
        <div class="entry-list" id="entryList"></div>
      </section>
      <aside class="panel pool-panel">
        <div class="entry-head">
          <div>
            <h2>朋友圈池</h2>
            <div class="muted">上传的新内容会先进入池子；选中日期后，可把池子内容加入当天。</div>
          </div>
          <button id="addPoolItem">新增池内容</button>
        </div>
        <div class="drop-zone" id="poolDropZone">拖拽素材到这里，会保存到朋友圈池</div>
        <input class="hidden-file-input" id="poolUpload" type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" />
        <div class="pool-list" id="poolList"></div>
      </aside>
    </div>
  </main>
  <script>
    let state = { prompts: [], momentPlans: [], momentPool: [], update: {}, meta: { promptRevision: 0, promptsUpdatedAt: '', promptCount: 0 } };
    const today = new Date();
    let monthCursor = new Date(today.getFullYear(), today.getMonth(), 1);
    let selectedDate = toDateString(today);
    const api = location.origin;
    const $ = (id) => document.getElementById(id);

    function setStatus(text, danger) {
      $("status").textContent = text;
      $("status").style.color = danger ? "#b85045" : "#2e7869";
    }
    function toDateString(date) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return y + "-" + m + "-" + d;
    }
    async function loadConfig() {
      const res = await fetch(api + "/api/admin/config", { headers: { "content-type": "application/json" } });
      if (!res.ok) throw new Error(await res.text());
      state = await res.json();
      state.momentPlans = Array.isArray(state.momentPlans) ? state.momentPlans : [];
      state.momentPool = Array.isArray(state.momentPool) ? state.momentPool : [];
      renderAll();
      setStatus("后台数据已读取");
    }
    function hasMomentContent(item) {
      return Boolean(String(item.rawContent || "").trim()) || (Array.isArray(item.materials) && item.materials.some((material) => String(material.url || "").trim()));
    }
    async function saveConfig() {
      const invalid = state.momentPlans.find((item) => !String(item.date || "").trim() || !hasMomentContent(item));
      if (invalid) {
        selectedDate = invalid.date || selectedDate;
        renderAll();
        setStatus("还有朋友圈内容为空，请补充文字或素材后再保存", true);
        return;
      }
      const res = await fetch(api + "/api/admin/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(state)
      });
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json();
      state = body.config;
      state.momentPlans = Array.isArray(state.momentPlans) ? state.momentPlans : [];
      state.momentPool = Array.isArray(state.momentPool) ? state.momentPool : [];
      renderAll();
      setStatus("保存成功");
    }
    function renderAll() {
      $("selectedTitle").textContent = selectedDate + " 朋友圈规划";
      renderCalendar();
      renderEntries();
      renderPool();
    }
    function renderCalendar() {
      const y = monthCursor.getFullYear();
      const m = monthCursor.getMonth();
      $("monthTitle").textContent = y + "年" + String(m + 1).padStart(2, "0") + "月";
      const first = new Date(y, m, 1).getDay();
      const days = new Date(y, m + 1, 0).getDate();
      const cells = [];
      for (let i = 0; i < first; i += 1) cells.push('<button class="day blank" type="button"></button>');
      for (let d = 1; d <= days; d += 1) {
        const date = toDateString(new Date(y, m, d));
        const entries = entriesForDate(date);
        const active = entries.filter((item) => item.status === "active").length;
        const cls = "day" + (date === selectedDate ? " selected" : "") + (date === toDateString(today) ? " today" : "");
        cells.push('<button class="' + cls + '" type="button" data-date="' + date + '"><strong>' + d + '</strong>' + (entries.length ? '<span class="badge">' + entries.length + '条 / ' + active + '启用</span>' : '') + '</button>');
      }
      $("calendar").innerHTML = cells.join("");
    }
    function entriesForDate(date) {
      return state.momentPlans
        .filter((item) => item.date === date)
        .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    }
    function renderEntries() {
      const entries = entriesForDate(selectedDate);
      $("entrySummary").textContent = entries.length ? "共 " + entries.length + " 条，APP 会读取其中启用的内容。" : "这一天还没有朋友圈内容。";
      if (!entries.length) {
        $("entryList").innerHTML = '<div class="empty">点击“添加一条朋友圈”，给 ' + escapeHtml(selectedDate) + ' 新增文字和素材。</div>';
        return;
      }
      $("entryList").innerHTML = entries.map((item, index) => renderEntry(item, index)).join("");
    }
    function renderEntry(item, index) {
      const materials = Array.isArray(item.materials) ? item.materials : [];
      return '<article class="entry-card" data-plan-card="' + escapeAttr(item.id) + '">' +
        '<div class="entry-head"><h3>第 ' + (index + 1) + ' 条朋友圈</h3><div class="row"><button class="secondary" data-duplicate-plan="' + escapeAttr(item.id) + '">复制一条</button><button class="danger" data-delete-plan="' + escapeAttr(item.id) + '">删除</button></div></div>' +
        '<div class="grid2"><label>状态<select data-plan-status="' + escapeAttr(item.id) + '"><option value="active"' + (item.status === "active" ? " selected" : "") + '>启用</option><option value="draft"' + (item.status === "draft" ? " selected" : "") + '>草稿</option><option value="inactive"' + (item.status === "inactive" ? " selected" : "") + '>停用</option></select></label><label>备注<input data-plan-remark="' + escapeAttr(item.id) + '" value="' + escapeAttr(item.remark || "") + '" placeholder="内部备注，可不填" /></label></div>' +
        '<label>朋友圈文字<textarea data-plan-raw="' + escapeAttr(item.id) + '" placeholder="输入这条朋友圈的原始内容，APP 会在用户点击时实时改写">' + escapeHtml(item.rawContent || "") + '</textarea></label>' +
        '<div class="entry-head"><strong>素材</strong><div class="row"><button class="secondary" data-add-material="' + escapeAttr(item.id) + '">添加素材链接</button><button class="secondary" type="button" data-pick-upload="' + escapeAttr(item.id) + '">上传到本条</button><button class="secondary" type="button" data-open-pool="' + escapeAttr(item.id) + '">从池子选择</button><input class="hidden-file-input" type="file" multiple data-upload-material="' + escapeAttr(item.id) + '" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" /></div></div>' +
        '<div class="drop-zone" data-drop-material="' + escapeAttr(item.id) + '">拖拽素材到这里会自动上传并保存，也可以点击选择文件</div>' +
        '<div class="material-list">' + (materials.length ? materials.map((material, materialIndex) => renderMaterial(item.id, material, materialIndex)).join("") : '<div class="empty">这条朋友圈还没有素材。</div>') + '</div>' +
      '</article>';
    }
    function renderMaterial(planId, material, index) {
      return '<div class="material-row">' +
        '<input data-material-name="' + escapeAttr(planId) + '" data-material-index="' + index + '" value="' + escapeAttr(material.name || "") + '" placeholder="素材名称" />' +
        '<select data-material-type="' + escapeAttr(planId) + '" data-material-index="' + index + '"><option value="image"' + (material.type === "image" ? " selected" : "") + '>图片</option><option value="video"' + (material.type === "video" ? " selected" : "") + '>视频</option><option value="file"' + (material.type === "file" ? " selected" : "") + '>文件</option></select>' +
        '<input data-material-url="' + escapeAttr(planId) + '" data-material-index="' + index + '" value="' + escapeAttr(material.url || "") + '" placeholder="https:// 或 data:" />' +
        '<button class="danger" data-remove-material="' + escapeAttr(planId) + '" data-material-index="' + index + '">删除</button>' +
      '</div>';
    }
    function addEntry() {
      const now = new Date().toISOString();
      state.momentPlans.push({
        id: crypto.randomUUID(),
        date: selectedDate,
        rawContent: "",
        materials: [],
        status: "active",
        remark: "",
        createdAt: now,
        updatedAt: now
      });
      renderAll();
      setStatus("已新增一条，填写文字和素材后点保存");
    }
    function findPlan(id) {
      return state.momentPlans.find((item) => item.id === id);
    }
    function findPoolItem(id) {
      return state.momentPool.find((item) => item.id === id);
    }
    function createPoolItem(input) {
      const now = new Date().toISOString();
      return {
        id: crypto.randomUUID(),
        rawContent: input?.rawContent || "",
        materials: Array.isArray(input?.materials) ? input.materials : [],
        remark: input?.remark || "",
        createdAt: now,
        updatedAt: now
      };
    }
    function poolItemToPlan(poolItem) {
      const now = new Date().toISOString();
      return {
        id: crypto.randomUUID(),
        date: selectedDate,
        rawContent: poolItem.rawContent || "",
        materials: (poolItem.materials || []).map((material) => ({ ...material, id: crypto.randomUUID() })),
        status: "active",
        remark: poolItem.remark || "",
        createdAt: now,
        updatedAt: now
      };
    }
    function renderPool() {
      state.momentPool = Array.isArray(state.momentPool) ? state.momentPool : [];
      if (!state.momentPool.length) {
        $("poolList").innerHTML = '<div class="empty">朋友圈池还没有内容。可以点击新增，也可以直接拖拽素材到池子。</div>';
        return;
      }
      $("poolList").innerHTML = state.momentPool.map((item, index) => renderPoolItem(item, index)).join("");
    }
    function renderPoolItem(item, index) {
      const materials = Array.isArray(item.materials) ? item.materials : [];
      return '<article class="pool-card" data-pool-card="' + escapeAttr(item.id) + '">' +
        '<div class="pool-card-head"><strong>池内容 ' + (index + 1) + '</strong><span class="pool-meta">素材 ' + materials.length + ' 个</span></div>' +
        '<label>朋友圈文字<textarea data-pool-raw="' + escapeAttr(item.id) + '" placeholder="可只放素材，也可写朋友圈文字">' + escapeHtml(item.rawContent || "") + '</textarea></label>' +
        '<label>备注<input data-pool-remark="' + escapeAttr(item.id) + '" value="' + escapeAttr(item.remark || "") + '" placeholder="内部备注，可不填" /></label>' +
        '<div class="row"><button type="button" data-use-pool="' + escapeAttr(item.id) + '">加入当天</button><button class="secondary" type="button" data-pick-pool-upload="' + escapeAttr(item.id) + '">上传素材</button><button class="danger" type="button" data-delete-pool="' + escapeAttr(item.id) + '">删除</button><input class="hidden-file-input" type="file" multiple data-upload-pool="' + escapeAttr(item.id) + '" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" /></div>' +
        '<div class="drop-zone" data-drop-pool="' + escapeAttr(item.id) + '">拖拽素材到这条池内容</div>' +
        '<div class="material-list">' + (materials.length ? materials.map((material, materialIndex) => renderPoolMaterial(item.id, material, materialIndex)).join("") : '<div class="empty">还没有素材。</div>') + '</div>' +
      '</article>';
    }
    function renderPoolMaterial(poolId, material, index) {
      return '<div class="material-row">' +
        '<input data-pool-material-name="' + escapeAttr(poolId) + '" data-material-index="' + index + '" value="' + escapeAttr(material.name || "") + '" placeholder="素材名称" />' +
        '<select data-pool-material-type="' + escapeAttr(poolId) + '" data-material-index="' + index + '"><option value="image"' + (material.type === "image" ? " selected" : "") + '>图片</option><option value="video"' + (material.type === "video" ? " selected" : "") + '>视频</option><option value="file"' + (material.type === "file" ? " selected" : "") + '>文件</option></select>' +
        '<input data-pool-material-url="' + escapeAttr(poolId) + '" data-material-index="' + index + '" value="' + escapeAttr(material.url || "") + '" placeholder="https:// 或 data:" />' +
        '<button class="danger" data-remove-pool-material="' + escapeAttr(poolId) + '" data-material-index="' + index + '">删除</button>' +
      '</div>';
    }
    async function uploadMaterial(file) {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(api + "/api/admin/moments/materials/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json();
      return body.material;
    }
    function uploadInputForPlan(planId) {
      return Array.from(document.querySelectorAll("[data-upload-material]")).find((input) => input.dataset.uploadMaterial === planId);
    }
    function uploadInputForPool(poolId) {
      return Array.from(document.querySelectorAll("[data-upload-pool]")).find((input) => input.dataset.uploadPool === poolId);
    }
    async function savePoolConfig() {
      const res = await fetch(api + "/api/admin/moments/pool", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ momentPool: state.momentPool })
      });
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json();
      state.momentPool = Array.isArray(body.momentPool) ? body.momentPool : [];
      renderPool();
      setStatus("朋友圈池已保存");
    }
    async function uploadFilesToPlan(planId, files, autoSave) {
      const plan = findPlan(planId);
      if (!plan) return;
      const fileList = Array.from(files || []);
      if (!fileList.length) return;
      setStatus("正在上传素材...");
      try {
        plan.materials = Array.isArray(plan.materials) ? plan.materials : [];
        for (const file of fileList) plan.materials.push(await uploadMaterial(file));
        plan.updatedAt = new Date().toISOString();
        renderAll();
        if (autoSave) {
          await saveConfig();
        } else {
          setStatus("素材已上传，点保存后生效");
        }
      } catch (error) {
        setStatus("素材上传失败：" + error.message, true);
      }
    }
    async function uploadFilesToPool(poolId, files) {
      const fileList = Array.from(files || []);
      if (!fileList.length) return;
      setStatus("正在上传到朋友圈池...");
      try {
        state.momentPool = Array.isArray(state.momentPool) ? state.momentPool : [];
        let poolItem = poolId ? findPoolItem(poolId) : undefined;
        if (!poolItem) {
          poolItem = createPoolItem({});
          state.momentPool.unshift(poolItem);
        }
        poolItem.materials = Array.isArray(poolItem.materials) ? poolItem.materials : [];
        for (const file of fileList) poolItem.materials.push(await uploadMaterial(file));
        poolItem.updatedAt = new Date().toISOString();
        await savePoolConfig();
      } catch (error) {
        setStatus("朋友圈池上传失败：" + error.message, true);
      }
    }
    function escapeHtml(value) {
      return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
    }
    function escapeAttr(value) {
      return escapeHtml(value).replace(new RegExp(String.fromCharCode(96), "g"), "&#096;");
    }

    $("reload").onclick = () => loadConfig().catch((error) => setStatus("读取失败：" + error.message, true));
    $("save").onclick = () => saveConfig().catch((error) => setStatus("保存失败：" + error.message, true));
    $("addEntry").onclick = addEntry;
    $("addPoolItem").onclick = () => {
      state.momentPool = Array.isArray(state.momentPool) ? state.momentPool : [];
      state.momentPool.unshift(createPoolItem({}));
      renderPool();
      setStatus("已新增一条池内容，填写文字或上传素材后会保存");
    };
    $("poolDropZone").onclick = () => $("poolUpload").click();
    $("poolUpload").onchange = async (event) => {
      await uploadFilesToPool("", event.target.files);
      event.target.value = "";
    };
    $("activateAll").onclick = () => {
      for (const item of entriesForDate(selectedDate)) item.status = "active";
      renderAll();
      setStatus("当天内容已全部设为启用，点保存后生效");
    };
    $("prevMonth").onclick = () => {
      monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1);
      renderCalendar();
    };
    $("nextMonth").onclick = () => {
      monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1);
      renderCalendar();
    };
    document.body.addEventListener("click", (event) => {
      const target = event.target;
      const pickUpload = target.closest("[data-pick-upload]");
      const dropPicker = target.closest("[data-drop-material]");
      if (pickUpload || dropPicker) {
        const planId = (pickUpload || dropPicker).dataset.pickUpload || (pickUpload || dropPicker).dataset.dropMaterial;
        const input = uploadInputForPlan(planId);
        if (input) input.click();
        return;
      }
      const pickPoolUpload = target.closest("[data-pick-pool-upload]");
      if (pickPoolUpload) {
        const input = uploadInputForPool(pickPoolUpload.dataset.pickPoolUpload);
        if (input) input.click();
        return;
      }
      const openPool = target.closest("[data-open-pool]");
      if (openPool) {
        document.querySelector(".pool-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
        setStatus("在朋友圈池点击“加入当天”，会加入 " + selectedDate);
        return;
      }
      const date = target.closest("[data-date]")?.dataset.date;
      if (date) {
        selectedDate = date;
        renderAll();
        return;
      }
      const addMaterialId = target.dataset.addMaterial;
      if (addMaterialId) {
        const plan = findPlan(addMaterialId);
        if (!plan) return;
        plan.materials = Array.isArray(plan.materials) ? plan.materials : [];
        plan.materials.push({ id: crypto.randomUUID(), name: "朋友圈素材", type: "image", url: "" });
        plan.updatedAt = new Date().toISOString();
        renderEntries();
      }
      const removeMaterialId = target.dataset.removeMaterial;
      if (removeMaterialId) {
        const plan = findPlan(removeMaterialId);
        if (!plan) return;
        plan.materials = (plan.materials || []).filter((_item, index) => String(index) !== String(target.dataset.materialIndex));
        plan.updatedAt = new Date().toISOString();
        renderEntries();
      }
      const deletePlanId = target.dataset.deletePlan;
      if (deletePlanId) {
        if (!confirm("删除这条朋友圈内容？")) return;
        state.momentPlans = state.momentPlans.filter((item) => item.id !== deletePlanId);
        renderAll();
        setStatus("已删除，点保存后生效");
      }
      const duplicatePlanId = target.dataset.duplicatePlan;
      if (duplicatePlanId) {
        const source = findPlan(duplicatePlanId);
        if (!source) return;
        const now = new Date().toISOString();
        state.momentPlans.push({ ...source, id: crypto.randomUUID(), createdAt: now, updatedAt: now, materials: (source.materials || []).map((item) => ({ ...item, id: crypto.randomUUID() })) });
        renderAll();
        setStatus("已复制一条，点保存后生效");
      }
      const usePoolId = target.dataset.usePool;
      if (usePoolId) {
        const poolItem = findPoolItem(usePoolId);
        if (!poolItem) return;
        if (!hasMomentContent(poolItem)) {
          setStatus("这条池内容还没有文字或素材，先补充后再加入当天", true);
          return;
        }
        state.momentPlans.push(poolItemToPlan(poolItem));
        renderAll();
        saveConfig().catch((error) => setStatus("加入当天失败：" + error.message, true));
      }
      const deletePoolId = target.dataset.deletePool;
      if (deletePoolId) {
        if (!confirm("删除这条朋友圈池内容？")) return;
        state.momentPool = (state.momentPool || []).filter((item) => item.id !== deletePoolId);
        renderPool();
        savePoolConfig().catch((error) => setStatus("朋友圈池保存失败：" + error.message, true));
      }
      const removePoolMaterialId = target.dataset.removePoolMaterial;
      if (removePoolMaterialId) {
        const item = findPoolItem(removePoolMaterialId);
        if (!item) return;
        item.materials = (item.materials || []).filter((_material, index) => String(index) !== String(target.dataset.materialIndex));
        item.updatedAt = new Date().toISOString();
        renderPool();
        savePoolConfig().catch((error) => setStatus("朋友圈池保存失败：" + error.message, true));
      }
    });
    document.body.addEventListener("input", (event) => {
      const target = event.target;
      const rawId = target.dataset.planRaw;
      const remarkId = target.dataset.planRemark;
      const materialNameId = target.dataset.materialName;
      const materialUrlId = target.dataset.materialUrl;
      const poolRawId = target.dataset.poolRaw;
      const poolRemarkId = target.dataset.poolRemark;
      const poolMaterialNameId = target.dataset.poolMaterialName;
      const poolMaterialUrlId = target.dataset.poolMaterialUrl;
      if (rawId) {
        const plan = findPlan(rawId);
        if (plan) { plan.rawContent = target.value.trim(); plan.updatedAt = new Date().toISOString(); }
      }
      if (remarkId) {
        const plan = findPlan(remarkId);
        if (plan) { plan.remark = target.value.trim(); plan.updatedAt = new Date().toISOString(); }
      }
      if (materialNameId || materialUrlId) {
        const plan = findPlan(materialNameId || materialUrlId);
        const material = plan?.materials?.[Number(target.dataset.materialIndex)];
        if (materialNameId && material) material.name = target.value.trim();
        if (materialUrlId && material) material.url = target.value.trim();
        if (plan) plan.updatedAt = new Date().toISOString();
      }
      if (poolRawId || poolRemarkId) {
        const item = findPoolItem(poolRawId || poolRemarkId);
        if (poolRawId && item) item.rawContent = target.value.trim();
        if (poolRemarkId && item) item.remark = target.value.trim();
        if (item) item.updatedAt = new Date().toISOString();
      }
      if (poolMaterialNameId || poolMaterialUrlId) {
        const item = findPoolItem(poolMaterialNameId || poolMaterialUrlId);
        const material = item?.materials?.[Number(target.dataset.materialIndex)];
        if (poolMaterialNameId && material) material.name = target.value.trim();
        if (poolMaterialUrlId && material) material.url = target.value.trim();
        if (item) item.updatedAt = new Date().toISOString();
      }
      renderCalendar();
    });
    document.body.addEventListener("change", async (event) => {
      const target = event.target;
      const statusId = target.dataset.planStatus;
      if (statusId) {
        const plan = findPlan(statusId);
        if (plan) { plan.status = target.value; plan.updatedAt = new Date().toISOString(); renderCalendar(); }
      }
      const materialTypeId = target.dataset.materialType;
      if (materialTypeId) {
        const plan = findPlan(materialTypeId);
        const material = plan?.materials?.[Number(target.dataset.materialIndex)];
        if (material) material.type = target.value;
        if (plan) plan.updatedAt = new Date().toISOString();
      }
      const poolMaterialTypeId = target.dataset.poolMaterialType;
      if (poolMaterialTypeId) {
        const item = findPoolItem(poolMaterialTypeId);
        const material = item?.materials?.[Number(target.dataset.materialIndex)];
        if (material) material.type = target.value;
        if (item) {
          item.updatedAt = new Date().toISOString();
          await savePoolConfig().catch((error) => setStatus("朋友圈池保存失败：" + error.message, true));
        }
      }
      const uploadId = target.dataset.uploadMaterial;
      if (uploadId) {
        await uploadFilesToPlan(uploadId, target.files, true);
        target.value = "";
      }
      const uploadPoolId = target.dataset.uploadPool;
      if (uploadPoolId) {
        await uploadFilesToPool(uploadPoolId, target.files);
        target.value = "";
      }
    });
    document.body.addEventListener("focusout", (event) => {
      const target = event.target;
      if (target.dataset.poolRaw || target.dataset.poolRemark || target.dataset.poolMaterialName || target.dataset.poolMaterialUrl) {
        savePoolConfig().catch((error) => setStatus("朋友圈池保存失败：" + error.message, true));
      }
    });
    document.body.addEventListener("dragover", (event) => {
      const zone = event.target.closest("[data-drop-material], [data-drop-pool], #poolDropZone");
      if (!zone) return;
      event.preventDefault();
      zone.classList.add("drag-over");
      zone.closest("[data-plan-card]")?.classList.add("drag-over");
    });
    document.body.addEventListener("dragleave", (event) => {
      const zone = event.target.closest("[data-drop-material], [data-drop-pool], #poolDropZone");
      if (!zone || (event.relatedTarget && zone.contains(event.relatedTarget))) return;
      zone.classList.remove("drag-over");
      zone.closest("[data-plan-card]")?.classList.remove("drag-over");
    });
    document.body.addEventListener("drop", async (event) => {
      const zone = event.target.closest("[data-drop-material], [data-drop-pool], #poolDropZone");
      if (!zone) return;
      event.preventDefault();
      zone.classList.remove("drag-over");
      zone.closest("[data-plan-card]")?.classList.remove("drag-over");
      if (zone.dataset.dropMaterial) {
        await uploadFilesToPlan(zone.dataset.dropMaterial, event.dataTransfer?.files, true);
      } else {
        await uploadFilesToPool(zone.dataset.dropPool || "", event.dataTransfer?.files);
      }
    });
    loadConfig().catch((error) => setStatus("读取失败：" + error.message, true));
  </script>
</body>
</html>`;
}

function renderAdminHtml(publicBaseUrl) {
  return renderAdminLandingHtml(publicBaseUrl);
}

function renderAdminLandingHtml(publicBaseUrl) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>陪练猫云后台 - 更新及授权</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; background: #f7f5ef; color: #26312f; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; }
    header { padding: 22px clamp(18px, 4vw, 44px); background: #ffffff; border-bottom: 1px solid #e8e0d3; display: grid; gap: 18px; }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 24px; letter-spacing: 0; }
    h2 { font-size: 18px; }
    h3 { font-size: 15px; }
    main { padding: 24px clamp(18px, 4vw, 44px); display: grid; gap: 18px; }
    .muted { color: #68726f; font-size: 13px; line-height: 1.6; }
    .header-row { display: flex; justify-content: space-between; gap: 16px; align-items: center; flex-wrap: wrap; }
    .nav-tabs { display: flex; gap: 10px; flex-wrap: wrap; }
    button, .button { border: 0; border-radius: 6px; padding: 10px 14px; font: inherit; font-weight: 800; cursor: pointer; background: #e8efe9; color: #25453e; text-decoration: none; }
    button.primary { background: #2e7869; color: #fff; }
    button.danger { background: #b85045; color: #fff; }
    button.active { background: #2e7869; color: #fff; }
    input, textarea, select { width: 100%; border: 1px solid #cfc6b8; border-radius: 6px; padding: 10px 11px; font: inherit; background: #fff; }
    textarea { min-height: 120px; resize: vertical; line-height: 1.55; }
    label { display: grid; gap: 6px; font-weight: 700; font-size: 13px; }
    .panel { background: #fffefa; border: 1px solid #e5ded1; border-radius: 8px; padding: 18px; display: none; gap: 16px; }
    .panel.active { display: grid; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .status { min-height: 24px; color: #2e7869; font-weight: 800; }
    .list { display: grid; gap: 10px; }
    .card { border: 1px solid #e0d7c8; border-radius: 8px; background: #fff; padding: 14px; display: grid; gap: 10px; }
    .card-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; }
    .pill { display: inline-flex; width: fit-content; padding: 3px 8px; border-radius: 999px; background: #eef5ef; color: #25453e; font-size: 12px; font-weight: 800; }
    .pill.off { background: #f0ebe2; color: #76695a; }
    .usage-grid { display: grid; grid-template-columns: minmax(260px, 340px) minmax(0, 1fr); gap: 16px; align-items: start; }
    .user-button { width: 100%; text-align: left; border: 1px solid #e0d7c8; background: #fff; color: #26312f; }
    .user-button.active { border-color: #2e7869; background: #f5fbf7; color: #1f6658; }
    .usage-line { display: grid; grid-template-columns: 170px 120px 130px minmax(0, 1fr); gap: 10px; align-items: start; }
    .usage-line span { overflow-wrap: anywhere; }
    .prompt-grid { display: grid; grid-template-columns: minmax(280px, 380px) minmax(0, 1fr); gap: 16px; align-items: start; }
    .prompt-item { width: 100%; text-align: left; border: 1px solid #e0d7c8; background: #fff; color: #26312f; display: grid; gap: 6px; }
    .prompt-item.active { border-color: #2e7869; background: #f5fbf7; color: #1f6658; }
    .readonly-field { border: 1px solid #e0d7c8; border-radius: 6px; background: #f8f5ee; padding: 10px 11px; color: #40504d; line-height: 1.55; }
    iframe { width: 100%; height: 76vh; border: 1px solid #e0d7c8; border-radius: 8px; background: #fff; }
    @media (max-width: 980px) { .grid2, .grid3, .usage-grid, .usage-line, .prompt-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <div class="header-row">
      <div>
        <h1>陪练猫云后台</h1>
        <div class="muted">管理 APP 更新、手机号授权、用户使用记录和朋友圈规划。</div>
      </div>
      <div class="muted">${publicBaseUrl}</div>
    </div>
    <nav class="nav-tabs" aria-label="后台导航">
      <button class="active" data-tab="update">更新及授权</button>
      <button data-tab="prompts">提示词管理</button>
      <button data-tab="users">用户授权</button>
      <button data-tab="usage">用户使用记录</button>
      <button data-tab="moments">朋友圈规划</button>
    </nav>
  </header>
  <main>
    <div class="status" id="status"></div>
    <section class="panel active" id="panel-update">
      <div class="card-head">
        <div>
          <h2>软件更新</h2>
          <div class="muted">前端 APP 的“检查更新”会读取这里发布的版本和下载地址。</div>
        </div>
        <div class="row">
          <button id="reloadTop">读取后台</button>
          <button class="primary" id="saveUpdate">保存发布</button>
        </div>
      </div>
      <div class="grid2">
        <label>最新版本 <input id="latestVersion" placeholder="0.1.2" /></label>
        <label>发布时间 <input id="publishedAt" placeholder="自动生成或填写 ISO 时间" /></label>
      </div>
      <label>安装包下载地址 <input id="downloadUrl" placeholder="https://..." /></label>
      <label>更新说明 <textarea id="releaseNotes" placeholder="本次更新内容"></textarea></label>
      <label class="row"><input id="forceUpdate" type="checkbox" style="width:auto" /> 强制更新</label>
    </section>

    <section class="panel" id="panel-prompts">
      <div class="card-head">
        <div>
          <h2>提示词管理</h2>
          <div class="muted">维护 APP 端可远程更新的提示词。保存后，APP 点击“更新提示词”会读取这里的新版本。</div>
        </div>
        <div class="row">
          <button id="reloadPrompts">读取后台</button>
          <button class="primary" id="savePrompts">保存提示词</button>
        </div>
      </div>
      <div class="prompt-grid">
        <aside class="list" id="promptList"></aside>
        <div class="card">
          <h3>编辑提示词</h3>
          <label>绑定 APP 功能 <div class="readonly-field" id="promptBinding">请选择左侧提示词</div></label>
          <label>提示词名称 <input id="promptName" readonly /></label>
          <label>说明 <input id="promptDescription" readonly /></label>
          <label>提示词正文 <textarea id="promptTemplate" placeholder="把真正要给模型的提示词放这里"></textarea></label>
          <label>可用变量 <input id="promptVars" readonly /></label>
          <div class="row">
            <button class="primary" id="keepPrompt">保存当前提示词到待发布</button>
            <button id="clearPrompt">清空当前提示词</button>
          </div>
        </div>
      </div>
    </section>

    <section class="panel" id="panel-users">
      <div class="card-head">
        <div>
          <h2>用户授权</h2>
          <div class="muted">填写手机号并启用后，前端 APP 才允许该手机号登录使用。</div>
        </div>
        <button class="primary" id="saveUsers">保存授权</button>
      </div>
      <div class="card">
        <h3>新增授权手机号</h3>
        <div class="grid3">
          <label>手机号 <input id="newPhone" maxlength="11" inputmode="numeric" placeholder="11 位手机号" /></label>
          <label>姓名/备注名 <input id="newName" placeholder="可选" /></label>
          <label>内部备注 <input id="newRemark" placeholder="可选" /></label>
        </div>
        <div class="row"><button class="primary" id="addUser">添加授权</button></div>
      </div>
      <div class="list" id="userList"></div>
    </section>

    <section class="panel" id="panel-usage">
      <div class="card-head">
        <div>
          <h2>用户使用记录</h2>
          <div class="muted">点击左侧手机号，右侧查看该用户的使用情况。</div>
        </div>
        <button id="reloadUsage">刷新记录</button>
      </div>
      <div class="usage-grid">
        <aside class="list" id="usageUsers"></aside>
        <div class="list" id="usageRecords"></div>
      </div>
    </section>

    <section class="panel" id="panel-moments">
      <div class="card-head">
        <div>
          <h2>朋友圈规划</h2>
          <div class="muted">朋友圈规划页面展示在下方，继续维护每天的朋友圈内容。</div>
        </div>
        <a class="button" href="/admin/moments" target="_blank" rel="noreferrer">新窗口打开</a>
      </div>
      <iframe src="/admin/moments" title="朋友圈规划"></iframe>
    </section>
  </main>
  <script>
    let state = { prompts: [], momentPlans: [], authorizedUsers: [], usageRecords: [], update: {}, meta: { promptRevision: 0, promptsUpdatedAt: "", promptCount: 0 } };
    let activeUsagePhone = "";
    let editingPromptId = "";
    const editablePromptCatalog = ${JSON.stringify(EDITABLE_PROMPT_CATALOG)};
    const api = location.origin;
    const $ = (id) => document.getElementById(id);

    function setStatus(text, danger) {
      $("status").textContent = text;
      $("status").style.color = danger ? "#b85045" : "#2e7869";
    }
    async function loadConfig() {
      const res = await fetch(api + "/api/admin/config", { headers: { "content-type": "application/json" } });
      if (!res.ok) throw new Error(await res.text());
      state = await res.json();
      state.authorizedUsers = Array.isArray(state.authorizedUsers) ? state.authorizedUsers : [];
      state.usageRecords = Array.isArray(state.usageRecords) ? state.usageRecords : [];
      state.prompts = Array.isArray(state.prompts) ? state.prompts : [];
      hydrate();
      setStatus("后台数据已读取");
    }
    async function saveConfig(message) {
      const res = await fetch(api + "/api/admin/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(state)
      });
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json();
      state = body.config;
      state.authorizedUsers = Array.isArray(state.authorizedUsers) ? state.authorizedUsers : [];
      state.usageRecords = Array.isArray(state.usageRecords) ? state.usageRecords : [];
      state.prompts = Array.isArray(state.prompts) ? state.prompts : [];
      hydrate();
      setStatus(message || "已保存发布");
    }
    function hydrate() {
      $("latestVersion").value = state.update?.latestVersion || "";
      $("downloadUrl").value = state.update?.downloadUrl || "";
      $("releaseNotes").value = state.update?.releaseNotes || "";
      $("forceUpdate").checked = Boolean(state.update?.force);
      $("publishedAt").value = state.update?.publishedAt || "";
      normalizeEditablePrompts();
      renderPrompts();
      fillPromptEditor();
      renderUsers();
      renderUsage();
    }
    function saveUpdateToState() {
      state.update = {
        latestVersion: $("latestVersion").value.trim(),
        downloadUrl: $("downloadUrl").value.trim(),
        releaseNotes: $("releaseNotes").value.trim(),
        force: $("forceUpdate").checked,
        publishedAt: $("publishedAt").value.trim() || new Date().toISOString()
      };
      return saveConfig("更新信息已保存发布");
    }
    function normalizeEditablePrompts() {
      const existing = new Map((state.prompts || []).map((item) => [item.scenario, item]));
      state.prompts = editablePromptCatalog.map((catalog) => {
        const saved = existing.get(catalog.scenario) || {};
        return {
          id: saved.id || "remote-" + catalog.scenario,
          scenario: catalog.scenario,
          name: catalog.name,
          description: catalog.description,
          appBinding: catalog.appBinding,
          requiredVariables: catalog.requiredVariables,
          template: saved.template || "",
          enabled: saved.enabled !== false,
          createdAt: saved.createdAt || new Date().toISOString(),
          updatedAt: saved.updatedAt || new Date().toISOString()
        };
      });
      if (!editingPromptId || !state.prompts.some((item) => item.id === editingPromptId)) {
        editingPromptId = state.prompts[0]?.id || "";
      }
    }
    function renderPrompts() {
      $("promptList").innerHTML = state.prompts.length ? state.prompts.map((item) => {
        const hasTemplate = Boolean((item.template || "").trim());
        return '<button class="prompt-item' + (item.id === editingPromptId ? " active" : "") + '" data-edit-prompt="' + escapeAttr(item.id) + '"><strong>' + escapeHtml(item.name) + ' <span class="pill' + (hasTemplate ? "" : " off") + '">' + (hasTemplate ? "已设置" : "未设置") + '</span></strong><span class="muted">' + escapeHtml(item.appBinding || item.description || "") + '</span></button>';
      }).join("") : '<div class="card"><strong>暂无可编辑提示词</strong><div class="muted">当前后台还没有可编辑提示词目录。</div></div>';
    }
    function fillPromptEditor() {
      const item = state.prompts.find((entry) => entry.id === editingPromptId) || state.prompts[0];
      if (!item) return;
      editingPromptId = item.id;
      $("promptBinding").textContent = item.appBinding || "-";
      $("promptName").value = item.name || "";
      $("promptDescription").value = item.description || "";
      $("promptTemplate").value = item.template || "";
      $("promptVars").value = (item.requiredVariables || []).map((name) => "{{" + name + "}}").join(", ");
    }
    function keepPrompt() {
      const item = state.prompts.find((entry) => entry.id === editingPromptId);
      if (!item) return setStatus("请先选择要编辑的提示词", true);
      item.template = $("promptTemplate").value.trim();
      item.updatedAt = new Date().toISOString();
      if (!item.template) return setStatus("提示词正文不能为空；如果不想维护，请点清空当前提示词", true);
      renderPrompts();
      fillPromptEditor();
      setStatus("提示词已加入待发布，点击保存提示词后生效");
    }
    function clearPrompt() {
      const item = state.prompts.find((entry) => entry.id === editingPromptId);
      if (!item) return;
      item.template = "";
      item.updatedAt = new Date().toISOString();
      renderPrompts();
      fillPromptEditor();
      setStatus("当前提示词已清空，保存后 APP 会继续使用内置提示词");
    }
    function addUser() {
      const phone = normalizePhone($("newPhone").value);
      if (!/^1\\d{10}$/.test(phone)) return setStatus("请输入 11 位手机号", true);
      if (state.authorizedUsers.some((item) => item.phone === phone)) return setStatus("该手机号已经在授权列表里", true);
      const now = new Date().toISOString();
      state.authorizedUsers.unshift({
        id: crypto.randomUUID(),
        phone,
        name: $("newName").value.trim(),
        enabled: true,
        remark: $("newRemark").value.trim(),
        createdAt: now,
        updatedAt: now
      });
      $("newPhone").value = "";
      $("newName").value = "";
      $("newRemark").value = "";
      renderUsers();
      renderUsage();
      setStatus("已添加授权，点击保存授权后生效");
    }
    function renderUsers() {
      const users = [...state.authorizedUsers].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
      $("userList").innerHTML = users.length ? users.map((user) => {
        return '<article class="card"><div class="card-head"><div><h3>' + escapeHtml(user.phone) + ' <span class="pill' + (user.enabled ? "" : " off") + '">' + (user.enabled ? "已授权" : "已停用") + '</span></h3><div class="muted">' + escapeHtml(user.name || "未填写姓名") + ' · ' + escapeHtml(user.remark || "无备注") + '</div></div><div class="row"><button data-view-usage="' + escapeAttr(user.phone) + '">查看使用情况</button><button data-toggle-user="' + escapeAttr(user.id) + '">' + (user.enabled ? "停用" : "启用") + '</button><button class="danger" data-delete-user="' + escapeAttr(user.id) + '">删除</button></div></div><div class="muted">最近登录：' + escapeHtml(formatTime(user.lastLoginAt)) + ' · 最近使用：' + escapeHtml(formatTime(user.lastUsedAt)) + '</div></article>';
      }).join("") : '<div class="card"><strong>还没有授权手机号</strong><div class="muted">添加手机号并保存后，前端用户才能登录使用。</div></div>';
    }
    function renderUsage() {
      const phones = uniquePhones();
      if (!activeUsagePhone && phones.length) activeUsagePhone = phones[0];
      $("usageUsers").innerHTML = phones.length ? phones.map((phone) => {
        const count = state.usageRecords.filter((item) => item.phone === phone).length;
        const user = state.authorizedUsers.find((item) => item.phone === phone);
        return '<button class="user-button' + (phone === activeUsagePhone ? " active" : "") + '" data-usage-phone="' + escapeAttr(phone) + '"><strong>' + escapeHtml(phone) + '</strong><div class="muted">' + escapeHtml(user?.name || "未填写姓名") + ' · ' + count + ' 条记录</div></button>';
      }).join("") : '<div class="card"><strong>暂无用户记录</strong><div class="muted">用户登录并使用功能后会出现在这里。</div></div>';
      const records = state.usageRecords.filter((item) => item.phone === activeUsagePhone);
      $("usageRecords").innerHTML = records.length ? records.map((record) => {
        return '<article class="card usage-line"><span>' + escapeHtml(formatTime(record.createdAt)) + '</span><span>' + escapeHtml(moduleText(record.module)) + '</span><span>' + escapeHtml(record.action || "-") + '</span><span>' + escapeHtml(record.summary || "-") + '</span></article>';
      }).join("") : '<div class="card"><strong>暂无使用记录</strong><div class="muted">请选择其他手机号，或等待用户使用 APP 后再刷新。</div></div>';
    }
    function uniquePhones() {
      const set = new Set();
      for (const user of state.authorizedUsers) set.add(user.phone);
      for (const record of state.usageRecords) set.add(record.phone);
      return Array.from(set).filter(Boolean).sort();
    }
    function switchTab(tab) {
      document.querySelectorAll("[data-tab]").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
      document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));
      $("panel-" + tab).classList.add("active");
    }
    function normalizePhone(value) {
      return String(value || "").replace(/[^\\d]/g, "");
    }
    function escapeHtml(value) {
      return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
    }
    function escapeAttr(value) {
      return escapeHtml(value).replace(new RegExp(String.fromCharCode(96), "g"), "&#096;");
    }
    function formatTime(value) {
      return value ? new Date(value).toLocaleString() : "-";
    }
    function moduleText(value) {
      return { auth: "登录", scripts: "短视频脚本", moments: "AI 朋友圈", articles: "图文发布" }[value] || value || "APP";
    }

    document.body.addEventListener("click", (event) => {
      const target = event.target.closest("button");
      if (!target) return;
      if (target.dataset.tab) switchTab(target.dataset.tab);
      if (target.id === "reloadTop" || target.id === "reloadUsage" || target.id === "reloadPrompts") loadConfig().catch((error) => setStatus("读取失败：" + error.message, true));
      if (target.id === "saveUpdate") saveUpdateToState().catch((error) => setStatus("保存失败：" + error.message, true));
      if (target.id === "savePrompts") saveConfig("提示词已保存发布").catch((error) => setStatus("保存失败：" + error.message, true));
      if (target.id === "keepPrompt") keepPrompt();
      if (target.id === "clearPrompt") clearPrompt();
      if (target.id === "saveUsers") saveConfig("授权列表已保存").catch((error) => setStatus("保存失败：" + error.message, true));
      if (target.id === "addUser") addUser();
      if (target.dataset.editPrompt) {
        editingPromptId = target.dataset.editPrompt;
        fillPromptEditor();
        renderPrompts();
      }
      if (target.dataset.toggleUser) {
        const user = state.authorizedUsers.find((item) => item.id === target.dataset.toggleUser);
        if (user) { user.enabled = !user.enabled; user.updatedAt = new Date().toISOString(); renderUsers(); setStatus("授权状态已修改，点击保存授权后生效"); }
      }
      if (target.dataset.deleteUser) {
        if (!confirm("删除这个授权手机号？")) return;
        state.authorizedUsers = state.authorizedUsers.filter((item) => item.id !== target.dataset.deleteUser);
        renderUsers();
        renderUsage();
        setStatus("授权手机号已删除，点击保存授权后生效");
      }
      if (target.dataset.viewUsage || target.dataset.usagePhone) {
        activeUsagePhone = target.dataset.viewUsage || target.dataset.usagePhone;
        switchTab("usage");
        renderUsage();
      }
    });
    loadConfig().catch((error) => setStatus("读取失败：" + error.message, true));
  </script>
</body>
</html>`;
}

function renderLegacyAdminHtml(publicBaseUrl) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>陪练猫云后台</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; background: #f7f5ef; color: #26312f; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    header { padding: 24px clamp(18px, 4vw, 44px); background: #ffffff; border-bottom: 1px solid #e8e0d3; display: flex; justify-content: space-between; gap: 16px; align-items: center; }
    h1 { margin: 0; font-size: 24px; }
    main { padding: 24px clamp(18px, 4vw, 44px); display: grid; gap: 18px; }
    section { background: #fffefa; border: 1px solid #e5ded1; border-radius: 8px; padding: 18px; }
    h2 { margin: 0 0 14px; font-size: 18px; }
    label { display: grid; gap: 6px; font-weight: 700; font-size: 13px; margin: 12px 0; }
    input, textarea, select { width: 100%; border: 1px solid #cfc6b8; border-radius: 6px; padding: 10px 11px; font: inherit; background: #ffffff; }
    textarea { min-height: 240px; resize: vertical; line-height: 1.55; }
    button { border: 0; border-radius: 6px; padding: 10px 14px; font: inherit; font-weight: 700; cursor: pointer; background: #2e7869; color: #fff; }
    a.button { display: inline-flex; align-items: center; text-decoration: none; border-radius: 6px; padding: 10px 14px; font-weight: 700; background: #2e7869; color: #fff; }
    button.secondary { background: #e8efe9; color: #25453e; }
    button.danger { background: #b85045; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .stack { display: grid; gap: 12px; }
    .list { display: grid; gap: 10px; }
    .item { border: 1px solid #e0d7c8; border-radius: 8px; padding: 12px; background: #fff; display: grid; gap: 10px; }
    .item strong { display: block; margin-bottom: 4px; }
    .item small { color: #68726f; display: block; line-height: 1.5; }
    .pill { display: inline-flex; padding: 3px 8px; border-radius: 999px; background: #f0ebe2; font-size: 12px; margin-left: 6px; }
    .status { min-height: 24px; color: #2e7869; font-weight: 700; }
    .muted { color: #68726f; font-size: 13px; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .stat { border: 1px solid #e0d7c8; border-radius: 8px; background: #fff; padding: 12px; }
    .stat strong { display: block; font-size: 20px; margin-top: 8px; }
    .split { display: grid; grid-template-columns: minmax(300px, 380px) minmax(0, 1fr); gap: 18px; align-items: start; }
    .planner-grid { display: grid; grid-template-columns: minmax(260px, 320px) minmax(360px, 1fr) minmax(300px, 420px); gap: 18px; align-items: start; }
    .planner-column { display: grid; gap: 12px; min-width: 0; }
    .planner-toolbar { display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; }
    .prompt-list { display: grid; gap: 10px; }
    .prompt-item { border: 1px solid #e0d7c8; border-radius: 8px; background: #fff; padding: 12px; display: grid; gap: 10px; cursor: pointer; }
    .prompt-item.active { border-color: #2e7869; box-shadow: inset 0 0 0 1px #2e7869; }
    .prompt-item-main { display: grid; gap: 4px; }
    .prompt-item-main span { color: #68726f; font-size: 13px; line-height: 1.5; }
    .prompt-help { border: 1px solid #d8e6dc; border-radius: 8px; background: #f5fbf7; padding: 12px; color: #25453e; line-height: 1.6; }
    .readonly-field { border: 1px solid #e0d7c8; border-radius: 8px; background: #f8f5ee; padding: 10px 11px; color: #40504d; }
    .plan-list { display: grid; gap: 10px; }
    .plan-item { border: 1px solid #e0d7c8; border-radius: 8px; background: #fff; padding: 12px; display: grid; gap: 10px; }
    .plan-item.active { border-color: #2e7869; box-shadow: inset 0 0 0 1px #2e7869; }
    .plan-item p { margin: 0; color: #40504d; line-height: 1.6; }
    .material-list { display: grid; gap: 10px; }
    .material-item { display: grid; grid-template-columns: 82px minmax(0, 1fr); gap: 10px; align-items: start; border: 1px solid #e0d7c8; border-radius: 8px; background: #fff; padding: 10px; }
    .material-preview { display: grid; place-items: center; width: 82px; aspect-ratio: 1; overflow: hidden; border: 1px solid #e0d7c8; border-radius: 8px; background: #f7f3ea; color: #68726f; font-size: 12px; text-align: center; overflow-wrap: anywhere; }
    .material-preview img, .material-preview video { width: 100%; height: 100%; object-fit: cover; }
    .material-fields { display: grid; gap: 8px; min-width: 0; }
    .material-fields .row { align-items: stretch; }
    .material-fields select { max-width: 110px; }
    .upload-zone { border: 1px dashed #b9c8bf; border-radius: 8px; background: #f5fbf7; padding: 14px; text-align: center; color: #2e7869; cursor: pointer; }
    .upload-zone input { display: none; }
    .compact-textarea { min-height: 120px; }
    .editor-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; }
    .advanced { display: none; border-top: 1px solid #e9e2d7; padding-top: 14px; }
    .advanced.open { display: grid; gap: 12px; }
    .hidden { display: none; }
    .admin-content { display: grid; gap: 18px; }
    .advanced-section summary { cursor: pointer; font-weight: 800; }
    .advanced-section[open] summary { margin-bottom: 14px; }
    @media (max-width: 1180px) { .planner-grid, .split, .stats { grid-template-columns: 1fr; } .grid2 { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>陪练猫云后台</h1>
      <div class="muted">朋友圈规划、素材和提示词发布</div>
    </div>
    <div class="muted">${publicBaseUrl}</div>
  </header>
  <main>
    <div class="admin-content" id="adminContent">
    <section class="stack">
      <div class="stats">
        <div class="stat"><span class="muted">朋友圈规划</span><strong id="planCount">0</strong></div>
        <div class="stat"><span class="muted">提示词版本</span><strong id="statRevision">#0</strong></div>
        <div class="stat"><span class="muted">最近发布</span><strong id="statUpdatedAt">-</strong></div>
      </div>
      <div class="row">
        <a class="button" href="/admin/moments">朋友圈规划</a>
        <button id="load">读取后台</button>
        <button id="save">保存发布</button>
      </div>
      <div class="status" id="status"></div>
      <p class="muted">登录已由浏览器账号密码弹窗完成。这里直接管理朋友圈规划，改完后点“保存发布”。</p>
    </section>

    <section class="stack">
      <div class="planner-toolbar">
        <div>
          <h2>朋友圈规划</h2>
          <div class="muted">提前安排多天朋友圈内容，APP 端每天自动读取当天启用规划。</div>
        </div>
        <div class="row">
          <button class="secondary" id="newPlan">新增规划</button>
          <button id="savePlan">保存当前规划</button>
          <button id="saveTop">保存发布</button>
        </div>
      </div>

      <div class="planner-grid">
        <aside class="planner-column">
          <div class="editor-head">
            <strong>已规划日期</strong>
            <button class="secondary" id="resetPlan">清空</button>
          </div>
          <div class="plan-list" id="planList"></div>
        </aside>

        <div class="planner-column">
          <div class="editor-head">
            <strong>文案与状态</strong>
            <span class="muted">同一天只能有一条启用规划</span>
          </div>
          <div class="grid2">
            <label>日期 <input id="planDate" type="date" /></label>
            <label>状态
              <select id="planStatus">
                <option value="draft">草稿</option>
                <option value="active">启用</option>
                <option value="inactive">停用</option>
              </select>
            </label>
          </div>
          <label>朋友圈原始文案 <textarea class="compact-textarea" id="planRawContent" placeholder="输入今天想让 APP 自动二创的朋友圈原始内容"></textarea></label>
          <label>备注 <input id="planRemark" placeholder="内部备注，可选" /></label>
        </div>

        <aside class="planner-column">
          <div class="editor-head">
            <strong>素材管理</strong>
            <button class="secondary" id="addMaterial" type="button">添加链接</button>
          </div>
          <label class="upload-zone">点击上传图片、视频或文件<input id="materialUpload" type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" /></label>
          <div class="material-list" id="materialList"></div>
        </aside>
      </div>
    </section>

    <details class="advanced-section" open>
      <summary>\u63d0\u793a\u8bcd\u7ba1\u7406</summary>
    <section class="split">
      <div class="stack">
        <div class="editor-head">
          <h2>\u53ef\u4fee\u6539\u63d0\u793a\u8bcd</h2>
        </div>
        <div class="prompt-help">\u8fd9\u91cc\u53ea\u4fdd\u7559\u9700\u8981\u4f60\u624b\u52a8\u8c03\u6574\u7684\u63d0\u793a\u8bcd\u3002\u7cfb\u7edf\u5df2\u7ecf\u5185\u7f6e\u597d\u7684\u9009\u9898\u3001\u56fe\u7247\u3001\u56fe\u6587\u3001\u4eca\u65e5\u670b\u53cb\u5708\u5efa\u8bae\u7b49\u63d0\u793a\u8bcd\u4e0d\u4f1a\u51fa\u73b0\u5728\u8fd9\u91cc\uff0c\u907f\u514d\u8bef\u6539\u9020\u6210\u6df7\u4e71\u3002</div>
        <div class="prompt-list" id="promptList"></div>
      </div>
      <div class="stack">
        <div class="editor-head">
          <h2>\u7f16\u8f91\u63d0\u793a\u8bcd</h2>
        </div>
        <div class="stack">
          <label>\u7ed1\u5b9a APP \u529f\u80fd <div class="readonly-field" id="promptBinding">\u8bf7\u9009\u62e9\u5de6\u4fa7\u63d0\u793a\u8bcd</div></label>
          <label>\u63d0\u793a\u8bcd\u540d\u79f0 <input id="promptName" readonly /></label>
          <label>\u8bf4\u660e <input id="promptDescription" readonly /></label>
          <label>\u63d0\u793a\u8bcd\u6b63\u6587 <textarea id="promptTemplate" placeholder="\u628a\u771f\u6b63\u8981\u7ed9\u6a21\u578b\u7684\u63d0\u793a\u8bcd\u653e\u8fd9\u91cc"></textarea></label>
          <label>\u53ef\u7528\u53d8\u91cf <input id="promptVars" readonly /></label>
          <div class="row">
            <button id="addPrompt">\u4fdd\u5b58\u5f53\u524d\u63d0\u793a\u8bcd</button>
            <button class="secondary" id="resetPrompt">\u91cd\u7f6e</button>
          </div>
          <p class="muted">\u4fdd\u5b58\u5f53\u524d\u63d0\u793a\u8bcd\u540e\uff0c\u8fd8\u9700\u8981\u70b9\u51fb\u9875\u9762\u9876\u90e8\u201c\u4fdd\u5b58\u53d1\u5e03\u201d\u3002APP \u7aef\u70b9\u51fb\u201c\u66f4\u65b0\u63d0\u793a\u8bcd\u201d\u540e\uff0c\u4f1a\u7acb\u523b\u4f7f\u7528\u8fd9\u91cc\u53d1\u5e03\u7684\u65b0\u7248\u672c\u3002</p>
        </div>
      </div>
    </section>
    </details>
    </div>
  </main>
  <script>
    let state = { prompts: [], momentPlans: [], update: {}, meta: { promptRevision: 0, promptsUpdatedAt: '', promptCount: 0 } };
    let editingPromptId = "";
    let editingPlanId = "";
    const editablePromptCatalog = ${JSON.stringify(EDITABLE_PROMPT_CATALOG)};
    const $ = (id) => document.getElementById(id);
    const api = location.origin;

    function setStatus(text, danger) {
      $("status").textContent = text;
      $("status").style.color = danger ? "#b85045" : "#2e7869";
    }
    function authHeaders() {
      return {
        "content-type": "application/json"
      };
    }
    async function loadConfig() {
      const res = await fetch(api + "/api/admin/config", { headers: authHeaders() });
      if (!res.ok) throw new Error(await res.text());
      state = await res.json();
      state.meta = state.meta || { promptRevision: 0, promptsUpdatedAt: '', promptCount: 0 };
      state.momentPlans = Array.isArray(state.momentPlans) ? state.momentPlans : [];
      hydrate();
      setStatus("后台数据已读取");
    }
    async function saveConfig() {
      const res = await fetch(api + "/api/admin/config", { method: "PUT", headers: authHeaders(), body: JSON.stringify(state) });
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json();
      state = body.config;
      state.meta = state.meta || { promptRevision: 0, promptsUpdatedAt: '', promptCount: 0 };
      state.momentPlans = Array.isArray(state.momentPlans) ? state.momentPlans : [];
      hydrate();
      setStatus("已保存并发布");
    }
    function hydrate() {
      $("planCount").textContent = String(state.momentPlans.length || 0);
      $("statRevision").textContent = "#" + String(state.meta?.promptRevision || 0);
      $("statUpdatedAt").textContent = state.meta?.promptsUpdatedAt ? new Date(state.meta.promptsUpdatedAt).toLocaleString() : "-";
      renderPlans();
      normalizeEditablePrompts();
      renderPrompts();
      fillPlanEditor();
      fillEditor();
    }
    function renderPlans() {
      const plans = [...(state.momentPlans || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
      if (!plans.length) {
        $("planList").innerHTML = '<div class="item"><strong>还没有朋友圈规划</strong><small>可以提前配置多天朋友圈文案和素材。</small></div>';
        renderMaterials([]);
        return;
      }
      $("planList").innerHTML = plans.map((item) => '<div class="plan-item' + (item.id === editingPlanId ? ' active' : '') + '"><div><strong>' + escapeHtml(item.date) + '<span class="pill">' + statusText(item.status) + '</span></strong><small>素材 ' + (item.materials || []).length + ' 个 · 更新于 ' + escapeHtml(formatTime(item.updatedAt)) + '</small></div><p>' + escapeHtml((item.rawContent || "").slice(0, 90)) + '</p><div class="row"><button class="secondary" data-edit-plan="' + item.id + '">编辑</button><button class="secondary" data-toggle-plan="' + item.id + '">' + (item.status === "active" ? "停用" : "启用") + '</button><button class="danger" data-delete-plan="' + item.id + '">删除</button></div></div>').join("");
    }
    function clearPlan() {
      editingPlanId = "";
      $("planDate").value = todayDateString();
      $("planStatus").value = "draft";
      $("planRawContent").value = "";
      $("planRemark").value = "";
      renderMaterials([]);
    }
    function fillPlanEditor() {
      const item = state.momentPlans.find((entry) => entry.id === editingPlanId);
      if (!item) {
        if (!$("planDate").value) clearPlan();
        return;
      }
      $("planDate").value = item.date || "";
      $("planStatus").value = item.status || "draft";
      $("planRawContent").value = item.rawContent || "";
      $("planRemark").value = item.remark || "";
      renderMaterials(item.materials || []);
    }
    function renderMaterials(materials) {
      const items = materials && materials.length ? materials : [];
      $("materialList").innerHTML = items.length ? items.map((item, index) => '<div class="material-item" data-material-id="' + escapeAttr(item.id || crypto.randomUUID()) + '"><div class="material-preview">' + materialPreview(item) + '</div><div class="material-fields"><input data-material-name="' + index + '" value="' + escapeAttr(item.name) + '" placeholder="素材名称" /><div class="row"><select data-material-type="' + index + '"><option value="image"' + (item.type === "image" ? " selected" : "") + '>图片</option><option value="video"' + (item.type === "video" ? " selected" : "") + '>视频</option><option value="file"' + (item.type === "file" ? " selected" : "") + '>文件</option></select><button class="danger" data-remove-material="' + index + '">删除</button></div><input data-material-url="' + index + '" value="' + escapeAttr(item.url) + '" placeholder="https:// 或 data:" /></div></div>').join("") : '<div class="item"><small>还没有素材。可以点击上传，也可以添加链接。</small></div>';
    }
    function readMaterials() {
      const rows = Array.from($("materialList").querySelectorAll(".material-item"));
      return rows.map((row) => ({
        id: row.dataset.materialId || crypto.randomUUID(),
        name: row.querySelector("[data-material-name]")?.value.trim() || "朋友圈素材",
        type: row.querySelector("[data-material-type]")?.value || "image",
        url: row.querySelector("[data-material-url]")?.value.trim() || ""
      })).filter((item) => item.url);
    }
    function currentPlanInput(nextStatus) {
      const existing = state.momentPlans.find((entry) => entry.id === editingPlanId);
      return {
        id: editingPlanId || crypto.randomUUID(),
        date: $("planDate").value,
        rawContent: $("planRawContent").value.trim(),
        materials: readMaterials(),
        status: nextStatus || $("planStatus").value,
        remark: $("planRemark").value.trim(),
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }
    function savePlanToState(plan) {
      if (!plan.date) return setStatus("朋友圈规划日期不能为空", true);
      if (!plan.rawContent) return setStatus("朋友圈原始文案不能为空", true);
      if (plan.status === "active" && state.momentPlans.some((item) => item.id !== plan.id && item.date === plan.date && item.status === "active")) {
        return setStatus("同一天已有启用中的朋友圈规划，请先停用旧内容", true);
      }
      state.momentPlans = [plan, ...state.momentPlans.filter((item) => item.id !== plan.id)];
      editingPlanId = plan.id;
      hydrate();
      setStatus("朋友圈规划已加入待保存，点保存发布才会生效");
    }
    async function uploadMaterial(file) {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(api + "/api/admin/moments/materials/upload", {
        method: "POST",
        body: form
      });
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json();
      return body.material;
    }
    function materialPreview(item) {
      if (item.type === "image") return '<img src="' + escapeAttr(item.url) + '" alt="" />';
      if (item.type === "video") return '<video src="' + escapeAttr(item.url) + '" muted></video>';
      return escapeHtml(item.name || "文件");
    }
    function normalizeEditablePrompts() {
      const existing = new Map((state.prompts || []).map((item) => [item.scenario, item]));
      state.prompts = editablePromptCatalog.map((catalog) => {
        const saved = existing.get(catalog.scenario) || {};
        return {
          id: saved.id || "remote-" + catalog.scenario,
          scenario: catalog.scenario,
          name: catalog.name,
          description: catalog.description,
          appBinding: catalog.appBinding,
          requiredVariables: catalog.requiredVariables,
          template: saved.template || "",
          enabled: saved.enabled !== false,
          createdAt: saved.createdAt || new Date().toISOString(),
          updatedAt: saved.updatedAt || new Date().toISOString()
        };
      });
      if (!editingPromptId || !state.prompts.some((item) => item.id === editingPromptId)) {
        editingPromptId = state.prompts[0]?.id || "";
      }
    }
    function renderPrompts() {
      $("promptList").innerHTML = state.prompts.map((item) => {
        const hasTemplate = Boolean((item.template || "").trim());
        return '<div class="prompt-item' + (item.id === editingPromptId ? ' active' : '') + '" data-edit-prompt="' + item.id + '"><div class="prompt-item-main"><strong>' + escapeHtml(item.name) + '<span class="pill">' + (hasTemplate ? '\u5df2\u8bbe\u7f6e' : '\u672a\u8bbe\u7f6e') + '</span></strong><span>' + escapeHtml(item.appBinding || item.description) + '</span><span>' + escapeHtml(item.description || '') + '</span></div><div class="row"><button class="secondary" data-edit-prompt-btn="' + item.id + '">\u7f16\u8f91</button></div></div>';
      }).join("");
    }
    function clearPrompt() {
      const item = state.prompts.find((entry) => entry.id === editingPromptId) || state.prompts[0];
      if (!item) return;
      item.template = "";
      item.updatedAt = new Date().toISOString();
      fillEditor();
      renderPrompts();
      setStatus("\u5f53\u524d\u63d0\u793a\u8bcd\u5df2\u6e05\u7a7a\uff0c\u4fdd\u5b58\u53d1\u5e03\u540e APP \u5c06\u7ee7\u7eed\u4f7f\u7528\u7cfb\u7edf\u5185\u7f6e\u63d0\u793a\u8bcd");
    }
    function fillEditor() {
      const item = state.prompts.find((entry) => entry.id === editingPromptId) || state.prompts[0];
      if (!item) return;
      editingPromptId = item.id;
      $("promptBinding").textContent = item.appBinding || "-";
      $("promptName").value = item.name;
      $("promptDescription").value = item.description || "";
      $("promptVars").value = (item.requiredVariables || []).map((name) => "{{" + name + "}}").join(", ");
      $("promptTemplate").value = item.template || "";
    }
    function escapeHtml(value) {
      return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
    }
    function escapeAttr(value) {
      return escapeHtml(value).replace(new RegExp(String.fromCharCode(96), "g"), "&#096;");
    }
    function statusText(status) {
      return status === "active" ? "启用" : status === "inactive" ? "停用" : "草稿";
    }
    function formatTime(value) {
      return value ? new Date(value).toLocaleString() : "-";
    }

    $("load").onclick = () => loadConfig().catch((error) => setStatus("读取失败：" + error.message, true));
    $("save").onclick = () => saveConfig().catch((error) => setStatus("保存失败：" + error.message, true));
    $("saveTop").onclick = () => saveConfig().catch((error) => setStatus("保存失败：" + error.message, true));
    $("resetPrompt").onclick = () => { clearPrompt(); };
    $("newPlan").onclick = () => { clearPlan(); setStatus("已准备新增朋友圈规划"); };
    $("resetPlan").onclick = () => { clearPlan(); setStatus("朋友圈规划编辑器已重置"); };
    $("addMaterial").onclick = () => {
      const materials = readMaterials();
      materials.push({ id: crypto.randomUUID(), name: "朋友圈素材", type: "image", url: "" });
      renderMaterials(materials);
    };
    $("savePlan").onclick = () => savePlanToState(currentPlanInput());
    $("materialUpload").onchange = async (event) => {
      const files = Array.from(event.target.files || []);
      if (!files.length) return;
      setStatus("正在上传素材...");
      try {
        const materials = readMaterials();
        for (const file of files) {
          materials.push(await uploadMaterial(file));
        }
        renderMaterials(materials);
        setStatus("素材已上传，记得保存规划并发布");
      } catch (error) {
        setStatus("素材上传失败：" + error.message, true);
      } finally {
        event.target.value = "";
      }
    };
    $("addPrompt").onclick = () => {
      const item = state.prompts.find((entry) => entry.id === editingPromptId);
      if (!item) return setStatus("\u8bf7\u5148\u9009\u62e9\u8981\u7f16\u8f91\u7684\u63d0\u793a\u8bcd", true);
      item.template = $("promptTemplate").value.trim();
      item.updatedAt = new Date().toISOString();
      if (!item.template) return setStatus("\u63d0\u793a\u8bcd\u6b63\u6587\u4e0d\u80fd\u4e3a\u7a7a\uff1b\u5982\u679c\u4e0d\u60f3\u7ef4\u62a4\uff0c\u8bf7\u70b9\u91cd\u7f6e\u540e\u4fdd\u5b58\u53d1\u5e03", true);
      renderPrompts();
      fillEditor();
      setStatus("\u63d0\u793a\u8bcd\u5df2\u52a0\u5165\u5f85\u4fdd\u5b58\uff0c\u70b9\u4fdd\u5b58\u53d1\u5e03\u624d\u4f1a\u540c\u6b65\u7ed9 APP");
    };
        document.body.addEventListener("click", (event) => {
      const promptId = event.target.dataset.editPrompt || event.target.dataset.editPromptBtn;
      const planId = event.target.dataset.editPlan;
      const togglePlanId = event.target.dataset.togglePlan;
      const deletePlanId = event.target.dataset.deletePlan;
      const removeMaterialIndex = event.target.dataset.removeMaterial;
      if (planId) {
        const item = state.momentPlans.find((entry) => entry.id === planId);
        if (!item) return;
        editingPlanId = item.id;
        fillPlanEditor();
        renderPlans();
      }
      if (togglePlanId) {
        const item = state.momentPlans.find((entry) => entry.id === togglePlanId);
        if (!item) return;
        editingPlanId = item.id;
        fillPlanEditor();
        savePlanToState(currentPlanInput(item.status === "active" ? "inactive" : "active"));
      }
      if (deletePlanId) {
        if (!confirm("删除这条朋友圈规划？")) return;
        state.momentPlans = state.momentPlans.filter((item) => item.id !== deletePlanId);
        if (editingPlanId === deletePlanId) editingPlanId = "";
        hydrate();
        setStatus("朋友圈规划已删除，记得保存发布");
      }
      if (removeMaterialIndex !== undefined) {
        const materials = readMaterials().filter((_item, index) => String(index) !== String(removeMaterialIndex));
        renderMaterials(materials);
      }
      if (promptId) {
        const item = state.prompts.find((entry) => entry.id === promptId);
        if (!item) return;
        editingPromptId = item.id;
        fillEditor();
        renderPrompts();
      }
    });
    loadConfig().catch((error) => setStatus("读取失败：" + error.message, true));
  </script>
</body>
</html>`;
}
