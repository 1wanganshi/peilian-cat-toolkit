import type { MomentsGenerateTextResult, MomentsImageResult, MomentsRewriteResult } from '../../shared/types';
import { AiService } from './ai-service';
import { ImageService } from './image-service';

export class MomentsGenerator {
  private readonly aiService = new AiService();
  private readonly imageService = new ImageService();

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
}
