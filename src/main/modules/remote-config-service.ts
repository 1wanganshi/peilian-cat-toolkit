import type { MomentMaterial, MomentPlan, PromptConfigMeta, PromptTemplate, TodayMomentPlansResult } from '../../shared/types';
import { buildApiUrl } from './api-url';

export interface RemoteUpdateConfig {
  latestVersion: string;
  downloadUrl: string;
  releaseNotes: string;
  force: boolean;
  publishedAt?: string;
}

export interface RemoteAppConfig {
  prompts: PromptTemplate[];
  update: RemoteUpdateConfig;
  meta: PromptConfigMeta;
}

export interface UpdateCheckResult extends RemoteUpdateConfig {
  currentVersion: string;
  hasUpdate: boolean;
}

const DEFAULT_BACKEND_URL = 'https://peilianmao001.com';
const CACHE_TTL_MS = 3 * 60 * 1000;

export class RemoteConfigService {
  private cachedConfig?: RemoteAppConfig;
  private cachedAt = 0;

  async getConfig(forceRefresh = false): Promise<RemoteAppConfig | undefined> {
    if (!this.isEnabled()) return undefined;
    const now = Date.now();
    if (!forceRefresh && this.cachedConfig && now - this.cachedAt < CACHE_TTL_MS) {
      return this.cachedConfig;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(buildApiUrl(this.baseUrl(), '/api/config'), {
        method: 'GET',
        signal: controller.signal,
        headers: { accept: 'application/json' }
      });
      if (!response.ok) return undefined;
      const config = (await response.json()) as RemoteAppConfig;
      this.cachedConfig = this.normalizeConfig(config);
      this.cachedAt = now;
      return this.cachedConfig;
    } catch {
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  }

  async checkUpdate(currentVersion: string): Promise<UpdateCheckResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const url = new URL(buildApiUrl(this.baseUrl(), '/api/update/check'));
      url.searchParams.set('currentVersion', currentVersion);
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { accept: 'application/json' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as UpdateCheckResult;
    } finally {
      clearTimeout(timeout);
    }
  }

  async listRemotePrompts(): Promise<PromptTemplate[]> {
    const config = await this.getConfig(true);
    return config?.prompts ?? [];
  }

  async getPromptMeta(): Promise<PromptConfigMeta> {
    const config = await this.getConfig(true);
    return config?.meta ?? this.defaultMeta();
  }

  async getTodayMomentPlan(date = this.todayDateString()): Promise<MomentPlan[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const url = new URL(buildApiUrl(this.baseUrl(), '/api/moments/plans/today'));
      url.searchParams.set('date', date);
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { accept: 'application/json' }
      });
      if (response.status === 404) {
        throw new Error('今天暂未配置朋友圈内容，请联系管理员。');
      }
      if (!response.ok) {
        throw new Error(`读取今日朋友圈规划失败：HTTP ${response.status}`);
      }
      return this.normalizeTodayMomentPlans(await response.json(), date);
    } finally {
      clearTimeout(timeout);
    }
  }

  isEnabled(): boolean {
    return process.env.PEILIAN_REMOTE_CONFIG_DISABLED !== '1';
  }

  baseUrl(): string {
    return (process.env.PEILIAN_REMOTE_CONFIG_URL || DEFAULT_BACKEND_URL).trim().replace(/\/+$/u, '');
  }

  private normalizeConfig(config: RemoteAppConfig): RemoteAppConfig {
    return {
      prompts: Array.isArray(config.prompts) ? config.prompts : [],
      update: {
        latestVersion: config.update?.latestVersion || '0.1.1',
        downloadUrl: config.update?.downloadUrl || '',
        releaseNotes: config.update?.releaseNotes || '',
        force: Boolean(config.update?.force),
        publishedAt: config.update?.publishedAt
      },
      meta: this.normalizeMeta(config.meta)
    };
  }

  private normalizeMeta(meta?: Partial<PromptConfigMeta>): PromptConfigMeta {
    return {
      promptRevision: Number.isFinite(Number(meta?.promptRevision)) ? Number(meta?.promptRevision) : 0,
      promptsUpdatedAt: typeof meta?.promptsUpdatedAt === 'string' ? meta.promptsUpdatedAt : '',
      promptCount: Number.isFinite(Number(meta?.promptCount)) ? Number(meta?.promptCount) : 0
    };
  }

  private defaultMeta(): PromptConfigMeta {
    return {
      promptRevision: 0,
      promptsUpdatedAt: '',
      promptCount: 0
    };
  }

  private normalizeMomentPlan(input: unknown): MomentPlan {
    const value = input as Partial<MomentPlan>;
    const now = new Date().toISOString();
    return {
      id: typeof value.id === 'string' ? value.id : '',
      date: typeof value.date === 'string' ? value.date : this.todayDateString(),
      rawContent: typeof value.rawContent === 'string' ? value.rawContent : '',
      materials: Array.isArray(value.materials) ? value.materials.map((item) => this.normalizeMaterial(item)).filter(Boolean) : [],
      status: value.status === 'draft' || value.status === 'inactive' ? value.status : 'active',
      remark: typeof value.remark === 'string' ? value.remark : '',
      createdAt: typeof value.createdAt === 'string' ? value.createdAt : now,
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : now
    };
  }

  private normalizeTodayMomentPlans(input: unknown, date: string): MomentPlan[] {
    const value = input as Partial<TodayMomentPlansResult> | MomentPlan | MomentPlan[];
    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeMomentPlan(item)).filter((item) => item.rawContent.trim());
    }
    if (Array.isArray((value as Partial<TodayMomentPlansResult>)?.plans)) {
      return ((value as Partial<TodayMomentPlansResult>).plans ?? [])
        .map((item) => this.normalizeMomentPlan({ ...item, date: item.date || date }))
        .filter((item) => item.rawContent.trim());
    }
    const single = this.normalizeMomentPlan(value);
    return single.rawContent.trim() ? [single] : [];
  }

  private normalizeMaterial(input: unknown): MomentMaterial {
    const value = input as Partial<MomentMaterial>;
    const type = value.type === 'video' || value.type === 'file' ? value.type : 'image';
    return {
      id: typeof value.id === 'string' ? value.id : crypto.randomUUID(),
      name: typeof value.name === 'string' ? value.name : '朋友圈素材',
      type,
      url: typeof value.url === 'string' ? value.url : ''
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
