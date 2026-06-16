import { app, BrowserWindow, clipboard, ipcMain, nativeImage, shell } from 'electron';
import { createWriteStream } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { config } from 'dotenv';
import type { ArticleGenerationProgress, HistoryCreateInput, UpdateDownloadResult } from '../shared/types';
import { ArticlePublisher } from './modules/article-publisher';
import { AuthService } from './modules/auth-service';
import { ExportService } from './modules/export-service';
import { HistoryService } from './modules/history-service';
import { ModelManager } from './modules/model-manager';
import { MomentsGenerator } from './modules/moments-generator';
import { PromptService } from './modules/prompt-service';
import { RemoteConfigService } from './modules/remote-config-service';
import { ScriptGenerator } from './modules/script-generator';

config();
app.setName('陪练猫工具包');
if (process.env.PEILIAN_CAT_USER_DATA) {
  app.setPath('userData', process.env.PEILIAN_CAT_USER_DATA);
}
if (process.env.PEILIAN_DISABLE_GPU === '1') {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
}

const scriptGenerator = new ScriptGenerator();
const momentsGenerator = new MomentsGenerator();
const articlePublisher = new ArticlePublisher();
const exportService = new ExportService();
const modelManager = new ModelManager();
const promptService = new PromptService();
const remoteConfigService = new RemoteConfigService();
const authService = new AuthService(undefined, remoteConfigService);
const historyService = new HistoryService();
let mainWindow: BrowserWindow | undefined;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

function focusMainWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    title: '陪练猫工具包',
    icon: join(__dirname, '../../resources/peilian-cat-icon.ico'),
    backgroundColor: '#f6f4ef',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });
}

async function saveHistorySafely(input: HistoryCreateInput): Promise<void> {
  try {
    await historyService.saveHistory(input);
  } catch {
    // History must never block content generation.
  }
}

function shortText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.replace(/\s+/gu, ' ').trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (!value) return fallback;
  try {
    return JSON.stringify(value).slice(0, 120);
  } catch {
    return fallback;
  }
}

function titleFromTopic(topic: unknown): string {
  if (topic && typeof topic === 'object' && 'title' in topic) {
    return shortText((topic as { title?: unknown }).title, '短视频脚本');
  }
  return shortText(topic, '短视频脚本');
}

async function authorizeAndTrack(module: string, action: string, summary = ''): Promise<void> {
  await authService.recordUsage({ module, action, summary });
}

function sanitizeFileSegment(value: string): string {
  return value.replace(/[^\w.-]+/gu, '-').replace(/-+/gu, '-').replace(/^-|-$/gu, '') || 'latest';
}

async function downloadLatestUpdateInstaller(): Promise<UpdateDownloadResult> {
  const update = await remoteConfigService.checkUpdate(app.getVersion());
  if (!update.downloadUrl) {
    throw new Error('后台还没有配置安装包下载地址，请先在网页后台“更新及授权”里填写下载地址并保存。');
  }

  const target = new URL(update.downloadUrl);
  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Error('安装包下载地址必须是 http/https 链接');
  }
  if (!/\.exe(?:$|[?#])/iu.test(target.pathname)) {
    throw new Error('安装包下载地址必须指向 Windows .exe 安装程序');
  }

  const downloadsDir = app.getPath('downloads');
  await mkdir(downloadsDir, { recursive: true });
  const filePath = join(downloadsDir, `PeilianCat-Setup-${sanitizeFileSegment(update.latestVersion)}.exe`);
  const response = await fetch(target);
  if (!response.ok || !response.body) {
    throw new Error(`下载安装包失败：HTTP ${response.status}`);
  }

  try {
    await pipeline(response.body, createWriteStream(filePath));
  } catch (error) {
    await unlink(filePath).catch(() => undefined);
    throw error;
  }

  await shell.openPath(filePath);
  return {
    ...update,
    downloaded: true,
    filePath,
    message: update.hasUpdate
      ? `最新版本 ${update.latestVersion} 已下载，安装程序已打开。`
      : `当前已是最新版本 ${update.currentVersion}，安装程序已重新下载并打开。`
  };
}

app.whenReady().then(() => {
  registerHandlers();
  createWindow();
  void promptService.refreshRemoteEditableTemplates().catch(() => undefined);

  app.on('second-instance', () => {
    focusMainWindow();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      focusMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function registerHandlers(): void {
  ipcMain.handle('get-auth-session', async () => authService.getSession());
  ipcMain.handle('login-with-phone', async (_event, phone: string) => authService.login(phone));
  ipcMain.handle('logout-auth-session', async () => authService.logout());
  ipcMain.handle('search-hot-topics', async (_event, topic: string) => {
    await authorizeAndTrack('scripts', 'search-hot-topics', shortText(topic));
    return scriptGenerator.searchAndGenerateTopics(topic);
  });
  ipcMain.handle('generate-today-topics', async (_event, forceRefresh?: boolean) => {
    await authorizeAndTrack('scripts', 'generate-today-topics', forceRefresh ? '刷新今日选题' : '读取今日选题');
    return scriptGenerator.generateTodayTopics(Boolean(forceRefresh));
  });
  ipcMain.handle('generate-script', async (_event, data) => {
    await authorizeAndTrack('scripts', 'generate-script', titleFromTopic(data.topic));
    const result = await scriptGenerator.generateScript(data.topic, data.duration, data.requirements);
    await saveHistorySafely({
      type: 'script',
      title: result.title || titleFromTopic(data.topic),
      summary: result.hook,
      content: { request: data, result }
    });
    return result;
  });
  ipcMain.handle('export-script', async (_event, script, format) =>
    exportService.exportScript(script, format)
  );
  ipcMain.handle('rewrite-moments', async (_event, text: string, style: string) => {
    await authorizeAndTrack('moments', 'rewrite-moments', shortText(text));
    const result = await momentsGenerator.rewriteMoments(text, style);
    await saveHistorySafely({
      type: 'moments',
      title: '朋友圈改写',
      summary: result.results[0]?.text ?? text,
      content: { request: { text, style }, result }
    });
    return result;
  });
  ipcMain.handle('generate-moment-texts', async (_event, data) => {
    await authorizeAndTrack('moments', 'generate-moment-texts', shortText(data.idea));
    const result = await momentsGenerator.generateTexts(data.idea, data.style);
    await saveHistorySafely({
      type: 'moments',
      title: '朋友圈文案生成',
      summary: result.results[0]?.text ?? data.idea,
      content: { request: data, result }
    });
    return result;
  });
  ipcMain.handle('generate-moment-image', async (_event, data) => {
    await authorizeAndTrack('moments', 'generate-moment-image', shortText(data.selectedText));
    const result = await momentsGenerator.generateImage(data.selectedText, data.referenceImage, data.referenceImageName);
    await saveHistorySafely({
      type: 'moment-image',
      title: '朋友圈配图生成',
      summary: result.imagePrompt || data.selectedText,
      content: { request: { ...data, referenceImage: data.referenceImage ? '[uploaded-image]' : undefined }, result }
    });
    return result;
  });
  ipcMain.handle('generate-moments-with-image', async (_event, data) => {
    await authorizeAndTrack('moments', 'generate-moments-with-image', shortText(data.idea ?? data.topic));
    const result = await momentsGenerator.generateWithImage(
      data.idea ?? data.topic,
      data.style,
      data.referenceImage,
      data.referenceImageName ?? data.imageNames?.[0]
    );
    await saveHistorySafely({
      type: 'moment-image',
      title: '朋友圈文案和配图',
      summary: result.text,
      content: { request: { ...data, referenceImage: data.referenceImage ? '[uploaded-image]' : undefined }, result }
    });
    return result;
  });
  ipcMain.handle('get-today-moment-plan', async () => {
    await authorizeAndTrack('moments', 'get-today-moment-plan', '读取今日朋友圈');
    return momentsGenerator.getTodayPlan();
  });
  ipcMain.handle('generate-today-moment-suggestion', async () => {
    await authorizeAndTrack('moments', 'generate-today-moment-suggestion', '生成今日朋友圈');
    const result = await momentsGenerator.generateTodaySuggestion();
    await saveHistorySafely({
      type: 'today-moment',
      title: `${result.date} 今日朋友圈`,
      summary: result.entries?.[0]?.rewriteContent ?? result.rewriteContent,
      content: { result }
    });
    return result;
  });
  ipcMain.handle('download-image', async (_event, base64Image: string, fileName?: string) =>
    exportService.downloadImage(base64Image, fileName)
  );
  ipcMain.handle('generate-article', async (_event, topic: string) => {
    await authorizeAndTrack('articles', 'generate-article', shortText(topic));
    const result = await articlePublisher.generateArticle(topic);
    await saveHistorySafely({
      type: 'article',
      title: result.publishContent?.title || topic,
      summary: result.publishContent?.body || result.searchSummary,
      content: { request: { topic }, result }
    });
    return result;
  });
  ipcMain.handle('generate-article-with-progress', async (event, topic: string, requestId: string) => {
    await authorizeAndTrack('articles', 'generate-article-with-progress', shortText(topic));
    const result = await articlePublisher.generateArticle(topic, (progress) => {
      const payload: ArticleGenerationProgress = {
        ...progress,
        requestId,
        createdAt: new Date().toISOString()
      };
      event.sender.send('article-generation-progress', payload);
    });
    await saveHistorySafely({
      type: 'article',
      title: result.publishContent?.title || topic,
      summary: result.publishContent?.body || result.searchSummary,
      content: { request: { topic, requestId }, result }
    });
    return result;
  });
  ipcMain.handle('regenerate-article-image', async (_event, card) => {
    await authorizeAndTrack('articles', 'regenerate-article-image', shortText(card?.title ?? card?.visualPrompt));
    const result = await articlePublisher.regenerateImage(card);
    await saveHistorySafely({
      type: 'article-image',
      title: `图文配图：${card.title ?? '未命名卡片'}`,
      summary: card.visualPrompt ?? card.body,
      content: { request: { card }, result }
    });
    return result;
  });
  ipcMain.handle('export-article-package', async (_event, article) =>
    exportService.exportArticlePackage(article)
  );
  ipcMain.handle('export-article-text', async (_event, article) => exportService.exportArticleText(article));
  ipcMain.handle('list-models', async () => modelManager.listModels());
  ipcMain.handle('save-model', async (_event, input) => modelManager.saveModel(input));
  ipcMain.handle('delete-model', async (_event, id: string) => modelManager.deleteModel(id));
  ipcMain.handle('check-model', async (_event, input) => modelManager.checkModel(input));
  ipcMain.handle('get-prompt-config-meta', async () => promptService.getPromptConfigMeta());
  ipcMain.handle('sync-prompt-templates-from-backend', async () => promptService.syncRemoteTemplates());
  ipcMain.handle('check-for-updates', async () => remoteConfigService.checkUpdate(app.getVersion()));
  ipcMain.handle('download-latest-update', async () => downloadLatestUpdateInstaller());
  ipcMain.handle('list-history', async (_event, query) => historyService.listHistory(query));
  ipcMain.handle('delete-history', async (_event, id: string) => historyService.deleteHistory(id));
  ipcMain.handle('clear-history', async () => historyService.clearHistory());
  ipcMain.handle('copy-image-to-clipboard', async (_event, base64Image: string) => {
    const normalized = base64Image.includes(',') ? base64Image.split(',').pop() ?? '' : base64Image;
    const dataUrl = base64Image.startsWith('data:image/')
      ? base64Image
      : `data:image/png;base64,${normalized}`;
    const imageFromDataUrl = nativeImage.createFromDataURL(dataUrl);
    const image = imageFromDataUrl.isEmpty()
      ? nativeImage.createFromBuffer(Buffer.from(normalized, 'base64'))
      : imageFromDataUrl;
    if (image.isEmpty()) throw new Error('图片复制失败，图片数据无效');
    clipboard.writeImage(image);
  });
  ipcMain.handle('open-external-url', async (_event, url: string) => {
    const target = new URL(url);
    if (!['http:', 'https:'].includes(target.protocol)) {
      throw new Error('只支持打开 http/https 下载地址');
    }
    await shell.openExternal(target.toString());
  });
}
