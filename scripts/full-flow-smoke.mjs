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
let chatCalls = 0;

const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const _chunk of request) {
    chunks.push(_chunk);
  }
  const body = Buffer.concat(chunks).toString('utf8');
  response.setHeader('Content-Type', 'application/json');
  if (request.url === '/v1/chat/completions') {
    const parsed = JSON.parse(body || '{}');
    const prompt = parsed.messages?.[0]?.content ?? '';
    chatCalls += 1;
    if (prompt.includes('今日选题') && prompt.includes('联网搜索结果')) {
      response.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          topics: [
            {
              title: '为什么孩子背了很多单词，还是不会开口说英语？',
              coreIdea: '把家长关注点从单词量转向可理解输入和真实表达场景。',
              facts: ['单词量不等于表达力', '亲子互动能降低开口压力', '可理解输入更适合启蒙', '高频短句更容易迁移到生活']
            },
            {
              title: '英语磨耳朵没效果，可能少了这一步',
              coreIdea: '磨耳朵需要画面、动作和语境，不是单纯播放背景音。',
              facts: ['背景音输入容易无效', '重复材料更容易熟悉', '画面帮助理解意义', '共听比放任播放更稳定']
            },
            {
              title: '自然拼读不是越早越好',
              coreIdea: '自然拼读需要听辨和词汇基础，不能直接变成规则背诵。',
              facts: ['自然拼读依赖音素意识', '规则学习需要声音经验', '儿歌绘本可打基础', '过早规则化会增加挫败']
            },
            {
              title: '英语启蒙别做成考试训练',
              coreIdea: '启蒙阶段先保兴趣和输入，再逐步过渡到表达与规则。',
              facts: ['家长教育焦虑常见', '过早刷题影响兴趣', '家庭场景适合少量高频', '亲子共学更容易坚持']
            }
          ]
        }) } }]
      }));
      return;
    }
    if (prompt.includes('body 是分镜数组') || prompt.includes('textOverlay')) {
      response.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          title: '少儿英语启蒙的真实方法',
          hook: '孩子英语不开口，先别急着加单词量。',
          body: [
            {
              scene: 1,
              duration: '0-3秒',
              content: '用家长熟悉的痛点开场，引出英语启蒙不是背单词这么简单。',
              visual: '家长和孩子一起看英文绘本，镜头切到孩子沉默不说。',
              textOverlay: '听了很多，为什么还不开口？'
            }
          ],
          ending: '先收藏这条，今天回家就能换一种输入方式。',
          keyPhrases: ['单词量不等于表达力'],
          hashtags: ['#英语启蒙', '#儿童英语', '#亲子教育']
        }) } }]
      }));
      return;
    }
    if (prompt.includes('contentType') && prompt.includes('publishContent')) {
      response.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          topic: '孩子英语启蒙的5个方法',
          contentType: 'list',
          searchSummary: 'mock search summary',
          cards: Array.from({ length: 6 }, (_, index) => ({
            index: index + 1,
            type: index === 0 ? 'cover' : index === 5 ? 'summary' : 'content',
            title: `英语启蒙卡片 ${index + 1}`,
            subtitle: '家长可收藏',
            body: '每天一点点，轻松开始。',
            visualPrompt: '手机竖屏亲子英语教育卡片，浅色背景，大标题清晰'
          })),
          publishContent: {
            title: '孩子英语启蒙的5个方法',
            body: '这组方法适合家长每天照着做。',
            hashtags: ['#英语启蒙', '#儿童英语', '#少儿英语']
          }
        }) } }]
      }));
      return;
    }
    if (chatCalls === 1) {
      response.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify([
          {
            title: '少儿钢琴陪练的3个真实方法',
            heatScore: 9.1,
            reason: '家长痛点明确，适合短视频表达',
            references: ['https://example.com/douyin/mock-1']
          }
        ]) } }]
      }));
      return;
    }
    if (chatCalls === 2) {
      response.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          type: 'rewrite',
          sourceText: '今天孩子主动练琴了',
          style: '日常真实风',
          results: [
            { index: 1, text: '今天孩子自己去练琴了，挺意外，也挺开心。' },
            { index: 2, text: '不用催的一天，孩子自己坐下来练了会儿琴。' },
            { index: 3, text: '今天的小惊喜：孩子主动练琴了。' }
          ]
        }) } }]
      }));
      return;
    }
    if (chatCalls === 3) {
      response.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          type: 'generate',
          idea: '孩子主动练琴',
          style: '真诚走心',
          results: [
            { index: 1, text: '今天孩子主动练琴了，没有催，心里有点小开心。' },
            { index: 2, text: '有些进步不大声，但看见的时候真的会很欣慰。' },
            { index: 3, text: '今天值得记一下：孩子自己把琴练了。' }
          ]
        }) } }]
      }));
      return;
    }
    if (chatCalls === 4) {
      response.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          type: 'image',
          selectedText: '今天孩子主动练琴了，没有催，心里有点小开心。',
          hasReferenceImage: false,
          imagePrompt: '真实生活感的家庭练琴场景，柔和自然光，比例 1:1，不要文字 logo 水印'
        }) } }]
      }));
      return;
    }
    if (chatCalls === 5) {
      response.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          title: '少儿钢琴陪练的3个真实方法',
          hook: '孩子练琴总拖拉，先别急着吼。',
          body: [
            {
              scene: 1,
              duration: '0-3秒',
              content: '抛出家长痛点。',
              visual: '家长和孩子在钢琴旁',
              textOverlay: '别催，先换方法'
            }
          ],
          ending: '收藏起来，下次练琴前看一遍。',
          keyPhrases: ['先降低阻力，再提高坚持'],
          hashtags: ['#少儿钢琴', '#陪练']
        }) } }]
      }));
      return;
    }
    if (prompt.includes('keyPhrases') || prompt.includes('textOverlay') || prompt.includes('短视频脚本')) {
      response.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          title: '少儿钢琴陪练的3个真实方法',
          hook: '孩子练琴总拖拉，先别急着吼。',
          body: [
            {
              scene: 1,
              duration: '0-3秒',
              content: '抛出家长痛点。',
              visual: '家长和孩子在钢琴旁',
              textOverlay: '别催，先换方法'
            }
          ],
          ending: '收藏起来，下次练琴前看一遍。',
          keyPhrases: ['先降低阻力，再提高坚持'],
          hashtags: ['#少儿钢琴', '#陪练']
        }) } }]
      }));
      return;
    }
    if (prompt.includes('heatScore') && prompt.includes('references')) {
      response.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify([
          {
            title: '少儿钢琴陪练的3个真实方法',
            heatScore: 9.1,
            reason: '家长痛点明确，适合短视频表达',
            references: ['https://example.com/douyin/mock-1']
          }
        ]) } }]
      }));
      return;
    }
    response.end(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }]
    }));
    return;
  }
  if (request.url === '/v1/images/generations') {
    response.end(JSON.stringify({
      data: [{ b64_json: Buffer.from('<svg><rect width="10" height="10"/></svg>').toString('base64') }]
    }));
    return;
  }
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
const userDataDir = await mkdtemp(join(tmpdir(), 'peilian-full-flow-'));

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
      PEILIAN_MOCK_SEARCH: '1',
      PEILIAN_ALLOW_MOCK_SEARCH: '1',
      PEILIAN_DISABLE_GPU: '1',
      ELECTRON_RENDERER_URL: ''
    }
  });

  const page = await waitForUsableWindow(app);

  const result = await page.evaluate(async (url) => {
    const api = window.electron;
    await api.saveModel({
      name: 'Mock Language',
      kind: 'language',
      provider: 'custom',
      model: 'mock-language',
      baseUrl: url,
      apiKey: 'mock-key',
      enabled: true
    });
    await api.saveModel({
      name: 'Mock Image',
      kind: 'image',
      provider: 'custom',
      model: 'mock-image',
      baseUrl: url,
      apiKey: 'mock-key',
      enabled: true
    });

    const topics = await api.searchHotTopics('少儿钢琴陪练');
    const todayTopics = await api.generateTodayTopics(true);
    const script = await api.generateScript({ topic: todayTopics[0], duration: 30, requirements: '口播风格' });
    const rewrite = await api.rewriteMoments('今天孩子主动练琴了', '日常真实风');
    const momentTexts = await api.generateMomentTexts({ idea: '孩子主动练琴', style: '真诚走心' });
    const momentImage = await api.generateMomentImage({ selectedText: momentTexts.results[0].text });
    const article = await api.generateArticle('孩子英语启蒙的5个方法');
    const regeneratedImage = await api.regenerateArticleImage(article.cards[0]);

    return {
      topics: topics?.length ?? 0,
      todayTopics: todayTopics?.length ?? 0,
      scriptTitle: script?.title ?? '',
      scriptScenes: script?.body?.length ?? 0,
      rewriteVersions: rewrite?.results?.length ?? 0,
      momentTexts: momentTexts?.results?.length ?? 0,
      momentImageChars: momentImage?.imageUrl?.length ?? 0,
      articleTitle: article?.publishContent?.title ?? '',
      articlePoints: article?.cards?.length ?? 0,
      articleImages: article?.images?.length ?? 0,
      regeneratedImageChars: regeneratedImage?.image?.length ?? 0
    };
  }, baseUrl);

  assert.ok(result.topics >= 1);
  assert.equal(result.todayTopics, 4);
  assert.ok(result.scriptTitle.length >= 1);
  assert.ok(result.scriptScenes >= 1);
  assert.ok(result.rewriteVersions >= 1);
  assert.ok(result.momentTexts >= 3);
  assert.ok(result.momentImageChars >= 20);
  assert.ok(result.articleTitle.length >= 1);
  assert.ok(result.articlePoints >= 6);
  assert.equal(result.articleImages, result.articlePoints);
  assert.ok(result.regeneratedImageChars >= 20);

  console.log('full business flow smoke passed');
  console.log(JSON.stringify(result, null, 2));
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
