import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const userDataDir = process.env.PEILIAN_SYNC_USER_DATA;

assert.ok(userDataDir, 'PEILIAN_SYNC_USER_DATA is required');

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
  const result = await page.evaluate(async () => {
    const sync = await window.electron.syncPromptTemplatesFromBackend();
    return {
      sync,
      canReadPromptsInRenderer: typeof window.electron.listPromptTemplates === 'function'
    };
  });

  assert.equal(result.sync.imported, 3, 'expected all backend editable prompts to be imported');
  assert.equal(result.canReadPromptsInRenderer, false, 'renderer should not be able to read prompt templates');

  const rawPrompts = await readFile(resolve(userDataDir, 'prompts.json'), 'utf8');
  const templates = JSON.parse(rawPrompts);
  const videoScriptPrompt = templates.find((item) => item.scenario === 'video-script-generate');
  assert.ok(videoScriptPrompt, 'video-script-generate prompt not found in local app templates');
  assert.equal(videoScriptPrompt.builtIn, false, 'video-script-generate should be loaded from backend');
  assert.ok(/[\u4e00-\u9fff]/u.test(videoScriptPrompt.template), 'synced video script prompt should contain Chinese text');
  assert.ok(result.sync.scenarios.includes('video-script-generate'), 'sync result should include video-script-generate');
  for (const scenario of ['moments-rewrite', 'moments-generate', 'video-script-generate']) {
    const prompt = templates.find((item) => item.scenario === scenario);
    assert.ok(prompt, `${scenario} prompt not found in local app templates`);
    assert.equal(prompt.builtIn, false, `${scenario} should be loaded from backend`);
    assert.ok(result.sync.scenarios.includes(scenario), `sync result should include ${scenario}`);
  }

  console.log('prompt sync smoke passed');
  console.log(JSON.stringify({
    imported: result.sync.imported,
    names: result.sync.names,
    rendererPromptAccess: result.canReadPromptsInRenderer,
    localTemplates: templates.length
  }, null, 2));
} finally {
  if (app) await app.close();
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
