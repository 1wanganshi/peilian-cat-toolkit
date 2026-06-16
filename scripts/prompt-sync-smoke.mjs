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

  assert.ok(result.sync.imported >= 1, 'expected at least one prompt imported from backend');
  assert.equal(result.canReadPromptsInRenderer, false, 'renderer should not be able to read prompt templates');

  const rawPrompts = await readFile(resolve(userDataDir, 'prompts.json'), 'utf8');
  const templates = JSON.parse(rawPrompts);
  assert.ok(
    templates.some((item) => item.id === 'sync-smoke-moments-generate'),
    'synced backend prompt not found in local app templates'
  );

  console.log('prompt sync smoke passed');
  console.log(JSON.stringify({
    imported: result.sync.imported,
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
