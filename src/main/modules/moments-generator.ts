import type {
  MomentPlan,
  MomentsGenerateTextResult,
  MomentsImageResult,
  MomentsRewriteResult,
  TodayMomentSuggestionResult
} from '../../shared/types';
import { AiService } from './ai-service';
import { ImageService } from './image-service';
import { RemoteConfigService } from './remote-config-service';

export class MomentsGenerator {
  private readonly aiService = new AiService();
  private readonly imageService = new ImageService();
  private readonly remoteConfigService = new RemoteConfigService();

  async rewriteMoments(originalText: string, style: string): Promise<MomentsRewriteResult> {
    if (!originalText.trim()) {
      throw new Error('请输入要改写的朋友圈内容');
    }

    return this.aiService.rewriteMoments(originalText, style);
  }

  async generateTexts(idea: string, style: string): Promise<MomentsGenerateTextResult> {
    if (!idea.trim()) {
      throw new Error('请输入你的朋友圈想法');
    }

    return this.aiService.generateMomentTexts(idea, style);
  }

  async generateImage(
    selectedText: string,
    referenceImage?: string,
    referenceImageName?: string
  ): Promise<MomentsImageResult> {
    if (!selectedText.trim()) {
      throw new Error('请先选择一条朋友圈文案再生成配图');
    }

    const hasReferenceImage = Boolean(referenceImage);
    const prompt = await this.aiService.buildMomentImagePrompt(selectedText, hasReferenceImage);
    const image = await this.imageService.generateIllustrationBase64(
      '朋友圈配图',
      referenceImageName ? `${prompt.imagePrompt}\n参考图文件：${referenceImageName}` : prompt.imagePrompt,
      referenceImage
    );

    if (!image) {
      throw new Error('图片生成失败，请重新生成');
    }

    return {
      type: 'image',
      selectedText,
      hasReferenceImage,
      imagePrompt: prompt.imagePrompt,
      imageUrl: image
    };
  }

  async generateWithImage(
    idea: string,
    style: string,
    referenceImage?: string,
    referenceImageName?: string
  ): Promise<MomentsImageResult & { text: string; image: string }> {
    const texts = await this.generateTexts(idea, style);
    const selectedText = texts.results[0]?.text ?? idea;
    const image = await this.generateImage(selectedText, referenceImage, referenceImageName);
    return { ...image, text: selectedText, image: image.imageUrl };
  }

  async getTodayPlan(): Promise<MomentPlan[]> {
    const plans = await this.remoteConfigService.getTodayMomentPlan();
    if (!plans.some((plan) => plan.rawContent.trim())) {
      throw new Error('今天暂未配置朋友圈内容，请联系管理员。');
    }
    return plans;
  }

  async generateTodaySuggestion(): Promise<TodayMomentSuggestionResult> {
    const plans = await this.getTodayPlan();
    const entries = await Promise.all(plans.map(async (plan) => {
      const { rewriteContent } = await this.aiService.generateTodayMomentSuggestion(plan.rawContent);
      return {
        id: plan.id,
        rawContent: plan.rawContent,
        rewriteContent,
        materials: plan.materials
      };
    }));
    const first = entries[0];
    return {
      date: plans[0]?.date ?? this.todayDateString(),
      rawContent: first?.rawContent ?? '',
      rewriteContent: first?.rewriteContent ?? '',
      materials: entries.flatMap((entry) => entry.materials),
      entries
    };
  }

  private todayDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
