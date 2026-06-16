import type {
  ArticleCard,
  ArticleGenerationProgress,
  ArticleGenerationProgressStatus,
  ArticleImageFailure,
  ArticleImageResult,
  ArticlePackage
} from '../../shared/types';
import { AiService } from './ai-service';
import { ImageService } from './image-service';
import { SearchEngine } from './search-engine';

export class ArticlePublisher {
  private readonly aiService = new AiService();
  private readonly imageService = new ImageService();
  private readonly searchEngine = new SearchEngine();

  async generateArticle(
    topic: string,
    onProgress?: (progress: Omit<ArticleGenerationProgress, 'requestId' | 'createdAt'>) => void
  ): Promise<ArticlePackage> {
    const progress = (
      step: string,
      message: string,
      status: ArticleGenerationProgressStatus = 'running',
      detail?: string,
      data?: ArticleGenerationProgress['data']
    ): void => {
      onProgress?.({ step, message, status, detail, data });
    };

    if (!topic.trim()) {
      throw new Error('请输入选题');
    }

    progress('校验选题', `正在判断“${topic.trim()}”是否属于英语教育选题`);
    if (!this.isEnglishEducationTopic(topic)) {
      progress('校验选题', '选题不属于英语学习、少儿英语或英语启蒙方向', 'error');
      throw new Error('请重新输入英语学习、少儿英语、英语启蒙或儿童英语教育相关选题');
    }
    progress('校验选题', '选题有效，准备联网搜索资料', 'success');

    progress('联网搜索', '正在搜索家长关心的问题、收藏型干货和抖音图文参考');
    const searchResults = await this.searchEngine.searchHotContent(
      `${topic} 英语启蒙 少儿英语 儿童英语 家长 收藏 抖音图文`,
      ['douyin', 'xiaohongshu', 'zhihu', 'wechat']
    );
    progress(
      '联网搜索',
      `已获取 ${searchResults.length} 条真实搜索结果，开始整理给 AI`,
      'success',
      searchResults.slice(0, 8).map((item) => `${this.hostname(item.url)}｜${item.title}`).join('\n')
    );

    progress('生成脚本', 'AI 正在根据搜索结果生成结构化 JSON 图文脚本');
    const article = await this.aiService.generateArticle(topic, searchResults, { requireModelResult: true });
    progress(
      '生成脚本',
      `AI 已生成 ${article.cards.length} 张卡片脚本，类型：${article.contentType}`,
      'success',
      article.cards.map((card) => `第 ${card.index} 张：${card.title}`).join('\n'),
      { article: { ...article, images: Array.from({ length: article.cards.length }, () => ''), failedImages: [] } }
    );

    progress('生成图片', `开始调用 image2 生成 ${article.cards.length} 张竖屏图文图片`);
    const generatedImages = await this.generateImagesWithLimit(article.cards, 2, progress);
    const images = generatedImages.map((item) => item.image);
    const failedImages = generatedImages
      .map((item) => item.failedImage)
      .filter((item): item is ArticleImageFailure => Boolean(item));

    if (failedImages.length > 0) {
      progress('生成图片', `${failedImages.length} 张图片生成失败，可在页面单张重试`, 'warning');
    } else {
      progress('生成图片', '全部图片已由 image2 生成完成', 'success');
    }
    progress('完成', '图文内容、图片和发布文案已全部准备好', failedImages.length > 0 ? 'warning' : 'success');

    return { ...article, images, failedImages };
  }

  async regenerateImage(card: ArticleCard): Promise<ArticleImageResult> {
    try {
      const image = await this.imageService.generateIllustrationBase64(card.title, card.visualPrompt);
      return { index: card.index, image };
    } catch (error) {
      return {
        index: card.index,
        image: '',
        failedImage: {
          index: card.index,
          message: error instanceof Error ? error.message : '图片生成失败'
        }
      };
    }
  }

  private async generateImagesWithLimit(
    cards: ArticleCard[],
    limit: number,
    onProgress?: (
      step: string,
      message: string,
      status?: ArticleGenerationProgressStatus,
      detail?: string,
      data?: ArticleGenerationProgress['data']
    ) => void
  ): Promise<ArticleImageResult[]> {
    const results: ArticleImageResult[] = [];
    for (let index = 0; index < cards.length; index += limit) {
      const batch = cards.slice(index, index + limit);
      batch.forEach((card) => {
        onProgress?.('生成图片', `image2 正在生成第 ${card.index} 张：${card.title}`);
      });
      const batchResults = await Promise.all(batch.map((card) => this.regenerateImage(card)));
      batchResults.forEach((result) => {
        if (result.failedImage) {
          onProgress?.('生成图片', `第 ${result.index} 张图片生成失败`, 'warning', result.failedImage.message, { imageResult: result });
        } else {
          onProgress?.('生成图片', `第 ${result.index} 张图片生成完成`, 'success', undefined, { imageResult: result });
        }
      });
      results.push(...batchResults);
    }
    return results;
  }

  private isEnglishEducationTopic(topic: string): boolean {
    return /英语|英文|少儿英语|儿童英语|英语启蒙|英语学习|绘本|phonics|自然拼读|单词|听力|口语|亲子英语|分级阅读|原版阅读|儿歌|英语故事/i.test(topic);
  }

  private hostname(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./u, '');
    } catch {
      return url;
    }
  }
}
