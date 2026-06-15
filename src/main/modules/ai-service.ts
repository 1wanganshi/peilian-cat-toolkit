import type {
  ArticlePackage,
  ArticleContentType,
  HotContent,
  MomentsGenerateTextResult,
  MomentsImageResult,
  MomentsRewriteResult,
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

  async generateScript(topic: VideoTopic, duration: number, requirements?: string): Promise<VideoScript> {
    const generated = await this.generateJsonWithLanguageModel<VideoScript>(
      await this.promptService.buildPrompt('video-script-generate', { topic, duration, requirements })
    );
    if (generated) return generated;

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
          content: `拆解选题核心：${topic.reason} 结合一个生活化例子讲清楚问题。`,
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

  async generateArticle(topic: string, searchResults: HotContent[] = []): Promise<ArticlePackage> {
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
          body: '少走弯路，从每天能做到的小方法开始。',
          visualPrompt: this.verticalCardPrompt(topic, '封面图，温暖亲子英语启蒙氛围，大标题清晰')
        },
        {
          index: 2,
          type: 'content',
          title: '先听懂，再开口',
          subtitle: '输入比催孩子说更重要',
          body: '每天固定 10-15 分钟听英文故事，让孩子先熟悉声音和节奏。',
          visualPrompt: this.verticalCardPrompt(topic, '家长和孩子一起听英文故事，浅色卡片排版')
        },
        {
          index: 3,
          type: 'content',
          title: '选孩子听得懂的材料',
          subtitle: '难度太高会降低兴趣',
          body: '绘本、儿歌、动画片段都可以，关键是重复、轻松、有画面。',
          visualPrompt: this.verticalCardPrompt(topic, '英语绘本和儿童学习场景，信息清晰适合收藏')
        },
        {
          index: 4,
          type: 'content',
          title: '不要一上来背单词',
          subtitle: '英语启蒙不是考试训练',
          body: '先建立语感和兴趣，再慢慢加入词汇和表达。',
          visualPrompt: this.verticalCardPrompt(topic, '避坑提示卡片，亲子教育风，浅色背景')
        },
        {
          index: 5,
          type: 'content',
          title: '亲子互动要简单',
          subtitle: '一句英文也能开始',
          body: 'Good job、Try again、What is this，用生活场景自然重复。',
          visualPrompt: this.verticalCardPrompt(topic, '家长与孩子日常英语互动，卡片式排版')
        },
        {
          index: 6,
          type: 'summary',
          title: '收藏这份启蒙清单',
          subtitle: '每天一点点，坚持更重要',
          body: '听故事、看绘本、做互动，比一次学很多更有效。',
          visualPrompt: this.verticalCardPrompt(topic, '总结页，引导收藏，温暖浅色亲子教育风')
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
      .map((item) => `${item.platform}: ${item.title}，点赞 ${item.likes}，评论 ${item.comments}`)
      .join('\n');
  }

  private inferArticleContentType(topic: string): ArticleContentType {
    if (/坑|误区|错|避坑/u.test(topic)) return 'mistakes';
    if (/对比|区别|做对|做错/u.test(topic)) return 'comparison';
    if (/推荐|绘本|故事|清单/u.test(topic)) return 'recommendation';
    if (/方法|怎么|如何/u.test(topic)) return 'tips';
    return 'list';
  }

  private verticalCardPrompt(topic: string, detail: string): string {
    return `适合抖音图文发布的手机竖屏亲子教育卡片，主题：${topic}。${detail}。浅色背景，温暖亲子教育风，卡片式排版，大标题清晰，信息适合家长收藏，围绕儿童英语、英语启蒙、亲子学习，不要低质、杂乱、文字过多。`;
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
