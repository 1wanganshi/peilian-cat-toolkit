import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const userDataDir = process.env.PEILIAN_REAL_USER_DATA;
const idea = '今天带孩子完成了一次很轻松的英语亲子阅读';
const referenceImage = await readFile(resolve(root, 'resources/peilian-cat-icon.png'), 'base64');

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
  const result = await page.evaluate(async ({ inputIdea, inputReferenceImage }) => {
    const texts = await window.electron.generateMomentTexts({
      idea: inputIdea
    });
    const selectedText = texts.results[0]?.text ?? inputIdea;
    const image = await window.electron.generateMomentImage({
      selectedText,
      referenceImage: inputReferenceImage,
      referenceImageName: 'peilian-cat-icon.png'
    });
    return { texts, selectedText, image };
  }, { inputIdea: idea, inputReferenceImage: referenceImage });

  assert.equal(result.image.type, 'image');
  assert.equal(result.image.hasReferenceImage, true);
  assert.ok(result.selectedText.length >= 5, 'generated text too short');
  assert.ok(result.image.imagePrompt.includes('参考') || result.image.imagePrompt.length >= 80, 'image prompt did not account for reference image');
  assert.ok(result.image.imageUrl.length >= 20, 'image output too short');

  const isSvgFallback = Buffer.from(result.image.imageUrl.slice(0, 80), 'base64')
    .toString('utf8')
    .trimStart()
    .startsWith('<svg');
  assert.equal(isSvgFallback, false, 'image generation used SVG fallback');

  console.log('real moments reference image smoke passed');
  console.log(JSON.stringify({
    textChars: result.selectedText.length,
    hasReferenceImage: result.image.hasReferenceImage,
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
