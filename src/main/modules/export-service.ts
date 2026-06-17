import { app, dialog } from 'electron';
import JSZip from 'jszip';
import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ArticlePackage, ExportResult, VideoScript } from '../../shared/types';

export class ExportService {
  async exportScript(script: VideoScript, format: 'txt' | 'md' | 'pdf'): Promise<ExportResult> {
    const filePath = await this.pickSavePath(`${script.title}.${format}`, format);
    if (!filePath) throw new Error('已取消导出');

    if (format === 'pdf') {
      await writeFile(filePath, await this.createScriptPdf(script));
    } else {
      await writeFile(filePath, format === 'md' ? this.scriptToMarkdown(script) : this.scriptToText(script), 'utf8');
    }

    return { filePath };
  }

  async downloadImage(base64Image: string, fileName = 'peilian-cat-image.png'): Promise<ExportResult> {
    const extension = this.inferImageExtension(base64Image);
    const filePath = await this.pickSavePath(this.withExtension(fileName, extension), extension);
    if (!filePath) throw new Error('已取消保存');

    await writeFile(filePath, Buffer.from(base64Image, 'base64'));
    return { filePath };
  }

  async exportArticlePackage(article: ArticlePackage): Promise<ExportResult> {
    const filePath = await this.pickSavePath(`${article.publishContent.title}.zip`, 'zip');
    if (!filePath) throw new Error('已取消导出');

    const zip = new JSZip();
    zip.file('发布内容.txt', this.articlePublishText(article));
    zip.file('图文脚本.md', this.articleToMarkdown(article));
    article.images.forEach((image, index) => {
      if (!image) return;
      zip.file(`images/card-${index + 1}.${this.inferImageExtension(image)}`, Buffer.from(image, 'base64'));
    });
    const content = await zip.generateAsync({ type: 'nodebuffer' });
    await writeFile(filePath, content);
    return { filePath };
  }

  async exportArticleText(article: ArticlePackage): Promise<ExportResult> {
    const filePath = await this.pickSavePath(`${article.publishContent.title}.txt`, 'txt');
    if (!filePath) throw new Error('已取消导出');
    await writeFile(filePath, this.articlePublishText(article), 'utf8');
    return { filePath };
  }

  private async pickSavePath(defaultName: string, extension: string): Promise<string | undefined> {
    const outputDir = join(app.getPath('documents'), '陪练猫工具包');
    await mkdir(outputDir, { recursive: true });
    const result = await dialog.showSaveDialog({
      defaultPath: join(outputDir, this.sanitizeFileName(defaultName)),
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }]
    });

    return result.canceled ? undefined : result.filePath;
  }

  private scriptToMarkdown(script: VideoScript): string {
    const scenes = script.body
      .map((scene) => scene.content)
      .filter(Boolean)
      .join('\n\n');

    return [script.title ? `# ${script.title}` : '', script.hook, scenes, script.ending, script.hashtags.join(' ')]
      .filter(Boolean)
      .join('\n\n');
  }

  private scriptToText(script: VideoScript): string {
    return this.scriptToMarkdown(script).replace(/^#+\s/gm, '');
  }

  private articleToMarkdown(article: ArticlePackage): string {
    const cards = article.cards
      .map(
        (card) =>
          `## 第 ${card.index} 张：${card.title}\n\n类型：${card.type}\n\n副标题：${card.subtitle}\n\n正文：${card.body}\n\n图片提示词：${card.visualPrompt}`
      )
      .join('\n\n');

    return `# ${article.topic}\n\n内容类型：${article.contentType}\n\n## 搜索摘要\n\n${article.searchSummary}\n\n${cards}\n\n## 发布内容\n\n${this.articlePublishText(article)}`;
  }

  private articlePublishText(article: ArticlePackage): string {
    return `标题：${article.publishContent.title}\n\n正文：\n${article.publishContent.body}\n\n话题：\n${article.publishContent.hashtags.join(' ')}`;
  }

  private async createScriptPdf(script: VideoScript): Promise<Buffer> {
    return new Promise((resolve) => {
      const doc = new PDFDocument({ margin: 56 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      const fontPath = this.findChineseFont();
      if (fontPath) doc.font(fontPath);
      doc.fontSize(20).text(script.title);
      doc.moveDown().fontSize(12).text(this.scriptToText(script));
      doc.end();
    });
  }

  private findChineseFont(): string | undefined {
    const candidates = [
      'C:\\Windows\\Fonts\\msyh.ttc',
      'C:\\Windows\\Fonts\\simhei.ttf',
      '/System/Library/Fonts/PingFang.ttc',
      '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
      '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
    ];

    return candidates.find((fontPath) => existsSync(fontPath));
  }

  private inferImageExtension(base64Image: string): 'png' | 'svg' {
    const header = Buffer.from(base64Image.slice(0, 80), 'base64').toString('utf8');
    return header.trimStart().startsWith('<svg') ? 'svg' : 'png';
  }

  private withExtension(fileName: string, extension: string): string {
    return fileName.replace(/\.[a-z0-9]+$/iu, `.${extension}`);
  }

  private sanitizeFileName(fileName: string): string {
    return fileName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').slice(0, 120);
  }
}
