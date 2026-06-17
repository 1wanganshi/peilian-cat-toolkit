import { ModelManager } from './model-manager';
import { PromptService } from './prompt-service';
import { buildApiUrl, buildOpenAiCompatibleBaseUrls } from './api-url';

export interface ImageReference {
  name: string;
  base64: string;
}

export class ImageService {
  private readonly modelManager = new ModelManager();
  private readonly promptService = new PromptService();

  async generateIllustrationBase64(
    title: string,
    description: string,
    referenceImages: ImageReference[] = []
  ): Promise<string> {
    const generated = await this.generateWithConfiguredModel(title, description, referenceImages);
    if (generated) return generated;

    const configuredModel = await this.modelManager.getEnabledModel('image');
    if (configuredModel) {
      throw new Error('image2 生图失败，请检查作图模型接口或稍后重试');
    }

    const safeTitle = this.escapeXml(title).slice(0, 22);
    const safeDescription = this.wrapSvgText(this.escapeXml(description).slice(0, 72), 24);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff8e7"/><stop offset="1" stop-color="#dff3ee"/></linearGradient>
<filter id="shadow"><feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#31514a" flood-opacity=".16"/></filter>
</defs>
<rect width="1080" height="1920" fill="url(#bg)"/>
<circle cx="860" cy="250" r="118" fill="#f6b560" opacity=".62"/>
<circle cx="176" cy="1660" r="160" fill="#7bc6b6" opacity=".48"/>
<rect x="90" y="220" width="900" height="1480" rx="36" fill="#fffdf7" filter="url(#shadow)"/>
<rect x="150" y="320" width="780" height="86" rx="43" fill="#dff3ee"/>
<text x="540" y="377" text-anchor="middle" font-family="Microsoft YaHei, Arial, sans-serif" font-size="34" font-weight="700" fill="#1f6658">少儿英语启蒙</text>
<path d="M286 650c34-86 116-134 214-98 60 22 98 78 128 142 44-66 118-98 194-68 104 42 124 176 38 258-66 64-160 100-258 138-108-42-210-86-276-154-56-58-68-144-40-218z" fill="#f47f6b" opacity=".9"/>
<circle cx="440" cy="630" r="24" fill="#2f3a3a"/>
<circle cx="762" cy="700" r="24" fill="#2f3a3a"/>
<path d="M488 830c66 54 160 58 240 10" fill="none" stroke="#2f3a3a" stroke-width="22" stroke-linecap="round"/>
<text x="540" y="1140" text-anchor="middle" font-family="Microsoft YaHei, Arial, sans-serif" font-size="58" font-weight="800" fill="#263332">${safeTitle}</text>
<text x="540" y="1240" text-anchor="middle" font-family="Microsoft YaHei, Arial, sans-serif" font-size="30" fill="#60706d">${safeDescription}</text>
<rect x="210" y="1460" width="660" height="82" rx="41" fill="#2f7d6d"/>
<text x="540" y="1514" text-anchor="middle" font-family="Microsoft YaHei, Arial, sans-serif" font-size="30" font-weight="700" fill="#ffffff">收藏起来照着做</text>
</svg>`;
    return Buffer.from(svg).toString('base64');
  }

  private async generateWithConfiguredModel(
    title: string,
    description: string,
    referenceImages: ImageReference[] = []
  ): Promise<string | undefined> {
    const model = await this.modelManager.getEnabledModel('image');
    if (!model || model.provider === 'stability') return undefined;

    let lastError = '';
    const isMomentImage = title.trim() === '朋友圈配图';
    const size = isMomentImage ? '1024x1024' : '768x1344';
    try {
      for (const baseUrl of buildOpenAiCompatibleBaseUrls(model.baseUrl)) {
        for (const prompt of await this.buildImagePrompts(title, description, isMomentImage)) {
          if (referenceImages.length > 0) {
            const edited = await this.generateImageEdit(baseUrl, model.apiKey, model.model, prompt, referenceImages, size);
            if (edited.image) return edited.image;
            lastError = edited.error || lastError;
          }

          const response = await fetch(buildApiUrl(baseUrl, '/images/generations'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${model.apiKey}`
            },
            body: JSON.stringify({
              model: model.model,
              prompt,
              size,
              n: 1
            })
          });
          if (!response.ok) {
            lastError = `HTTP ${response.status}: ${(await response.text()).slice(0, 180)}`;
            continue;
          }
          try {
            const data = (await response.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
            if (data.data?.[0]?.b64_json) return data.data[0].b64_json;
            if (data.data?.[0]?.url) return this.downloadImageAsBase64(data.data[0].url);
          } catch {
            lastError = '图片接口返回内容不是有效 JSON';
            continue;
          }
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : '图片接口请求失败';
    }

    if (lastError) {
      throw new Error(`image2 生图失败：${lastError}`);
    }
    return undefined;
  }

  private async generateImageEdit(
    baseUrl: string,
    apiKey: string,
    model: string,
    prompt: string,
    referenceImages: ImageReference[],
    size: string
  ): Promise<{ image?: string; error?: string }> {
    try {
      const formData = new FormData();
      formData.append('model', model);
      formData.append('prompt', prompt);
      formData.append('size', size);
      formData.append('n', '1');
      referenceImages.forEach((referenceImage, index) => {
        formData.append(
          'image',
          this.base64ToBlob(referenceImage.base64),
          referenceImage.name || `reference-${index + 1}.png`
        );
      });

      const response = await fetch(buildApiUrl(baseUrl, '/images/edits'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`
        },
        body: formData
      });
      if (!response.ok) {
        return { error: `HTTP ${response.status}: ${(await response.text()).slice(0, 180)}` };
      }
      const data = (await response.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
      if (data.data?.[0]?.b64_json) return { image: data.data[0].b64_json };
      if (data.data?.[0]?.url) return { image: await this.downloadImageAsBase64(data.data[0].url) };
      return { error: '图片编辑接口没有返回图片数据' };
    } catch (error) {
      return { error: error instanceof Error ? error.message : '图片编辑接口请求失败' };
    }
  }

  private base64ToBlob(base64Image: string): Blob {
    const buffer = Buffer.from(base64Image.replace(/^data:image\/[a-z0-9.+-]+;base64,/iu, ''), 'base64');
    return new Blob([buffer], { type: this.inferMimeType(buffer) });
  }

  private inferMimeType(buffer: Buffer): string {
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return 'image/png';
    }
    if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
    if (buffer.subarray(0, 4).toString('ascii') === 'RIFF') return 'image/webp';
    return 'image/png';
  }

  private async downloadImageAsBase64(url: string): Promise<string | undefined> {
    try {
      const response = await fetch(url);
      if (!response.ok) return undefined;
      const buffer = Buffer.from(await response.arrayBuffer());
      return buffer.toString('base64');
    } catch {
      return undefined;
    }
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private wrapSvgText(value: string, maxChars: number): string {
    const rows = value.match(new RegExp(`.{1,${maxChars}}`, 'gu'))?.slice(0, 3) ?? [];
    return rows
      .map((row, index) => `<tspan x="540" dy="${index === 0 ? 0 : 44}">${row}</tspan>`)
      .join('');
  }

  private async buildImagePrompts(title: string, description: string, isMomentImage = false): Promise<string[]> {
    if (isMomentImage) {
      const momentPrompt = this.compactPrompt(description, 900);
      return [
        momentPrompt,
        `${momentPrompt} 微信朋友圈真实随手拍照片，手机拍摄感，自然光，1:1 square photo, child holding microphone, large screen English learning interaction, Peilian Cat device visible, small English learning UI allowed on screen, no ad text, no logo, no watermark, no poster.`,
        `Realistic WeChat Moments square lifestyle photo based on this post: ${this.compactPrompt(description, 360)} Child holding a microphone, interacting with a large TV or monitor for English learning, Peilian Cat white device visible, warm family home, candid phone snapshot, small screen UI allowed, no logo, no watermark, no ad poster.`
      ];
    }

    const fullPrompt = await this.promptService.buildPrompt('image-generate', { title, description });
    const shortTitle = title.replace(/\s+/gu, ' ').slice(0, 40);
    return [
      this.compactPrompt(fullPrompt, 520),
      `Vertical Douyin educational card. Title: ${shortTitle}. Light background. Clean card layout. Large clear headline. Warm parent-child English learning theme. 9:16. No watermark, no logo.`,
      `Vertical card. ${shortTitle}. English learning for kids. Light background. Clean layout. No watermark.`
    ];
  }

  private compactPrompt(prompt: string, maxLength: number): string {
    return prompt.replace(/\s+/gu, ' ').slice(0, maxLength);
  }
}
