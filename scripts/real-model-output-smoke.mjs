import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const languageBaseUrl = process.env.PEILIAN_TEST_LANGUAGE_BASE_URL;
const languageApiKey = process.env.PEILIAN_TEST_LANGUAGE_API_KEY;
const languageModel = process.env.PEILIAN_TEST_LANGUAGE_MODEL;
const imageBaseUrl = process.env.PEILIAN_TEST_IMAGE_BASE_URL;
const imageApiKey = process.env.PEILIAN_TEST_IMAGE_API_KEY;
const imageModel = process.env.PEILIAN_TEST_IMAGE_MODEL;

for (const [name, value] of Object.entries({
  PEILIAN_TEST_LANGUAGE_BASE_URL: languageBaseUrl,
  PEILIAN_TEST_LANGUAGE_API_KEY: languageApiKey,
  PEILIAN_TEST_LANGUAGE_MODEL: languageModel,
  PEILIAN_TEST_IMAGE_BASE_URL: imageBaseUrl,
  PEILIAN_TEST_IMAGE_API_KEY: imageApiKey,
  PEILIAN_TEST_IMAGE_MODEL: imageModel
})) {
  assert.ok(value, `${name} is required`);
}

const userDataDir = await mkdtemp(join(tmpdir(), 'peilian-real-models-'));
process.env.PEILIAN_CAT_USER_DATA = userDataDir;

try {
  const { ModelManager } = await import(pathToFileURL(join(process.cwd(), 'out/main/main.js')).href);
  assert.ok(ModelManager, 'ModelManager export is required for real smoke');
} catch {
  // Production bundle does not export service classes. Use direct API calls below.
}

try {
  const languageCheck = await checkOpenAiCompatibleLanguage(languageBaseUrl, languageApiKey, languageModel);
  const imageCheck = await checkOpenAiCompatibleImage(imageBaseUrl, imageApiKey, imageModel);
  const text = await generateText(languageBaseUrl, languageApiKey, languageModel);
  const image = await generateImage(imageBaseUrl, imageApiKey, imageModel);

  assert.equal(languageCheck.ok, true, languageCheck.message);
  assert.equal(imageCheck.ok, true, imageCheck.message);
  assert.ok(text.length >= 10, 'language output too short');
  assert.ok(image.length >= 20, 'image output too short');

  console.log('real model output smoke passed');
  console.log(`language output chars: ${text.length}`);
  console.log(`image output chars: ${image.length}`);
} finally {
  await rm(userDataDir, { recursive: true, force: true });
}

async function checkOpenAiCompatibleLanguage(baseUrl, apiKey, model) {
  const result = await firstOk(baseUrl, '/chat/completions', async (url) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 16
      })
    });
    return { response, text: await response.text() };
  });
  return result;
}

async function checkOpenAiCompatibleImage(baseUrl, apiKey, model) {
  const prompts = [
    'Vertical card. English learning for kids. Light background. No watermark.',
    'test'
  ];
  let result = { ok: false, message: 'not started', body: '' };
  for (const prompt of prompts) {
    result = await firstOk(baseUrl, '/images/generations', async (url) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          prompt,
          size: '768x1344',
          n: 1
        })
      });
      return { response, text: await response.text() };
    });
    if (result.ok) break;
  }
  return result;
}

async function generateText(baseUrl, apiKey, model) {
  const result = await firstOk(baseUrl, '/chat/completions', async (url) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: '用中文写一句陪练猫工具包的连通测试文案，20字以内。' }],
        max_tokens: 80
      })
    });
    return { response, text: await response.text() };
  });
  assert.equal(result.ok, true, result.message);
  const data = parseJsonBody(result.body, result.message);
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

async function generateImage(baseUrl, apiKey, model) {
  const prompts = [
    'Vertical Douyin educational card. Light background. Clean layout. Parent child English learning. No watermark.',
    'Vertical card. English learning for kids. Light background. No watermark.',
    'test'
  ];
  let result = { ok: false, message: 'not started', body: '' };
  for (const prompt of prompts) {
    result = await firstOk(baseUrl, '/images/generations', async (url) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          prompt,
          size: '768x1344',
          n: 1
        })
      });
      return { response, text: await response.text() };
    });
    if (result.ok) break;
  }
  assert.equal(result.ok, true, result.message);
  const data = parseJsonBody(result.body, result.message);
  const output = data.data?.[0]?.b64_json ?? data.data?.[0]?.url ?? data.url ?? data.id ?? data.task_id ?? '';
  if (typeof output === 'string' && /^https?:\/\//u.test(output)) {
    const response = await fetch(output);
    assert.equal(response.ok, true, `image url not reachable: HTTP ${response.status}`);
  }
  if (!output) {
    console.log('image response keys:', Object.keys(data).join(', '));
    if (Array.isArray(data.data) && data.data[0]) {
      console.log('image data[0] keys:', Object.keys(data.data[0]).join(', '));
    }
  } else if (String(output).length < 100) {
    console.log('short image output:', String(output));
    console.log('image response keys:', Object.keys(data).join(', '));
    if (Array.isArray(data.data) && data.data[0]) {
      console.log('image data[0] keys:', Object.keys(data.data[0]).join(', '));
    }
  }
  return output;
}

async function firstOk(baseUrl, path, request) {
  const candidates = buildBaseUrls(baseUrl).map((url) => `${url}${path}`);
  let last = { ok: false, message: 'no candidates', body: '' };
  for (const url of candidates) {
    try {
      const { response, text } = await request(url);
      if (response.ok && looksLikeHtml(text)) {
        last = {
          ok: false,
          message: `${url} -> HTTP ${response.status} returned HTML, not model API JSON`,
          body: text
        };
        continue;
      }
      last = {
        ok: response.ok,
        message: `${url} -> HTTP ${response.status}${response.ok ? '' : ` ${text.slice(0, 200)}`}`,
        body: text
      };
      if (response.ok) return last;
    } catch (error) {
      last = { ok: false, message: `${url} -> ${error instanceof Error ? error.message : String(error)}`, body: '' };
    }
  }
  return last;
}

function buildBaseUrls(baseUrl) {
  const cleanBase = baseUrl.trim().replace(/\/+$/u, '');
  const urls = [cleanBase];
  if (!/\/v\d+(?:\/)?$/u.test(cleanBase)) urls.push(`${cleanBase}/v1`);
  return Array.from(new Set(urls));
}

function looksLikeHtml(body) {
  return /^\s*<!doctype html|^\s*<html[\s>]/iu.test(body);
}

function parseJsonBody(body, context) {
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${context}; response was not valid JSON`);
  }
}
