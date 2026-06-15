import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const userDataDir = process.env.PEILIAN_REAL_USER_DATA;
const topic = '\u5b69\u5b50\u82f1\u8bed\u542f\u8499\u76845\u4e2a\u65b9\u6cd5';

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

  const article = await page.evaluate(async (inputTopic) => {
    const models = await window.electron.listModels();
    const languageEnabled = models.some((model) => model.kind === 'language' && model.enabled);
    const imageEnabled = models.some((model) => model.kind === 'image' && model.enabled);
    const generated = await window.electron.generateArticle(inputTopic);
    return { generated, languageEnabled, imageEnabled };
  }, topic);

  assert.equal(article.languageEnabled, true, 'language model config not loaded');
  assert.equal(article.imageEnabled, true, 'image model config not loaded');
  assert.equal(article.generated.topic, topic);
  assert.ok(article.generated.cards.length >= 6, `expected at least 6 cards, got ${article.generated.cards.length}`);
  assert.ok(article.generated.publishContent.title.length > 0, 'missing publish title');
  assert.ok(article.generated.publishContent.body.length > 0, 'missing publish body');
  assert.ok(article.generated.publishContent.hashtags.length >= 3, 'missing hashtags');
  assert.equal(article.generated.images.length, article.generated.cards.length);
  assert.equal(article.generated.failedImages.length, 0, `failed images: ${JSON.stringify(article.generated.failedImages)}`);
  assert.ok(article.generated.images.every((image) => image.length > 20), 'one or more images are empty');

  const svgFallbackCount = article.generated.images.filter((image) => {
    try {
      return Buffer.from(image.slice(0, 80), 'base64').toString('utf8').trimStart().startsWith('<svg');
    } catch {
      return false;
    }
  }).length;

  console.log('real article flow smoke passed');
  console.log(JSON.stringify({
    topic: article.generated.topic,
    contentType: article.generated.contentType,
    cards: article.generated.cards.length,
    images: article.generated.images.length,
    svgFallbackCount,
    titleChars: article.generated.publishContent.title.length,
    bodyChars: article.generated.publishContent.body.length,
    hashtags: article.generated.publishContent.hashtags.length
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
