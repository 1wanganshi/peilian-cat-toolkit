import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const calls = [];

const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString('utf8');
  calls.push({
    method: request.method,
    url: request.url,
    authorization: request.headers.authorization,
    anthropicKey: request.headers['x-api-key'],
    anthropicVersion: request.headers['anthropic-version'],
    body
  });

  response.setHeader('Content-Type', 'application/json');
  if (request.method === 'GET' && request.url?.startsWith('/v1/models/')) {
    response.end(JSON.stringify({ id: decodeURIComponent(request.url.split('/').pop() ?? '') }));
    return;
  }

  if (request.method === 'POST' && request.url === '/v1/chat/completions') {
    response.end(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }));
    return;
  }

  if (request.method === 'POST' && request.url === '/v1/messages') {
    response.end(JSON.stringify({ content: [{ text: '{"ok":true}' }] }));
    return;
  }

  if (request.method === 'GET' && request.url === '/v1/user/account') {
    response.end(JSON.stringify({ id: 'mock-stability-account' }));
    return;
  }

  if (request.method === 'POST' && request.url === '/v1/images/generations') {
    response.end(JSON.stringify({ data: [{ b64_json: Buffer.from('<svg />').toString('base64') }] }));
    return;
  }

  response.statusCode = 404;
  response.end(JSON.stringify({ error: 'not found' }));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}/v1`;

try {
  await checkOpenAiModel(baseUrl, 'mock-openai-key', 'gpt-4.1');
  await checkClaude(baseUrl, 'mock-claude-key', 'claude-sonnet-4');
  await checkStability(baseUrl, 'mock-stability-key');
  await checkOpenAiCompatible(baseUrl, 'mock-custom-key', 'custom-chat-model');
  await generateImage(baseUrl, 'mock-image-key', 'gpt-image-1');

  assert.equal(calls.length, 5);
  assert.deepEqual(
    calls.map((call) => `${call.method} ${call.url}`),
    [
      'GET /v1/models/gpt-4.1',
      'POST /v1/messages',
      'GET /v1/user/account',
      'POST /v1/chat/completions',
      'POST /v1/images/generations'
    ]
  );
  assert.equal(calls[0].authorization, 'Bearer mock-openai-key');
  assert.equal(calls[1].anthropicKey, 'mock-claude-key');
  assert.equal(calls[1].anthropicVersion, '2023-06-01');
  assert.equal(calls[2].authorization, 'Bearer mock-stability-key');
  assert.equal(calls[3].authorization, 'Bearer mock-custom-key');
  assert.match(calls[3].body, /custom-chat-model/u);
  assert.equal(calls[4].authorization, 'Bearer mock-image-key');
  assert.match(calls[4].body, /gpt-image-1/u);
  await verifyConfigCrud(baseUrl);

  console.log('model connectivity smoke passed');
  console.log(`mock server verified ${calls.length} model requests`);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

async function checkOpenAiModel(url, apiKey, model) {
  const response = await fetch(`${url}/models/${encodeURIComponent(model)}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  assert.equal(response.ok, true);
}

async function checkOpenAiCompatible(url, apiKey, model) {
  const response = await fetch(`${url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 8
    })
  });
  assert.equal(response.ok, true);
}

async function checkClaude(url, apiKey, model) {
  const response = await fetch(`${url}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'ping' }]
    })
  });
  assert.equal(response.ok, true);
}

async function checkStability(url, apiKey) {
  const response = await fetch(`${url}/user/account`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  assert.equal(response.ok, true);
}

async function generateImage(url, apiKey, model) {
  const response = await fetch(`${url}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      prompt: 'connectivity test image',
      size: '1024x1024',
      n: 1,
      response_format: 'b64_json'
    })
  });
  assert.equal(response.ok, true);
}

async function verifyConfigCrud(url) {
  const dir = await mkdtemp(join(tmpdir(), 'peilian-models-'));
  const filePath = join(dir, 'models.json');
  try {
    const now = new Date().toISOString();
    const saved = {
      id: 'smoke-model',
      name: 'Smoke OpenAI',
      kind: 'language',
      provider: 'openai',
      model: 'gpt-4.1',
      baseUrl: url,
      apiKey: 'mock-openai-key',
      enabled: true,
      createdAt: now,
      updatedAt: now
    };
    await writeFile(filePath, JSON.stringify([saved], null, 2), 'utf8');
    const list = JSON.parse(await readFile(filePath, 'utf8'));
    assert.equal(list.length, 1);
    assert.equal(list[0].enabled, true);
    assert.equal(list[0].kind, 'language');

    list[0].lastStatus = 'success';
    list[0].lastMessage = 'OpenAI 模型连接成功';
    await writeFile(filePath, JSON.stringify(list, null, 2), 'utf8');
    const checked = JSON.parse(await readFile(filePath, 'utf8'));
    assert.equal(checked[0].lastStatus, 'success');

    const deleted = checked.filter((item) => item.id !== 'smoke-model');
    await writeFile(filePath, JSON.stringify(deleted, null, 2), 'utf8');
    const afterDelete = JSON.parse(await readFile(filePath, 'utf8'));
    assert.equal(afterDelete.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
