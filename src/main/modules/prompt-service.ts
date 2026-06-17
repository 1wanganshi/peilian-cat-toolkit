import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { PromptConfigMeta, PromptScenario, PromptSyncResult, PromptTemplate } from '../../shared/types';
import { RemoteConfigService } from './remote-config-service';

const REMOTE_EDITABLE_SCENARIOS = new Set<PromptScenario>([
  'moments-rewrite',
  'moments-generate',
  'video-script-generate'
]);

const REMOTE_EDITABLE_SCENARIO_NAMES: Record<PromptScenario, string> = {
  'video-today-topics': '今日短视频选题整理',
  'video-topic-generate': '短视频选题生成',
  'video-script-generate': '短视频脚本生成',
  'moments-rewrite': '朋友圈改写',
  'moments-generate': '朋友圈生成',
  'article-generate': 'AI 图文发布生成',
  'image-generate': '生图提示词'
};

const DEFAULT_TEMPLATES: Array<Omit<PromptTemplate, 'createdAt' | 'updatedAt'>> = [
  {
    id: 'default-video-today-topics',
    scenario: 'video-today-topics',
    name: '今日短视频选题整理',
    description: '根据英语启蒙相关搜索结果整理 4 个适合短视频创作的今日选题。',
    requiredVariables: ['searchResults', 'projectContext'],
    enabled: true,
    builtIn: true,
    template: `你是陪练猫的短视频选题策划专家，专注英语启蒙、少儿英语、儿童英语教育、家庭英语教育。

项目定位：
{{projectContext}}

联网搜索结果：
{{searchResults}}

任务：根据搜索结果整理 4 个“今日选题”，面向家长用户，适合短视频脚本创作。

选题方向优先关注：
英语启蒙、儿童英语学习、家庭英语教育、家长陪练、英语启蒙认知、英语学习热点、儿童英语教育趋势、亲子英语学习、幼儿英语输入、自然拼读、分级阅读、英语磨耳朵、英语启蒙误区、家长教育焦虑、英语学习方法。

要求：
1. 必须生成 4 个选题。
2. title 要有明确观点和吸引力，适合短视频标题。
3. coreIdea 写清楚这个选题的主要理论、认知升级或内容大纲。
4. facts 每个选题 3-4 条，尽量来自搜索结果，简洁明确。
5. 不要直接复制搜索结果原文，要提炼成家长愿意看的选题。
6. 只输出合法 JSON，不要 Markdown。

输出格式：
{
  "topics": [
    {
      "title": "选题标题",
      "coreIdea": "主要理论、认知或大纲内容",
      "facts": ["事实依据1", "事实依据2", "事实依据3", "事实依据4"]
    }
  ]
}`
  },
  {
    id: 'default-video-topic-generate',
    scenario: 'video-topic-generate',
    name: '短视频选题生成',
    description: '根据主题和热门内容生成可拍摄选题。',
    requiredVariables: ['topic', 'hotContent'],
    enabled: true,
    builtIn: true,
    template: `你是一个短视频选题策划专家。

用户主题：{{topic}}

热门内容数据：
{{hotContent}}

任务：生成 5 个短视频选题方向。

输出要求：
1. 每个选题要有明确标题。
2. heatScore 使用 0-10 分。
3. reason 说明推荐理由。
4. references 放参考链接。

只输出合法 JSON 数组，字段为 title, heatScore, reason, references。`
  },
  {
    id: 'default-video-script-generate',
    scenario: 'video-script-generate',
    name: '短视频脚本生成',
    description: '根据选题、时长和补充要求生成完整分镜脚本。',
    requiredVariables: ['topic', 'duration', 'requirements'],
    enabled: true,
    builtIn: true,
    template: `你是一个专业短视频脚本创作专家。

选题：
{{topic}}

视频时长：{{duration}} 秒
用户补充要求：{{requirements}}

任务：生成完整短视频脚本。

输出要求：
1. 开头 3 秒必须有钩子。
2. 结构清晰：开头、主体、结尾。
3. body 是分镜数组，每个分镜包含 scene, duration, content, visual, textOverlay。
4. 标注关键金句 keyPhrases 和话题 hashtags。

只输出合法 JSON，字段为 title, hook, body, ending, keyPhrases, hashtags。`
  },
  {
    id: 'default-moments-rewrite',
    scenario: 'moments-rewrite',
    name: '朋友圈改写',
    description: '把原文按指定风格改写成三个真人感朋友圈版本。',
    requiredVariables: ['originalText', 'style'],
    enabled: true,
    builtIn: true,
    template: `你是一个非常懂普通人朋友圈表达的改写助手。

原文：
{{originalText}}
改写风格：{{style}}

任务：先理解原文含义，再换一种表达，生成 3 条明显不同的朋友圈改写结果。
要求：
1. 保留核心意思，不照抄原句。
2. 口语化、真人化、自然、有生活感。
3. 不要营销味、模板味、鸡汤味、公众号味、小红书标题党腔、AI 腔。
4. 不要输出解释、分析、标题。
5. 避免“震撼”“爆款”“逆天”“封神”“在这个快节奏的时代”“愿我们都能”“生活不止眼前”等明显模板句，除非原文就是这种风格。
6. 每条适合微信朋友圈直接发布，不要写成长文，可有 0-2 个 emoji。

只输出合法 JSON：
{
  "type": "rewrite",
  "sourceText": "用户输入的原朋友圈",
  "style": "用户选择的风格",
  "results": [
    { "index": 1, "text": "改写后的朋友圈文案" },
    { "index": 2, "text": "改写后的朋友圈文案" },
    { "index": 3, "text": "改写后的朋友圈文案" }
  ]
}`
  },
  {
    id: 'default-moments-generate',
    scenario: 'moments-generate',
    name: '朋友圈生成',
    description: '根据想法和风格生成三个真人感朋友圈版本。',
    requiredVariables: ['idea', 'style'],
    enabled: true,
    builtIn: true,
    template: `你是一个非常懂普通人朋友圈表达的创作助手。

朋友圈想法：{{idea}}
风格：{{style}}

任务：根据用户想法生成 3 条明显不同的朋友圈文案。
要求：
1. 100% 口语化、真人化，像普通人随手发朋友圈。
2. 不要公众号腔、小红书标题党腔、营销号腔、官方宣传腔、AI 腔。
3. 不要写成文章，不要输出解释、分析、标题。
4. 默认每条 20-120 字，除非用户明确要求长文。
5. 不要虚构过多细节；需要细节时，用模糊但自然的表达。
6. 可以有 0-2 个 emoji，不要过多。
7. 不要每次用同一种句式。
8. 不包含违法、色情、暴力、仇恨、诈骗、医疗保证、金融承诺等违规内容；如输入敏感，给安全替代表达。

只输出合法 JSON：
{
  "type": "generate",
  "idea": "用户输入的朋友圈想法",
  "style": "用户选择的风格",
  "results": [
    { "index": 1, "text": "生成的朋友圈文案" },
    { "index": 2, "text": "生成的朋友圈文案" },
    { "index": 3, "text": "生成的朋友圈文案" }
  ]
}`
  },
  {
    id: 'default-article-generate',
    scenario: 'article-generate',
    name: 'AI 图文发布生成',
    description: '生成适合抖音图文发布的少儿英语教育卡片脚本。',
    requiredVariables: ['topic', 'searchSummary', 'searchResults'],
    enabled: true,
    builtIn: true,
    template: `你是一个儿童/亲子内容创作专家。

用户选题：{{topic}}

联网搜索摘要：
{{searchSummary}}

联网搜索结果：
{{searchResults}}

任务：生成一组适合抖音图文发布的少儿英语教育卡片脚本。

内容方向必须偏向家长喜欢收藏的类型：
- 清单型：孩子英语启蒙的5个方法
- 避坑型：英语启蒙的6个误区
- 对比型：英语启蒙做对和做错的区别
- 方法型：孩子听英语故事的正确方法
- 推荐型：适合孩子的英语绘本/故事清单

结构要求：
1. 默认生成 6 到 8 张图文卡片。
2. 第 1 张是 cover，标题要有吸引力。
3. 中间卡片是 content，写具体方法、清单、避坑点、对比内容或推荐内容。
4. 最后一张是 summary，引导用户收藏。
5. 每张卡片必须有较高信息密度，让家长觉得“值得收藏”：body 写成 4-6 行，每行短句，包含结论、具体步骤、判断标准、常见误区或可执行动作。
6. 避免空话，例如“坚持很重要”“多听多说”必须改成具体做法，例如“每天 10 分钟，固定同一本绘本重复 5 天”。
7. 每张卡片都要有 visualPrompt，适合生成手机竖屏图文图片。

图片风格要求写入 visualPrompt：
- 适合抖音图文发布
- 手机竖屏比例
- 温暖亲子教育风
- 浅色背景
- 卡片式排版，像可收藏的干货清单
- 大标题清晰，正文包含 3-5 个信息块、编号步骤、对比表或 checklist
- 信息适合家长收藏，密度高但层级清楚
- 主题围绕儿童英语、英语启蒙、亲子学习
- 不要低质、杂乱；可以有较多文字，但必须排版清晰、留白合理、手机上可读

只输出合法 JSON，格式严格如下：
{
  "topic": "用户输入的选题",
  "contentType": "list | tips | mistakes | comparison | recommendation",
  "searchSummary": "根据联网搜索得到的内容摘要",
  "cards": [
    {
      "index": 1,
      "type": "cover",
      "title": "封面标题",
      "subtitle": "封面副标题",
      "body": "这一页图片上的文字，4-6行短句，包含可收藏的信息点",
      "visualPrompt": "用于生成这张图的图片提示词"
    }
  ],
  "publishContent": {
    "title": "适合抖音发布的标题",
    "body": "适合抖音发布的正文",
    "hashtags": ["#英语启蒙", "#儿童英语", "#少儿英语", "#亲子教育", "#家庭教育"]
  }
}`
  },
  {
    id: 'default-image-generate',
    scenario: 'image-generate',
    name: '生图提示词',
    description: '根据内容标题和描述生成图片模型提示词。',
    requiredVariables: ['title', 'description'],
    enabled: true,
    builtIn: true,
    template: `Vertical Douyin educational card.

Title: {{title}}
Content: {{description}}

Warm parent-child English learning theme. Light background. Clean card layout. Large clear headline. Dense but readable save-worthy information card with 3-5 structured text blocks, numbered steps or checklist rows, clear hierarchy, generous margins. 9:16 vertical, 768x1344. No clutter, no watermark, no logo.`
  }
];

export class PromptService {
  private readonly filePath: string;
  private readonly metaFilePath: string;
  private readonly remoteConfigService = new RemoteConfigService();

  constructor(filePath = join(process.env.PEILIAN_CAT_USER_DATA ?? app.getPath('userData'), 'prompts.json')) {
    this.filePath = filePath;
    this.metaFilePath = join(dirname(filePath), 'prompt-meta.json');
  }

  async listTemplates(): Promise<PromptTemplate[]> {
    return this.readTemplates();
  }

  async syncRemoteTemplates(): Promise<PromptSyncResult> {
    const remoteConfig = await this.remoteConfigService.getConfig(true);
    if (!remoteConfig) {
      throw new Error('无法连接后台提示词配置');
    }
    const remoteTemplates = remoteConfig.prompts;
    const remoteMeta = remoteConfig.meta;
    const validRemoteTemplates = remoteTemplates.filter((item) =>
      item.enabled && REMOTE_EDITABLE_SCENARIOS.has(item.scenario) && item.template
    );
    const validRemoteScenarios = new Set(validRemoteTemplates.map((item) => item.scenario));
    const missingRemoteScenarios = [...REMOTE_EDITABLE_SCENARIOS].filter((scenario) => !validRemoteScenarios.has(scenario));
    if (missingRemoteScenarios.length > 0) {
      const names = missingRemoteScenarios.map((scenario) => REMOTE_EDITABLE_SCENARIO_NAMES[scenario]).join('、');
      throw new Error(`后台提示词缺少：${names}。请先在网页后台补齐并保存提示词。`);
    }
    const localTemplates = await this.readTemplates();
    if (validRemoteTemplates.length === 0) {
      const syncedAt = new Date().toISOString();
      const meta = {
        promptRevision: remoteMeta.promptRevision,
        promptsUpdatedAt: remoteMeta.promptsUpdatedAt || syncedAt,
        promptCount: 0
      };
      await this.writeLocalMeta(meta);
      return {
        imported: 0,
        syncedAt,
        scenarios: [],
        names: [],
        ...meta
      };
    }

    const remoteScenarios = new Set(validRemoteTemplates.map((item) => item.scenario));
    const localFallbacks = localTemplates.filter((item) => !remoteScenarios.has(item.scenario));
    const syncedTemplates = [
      ...validRemoteTemplates.map((item) => ({
        ...item,
        builtIn: false,
        updatedAt: new Date().toISOString()
      })),
      ...localFallbacks
    ];
    await this.writeTemplates(syncedTemplates);
    const syncedAt = new Date().toISOString();
    const meta = {
      promptRevision: remoteMeta.promptRevision,
      promptsUpdatedAt: remoteMeta.promptsUpdatedAt || syncedAt,
      promptCount: validRemoteTemplates.length
    };
    await this.writeLocalMeta(meta);
    return {
      imported: validRemoteTemplates.length,
      syncedAt,
      scenarios: validRemoteTemplates.map((item) => item.scenario),
      names: validRemoteTemplates.map((item) => item.name),
      ...meta
    };
  }

  async refreshRemoteEditableTemplates(): Promise<void> {
    await this.syncRemoteTemplates();
  }

  async getPromptConfigMeta(): Promise<PromptConfigMeta> {
    const remoteMeta = await this.remoteConfigService.getPromptMeta();
    const localMeta = await this.readLocalMeta();
    return {
      promptRevision: remoteMeta.promptRevision,
      promptsUpdatedAt: remoteMeta.promptsUpdatedAt,
      promptCount: remoteMeta.promptCount,
      localPromptRevision: localMeta.promptRevision,
      localPromptsUpdatedAt: localMeta.promptsUpdatedAt
    };
  }

  async buildPrompt(scenario: PromptScenario, variables: Record<string, unknown>): Promise<string> {
    const templates = await this.listTemplates();
    const template = templates.find((item) => item.scenario === scenario && item.enabled) ??
      templates.find((item) => item.scenario === scenario);

    if (!template) {
      throw new Error(`未找到提示词模板：${scenario}`);
    }

    return this.renderTemplate(template.template, variables);
  }

  private renderTemplate(template: string, variables: Record<string, unknown>): string {
    const renderedVariables = new Set<string>();
    const rendered = template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/gu, (_match, name: string) => {
      renderedVariables.add(name);
      return this.text(variables[name]);
    });
    const missingVariables = Object.entries(variables)
      .filter(([name, value]) => !renderedVariables.has(name) && this.text(value))
      .map(([name, value]) => `${name}: ${this.text(value)}`);

    if (missingVariables.length === 0) return rendered;

    return `${rendered}\n\n---\nAPP input, must be used:\n${missingVariables.join('\n')}`;
  }

  private async readTemplates(): Promise<PromptTemplate[]> {
    const seeded = this.defaultTemplates();
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const saved = JSON.parse(raw) as PromptTemplate[];
      const refreshed = saved.map((item) => {
        const defaultItem = seeded.find((seed) => seed.id === item.id);
        if (!defaultItem || !item.builtIn) return item;
        return {
          ...defaultItem,
          enabled: item.enabled,
          createdAt: item.createdAt,
          updatedAt: defaultItem.updatedAt
        };
      });
      const missingDefaults = seeded.filter((defaultItem) => !refreshed.some((item) => item.id === defaultItem.id));
      return [...refreshed, ...missingDefaults];
    } catch {
      await this.writeTemplates(seeded);
      return seeded;
    }
  }

  private async writeTemplates(templates: PromptTemplate[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(templates, null, 2), 'utf8');
  }

  private async readLocalMeta(): Promise<PromptConfigMeta> {
    try {
      const raw = await readFile(this.metaFilePath, 'utf8');
      const saved = JSON.parse(raw) as Partial<PromptConfigMeta>;
      return {
        promptRevision: Number.isFinite(Number(saved.promptRevision)) ? Number(saved.promptRevision) : 0,
        promptsUpdatedAt: typeof saved.promptsUpdatedAt === 'string' ? saved.promptsUpdatedAt : '',
        promptCount: Number.isFinite(Number(saved.promptCount)) ? Number(saved.promptCount) : 0
      };
    } catch {
      return {
        promptRevision: 0,
        promptsUpdatedAt: '',
        promptCount: 0
      };
    }
  }

  private async writeLocalMeta(meta: PromptConfigMeta): Promise<void> {
    await mkdir(dirname(this.metaFilePath), { recursive: true });
    await writeFile(this.metaFilePath, JSON.stringify(meta, null, 2), 'utf8');
  }

  private defaultTemplates(): PromptTemplate[] {
    const now = new Date().toISOString();
    return DEFAULT_TEMPLATES.map((item) => ({ ...item, createdAt: now, updatedAt: now }));
  }

  private text(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value == null) return '';
    return JSON.stringify(value, null, 2);
  }
}
