import type {
  ArticlePackage,
  ArticleContentType,
  HotContent,
  MomentsGenerateTextResult,
  MomentsImageResult,
  MomentsRewriteResult,
  TodayMomentSuggestionResult,
  TodayVideoTopic,
  VideoScript,
  VideoTopic
} from '../../shared/types';
import { buildApiUrl, buildOpenAiCompatibleBaseUrls } from './api-url';
import { ModelManager } from './model-manager';
import { PromptService } from './prompt-service';

export class AiService {
  private readonly modelManager = new ModelManager();
  private readonly promptService = new PromptService();

  async generateTopics(topic: string, hotContent: HotContent[]): Promise<VideoTopic[]> {
    const generated = await this.generateJsonWithLanguageModel<VideoTopic[]>(
      await this.promptService.buildPrompt('video-topic-generate', { topic, hotContent: hotContent.slice(0, 8) })
    );
    if (generated) return generated;

    const references = hotContent.slice(0, 6).map((item) => item.url);
    return [
      {
        title: `${topic}最容易被忽略的3个真相`,
        heatScore: 9.4,
        reason: '反常识切入容易制造停留，适合用真实案例承接。',
        references
      },
      {
        title: `普通人做${topic}，先别急着买课`,
        heatScore: 8.9,
        reason: '避坑类内容收藏率高，能自然引出方法论。',
        references
      },
      {
        title: `${topic}从0到1的7天行动表`,
        heatScore: 8.6,
        reason: '清单型结构明确，适合短视频和图文复用。',
        references
      },
      {
        title: `为什么你做${topic}总是没反馈`,
        heatScore: 8.2,
        reason: '问题诊断型标题能吸引已有痛点的人群。',
        references
      },
      {
        title: `${topic}高手不会明说的底层逻辑`,
        heatScore: 8.0,
        reason: '知识差包装强，利于开头三秒设置悬念。',
        references
      }
    ];
  }

  async generateTodayTopics(searchResults: HotContent[]): Promise<TodayVideoTopic[]> {
    const projectContext = '陪练猫，英语启蒙方向，面向家长和儿童英语学习场景。';
    const generated = await this.generateJsonWithLanguageModel<{ topics?: Array<Omit<TodayVideoTopic, 'id'>> }>(
      await this.promptService.buildPrompt('video-today-topics', {
        projectContext,
        searchResults: searchResults.slice(0, 18)
      })
    );

    const topics = generated?.topics?.length ? generated.topics : this.fallbackTodayTopics(searchResults);
    return topics.slice(0, 4).map((item, index) => ({
      id: `today_${index + 1}`,
      title: item.title,
      coreIdea: item.coreIdea,
      facts: item.facts.slice(0, 4)
    }));
  }

  async generateScript(topic: VideoTopic | TodayVideoTopic, duration: number, requirements?: string): Promise<VideoScript> {
    const prompt = await this.promptService.buildPrompt('video-script-generate', { topic, duration, requirements });
    const generatedText = await this.generateTextWithLanguageModel(prompt);
    if (generatedText) {
      const generated = this.normalizeVideoScriptResponse(generatedText, topic, duration);
      if (generated) return generated;
    }

    return this.fallbackVideoScript(topic, duration, requirements);
  }

  private fallbackVideoScript(topic: VideoTopic | TodayVideoTopic, duration: number, requirements?: string): VideoScript {
    const middleEnd = duration <= 15 ? '11-14秒' : duration <= 30 ? '18-26秒' : '32-54秒';
    return {
      title: topic.title,
      hook: `先别划走，${topic.title.replace(/[。！？!?]$/u, '')}，真正关键的是第一步。`,
      body: [
        {
          scene: 1,
          duration: '0-3秒',
          content: '用一句反常识观点抛出矛盾，告诉观众这条内容能帮他们少走弯路。',
          visual: '人物正对镜头，字幕快速弹出关键词，背景保持干净。',
          textOverlay: '90%的人第一步就做错了'
        },
        {
          scene: 2,
          duration: duration <= 15 ? '3-10秒' : '3-18秒',
          content: `拆解选题核心：${this.topicReason(topic)} 结合一个生活化例子讲清楚问题。`,
          visual: '左侧人物讲解，右侧出现三点式清单。',
          textOverlay: '痛点 / 原因 / 正确做法'
        },
        {
          scene: 3,
          duration: middleEnd,
          content: requirements?.trim()
            ? `补充用户要求：${requirements.trim()}。给出可直接照做的行动步骤。`
            : '给出一套可直接照做的行动步骤，让观众看完能立刻执行。',
          visual: '步骤卡片逐条出现，配合轻微放大强调重点。',
          textOverlay: '今天就能用的3步'
        }
      ],
      ending: '如果你也遇到这个问题，先收藏，下一条我把模板直接拆给你。',
      keyPhrases: ['先解决方向，再追求技巧', '可执行，比看起来高级更重要'],
      hashtags: ['#短视频脚本', '#内容创作', '#爆款选题']
    };
  }

  private normalizeVideoScriptResponse(
    text: string,
    topic: VideoTopic | TodayVideoTopic,
    duration: number
  ): VideoScript | undefined {
    const trimmed = text.trim();
    if (!trimmed) return undefined;

    try {
      const parsed = JSON.parse(this.extractJson(trimmed)) as unknown;
      const normalized = this.normalizeVideoScriptObject(parsed, topic, duration);
      if (normalized) return normalized;
    } catch {
      // Some backend prompts intentionally ask the model for a pure transcript.
    }

    return this.wrapPlainScriptText(trimmed, topic, duration);
  }

  private normalizeVideoScriptObject(
    input: unknown,
    topic: VideoTopic | TodayVideoTopic,
    duration: number
  ): VideoScript | undefined {
    if (!input || typeof input !== 'object') return undefined;
    const value = input as Record<string, unknown>;
    const sceneInput = Array.isArray(value.body) ? value.body : this.textValue(value.body) ? [value.body] : [];
    const body = sceneInput
      .map((item, index) => this.normalizeScriptScene(item, index))
      .filter((item): item is VideoScript['body'][number] => Boolean(item));
    const fallbackText = this.textValue(value.script) || this.textValue(value.content) || this.textValue(value.text);

    if (body.length === 0 && fallbackText) {
      body.push({
        scene: 1,
        duration: `0-${duration}秒`,
        content: fallbackText,
        visual: '按逐字稿节奏安排口播画面。',
        textOverlay: topic.title
      });
    }

    if (body.length === 0) return undefined;

    return {
      title: this.textValue(value.title) || topic.title,
      hook: this.textValue(value.hook) || body[0]?.content.slice(0, 80) || topic.title,
      body,
      ending: this.textValue(value.ending),
      keyPhrases: this.stringArray(value.keyPhrases),
      hashtags: this.stringArray(value.hashtags)
    };
  }

  private normalizeScriptScene(input: unknown, index: number): VideoScript['body'][number] | undefined {
    if (typeof input === 'string') {
      const content = input.trim();
      if (!content) return undefined;
      return {
        scene: index + 1,
        duration: '',
        content,
        visual: '按逐字稿节奏安排口播画面。',
        textOverlay: ''
      };
    }

    if (!input || typeof input !== 'object') return undefined;
    const value = input as Record<string, unknown>;
    const content = this.textValue(value.content) || this.textValue(value.text) || this.textValue(value.line);
    if (!content) return undefined;

    return {
      scene: Number.isFinite(Number(value.scene)) ? Number(value.scene) : index + 1,
      duration: this.textValue(value.duration),
      content,
      visual: this.textValue(value.visual) || '按逐字稿节奏安排口播画面。',
      textOverlay: this.textValue(value.textOverlay)
    };
  }

  private wrapPlainScriptText(text: string, topic: VideoTopic | TodayVideoTopic, duration: number): VideoScript {
    const paragraphs = text.split(/\n{2,}/u).map((item) => item.trim()).filter(Boolean);
    const hook = paragraphs[0] || topic.title;
    const content = paragraphs.join('\n\n') || text;

    return {
      title: topic.title,
      hook,
      body: [
        {
          scene: 1,
          duration: `0-${duration}秒`,
          content,
          visual: '按逐字稿节奏安排口播画面。',
          textOverlay: hook.slice(0, 28)
        }
      ],
      ending: paragraphs.length > 1 ? paragraphs[paragraphs.length - 1] : '',
      keyPhrases: [],
      hashtags: []
    };
  }

  private textValue(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
  }

  private stringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => this.textValue(item)).filter(Boolean);
  }

  async rewriteMoments(originalText: string, style: string): Promise<MomentsRewriteResult> {
    const generated = await this.generateJsonWithLanguageModel<MomentsRewriteResult>(
      await this.promptService.buildPrompt('moments-rewrite', { originalText, style })
    );
    if (generated?.results?.length) {
      return {
        type: 'rewrite',
        sourceText: generated.sourceText || originalText,
        style: generated.style || style,
        results: generated.results.slice(0, 3).map((item, index) => ({ index: index + 1, text: item.text }))
      };
    }

    const text = originalText.trim();
    return {
      type: 'rewrite',
      sourceText: text,
      style,
      results: [
        { index: 1, text: `今天就想简单记一下：${text}。没什么大道理，就是当下真的有点感受。` },
        { index: 2, text: `${text}\n\n这种小瞬间还挺值得留下来的。` },
        { index: 3, text: `把这件事换个方式说，大概就是：${text}。挺真实，也挺日常。` }
      ]
    };
  }

  async generateMomentTexts(idea: string, style: string): Promise<MomentsGenerateTextResult> {
    const generated = await this.generateJsonWithLanguageModel<MomentsGenerateTextResult>(
      await this.promptService.buildPrompt('moments-generate', { idea, topic: idea, style })
    );
    if (generated?.results?.length) {
      return {
        type: 'generate',
        idea: generated.idea || idea,
        style: generated.style || style,
        results: generated.results.slice(0, 3).map((item, index) => ({ index: index + 1, text: item.text }))
      };
    }

    const text = idea.trim();
    return {
      type: 'generate',
      idea: text,
      style,
      results: [
        { index: 1, text: `${text}。\n\n拖着的时候觉得很难，做完反而松了一口气。` },
        { index: 2, text: `今天的小进度：${text}。不算多厉害，但心里舒服了不少。` },
        { index: 3, text: `${text}\n\n这种感觉还挺好，像是把生活里一个小角落收拾干净了。` }
      ]
    };
  }

  async generateTodayMomentSuggestion(rawContent: string): Promise<Pick<TodayMomentSuggestionResult, 'rewriteContent'>> {
    const generated = await this.generateJsonWithLanguageModel<{ rewriteContent?: string; results?: Array<{ text?: string }> }>(
      await this.promptService.buildPrompt('moments-rewrite', {
        originalText: rawContent,
        style: '\u4eca\u65e5\u670b\u53cb\u5708\u5efa\u8bae'
      })
    );
    const rewriteContent = generated?.rewriteContent?.trim() ||
      generated?.results?.map((item) => item.text?.trim()).find(Boolean);
    if (rewriteContent) return { rewriteContent };

    return {
      rewriteContent: `${rawContent.trim()}\n\n今天就把这段小记录发出来，真实一点，也刚刚好。`
    };
  }

  async buildMomentImagePrompt(
    selectedText: string,
    hasReferenceImage: boolean
  ): Promise<Omit<MomentsImageResult, 'imageUrl'>> {
    const prompt = `根据这条朋友圈文案生成一张适合微信朋友圈发布的配图提示词。

朋友圈文案：${selectedText}
是否有参考人物图：${hasReferenceImage ? '是' : '否'}

要求：
1. 只输出 JSON。
2. imagePrompt 必须包含场景描述、人物描述、情绪氛围、自然构图、比例 1:1、真实生活感。
3. 如果有参考人物图，必须强调保留参考图中人物的性别、大致年龄、脸型气质、发型、服饰风格和整体感觉，并让人物出现在新场景里。
4. 如果没有参考图，可以生成自然生活氛围图，例如城市街景、咖啡馆、亲子场景、学习场景、旅行场景或随手拍生活场景。
5. 避免文字、logo、水印、夸张海报感、商业广告感、假脸感、杂乱构图。

格式：
{
  "type": "image",
  "selectedText": "用于生成配图的朋友圈文案",
  "hasReferenceImage": true,
  "imagePrompt": "最终用于 image2 的图片生成提示词"
}`;

    const generated = await this.generateJsonWithLanguageModel<Omit<MomentsImageResult, 'imageUrl'>>(prompt);
    if (generated?.imagePrompt) {
      return {
        type: 'image',
        selectedText,
        hasReferenceImage,
        imagePrompt: generated.imagePrompt
      };
    }

    return {
      type: 'image',
      selectedText,
      hasReferenceImage,
      imagePrompt: hasReferenceImage
        ? `根据用户上传的参考人物图，保留人物的核心形象特征，包括性别、大致年龄、脸型气质、发型、服饰风格和整体感觉。将人物放在一个与朋友圈文案“${selectedText}”一致的真实自然生活场景中，朋友圈随手拍风格，氛围轻松真实，有生活感，构图自然，光线柔和，比例 1:1，不要文字，不要 logo，不要水印，不要商业海报感，不要假脸感。`
        : `根据朋友圈文案“${selectedText}”生成一张自然生活感氛围图，真实随手拍风格，场景与内容一致，光线柔和，构图干净，比例 1:1，适合微信朋友圈发布，不要文字，不要 logo，不要水印，不要商业海报感，不要夸张滤镜。`
    };
  }

  async generateArticle(
    topic: string,
    searchResults: HotContent[] = [],
    options: { requireModelResult?: boolean } = {}
  ): Promise<ArticlePackage> {
    const searchSummary = this.summarizeSearchResults(searchResults);
    const generated = await this.generateJsonWithLanguageModel<ArticlePackage>(
      await this.promptService.buildPrompt('article-generate', {
        topic,
        searchSummary,
        searchResults: searchResults.slice(0, 12)
      })
    );
    if (generated?.cards?.length) {
      return {
        ...generated,
        topic: generated.topic || topic,
        searchSummary: generated.searchSummary || searchSummary,
        images: [],
        failedImages: []
      };
    }

    if (options.requireModelResult) {
      throw new Error('AI 没有返回合法的图文 JSON，请检查语言模型配置后重试');
    }

    const contentType = this.inferArticleContentType(topic);
    return {
      topic,
      contentType,
      searchSummary,
      cards: [
        {
          index: 1,
          type: 'cover',
          title: topic,
          subtitle: '家长收藏版英语启蒙图文',
          body: '先收藏这张清单\n适合 3-8 岁家庭启蒙\n每天 10-15 分钟即可开始\n重点不是背单词，而是可理解输入',
          visualPrompt: this.verticalCardPrompt(topic, '封面图，含 4 个核心收益点，温暖亲子英语启蒙氛围，大标题清晰')
        },
        {
          index: 2,
          type: 'content',
          title: '先听懂，再开口',
          subtitle: '输入比催孩子说更重要',
          body: '每天固定 10-15 分钟\n同一本故事连续听 5 天\n先看画面理解意思\n只问 1 个简单问题\n不逼孩子立刻复述',
          visualPrompt: this.verticalCardPrompt(topic, '家长和孩子一起听英文故事，5 条步骤清单，浅色卡片排版')
        },
        {
          index: 3,
          type: 'content',
          title: '选孩子听得懂的材料',
          subtitle: '难度太高会降低兴趣',
          body: '生词不要超过 20%\n优先选有画面的内容\n句子短、重复多更好\n孩子愿意反复看才算合适\n太难就降一级',
          visualPrompt: this.verticalCardPrompt(topic, '英语绘本和儿童学习场景，材料选择 checklist，信息清晰适合收藏')
        },
        {
          index: 4,
          type: 'content',
          title: '不要一上来背单词',
          subtitle: '英语启蒙不是考试训练',
          body: '单词会背不等于会用\n孤立记忆容易忘\n先放到故事和场景里\n用动作、图片、实物辅助\n最后再认读单词',
          visualPrompt: this.verticalCardPrompt(topic, '避坑提示卡片，错误做法和正确做法对比，亲子教育风，浅色背景')
        },
        {
          index: 5,
          type: 'content',
          title: '亲子互动要简单',
          subtitle: '一句英文也能开始',
          body: '起床：Wake up\n吃饭：Yummy\n收玩具：Clean up\n鼓励：Good try\n每天固定 3 句就够',
          visualPrompt: this.verticalCardPrompt(topic, '家长与孩子日常英语互动，生活场景短句表格，卡片式排版')
        },
        {
          index: 6,
          type: 'summary',
          title: '收藏这份启蒙清单',
          subtitle: '每天一点点，坚持更重要',
          body: '1. 选听得懂的材料\n2. 同一内容重复 5 天\n3. 每天只互动 3 句\n4. 不急着背单词\n5. 看兴趣和理解，不看速度',
          visualPrompt: this.verticalCardPrompt(topic, '总结页，5 点收藏清单，引导收藏，温暖浅色亲子教育风')
        }
      ],
      publishContent: {
        title: `${topic}，家长一定要收藏`,
        body: `英语启蒙不需要一开始就追求会说多少，重点是让孩子愿意听、愿意重复、愿意在生活里接触英语。\n\n这组方法适合家长每天照着做，轻松开始，不焦虑。`,
        hashtags: ['#英语启蒙', '#儿童英语', '#少儿英语', '#亲子教育', '#家庭教育']
      },
      images: [],
      failedImages: []
    };
  }

  private summarizeSearchResults(searchResults: HotContent[]): string {
    if (searchResults.length === 0) {
      return '未获取到外部搜索结果，使用少儿英语启蒙通用方法生成。';
    }

    return searchResults
      .slice(0, 8)
      .map((item) => {
        const summary = item.summary ? `\n摘要：${item.summary}` : '';
        return `${item.platform}: ${item.title}${summary}\n链接：${item.url}`;
      })
      .join('\n');
  }

  private topicReason(topic: VideoTopic | TodayVideoTopic): string {
    return 'reason' in topic ? topic.reason : topic.coreIdea;
  }

  private inferArticleContentType(topic: string): ArticleContentType {
    if (/坑|误区|错|避坑/u.test(topic)) return 'mistakes';
    if (/对比|区别|做对|做错/u.test(topic)) return 'comparison';
    if (/推荐|绘本|故事|清单/u.test(topic)) return 'recommendation';
    if (/方法|怎么|如何/u.test(topic)) return 'tips';
    return 'list';
  }

  private fallbackTodayTopics(searchResults: HotContent[]): Array<Omit<TodayVideoTopic, 'id'>> {
    const references = searchResults.slice(0, 4).map((item) => item.title);
    return [
      {
        title: '为什么孩子背了很多单词，还是不会开口说英语？',
        coreIdea: '把家长的关注点从“单词量”转到“输入方式”和“表达场景”，讲清楚启蒙阶段为什么要先让孩子听懂、愿意说。',
        facts: [
          references[0] || '英语启蒙讨论中，家长常把“会背单词”当作进步的核心指标。',
          '单词孤立记忆不等于能在真实场景里表达。',
          '可理解输入、固定句型和亲子互动更容易转化为输出。',
          '磨耳朵只有在和画面、情境结合时，才更容易形成理解。'
        ]
      },
      {
        title: '英语磨耳朵没效果，可能少了这一步',
        coreIdea: '解释磨耳朵不是单纯播放，而是要让声音和画面、动作、情境形成联结，帮助家长调整家庭输入方式。',
        facts: [
          references[1] || '“英语磨耳朵是否有效”是高频家长问题。',
          '背景音式输入很难帮助孩子建立意义连接。',
          '重复、稳定、可理解的材料更容易被孩子接受。',
          '家长陪伴式输入通常比完全放任播放更有效。'
        ]
      },
      {
        title: '自然拼读不是越早越好，关键看孩子有没有两个基础',
        coreIdea: '帮助家长理解自然拼读需要听辨能力和一定词汇经验，避免直接把启蒙做成规则背诵。',
        facts: [
          references[2] || '自然拼读是儿童英语教育中的热门方法。',
          '孩子需要先有音素敏感度，再进入拼读规则。',
          '如果对英语声音还不熟，直接学规则容易变机械记忆。',
          '儿歌、绘本和游戏更适合打基础。'
        ]
      },
      {
        title: '家长最容易踩的坑：把英语启蒙做成考试训练',
        coreIdea: '强调启蒙阶段重在兴趣、输入和互动，不是早早把家庭学习变成刷题和背诵。',
        facts: [
          references[3] || '很多家长在英语启蒙中容易焦虑，想快速看结果。',
          '过早强调考试结果，会降低孩子对英语的自然兴趣。',
          '家庭英语学习更适合少量高频、可重复的场景化输入。',
          '亲子共学比单向灌输更容易长期坚持。'
        ]
      }
    ];
  }

  private verticalCardPrompt(topic: string, detail: string): string {
    return `适合抖音图文发布的手机竖屏亲子教育干货卡片，主题：${topic}。${detail}。浅色背景，温暖亲子教育风，卡片式排版，大标题清晰，包含 3-5 个结构化信息块、编号步骤、对比表或 checklist，信息密度高且适合家长收藏，围绕儿童英语、英语启蒙、亲子学习，层级清楚，手机上可读，不要低质、杂乱、logo 或水印。`;
  }

  private async generateJsonWithLanguageModel<T>(prompt: string): Promise<T | undefined> {
    const text = await this.generateTextWithLanguageModel(`${prompt}\n只输出合法 JSON，不要 Markdown。`);
    if (!text) return undefined;

    try {
      return JSON.parse(this.extractJson(text)) as T;
    } catch {
      return undefined;
    }
  }

  private async generateTextWithLanguageModel(prompt: string): Promise<string | undefined> {
    const model = await this.modelManager.getEnabledModel('language');
    if (!model) return undefined;

    try {
      if (model.provider === 'claude') {
        const response = await fetch(buildApiUrl(model.baseUrl, '/messages'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': model.apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: model.model,
            max_tokens: 1600,
            messages: [{ role: 'user', content: prompt }]
          })
        });
        if (!response.ok) return undefined;
        const data = (await response.json()) as { content?: Array<{ text?: string }> };
        return data.content?.map((item) => item.text ?? '').join('').trim() || undefined;
      }

      for (const baseUrl of buildOpenAiCompatibleBaseUrls(model.baseUrl)) {
        const response = await fetch(buildApiUrl(baseUrl, '/chat/completions'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${model.apiKey}`
          },
          body: JSON.stringify({
            model: model.model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.8
          })
        });
        if (!response.ok) continue;
        try {
          const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const content = data.choices?.[0]?.message?.content?.trim();
          if (content) return content;
        } catch {
          continue;
        }
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  private extractJson(text: string): string {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/u);
    return (fenced?.[1] ?? text).trim();
  }
}
