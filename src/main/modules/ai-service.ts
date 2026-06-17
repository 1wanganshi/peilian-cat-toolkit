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
import { AuthService } from './auth-service';
import { ModelManager } from './model-manager';
import { PromptService } from './prompt-service';
import { RemoteConfigService } from './remote-config-service';

export const PEILIAN_MOMENT_IMAGE_SCENE_GUIDE = `陪练猫固定生图设定：
陪练猫是一款家庭英语启蒙互动设备，由白色便携主机和儿童话筒组成，连接电视、显示器或投影使用。孩子手持话筒，对着大屏里的 AI 老师、卡通角色、英语游戏和绘本内容进行跟读、对话、闯关和唱跳。画面风格要温馨、明亮、亲子友好，突出 AI 陪练、智能纠音、大屏护眼、游戏化学习和孩子主动开口说英语。

固定场景库：
1. 客厅大屏英语启蒙：孩子站在客厅电视或显示器前，手持陪练猫话筒，屏幕有卡通动物、英文单词和跟读提示，主机放在电视柜或桌面上。
2. AI 陪练一对一对话：孩子拿话筒和屏幕里的 AI 卡通老师英文对话，屏幕可有实时评分、星星奖励、语音波形和鼓励动画。
3. 英语单词闯关游戏：屏幕是闯关地图、金币、星星、卡通猫角色，孩子通过话筒说出 apple、banana、cat、dog 等单词通关。
4. 智能纠音练习：孩子对话筒读英文单词或句子，屏幕显示发音评分、正确音标、绿色对勾和 Great job，家长可微笑陪伴但不干预。
5. 亲子陪伴学习：晚上或周末，父母坐在沙发旁陪孩子使用陪练猫，孩子拿话筒跟读英文绘本，大屏显示绘本插画和英文句子。
6. 儿童房独立练习：孩子在儿童房独立使用陪练猫，主机连接小显示器或投影，桌上有绘本、积木、学习卡片。
7. 情景英语角色扮演：屏幕出现超市、动物园、餐厅或机场场景，孩子拿话筒扮演顾客、游客或小店员说简单英文。
8. 唱跳儿歌英语启蒙：屏幕播放英文儿歌动画，孩子拿话筒跟唱并跟着节奏摆动，画面活泼有音乐和卡通元素。
9. 晨间十分钟英语打卡：早晨阳光洒进客厅，孩子穿居家服或校服拿话筒完成每日英语打卡，屏幕有连续打卡、今日任务和徽章。
10. 多孩子互动比赛：两个孩子轮流拿话筒对着大屏英语抢答或单词 PK，屏幕有分数、排行榜和奖励动画。
11. 护眼大屏学习：孩子与屏幕保持安全距离，坐姿自然，手持话筒跟读，突出大屏、柔和光线、没有近距离盯手机或平板。
12. 产品特写使用场景：前景展示陪练猫白色主机、话筒和连接显示器的组合，背景虚化显示孩子正在大屏前英语互动。`;

export class AiService {
  private readonly modelManager = new ModelManager();
  private readonly promptService = new PromptService();
  private readonly remoteConfigService = new RemoteConfigService();
  private readonly authService = new AuthService(undefined, this.remoteConfigService);

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

    throw new Error('短视频脚本没有调用到可用大模型，请在“更新及授权”的“高级设置：模型管理”中启用文字大模型，或检查“王安实自用私密模型”后台配置。');
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
      hook: this.richTextValue(value.hook) || body[0]?.content.slice(0, 80) || topic.title,
      body,
      ending: this.richTextValue(value.ending),
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

  private richTextValue(value: unknown): string {
    const direct = this.textValue(value);
    if (direct) return direct;
    if (!value || typeof value !== 'object') return '';
    const record = value as Record<string, unknown>;
    return this.textValue(record.content) ||
      this.textValue(record.text) ||
      this.textValue(record.value) ||
      this.textValue(record.message) ||
      '';
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
    const prompt = await this.promptService.buildPrompt('moments-generate', { idea, style });
    const generatedText = await this.generateTextWithLanguageModel(
      this.withMomentGenerateRuntimeRequest(prompt, idea)
    );
    const generated = generatedText ? this.normalizeMomentGenerateResponse(generatedText, idea, style) : undefined;
    if (generated?.results?.length) {
      return generated;
    }

    throw new Error('AI 没有返回可用的朋友圈文案，请检查语言模型配置或后台“朋友圈生成”提示词输出格式。');
  }

  private withMomentGenerateRuntimeRequest(prompt: string, idea: string): string {
    return `${prompt}

---
APP 本次固定执行要求：
用户输入：${idea.trim()}
本次必须一次生成 3 条可选朋友圈文案。
每条都必须是完整的「标题 + 正文三段」，正文三段之间空一行。
每条文案之间只用一条横线 --- 隔开。
即使用户只输入一句简单内容，也不要追问、不要让用户补充细节；请基于合理、真实、不过度编造的生活细节直接展开。
只输出这 3 条最终文案，不输出 JSON、编号、解释、分析或创作思路。`;
  }

  private normalizeMomentGenerateResponse(
    text: string,
    idea: string,
    style: string
  ): MomentsGenerateTextResult | undefined {
    const trimmed = text.trim();
    if (!trimmed) return undefined;

    try {
      const parsed = JSON.parse(this.extractJson(trimmed)) as Partial<MomentsGenerateTextResult>;
      if (Array.isArray(parsed.results) && parsed.results.length > 0) {
        const results = parsed.results
          .map((item, index) => ({ index: index + 1, text: this.textValue((item as { text?: unknown })?.text) }))
          .filter((item) => item.text);
        if (results.length > 0) {
          return {
            type: 'generate',
            idea: this.textValue(parsed.idea) || idea,
            style: this.textValue(parsed.style) || style,
            results: results.slice(0, 3)
          };
        }
      }
    } catch {
      // Backend prompts may intentionally ask for copy-ready plain text instead of JSON.
    }

    const plainVersions = this.splitMomentPlainTextVersions(trimmed);
    if (plainVersions.length === 0) return undefined;

    return {
      type: 'generate',
      idea,
      style,
      results: plainVersions.slice(0, 3).map((item, index) => ({ index: index + 1, text: item }))
    };
  }

  private splitMomentPlainTextVersions(text: string): string[] {
    const normalized = text
      .replace(/\r\n/gu, '\n')
      .replace(/```(?:text|markdown)?/giu, '')
      .replace(/```/gu, '')
      .trim();
    if (!normalized) return [];

    const separated = normalized
      .split(/\n\s*(?:-{3,}|—{3,}|_{3,})\s*\n/gu)
      .map((item) => this.cleanMomentPlainText(item))
      .filter(Boolean);
    if (separated.length > 1) return separated;

    const labeled = normalized
      .split(/\n(?=(?:文案|版本|方案)\s*[一二三123]\s*[：:])/gu)
      .map((item) => this.cleanMomentPlainText(item))
      .filter(Boolean);
    if (labeled.length > 1) return labeled;

    return [this.cleanMomentPlainText(normalized)].filter(Boolean);
  }

  private cleanMomentPlainText(text: string): string {
    return text
      .replace(/^\s*(?:文案|版本|方案)\s*[一二三123]\s*[：:]\s*/u, '')
      .replace(/^\s*(?:以下是|这是).*?朋友圈文案[：:：]?\s*/u, '')
      .trim();
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
是否有参考图：${hasReferenceImage ? '是，包含固定陪练猫设备图，可能还包含用户上传图' : '否'}

${PEILIAN_MOMENT_IMAGE_SCENE_GUIDE}

要求：
1. 只输出 JSON。
2. imagePrompt 必须紧扣朋友圈文案本身，先理解文案情绪和事件，再从固定场景库里选择最贴合的 1 个陪练猫场景来生成。
3. 画面必须自然出现陪练猫白色便携主机和儿童话筒，孩子手持话筒与大屏互动；不要只生成普通生活氛围图。
4. 风格是微信朋友圈真实随手拍：自然光、手机拍摄感、家庭生活氛围、不过度摆拍、不过度修图、比例 1:1。
5. 如果有参考图，必须把固定陪练猫设备图作为核心参考，保留设备外观并让它自然出现在场景里；如果还有用户上传图，也要参考用户图里的主体特征、人物气质或场景元素。
6. 屏幕里可以有少量英文单词、分数、星星、语音波形或卡通学习 UI，但不要生成大段文字、广告标题、logo、水印、商业海报感、摆拍大片感、夸张滤镜、假脸感或杂乱构图。

格式：
{
  "type": "image",
  "selectedText": "用于生成配图的朋友圈文案",
  "hasReferenceImage": true,
  "imagePrompt": "最终用于 image2 的图片生成提示词，必须写明选用的陪练猫固定场景、孩子拿话筒、大屏互动、主机位置和朋友圈真实随手拍风格"
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
        ? `${PEILIAN_MOMENT_IMAGE_SCENE_GUIDE}\n\n根据朋友圈文案“${selectedText}”选择最贴合的 1 个固定场景生成微信朋友圈配图。固定参考图是陪练猫设备图，必须保留白色便携主机和儿童话筒的核心外观，让孩子手持话筒与电视、显示器或投影大屏自然互动；如果同时提供用户上传参考图，也要参考用户图里的主体特征、人物气质或场景元素。手机随手拍风格，自然光，温馨家庭学习氛围，比例 1:1，可以有少量英文学习 UI，不要广告海报感，不要商业摄影感，不要 logo、水印或大段文字。`
        : `${PEILIAN_MOMENT_IMAGE_SCENE_GUIDE}\n\n根据朋友圈文案“${selectedText}”选择最贴合的 1 个固定场景生成微信朋友圈配图。画面必须出现陪练猫白色便携主机、儿童话筒、孩子手持话筒与大屏互动，突出英语启蒙、AI 陪练、智能纠音、大屏护眼或游戏化练习中的一个重点。手机随手拍风格，自然光，温馨家庭学习氛围，比例 1:1，可以有少量英文学习 UI，不要广告海报感，不要商业摄影感，不要 logo、水印或大段文字。`
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
    if (await this.modelManager.getUsageMode() === 'private') {
      const session = await this.authService.requireAuthorized();
      return this.remoteConfigService.generateTextWithPrivateModel(prompt, session.phone);
    }

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
