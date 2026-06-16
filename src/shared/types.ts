export type Platform = 'douyin' | 'xiaohongshu' | 'bilibili' | 'zhihu' | 'wechat';

export interface HotContent {
  platform: Platform;
  title: string;
  views: number;
  likes: number;
  comments: number;
  url: string;
}

export interface VideoTopic {
  title: string;
  heatScore: number;
  reason: string;
  references: string[];
}

export interface ScriptScene {
  scene: number;
  duration: string;
  content: string;
  visual: string;
  textOverlay: string;
}

export interface VideoScript {
  title: string;
  hook: string;
  body: ScriptScene[];
  ending: string;
  keyPhrases: string[];
  hashtags: string[];
}

export interface MomentsVersion {
  index: number;
  text: string;
}

export interface MomentsRewriteResult {
  type: 'rewrite';
  sourceText: string;
  style: string;
  results: MomentsVersion[];
}

export interface MomentsGenerateTextResult {
  type: 'generate';
  idea: string;
  style: string;
  results: MomentsVersion[];
}

export interface MomentsImageResult {
  type: 'image';
  selectedText: string;
  hasReferenceImage: boolean;
  imagePrompt: string;
  imageUrl: string;
}

export type ArticleContentType = 'list' | 'tips' | 'mistakes' | 'comparison' | 'recommendation';

export type ArticleCardType = 'cover' | 'content' | 'summary';

export interface ArticleCard {
  index: number;
  type: ArticleCardType;
  title: string;
  subtitle: string;
  body: string;
  visualPrompt: string;
}

export interface ArticlePublishContent {
  title: string;
  body: string;
  hashtags: string[];
}

export interface ArticleImageFailure {
  index: number;
  message: string;
}

export interface ArticleImageResult {
  index: number;
  image: string;
  failedImage?: ArticleImageFailure;
}

export type ArticleGenerationProgressStatus = 'running' | 'success' | 'warning' | 'error';

export interface ArticleGenerationProgress {
  requestId: string;
  step: string;
  message: string;
  status: ArticleGenerationProgressStatus;
  detail?: string;
  createdAt: string;
}

export interface ArticlePackage {
  topic: string;
  contentType: ArticleContentType;
  searchSummary: string;
  cards: ArticleCard[];
  publishContent: ArticlePublishContent;
  images: string[];
  failedImages: ArticleImageFailure[];
}

export interface GenerateScriptRequest {
  topic: VideoTopic;
  duration: number;
  requirements?: string;
}

export interface GenerateMomentsRequest {
  idea: string;
  style: string;
  referenceImage?: string;
  referenceImageName?: string;
}

export interface GenerateMomentImageRequest {
  selectedText: string;
  referenceImage?: string;
  referenceImageName?: string;
}

export interface ExportResult {
  filePath: string;
}

export type ModelKind = 'language' | 'image';

export type ModelProvider = 'openai' | 'claude' | 'stability' | 'custom';

export interface ModelConfig {
  id: string;
  name: string;
  kind: ModelKind;
  provider: ModelProvider;
  model: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  lastCheckedAt?: string;
  lastStatus?: 'success' | 'failed';
  lastMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelConfigInput {
  id?: string;
  name: string;
  kind: ModelKind;
  provider: ModelProvider;
  model: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
}

export interface ModelCheckResult {
  ok: boolean;
  message: string;
  checkedAt: string;
}

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  downloadUrl: string;
  releaseNotes: string;
  force: boolean;
  publishedAt?: string;
}

export type PromptScenario =
  | 'video-topic-generate'
  | 'video-script-generate'
  | 'moments-rewrite'
  | 'moments-generate'
  | 'article-generate'
  | 'image-generate';

export interface PromptTemplate {
  id: string;
  scenario: PromptScenario;
  name: string;
  description: string;
  requiredVariables: string[];
  template: string;
  enabled: boolean;
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PromptTemplateInput {
  id?: string;
  scenario: PromptScenario;
  name: string;
  description: string;
  requiredVariables: string[];
  template: string;
  enabled: boolean;
}

export interface PromptPreviewRequest {
  id?: string;
  scenario?: PromptScenario;
  template?: string;
  variables: Record<string, unknown>;
}

export interface PromptPreviewResult {
  id?: string;
  scenario?: PromptScenario;
  prompt: string;
}

export interface PromptSyncResult {
  imported: number;
  syncedAt: string;
}

export type ElectronApi = {
  searchHotTopics: (topic: string) => Promise<VideoTopic[]>;
  generateScript: (data: GenerateScriptRequest) => Promise<VideoScript>;
  exportScript: (script: VideoScript, format: 'txt' | 'md' | 'pdf') => Promise<ExportResult>;
  rewriteMoments: (text: string, style: string) => Promise<MomentsRewriteResult>;
  generateMomentTexts: (data: GenerateMomentsRequest) => Promise<MomentsGenerateTextResult>;
  generateMomentImage: (data: GenerateMomentImageRequest) => Promise<MomentsImageResult>;
  generateMomentsWithImage: (data: GenerateMomentsRequest) => Promise<MomentsImageResult & { text: string; image: string }>;
  downloadImage: (base64Image: string, fileName?: string) => Promise<ExportResult>;
  generateArticle: (topic: string) => Promise<ArticlePackage>;
  generateArticleWithProgress: (topic: string, requestId: string) => Promise<ArticlePackage>;
  onArticleGenerationProgress: (callback: (progress: ArticleGenerationProgress) => void) => () => void;
  exportArticlePackage: (article: ArticlePackage) => Promise<ExportResult>;
  exportArticleText: (article: ArticlePackage) => Promise<ExportResult>;
  regenerateArticleImage: (card: ArticleCard) => Promise<ArticleImageResult>;
  listModels: () => Promise<ModelConfig[]>;
  saveModel: (input: ModelConfigInput) => Promise<ModelConfig>;
  deleteModel: (id: string) => Promise<void>;
  checkModel: (input: ModelConfigInput) => Promise<ModelCheckResult>;
  syncPromptTemplatesFromBackend: () => Promise<PromptSyncResult>;
  checkForUpdates: () => Promise<UpdateCheckResult>;
  openExternalUrl: (url: string) => Promise<void>;
};
