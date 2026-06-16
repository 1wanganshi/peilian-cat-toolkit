import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { config } from 'dotenv';
import type { ArticleGenerationProgress } from '../shared/types';
import { ArticlePublisher } from './modules/article-publisher';
import { ExportService } from './modules/export-service';
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
let mainWindow: BrowserWindow | undefined;

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

app.whenReady().then(() => {
  registerHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function registerHandlers(): void {
  ipcMain.handle('search-hot-topics', async (_event, topic: string) =>
    scriptGenerator.searchAndGenerateTopics(topic)
  );
  ipcMain.handle('generate-today-topics', async (_event, forceRefresh?: boolean) =>
    scriptGenerator.generateTodayTopics(Boolean(forceRefresh))
  );
  ipcMain.handle('generate-script', async (_event, data) =>
    scriptGenerator.generateScript(data.topic, data.duration, data.requirements)
  );
  ipcMain.handle('export-script', async (_event, script, format) =>
    exportService.exportScript(script, format)
  );
  ipcMain.handle('rewrite-moments', async (_event, text: string, style: string) =>
    momentsGenerator.rewriteMoments(text, style)
  );
  ipcMain.handle('generate-moment-texts', async (_event, data) =>
    momentsGenerator.generateTexts(data.idea, data.style)
  );
  ipcMain.handle('generate-moment-image', async (_event, data) =>
    momentsGenerator.generateImage(data.selectedText, data.referenceImage, data.referenceImageName)
  );
  ipcMain.handle('generate-moments-with-image', async (_event, data) =>
    momentsGenerator.generateWithImage(
      data.idea ?? data.topic,
      data.style,
      data.referenceImage,
      data.referenceImageName ?? data.imageNames?.[0]
    )
  );
  ipcMain.handle('download-image', async (_event, base64Image: string, fileName?: string) =>
    exportService.downloadImage(base64Image, fileName)
  );
  ipcMain.handle('generate-article', async (_event, topic: string) =>
    articlePublisher.generateArticle(topic)
  );
  ipcMain.handle('generate-article-with-progress', async (event, topic: string, requestId: string) =>
    articlePublisher.generateArticle(topic, (progress) => {
      const payload: ArticleGenerationProgress = {
        ...progress,
        requestId,
        createdAt: new Date().toISOString()
      };
      event.sender.send('article-generation-progress', payload);
    })
  );
  ipcMain.handle('regenerate-article-image', async (_event, card) =>
    articlePublisher.regenerateImage(card)
  );
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
  ipcMain.handle('open-external-url', async (_event, url: string) => {
    const target = new URL(url);
    if (!['http:', 'https:'].includes(target.protocol)) {
      throw new Error('只支持打开 http/https 下载地址');
    }
    await shell.openExternal(target.toString());
  });
}
