import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import type { HistoryCreateInput, HistoryItem, HistoryQuery } from '../../shared/types';

const MAX_HISTORY_ITEMS = 300;

export class HistoryService {
  private readonly filePath: string;

  constructor(filePath = join(process.env.PEILIAN_CAT_USER_DATA ?? app.getPath('userData'), 'history.json')) {
    this.filePath = filePath;
  }

  async listHistory(query: HistoryQuery = {}): Promise<HistoryItem[]> {
    const keyword = query.keyword?.trim().toLowerCase();
    const limit = Math.max(1, Math.min(Number(query.limit) || MAX_HISTORY_ITEMS, MAX_HISTORY_ITEMS));
    const items = await this.readHistory();

    return items
      .filter((item) => !query.type || query.type === 'all' || item.type === query.type)
      .filter((item) => {
        if (!keyword) return true;
        return `${item.title}\n${item.summary}\n${this.stringify(item.content)}`.toLowerCase().includes(keyword);
      })
      .slice(0, limit);
  }

  async saveHistory(input: HistoryCreateInput): Promise<HistoryItem> {
    const now = new Date().toISOString();
    const item: HistoryItem = {
      id: randomUUID(),
      type: input.type,
      title: this.clean(input.title, '未命名内容', 80),
      summary: this.clean(input.summary ?? this.summarize(input.content), '', 180),
      content: input.content,
      createdAt: now
    };

    const items = await this.readHistory();
    const nextItems = [item, ...items].slice(0, MAX_HISTORY_ITEMS);
    await this.writeHistory(nextItems);
    return item;
  }

  async deleteHistory(id: string): Promise<void> {
    const items = await this.readHistory();
    await this.writeHistory(items.filter((item) => item.id !== id));
  }

  async clearHistory(): Promise<void> {
    await this.writeHistory([]);
  }

  private async readHistory(): Promise<HistoryItem[]> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw.replace(/^\uFEFF/u, '')) as HistoryItem[];
      return Array.isArray(parsed) ? parsed.filter((item) => item?.id && item?.createdAt) : [];
    } catch {
      return [];
    }
  }

  private async writeHistory(items: HistoryItem[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(items, null, 2), 'utf8');
  }

  private summarize(content: unknown): string {
    if (typeof content === 'string') return content;
    if (!content || typeof content !== 'object') return String(content ?? '');

    const value = content as Record<string, unknown>;
    const result = value.result as Record<string, unknown> | undefined;
    const publishContent = result?.publishContent as Record<string, unknown> | undefined;
    const firstText = Array.isArray(result?.results)
      ? (result.results[0] as Record<string, unknown> | undefined)?.text
      : undefined;

    return this.stringify(firstText ?? result?.hook ?? result?.rewriteContent ?? publishContent?.body ?? result?.imagePrompt ?? content);
  }

  private stringify(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value == null) return '';
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '';
    }
  }

  private clean(value: string, fallback: string, maxLength: number): string {
    const trimmed = value.replace(/\s+/gu, ' ').trim();
    if (!trimmed) return fallback;
    return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
  }
}
