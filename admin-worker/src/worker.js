const CONFIG_KEY = 'app:config';

const DEFAULT_CONFIG = {
  prompts: [],
  update: {
    latestVersion: '0.1.0',
    downloadUrl: '',
    releaseNotes: '初始版本',
    force: false,
    publishedAt: '2026-06-15T00:00:00.000Z'
  },
  meta: {
    promptRevision: 0,
    promptsUpdatedAt: '2026-06-15T00:00:00.000Z',
    promptCount: 0
  }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));

    try {
      if (url.pathname === '/' || url.pathname === '/admin') {
        return htmlResponse(renderAdminHtml(env.PUBLIC_BASE_URL || url.origin));
      }

      if (url.pathname === '/api/health') {
        return jsonResponse({ ok: true, service: 'peilian-cat-admin', now: new Date().toISOString() });
      }

      if (url.pathname === '/api/config' && request.method === 'GET') {
        return jsonResponse(await readConfig(env));
      }

      if (url.pathname === '/api/prompts/meta' && request.method === 'GET') {
        const config = await readConfig(env);
        return jsonResponse(config.meta);
      }

      if (url.pathname === '/api/update/check' && request.method === 'GET') {
        const config = await readConfig(env);
        const currentVersion = url.searchParams.get('currentVersion') || '0.0.0';
        const latestVersion = config.update?.latestVersion || '0.1.0';
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
  const prompts = Array.isArray(input?.prompts) ? input.prompts.map(normalizePrompt).filter(Boolean) : [];
  const meta = normalizeMeta(input?.meta);
  return {
    prompts,
    update: {
      latestVersion: text(input?.update?.latestVersion) || DEFAULT_CONFIG.update.latestVersion,
      downloadUrl: text(input?.update?.downloadUrl),
      releaseNotes: text(input?.update?.releaseNotes),
      force: Boolean(input?.update?.force),
      publishedAt: text(input?.update?.publishedAt) || now
    },
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

function normalizeMeta(input) {
  return {
    promptRevision: Number.isFinite(Number(input?.promptRevision)) ? Number(input.promptRevision) : 0,
    promptsUpdatedAt: text(input?.promptsUpdatedAt) || '',
    promptCount: Number.isFinite(Number(input?.promptCount)) ? Number(input.promptCount) : 0
  };
}

function normalizePrompt(input) {
  const scenario = text(input?.scenario);
  const name = text(input?.name);
  const template = text(input?.template);
  if (!scenario || !name || !template) return undefined;
  const now = new Date().toISOString();
  return {
    id: text(input?.id) || crypto.randomUUID(),
    scenario,
    name,
    description: text(input?.description),
    requiredVariables: Array.isArray(input?.requiredVariables) ? input.requiredVariables.map(text).filter(Boolean) : [],
    template,
    enabled: input?.enabled !== false,
    builtIn: false,
    createdAt: text(input?.createdAt) || now,
    updatedAt: now
  };
}

function assertAdmin(request, env) {
  const token = env.ADMIN_TOKEN || '';
  const authorization = request.headers.get('authorization') || '';
  const incoming = authorization.replace(/^Bearer\s+/iu, '').trim();
  if (!token || incoming !== token) {
    const error = new Error('Unauthorized');
    error.status = 401;
    throw error;
  }
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
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
  return withCors(new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
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
  headers.set('access-control-allow-methods', 'GET,PUT,OPTIONS');
  headers.set('access-control-allow-headers', 'content-type,authorization');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function renderAdminHtml(publicBaseUrl) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>陪练猫提示词后台</title>
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
    .prompt-list { display: grid; gap: 10px; }
    .prompt-item { border: 1px solid #e0d7c8; border-radius: 8px; background: #fff; padding: 12px; display: grid; gap: 10px; cursor: pointer; }
    .prompt-item.active { border-color: #2e7869; box-shadow: inset 0 0 0 1px #2e7869; }
    .prompt-item-main { display: grid; gap: 4px; }
    .prompt-item-main span { color: #68726f; font-size: 13px; line-height: 1.5; }
    .editor-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; }
    .advanced { display: none; border-top: 1px solid #e9e2d7; padding-top: 14px; }
    .advanced.open { display: grid; gap: 12px; }
    @media (max-width: 980px) { .split, .stats { grid-template-columns: 1fr; } .grid2 { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>陪练猫提示词后台</h1>
      <div class="muted">这里只管模块和提示词，别的都默认内置。</div>
    </div>
    <div class="muted">${publicBaseUrl}</div>
  </header>
  <main>
    <section class="stack">
      <div class="stats">
        <div class="stat"><span class="muted">模块数量</span><strong id="statCount">0</strong></div>
        <div class="stat"><span class="muted">提示词版本</span><strong id="statRevision">#0</strong></div>
        <div class="stat"><span class="muted">最近发布</span><strong id="statUpdatedAt">-</strong></div>
      </div>
      <div class="row">
        <label style="flex:1; min-width:260px">后台 Token <input id="token" type="password" placeholder="粘贴 ADMIN_TOKEN" /></label>
        <button id="load">读取后台</button>
        <button class="secondary" id="save">保存发布</button>
      </div>
      <div class="status" id="status"></div>
      <p class="muted">发布后，桌面端会提示有新的提示词版本。你点更新，它就拉下来。</p>
    </section>

    <section class="split">
      <div class="stack">
        <div class="editor-head">
          <h2>模块列表</h2>
          <button class="secondary" id="newPrompt">新增模块</button>
        </div>
        <div class="prompt-list" id="promptList"></div>
      </div>
      <div class="stack">
        <div class="editor-head">
          <h2>编辑提示词</h2>
          <button class="secondary" id="toggleAdvanced">高级设置</button>
        </div>
        <div class="stack">
          <div class="grid2">
            <label>模块
              <select id="promptScenario">
                <option value="video-today-topics">今日短视频选题整理</option>
                <option value="video-topic-generate">短视频选题生成</option>
                <option value="video-script-generate">短视频脚本生成</option>
                <option value="moments-rewrite">朋友圈改写</option>
                <option value="moments-generate">朋友圈生成</option>
                <option value="article-generate">图文内容生成</option>
                <option value="image-generate">生图提示词</option>
              </select>
            </label>
            <label>名称 <input id="promptName" placeholder="例如：朋友圈生成" /></label>
          </div>
          <label>一句话说明 <input id="promptDescription" placeholder="这个模块是干什么的" /></label>
          <label>提示词正文 <textarea id="promptTemplate" placeholder="把真正要给模型的提示词放这里"></textarea></label>
          <div class="advanced" id="advancedPanel">
            <label>变量 <input id="promptVars" placeholder="topic, style" /></label>
          </div>
          <div class="row">
            <button id="addPrompt">保存当前模块</button>
            <button class="secondary" id="resetPrompt">重置</button>
          </div>
        </div>
      </div>
    </section>
  </main>
  <script>
    let state = { prompts: [], update: {}, meta: { promptRevision: 0, promptsUpdatedAt: '', promptCount: 0 } };
    let editingPromptId = "";
    let advancedOpen = false;
    const $ = (id) => document.getElementById(id);
    const api = location.origin;

    function setStatus(text, danger) {
      $("status").textContent = text;
      $("status").style.color = danger ? "#b85045" : "#2e7869";
    }
    function authHeaders() {
      return { authorization: "Bearer " + $("token").value.trim(), "content-type": "application/json" };
    }
    async function loadConfig() {
      const path = $("token").value.trim() ? "/api/admin/config" : "/api/config";
      const res = await fetch(api + path, { headers: $("token").value.trim() ? authHeaders() : {} });
      if (!res.ok) throw new Error(await res.text());
      state = await res.json();
      state.meta = state.meta || { promptRevision: 0, promptsUpdatedAt: '', promptCount: 0 };
      hydrate();
      setStatus("提示词已读取");
    }
    async function saveConfig() {
      const res = await fetch(api + "/api/admin/config", { method: "PUT", headers: authHeaders(), body: JSON.stringify(state) });
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json();
      state = body.config;
      state.meta = state.meta || { promptRevision: 0, promptsUpdatedAt: '', promptCount: 0 };
      hydrate();
      setStatus("已保存并发布");
    }
    function hydrate() {
      $("statCount").textContent = String(state.prompts.length || 0);
      $("statRevision").textContent = "#" + String(state.meta?.promptRevision || 0);
      $("statUpdatedAt").textContent = state.meta?.promptsUpdatedAt ? new Date(state.meta.promptsUpdatedAt).toLocaleString() : "-";
      renderPrompts();
      fillEditor();
      syncAdvanced();
    }
    function renderPrompts() {
      if (!state.prompts.length) {
        $("promptList").innerHTML = '<div class="item"><strong>还没有模块</strong><small>先新增一个模块，再把提示词正文贴进来。</small></div>';
        return;
      }
      $("promptList").innerHTML = state.prompts.map((item) => '<div class="prompt-item' + (item.id === editingPromptId ? ' active' : '') + '" data-edit-prompt="' + item.id + '"><div class="prompt-item-main"><strong>' + escapeHtml(item.name) + '<span class="pill">' + escapeHtml(item.scenario) + '</span></strong><span>' + escapeHtml(item.description || "未填写说明") + '</span></div><div class="row"><button class="secondary" data-edit-prompt-btn="' + item.id + '">编辑</button><button class="danger" data-delete-prompt="' + item.id + '">删除</button></div></div>').join("");
    }
    function clearPrompt() {
      editingPromptId = "";
      ["promptName","promptDescription","promptVars","promptTemplate"].forEach((id) => $(id).value = "");
      $("promptScenario").value = "moments-generate";
    }
    function fillEditor() {
      const item = state.prompts.find((entry) => entry.id === editingPromptId);
      if (!item) return;
      $("promptScenario").value = item.scenario;
      $("promptName").value = item.name;
      $("promptDescription").value = item.description || "";
      $("promptVars").value = (item.requiredVariables || []).join(", ");
      $("promptTemplate").value = item.template || "";
    }
    function syncAdvanced() {
      $("advancedPanel").classList.toggle("open", advancedOpen);
    }
    function escapeHtml(value) {
      return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
    }

    $("load").onclick = () => loadConfig().catch((error) => setStatus("读取失败：" + error.message, true));
    $("save").onclick = () => saveConfig().catch((error) => setStatus("保存失败：" + error.message, true));
    $("newPrompt").onclick = () => { clearPrompt(); setStatus("已准备新增模块"); };
    $("resetPrompt").onclick = () => { clearPrompt(); setStatus("编辑器已重置"); };
    $("toggleAdvanced").onclick = () => { advancedOpen = !advancedOpen; syncAdvanced(); };
    $("addPrompt").onclick = () => {
      const item = {
        id: editingPromptId || crypto.randomUUID(),
        scenario: $("promptScenario").value,
        name: $("promptName").value.trim(),
        description: $("promptDescription").value.trim(),
        requiredVariables: $("promptVars").value.split(",").map((v) => v.trim()).filter(Boolean),
        template: $("promptTemplate").value,
        enabled: true
      };
      if (!item.name || !item.template) return setStatus("模块名称和提示词内容不能为空", true);
      state.prompts = [item, ...state.prompts.filter((old) => old.id !== item.id)];
      editingPromptId = item.id;
      hydrate();
      setStatus("模块已加入待保存，点保存发布才会生效");
    };
    document.body.addEventListener("click", (event) => {
      const promptId = event.target.dataset.editPrompt || event.target.dataset.editPromptBtn;
      const deletePromptId = event.target.dataset.deletePrompt;
      if (promptId) {
        const item = state.prompts.find((entry) => entry.id === promptId);
        if (!item) return;
        editingPromptId = item.id;
        fillEditor();
        renderPrompts();
      }
      if (deletePromptId) {
        state.prompts = state.prompts.filter((item) => item.id !== deletePromptId);
        if (editingPromptId === deletePromptId) editingPromptId = "";
        renderPrompts();
        setStatus("模块已删除，记得保存发布");
      }
    });
    loadConfig().catch(() => setStatus("请输入后台 Token 后读取提示词"));
  </script>
</body>
</html>`;
}
