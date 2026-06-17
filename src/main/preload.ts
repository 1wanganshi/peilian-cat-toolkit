import { contextBridge, ipcRenderer } from 'electron';
import type {
  ArticleCard,
  ArticleGenerationProgress,
  ArticlePackage,
  GenerateMomentsRequest,
  GenerateMomentImageRequest,
  GenerateScriptRequest,
  HistoryQuery,
  ModelConfigInput,
  ModelUsageMode,
  VideoScript
} from '../shared/types';

contextBridge.exposeInMainWorld('electron', {
  searchHotTopics: (topic: string) => ipcRenderer.invoke('search-hot-topics', topic),
  generateScript: (data: GenerateScriptRequest) => ipcRenderer.invoke('generate-script', data),
  exportScript: (script: VideoScript, format: 'txt' | 'md' | 'pdf') =>
    ipcRenderer.invoke('export-script', script, format),
  rewriteMoments: (text: string, style: string) => ipcRenderer.invoke('rewrite-moments', text, style),
  generateMomentTexts: (data: GenerateMomentsRequest) =>
    ipcRenderer.invoke('generate-moment-texts', data),
  generateMomentImage: (data: GenerateMomentImageRequest) =>
    ipcRenderer.invoke('generate-moment-image', data),
  getTodayMomentPlan: () => ipcRenderer.invoke('get-today-moment-plan'),
  generateTodayMomentSuggestion: () => ipcRenderer.invoke('generate-today-moment-suggestion'),
  downloadImage: (base64Image: string, fileName?: string) =>
    ipcRenderer.invoke('download-image', base64Image, fileName),
  generateArticle: (topic: string) => ipcRenderer.invoke('generate-article', topic),
  generateArticleWithProgress: (topic: string, requestId: string) =>
    ipcRenderer.invoke('generate-article-with-progress', topic, requestId),
  onArticleGenerationProgress: (callback: (progress: ArticleGenerationProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: ArticleGenerationProgress): void => callback(progress);
    ipcRenderer.on('article-generation-progress', listener);
    return () => ipcRenderer.removeListener('article-generation-progress', listener);
  },
  exportArticlePackage: (article: ArticlePackage) => ipcRenderer.invoke('export-article-package', article),
  exportArticleText: (article: ArticlePackage) => ipcRenderer.invoke('export-article-text', article),
  regenerateArticleImage: (card: ArticleCard) => ipcRenderer.invoke('regenerate-article-image', card),
  listModels: () => ipcRenderer.invoke('list-models'),
  saveModel: (input: ModelConfigInput) => ipcRenderer.invoke('save-model', input),
  deleteModel: (id: string) => ipcRenderer.invoke('delete-model', id),
  checkModel: (input: ModelConfigInput) => ipcRenderer.invoke('check-model', input),
  getModelUsageSettings: () => ipcRenderer.invoke('get-model-usage-settings'),
  setModelUsageMode: (mode: ModelUsageMode) => ipcRenderer.invoke('set-model-usage-mode', mode),
  generateTodayTopics: (forceRefresh?: boolean) => ipcRenderer.invoke('generate-today-topics', forceRefresh),
  getPromptConfigMeta: () => ipcRenderer.invoke('get-prompt-config-meta'),
  syncPromptTemplatesFromBackend: () => ipcRenderer.invoke('sync-prompt-templates-from-backend'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadLatestUpdate: () => ipcRenderer.invoke('download-latest-update'),
  openExternalUrl: (url: string) => ipcRenderer.invoke('open-external-url', url),
  getAuthSession: () => ipcRenderer.invoke('get-auth-session'),
  loginWithPhone: (phone: string) => ipcRenderer.invoke('login-with-phone', phone),
  logoutAuthSession: () => ipcRenderer.invoke('logout-auth-session'),
  listHistory: (query?: HistoryQuery) => ipcRenderer.invoke('list-history', query),
  deleteHistory: (id: string) => ipcRenderer.invoke('delete-history', id),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  copyImageToClipboard: (base64Image: string) => ipcRenderer.invoke('copy-image-to-clipboard', base64Image)
});
