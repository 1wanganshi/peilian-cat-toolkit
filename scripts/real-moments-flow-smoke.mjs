import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const userDataDir = process.env.PEILIAN_REAL_USER_DATA;
const idea = '今天终于把拖了很久的事做完了';

assert.ok(userDataDir, 'PEILIAN_REAL_USER_DATA is required');

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

  const result = await page.evaluate(async (inputIdea) => {
    const models = await window.electron.listModels();
    const languageEnabled = models.some((model) => model.kind === 'language' && model.enabled);
    const imageEnabled = models.some((model) => model.kind === 'image' && model.enabled);
    const texts = await window.electron.generateMomentTexts({
      idea: inputIdea
    });
    const image = await window.electron.generateMomentImage({
      selectedText: texts.results[0].text
    });
    return { languageEnabled, imageEnabled, texts, image };
  }, idea);

  assert.equal(result.languageEnabled, true, 'language model config not loaded');
  assert.equal(result.imageEnabled, true, 'image model config not loaded');
  assert.equal(result.texts.type, 'generate');
  assert.equal(result.texts.idea, idea);
  assert.ok(result.texts.results.length >= 3, `expected 3 texts, got ${result.texts.results.length}`);
  assert.ok(result.texts.results.every((item) => item.text.length >= 5), 'one or more generated texts are too short');
  assert.equal(result.image.type, 'image');
  assert.equal(result.image.hasReferenceImage, true);
  assert.ok(result.image.imagePrompt.length >= 20, 'image prompt too short');
  assert.ok(result.image.imageUrl.length >= 20, 'image output too short');

  const isSvgFallback = Buffer.from(result.image.imageUrl.slice(0, 80), 'base64')
    .toString('utf8')
    .trimStart()
    .startsWith('<svg');

  console.log('real moments flow smoke passed');
  console.log(JSON.stringify({
    idea: result.texts.idea,
    textVersions: result.texts.results.length,
    firstTextChars: result.texts.results[0].text.length,
    imagePromptChars: result.image.imagePrompt.length,
    imageChars: result.image.imageUrl.length,
    isSvgFallback
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
