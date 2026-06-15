import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  PromptPreviewRequest,
  PromptPreviewResult,
  PromptScenario,
  PromptTemplate,
  PromptTemplateInput
} from '../../shared/types';
import { RemoteConfigService } from './remote-config-service';

const DEFAULT_TEMPLATES: Array<Omit<PromptTemplate, 'createdAt' | 'updatedAt'>> = [
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
5. 每张卡片 body 控制在适合图片展示的简短文字，不要长篇大论。
6. 每张卡片都要有 visualPrompt，适合生成手机竖屏图文图片。

图片风格要求写入 visualPrompt：
- 适合抖音图文发布
- 手机竖屏比例
- 温暖亲子教育风
- 浅色背景
- 卡片式排版
- 大标题清晰
- 信息适合家长收藏
- 主题围绕儿童英语、英语启蒙、亲子学习
- 不要低质、杂乱、文字过多

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
      "body": "这一页图片上的简短文字",
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

Warm parent-child English learning theme. Light background. Clean card layout. Large clear headline. Few concise info blocks. Cute but polished education style. 9:16 vertical, 768x1344. No clutter, no watermark, no logo, not too much text.`
  }
];

export class PromptService {
  private readonly filePath: string;
  private readonly remoteConfigService = new RemoteConfigService();

  constructor(filePath = join(process.env.PEILIAN_CAT_USER_DATA ?? app.getPath('userData'), 'prompts.json')) {
    this.filePath = filePath;
  }

  async listTemplates(): Promise<PromptTemplate[]> {
    return this.readTemplates();
  }

  async syncRemoteTemplates(): Promise<{ imported: number; templates: PromptTemplate[] }> {
    const remoteTemplates = await this.remoteConfigService.listRemotePrompts();
    const validRemoteTemplates = remoteTemplates.filter((item) => item.enabled && item.scenario && item.template);
    if (validRemoteTemplates.length === 0) {
      throw new Error('后台暂无可用提示词，请先在网页后台保存提示词');
    }

    const localTemplates = await this.readTemplates();
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
    return { imported: validRemoteTemplates.length, templates: syncedTemplates };
  }

  async saveTemplate(input: PromptTemplateInput): Promise<PromptTemplate> {
    this.validateInput(input);
    const templates = await this.readTemplates();
    const now = new Date().toISOString();
    const index = input.id ? templates.findIndex((item) => item.id === input.id) : -1;
    const existing = index >= 0 ? templates[index] : undefined;
    const template: PromptTemplate = {
      id: existing?.id ?? crypto.randomUUID(),
      scenario: input.scenario,
      name: input.name.trim(),
      description: input.description.trim(),
      requiredVariables: input.requiredVariables.map((item) => item.trim()).filter(Boolean),
      template: input.template,
      enabled: input.enabled,
      builtIn: existing?.builtIn ?? false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    if (index >= 0) {
      templates[index] = template;
    } else {
      templates.unshift(template);
    }

    await this.writeTemplates(templates);
    return template;
  }

  async deleteTemplate(id: string): Promise<void> {
    const templates = await this.readTemplates();
    await this.writeTemplates(templates.filter((item) => item.id !== id));
  }

  async previewPrompt(request: PromptPreviewRequest): Promise<PromptPreviewResult> {
    const template = request.template ?? await this.resolveTemplateText(request);
    return {
      id: request.id,
      scenario: request.scenario,
      prompt: this.renderTemplate(template, request.variables)
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

  private async resolveTemplateText(request: PromptPreviewRequest): Promise<string> {
    const templates = await this.listTemplates();
    const template = request.id
      ? templates.find((item) => item.id === request.id)
      : templates.find((item) => item.scenario === request.scenario && item.enabled) ??
        templates.find((item) => item.scenario === request.scenario);

    if (!template) throw new Error('未找到提示词模板');
    return template.template;
  }

  private renderTemplate(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/gu, (_match, name: string) =>
      this.text(variables[name])
    );
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

  private defaultTemplates(): PromptTemplate[] {
    const now = new Date().toISOString();
    return DEFAULT_TEMPLATES.map((item) => ({ ...item, createdAt: now, updatedAt: now }));
  }

  private validateInput(input: PromptTemplateInput): void {
    if (!input.name.trim()) throw new Error('请输入提示词名称');
    if (!input.template.trim()) throw new Error('请输入提示词内容');
  }

  private text(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value == null) return '';
    return JSON.stringify(value, null, 2);
  }
}
