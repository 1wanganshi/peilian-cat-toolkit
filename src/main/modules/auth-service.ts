import { app } from 'electron';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AuthorizedUser, UserAuthSession, UserLoginResult } from '../../shared/types';
import { buildApiUrl } from './api-url';
import { RemoteConfigService } from './remote-config-service';

interface StoredAuthSession {
  phone: string;
  checkedAt: string;
}

interface UsageInput {
  module: string;
  action: string;
  summary?: string;
}

export class AuthService {
  private readonly filePath: string;
  private readonly remoteConfigService: RemoteConfigService;
  private readonly modelAdminPhones: Set<string>;

  constructor(
    filePath = join(process.env.PEILIAN_CAT_USER_DATA ?? app.getPath('userData'), 'auth-session.json'),
    remoteConfigService = new RemoteConfigService()
  ) {
    this.filePath = filePath;
    this.remoteConfigService = remoteConfigService;
    this.modelAdminPhones = new Set(
      (process.env.PEILIAN_MODEL_ADMIN_PHONES || '13365179393')
        .split(',')
        .map((phone) => this.normalizePhone(phone))
        .filter(Boolean)
    );
  }

  async getSession(): Promise<UserAuthSession | undefined> {
    const saved = await this.readSession();
    if (!saved?.phone) return undefined;
    return this.checkPhone(saved.phone);
  }

  async login(phone: string): Promise<UserLoginResult> {
    const result = await this.checkPhone(phone);
    if (!result.authorized) return result;
    await this.writeSession({ phone: result.phone, checkedAt: result.checkedAt });
    await this.postUsage({
      phone: result.phone,
      module: 'auth',
      action: 'login',
      summary: '手机号登录'
    }).catch(() => undefined);
    return result;
  }

  async logout(): Promise<void> {
    await rm(this.filePath, { force: true });
  }

  async requireAuthorized(): Promise<UserAuthSession> {
    const session = await this.getSession();
    if (session?.authorized) return session;
    throw new Error(session?.message || '请先用已授权手机号登录后再使用');
  }

  async requireModelAdmin(): Promise<UserAuthSession> {
    const session = await this.requireAuthorized();
    if (this.isModelAdmin(session.phone)) return session;
    throw new Error('当前账号无权查看或修改模型配置');
  }

  async recordUsage(input: UsageInput): Promise<void> {
    const session = await this.requireAuthorized();
    void this.postUsage({
      phone: session.phone,
      module: input.module,
      action: input.action,
      summary: input.summary || ''
    }).catch(() => undefined);
  }

  normalizePhone(phone: string): string {
    return String(phone || '').replace(/[^\d]/gu, '');
  }

  isModelAdmin(phone: string): boolean {
    return this.modelAdminPhones.has(this.normalizePhone(phone));
  }

  private async checkPhone(phone: string): Promise<UserLoginResult> {
    const normalizedPhone = this.normalizePhone(phone);
    const checkedAt = new Date().toISOString();
    if (!/^1\d{10}$/u.test(normalizedPhone)) {
      return {
        phone: normalizedPhone,
        authorized: false,
        checkedAt,
        message: '请输入 11 位手机号'
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(buildApiUrl(this.remoteConfigService.baseUrl(), '/api/auth/check'), {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ phone: normalizedPhone })
      });
      const body = await response.json().catch(() => ({})) as Partial<UserLoginResult> & { error?: string; user?: AuthorizedUser };
      if (!response.ok) {
        return {
          phone: normalizedPhone,
          authorized: false,
          checkedAt,
          message: body.message || body.error || `授权校验失败：HTTP ${response.status}`
        };
      }
      return {
        phone: normalizedPhone,
        authorized: Boolean(body.authorized),
        checkedAt,
        message: body.message,
        isModelAdmin: this.isModelAdmin(normalizedPhone),
        user: body.user
      };
    } catch (error) {
      return {
        phone: normalizedPhone,
        authorized: false,
        checkedAt,
        message: error instanceof Error ? `授权校验失败：${error.message}` : '授权校验失败'
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async postUsage(input: UsageInput & { phone: string }): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      await fetch(buildApiUrl(this.remoteConfigService.baseUrl(), '/api/usage/record'), {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(input)
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readSession(): Promise<StoredAuthSession | undefined> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw.replace(/^\uFEFF/u, '')) as StoredAuthSession;
      return parsed?.phone ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  private async writeSession(session: StoredAuthSession): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(session, null, 2), 'utf8');
  }
}
