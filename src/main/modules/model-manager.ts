import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ModelCheckResult, ModelConfig, ModelConfigInput, ModelKind } from '../../shared/types';
import { buildApiUrl, buildOpenAiCompatibleBaseUrls } from './api-url';

const DEFAULT_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  claude: 'https://api.anthropic.com/v1',
  stability: 'https://api.stability.ai/v1',
  custom: ''
};

export class ModelManager {
  private readonly filePath: string;

  constructor(filePath = join(process.env.PEILIAN_CAT_USER_DATA ?? app.getPath('userData'), 'models.json')) {
    this.filePath = filePath;
  }

  async listModels(): Promise<ModelConfig[]> {
    return this.readModels();
  }

  async saveModel(input: ModelConfigInput): Promise<ModelConfig> {
    this.validateInput(input);
    const models = await this.readModels();
    const now = new Date().toISOString();
    const existingIndex = input.id ? models.findIndex((model) => model.id === input.id) : -1;
    const existing = existingIndex >= 0 ? models[existingIndex] : undefined;
    const model: ModelConfig = {
      id: existing?.id ?? crypto.randomUUID(),
      name: input.name.trim(),
      kind: input.kind,
      provider: input.provider,
      model: input.model.trim(),
      baseUrl: this.normalizeBaseUrl(input.baseUrl || DEFAULT_BASE_URLS[input.provider]),
      apiKey: input.apiKey.trim(),
      enabled: input.enabled,
      lastCheckedAt: existing?.lastCheckedAt,
      lastStatus: existing?.lastStatus,
      lastMessage: existing?.lastMessage,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    if (existingIndex >= 0) {
      models[existingIndex] = model;
    } else {
      models.unshift(model);
    }

    await this.writeModels(models);
    return model;
  }

  async deleteModel(id: string): Promise<void> {
    const models = await this.readModels();
    await this.writeModels(models.filter((model) => model.id !== id));
  }

  async checkModel(input: ModelConfigInput): Promise<ModelCheckResult> {
    this.validateInput(input);
    const checkedAt = new Date().toISOString();
    try {
      const result = await this.runProviderCheck(input);
      if (input.id) {
        await this.updateCheckState(input.id, result.ok, result.message, checkedAt);
      }
      return { ...result, checkedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : '模型检测失败';
      if (input.id) {
        await this.updateCheckState(input.id, false, message, checkedAt);
      }
      return { ok: false, message, checkedAt };
    }
  }

  async getEnabledModel(kind: ModelKind): Promise<ModelConfig | undefined> {
    const models = await this.readModels();
    return models.find((model) => model.kind === kind && model.enabled);
  }

  private async runProviderCheck(input: ModelConfigInput): Promise<Omit<ModelCheckResult, 'checkedAt'>> {
    const baseUrl = this.normalizeBaseUrl(input.baseUrl || DEFAULT_BASE_URLS[input.provider]);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      if (input.provider === 'openai') {
        return await this.checkOpenAiModel(baseUrl, input.apiKey, input.model, controller.signal);
      }

      if (input.provider === 'custom') {
        if (input.kind === 'image') {
          return await this.checkOpenAiCompatibleImage(baseUrl, input.apiKey, input.model, controller.signal);
        }
        return await this.checkOpenAiCompatible(baseUrl, input.apiKey, input.model, controller.signal);
      }

      if (input.provider === 'claude') {
        return await this.checkClaude(baseUrl, input.apiKey, input.model, controller.signal);
      }

      return await this.checkStability(baseUrl, input.apiKey, controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async checkOpenAiCompatible(
    baseUrl: string,
    apiKey: string,
    model: string,
    signal: AbortSignal
  ): Promise<Omit<ModelCheckResult, 'checkedAt'>> {
    let lastResult: Omit<ModelCheckResult, 'checkedAt'> | undefined;
    for (const candidateBaseUrl of buildOpenAiCompatibleBaseUrls(baseUrl)) {
      const response = await fetch(buildApiUrl(candidateBaseUrl, '/chat/completions'), {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 8
        })
      });
      lastResult = await this.toCheckResult(response, '语言模型连接成功');
      if (lastResult.ok) return lastResult;
    }

    return lastResult ?? { ok: false, message: '检测失败：Base URL 为空' };
  }

  private async checkOpenAiCompatibleImage(
    baseUrl: string,
    apiKey: string,
    model: string,
    signal: AbortSignal
  ): Promise<Omit<ModelCheckResult, 'checkedAt'>> {
    let lastResult: Omit<ModelCheckResult, 'checkedAt'> | undefined;
    for (const candidateBaseUrl of buildOpenAiCompatibleBaseUrls(baseUrl)) {
      const response = await fetch(buildApiUrl(candidateBaseUrl, '/images/generations'), {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          prompt: 'test',
          size: '768x1344',
          n: 1
        })
      });
      lastResult = await this.toCheckResult(response, '生图模型连接成功');
      if (lastResult.ok) return lastResult;
    }

    return lastResult ?? { ok: false, message: '检测失败：Base URL 为空' };
  }

  private async checkOpenAiModel(
    baseUrl: string,
    apiKey: string,
    model: string,
    signal: AbortSignal
  ): Promise<Omit<ModelCheckResult, 'checkedAt'>> {
    let lastResult: Omit<ModelCheckResult, 'checkedAt'> | undefined;
    for (const candidateBaseUrl of buildOpenAiCompatibleBaseUrls(baseUrl)) {
      const response = await fetch(buildApiUrl(candidateBaseUrl, `/models/${encodeURIComponent(model)}`), {
        method: 'GET',
        signal,
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      });
      lastResult = await this.toCheckResult(response, 'OpenAI 模型连接成功');
      if (lastResult.ok) return lastResult;
    }

    return lastResult ?? { ok: false, message: '检测失败：Base URL 为空' };
  }

  private async checkClaude(
    baseUrl: string,
    apiKey: string,
    model: string,
    signal: AbortSignal
  ): Promise<Omit<ModelCheckResult, 'checkedAt'>> {
    const response = await fetch(buildApiUrl(baseUrl, '/messages'), {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'ping' }]
      })
    });

    return this.toCheckResult(response, 'Claude 语言模型连接成功');
  }

  private async checkStability(
    baseUrl: string,
    apiKey: string,
    signal: AbortSignal
  ): Promise<Omit<ModelCheckResult, 'checkedAt'>> {
    const response = await fetch(buildApiUrl(baseUrl, '/user/account'), {
      method: 'GET',
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    });

    return this.toCheckResult(response, '生图模型连接成功');
  }

  private async toCheckResult(response: Response, successMessage: string): Promise<Omit<ModelCheckResult, 'checkedAt'>> {
    const body = await response.text();
    if (response.ok) {
      if (this.looksLikeHtml(body)) {
        return { ok: false, message: '检测失败：接口返回 HTML 页面，不是模型 API JSON 响应' };
      }
      return { ok: true, message: successMessage };
    }

    return {
      ok: false,
      message: `检测失败：HTTP ${response.status}${body ? `，${body.slice(0, 160)}` : ''}`
    };
  }

  private looksLikeHtml(body: string): boolean {
    return /^\s*<!doctype html|^\s*<html[\s>]/iu.test(body);
  }

  private async updateCheckState(id: string, ok: boolean, message: string, checkedAt: string): Promise<void> {
    const models = await this.readModels();
    const index = models.findIndex((model) => model.id === id);
    if (index < 0) return;

    models[index] = {
      ...models[index],
      lastCheckedAt: checkedAt,
      lastStatus: ok ? 'success' : 'failed',
      lastMessage: message,
      updatedAt: new Date().toISOString()
    };
    await this.writeModels(models);
  }

  private validateInput(input: ModelConfigInput): void {
    if (!input.name.trim()) throw new Error('请输入模型名称');
    if (!input.model.trim()) throw new Error('请输入模型 ID');
    if (!input.apiKey.trim()) throw new Error('请输入 API Key');
    if (!input.baseUrl.trim() && input.provider === 'custom') throw new Error('自定义模型需要填写 Base URL');
  }

  private async readModels(): Promise<ModelConfig[]> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return JSON.parse(raw.replace(/^\uFEFF/u, '')) as ModelConfig[];
    } catch {
      return [];
    }
  }

  private async writeModels(models: ModelConfig[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(models, null, 2), 'utf8');
  }

  private normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.trim().replace(/\/+$/u, '');
  }
}
