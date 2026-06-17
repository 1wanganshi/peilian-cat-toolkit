import type {
  MomentPlan,
  MomentsGenerateTextResult,
  MomentsImageResult,
  MomentsRewriteResult,
  TodayMomentSuggestionItem,
  TodayMomentSuggestionResult
} from '../../shared/types';
import { app } from 'electron';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AiService, PEILIAN_MOMENT_IMAGE_SCENE_GUIDE } from './ai-service';
import type { ImageReference } from './image-service';
import { ImageService } from './image-service';
import { RemoteConfigService } from './remote-config-service';

export class MomentsGenerator {
  private readonly aiService = new AiService();
  private readonly imageService = new ImageService();
  private readonly remoteConfigService = new RemoteConfigService();
  private readonly todaySuggestionTimeoutMs = 35000;

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

    const references = await this.buildMomentImageReferences(referenceImage, referenceImageName);
    const hasReferenceImage = references.length > 0;
    const prompt = await this.aiService.buildMomentImagePrompt(selectedText, hasReferenceImage);
    const promptWithReferences = [
      PEILIAN_MOMENT_IMAGE_SCENE_GUIDE,
      prompt.imagePrompt,
      '固定参考图：陪练猫设备图，配图里必须自然体现白色便携主机、儿童话筒、孩子手持话筒与电视/显示器/投影大屏互动，不要做成硬广海报。',
      referenceImage ? `用户参考图：${referenceImageName || '用户上传图片'}，需要同时参考这张图的主体特征、场景或气质。` : ''
    ].filter(Boolean).join('\n');
    const image = await this.imageService.generateIllustrationBase64(
      '朋友圈配图',
      promptWithReferences,
      references
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

  private async buildMomentImageReferences(referenceImage?: string, referenceImageName?: string): Promise<ImageReference[]> {
    const references: ImageReference[] = [await this.loadDeviceReference()];
    if (referenceImage) {
      references.push({
        name: referenceImageName || 'user-reference.png',
        base64: referenceImage
      });
    }
    return references;
  }

  private async loadDeviceReference(): Promise<ImageReference> {
    const candidates = [
      join(app.getAppPath(), 'resources', 'peilian-device-reference.png'),
      join(process.resourcesPath || '', 'peilian-device-reference.png'),
      join(process.resourcesPath || '', 'resources', 'peilian-device-reference.png')
    ];
    const imagePath = candidates.find((candidate) => candidate && existsSync(candidate));
    if (!imagePath) {
      throw new Error('未找到固定陪练猫设备参考图，请检查 resources/peilian-device-reference.png');
    }
    const base64 = await readFile(imagePath, 'base64');
    return {
      name: 'peilian-device-reference.png',
      base64
    };
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
    const entries = await Promise.all(plans.map((plan) => this.generateTodaySuggestionEntry(plan)));
    const first = entries[0];
    const warnings = entries.map((entry) => entry.warning).filter((warning): warning is string => Boolean(warning));
    return {
      date: plans[0]?.date ?? this.todayDateString(),
      rawContent: first?.rawContent ?? '',
      rewriteContent: first?.rewriteContent ?? '',
      materials: entries.flatMap((entry) => entry.materials),
      entries,
      warnings
    };
  }

  private async generateTodaySuggestionEntry(plan: MomentPlan): Promise<TodayMomentSuggestionItem> {
    try {
      const { rewriteContent } = await this.withTimeout(
        this.aiService.generateTodayMomentSuggestion(plan.rawContent),
        this.todaySuggestionTimeoutMs
      );
      return {
        id: plan.id,
        rawContent: plan.rawContent,
        rewriteContent,
        materials: plan.materials
      };
    } catch (error) {
      return {
        id: plan.id,
        rawContent: plan.rawContent,
        rewriteContent: this.fallbackTodayRewrite(plan.rawContent),
        materials: plan.materials,
        warning: this.todaySuggestionWarning(error)
      };
    }
  }

  private async withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        task,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('AI 生成等待时间较长，已先返回后台原文整理版。')), timeoutMs);
        })
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private fallbackTodayRewrite(rawContent: string): string {
    const text = rawContent.trim();
    if (!text) return '今天这条朋友圈后台还没有填写文案，可以先使用配置好的素材。';
    return `${text}\n\n今天先把这段记录整理出来，真实一点发出去就很好。`;
  }

  private todaySuggestionWarning(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (/abort|timeout|timed out|aborted|超时|等待时间较长/iu.test(message)) {
      return 'AI 生成等待时间较长，已先返回后台原文整理版；可以稍后点“重新生成”。';
    }
    return 'AI 二创暂时没有成功，已先返回后台原文整理版；可以稍后点“重新生成”。';
  }

  private todayDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
