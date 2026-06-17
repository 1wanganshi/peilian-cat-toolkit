import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const calls = [];

const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  calls.push({
    method: request.method,
    url: request.url,
    authorization: request.headers.authorization,
    body: Buffer.concat(chunks).toString('utf8')
  });

  response.setHeader('Content-Type', 'application/json');
  if (request.url?.startsWith('/v1/models/')) {
    response.end(JSON.stringify({ id: 'mock-model' }));
    return;
  }

  response.statusCode = 404;
  response.end(JSON.stringify({ error: 'not found' }));
});

await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}/v1`;
const userDataDir = await mkdtemp(join(tmpdir(), 'peilian-electron-user-data-'));

let app;
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: ['.', '--disable-gpu'],
    cwd: root,
    env: {
      ...process.env,
      SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
      ComSpec: process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe',
      PEILIAN_CAT_USER_DATA: userDataDir,
      PEILIAN_DISABLE_GPU: '1',
      ELECTRON_RENDERER_URL: ''
    }
  });

  const page = await waitForUsableWindow(app);
  const initialState = await page.evaluate(() => ({
    href: location.href,
    body: document.body.innerText.slice(0, 500),
    hasElectron: Boolean(window.electron)
  }));
  assert.equal(initialState.hasElectron, true, `window.electron missing at ${initialState.href}: ${initialState.body}`);

  await page.evaluate(() => history.pushState({}, '', '/backend'));
  await page.waitForTimeout(500);

  const result = await page.evaluate(async (url) => {
    const api = window.electron;
    if (!api) return { ok: false, reason: 'window.electron missing' };

    const saved = await api.saveModel({
      name: 'Electron Smoke OpenAI',
      kind: 'language',
      provider: 'openai',
      model: 'gpt-4.1',
      baseUrl: url,
      apiKey: 'mock-openai-key',
      enabled: true
    });
    const checked = await api.checkModel(saved);
    const rendererPromptAccess = typeof api.listPromptTemplates === 'function' ||
      typeof api.savePromptTemplate === 'function' ||
      typeof api.previewPrompt === 'function' ||
      typeof api.deletePromptTemplate === 'function';
    const canSyncPrompts = typeof api.syncPromptTemplatesFromBackend === 'function';
    const listed = await api.listModels();
    await api.deleteModel(saved.id);
    const afterDelete = await api.listModels();
    return {
      ok: checked.ok,
      savedName: saved.name,
      listedCount: listed.length,
      afterDeleteCount: afterDelete.length,
      message: checked.message,
      rendererPromptAccess,
      canSyncPrompts
    };
  }, baseUrl);

  assert.equal(result.ok, true, result.reason ?? result.message);
  assert.equal(result.savedName, 'Electron Smoke OpenAI');
  assert.equal(result.listedCount, 1);
  assert.equal(result.afterDeleteCount, 0);
  assert.equal(result.rendererPromptAccess, false);
  assert.equal(result.canSyncPrompts, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url, '/v1/models/gpt-4.1');
  assert.equal(calls[0].authorization, 'Bearer mock-openai-key');

  console.log('electron model UI smoke passed');
  console.log('verified renderer preload, IPC, model check, prompt sync entry, and hidden prompt CRUD APIs');
} finally {
  if (app) await app.close();
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }).catch(() => {});
}

async function waitForUsableWindow(app) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const windows = app.windows().filter((window) => !window.isClosed());
    const page = windows[0] ?? await Promise.race([
      app.waitForEvent('window', { timeout: 1000 }).catch(() => undefined),
      new Promise((resolve) => setTimeout(() => resolve(undefined), 1000))
    ]);
    if (page && !page.isClosed()) {
      try {
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
        if (!page.isClosed()) return page;
      } catch {
        if (!page.isClosed()) return page;
      }
    }
  }
  throw new Error('Electron window did not stay open');
}
