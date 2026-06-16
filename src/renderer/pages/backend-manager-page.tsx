import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Collapse, Form, Input, Popconfirm, Select, Space, Switch, Tag, message } from 'antd';
import { CheckCircle2, DownloadCloud, PlugZap, RefreshCw, Save, Trash2 } from 'lucide-react';
import type {
  ModelConfig,
  ModelConfigInput,
  ModelKind,
  ModelProvider,
  PromptConfigMeta,
  UpdateCheckResult,
  UpdateDownloadResult
} from '../../shared/types';
import { EmptyState } from '../components/empty-state';
import { ErrorBanner } from '../components/error-banner';

const PROVIDERS: Array<{ label: string; value: ModelProvider; kinds: ModelKind[]; defaultBaseUrl: string }> = [
  { label: 'OpenAI', value: 'openai', kinds: ['language', 'image'], defaultBaseUrl: 'https://api.openai.com/v1' },
  { label: 'Claude', value: 'claude', kinds: ['language'], defaultBaseUrl: 'https://api.anthropic.com/v1' },
  { label: 'Stability AI', value: 'stability', kinds: ['image'], defaultBaseUrl: 'https://api.stability.ai/v1' },
  { label: '自定义兼容接口', value: 'custom', kinds: ['language', 'image'], defaultBaseUrl: '' }
];

const DEFAULT_MODEL_INPUT: ModelConfigInput = {
  name: '',
  kind: 'language',
  provider: 'openai',
  model: '',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  enabled: true
};

type UpdatePanelResult = UpdateCheckResult & Partial<Pick<UpdateDownloadResult, 'downloaded' | 'filePath' | 'message'>>;

export function BackendManagerPage(): JSX.Element {
  return (
    <div className="single-column">
      <UpdatePanel />
      <BackendPromptSyncPanel />
      <Collapse
        ghost
        className="advanced-collapse"
      items={[
          { key: 'models', label: '高级设置：模型管理', children: <ModelManagerPanel /> }
      ]}
    />
    </div>
  );
}

function UpdatePanel(): JSX.Element {
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [result, setResult] = useState<UpdatePanelResult | null>(null);
  const [error, setError] = useState('');

  async function checkLatestVersion(): Promise<void> {
    setChecking(true);
    setError('');
    try {
      const update = await window.electron.checkForUpdates();
      setResult(update);
      update.hasUpdate
        ? message.info(`发现新版本 ${update.latestVersion}，可立刻更新。`)
        : message.success(`当前版本 ${update.currentVersion} 已是最新。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '检查更新失败，请稍后重试');
    } finally {
      setChecking(false);
    }
  }

  async function downloadLatestVersion(): Promise<void> {
    setUpdating(true);
    setError('');
    try {
      const update = await window.electron.downloadLatestUpdate();
      setResult(update);
      message.success(update.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : '立刻更新失败，请稍后重试');
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="single-column">
      {error && <ErrorBanner message={error} />}
      <Card title="版本更新" variant="borderless">
        <Space direction="vertical" size={16} className="full-width">
          <div className="model-note">
            <DownloadCloud size={18} />
            <span>先连接后台读取最新版本；发现新版本后可在软件内直接下载安装包并打开安装程序，不会跳转网页。</span>
          </div>
          <Space wrap>
            <Button icon={<RefreshCw size={16} />} loading={checking} disabled={updating} onClick={checkLatestVersion}>
              {checking ? '正在检查更新' : '检查更新'}
            </Button>
            <Button
              type="primary"
              icon={<DownloadCloud size={16} />}
              loading={updating}
              disabled={checking}
              onClick={downloadLatestVersion}
            >
              {updating ? '正在更新' : '立刻更新'}
            </Button>
          </Space>
          {result && (
            <Alert
              type={result.hasUpdate ? 'info' : 'success'}
              showIcon
              message={result.hasUpdate ? `发现新版本 ${result.latestVersion}` : `当前版本 ${result.currentVersion} 已是最新`}
              description={
                <div className="update-check-detail">
                  <p>当前版本：{result.currentVersion}</p>
                  <p>最新版本：{result.latestVersion}</p>
                  {result.force && <p>本次更新被后台标记为强制更新。</p>}
                  {result.releaseNotes && <p>{result.releaseNotes}</p>}
                  {result.filePath && <p>安装包位置：{result.filePath}</p>}
                </div>
              }
            />
          )}
        </Space>
      </Card>
    </div>
  );
}

function BackendPromptSyncPanel(): JSX.Element {
  const [syncing, setSyncing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [lastSync, setLastSync] = useState<string | undefined>();
  const [lastRevision, setLastRevision] = useState<number | undefined>();
  const [imported, setImported] = useState<number | undefined>();
  const [syncedNames, setSyncedNames] = useState<string[]>([]);
  const [meta, setMeta] = useState<PromptConfigMeta | undefined>();

  useEffect(() => {
    const saved = localStorage.getItem('peilian-prompt-last-sync');
    const revision = Number(localStorage.getItem('peilian-prompt-last-revision') || 0);
    if (saved) setLastSync(saved);
    if (revision > 0) setLastRevision(revision);
    void checkPromptMeta();
  }, []);

  const localRevision = meta?.localPromptRevision ?? lastRevision ?? 0;
  const hasPromptUpdate = Boolean(meta && meta.promptRevision > localRevision);

  async function syncPrompts(): Promise<void> {
    setSyncing(true);
    setError('');
    try {
      const result = await window.electron.syncPromptTemplatesFromBackend();
      setImported(result.imported);
      setLastSync(result.syncedAt);
      setLastRevision(result.promptRevision);
      setMeta({
        promptRevision: result.promptRevision,
        promptsUpdatedAt: result.promptsUpdatedAt,
        promptCount: result.promptCount,
        localPromptRevision: result.promptRevision,
        localPromptsUpdatedAt: result.promptsUpdatedAt
      });
      localStorage.setItem('peilian-prompt-last-sync', result.syncedAt);
      localStorage.setItem('peilian-prompt-last-revision', String(result.promptRevision));
      setSyncedNames(result.names);
      message.success(result.names.length ? `已同步：${result.names.join('、')}` : `已从后台更新 ${result.imported} 个提示词`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新提示词失败，请稍后重试');
    } finally {
      setSyncing(false);
    }
  }

  async function checkPromptMeta(): Promise<void> {
    setChecking(true);
    try {
      setMeta(await window.electron.getPromptConfigMeta());
    } catch {
      setMeta(undefined);
    } finally {
      setChecking(false);
    }
  }

  return (
    <section className="panel">
      {error && <ErrorBanner message={error} />}
      <Card title="提示词更新" variant="borderless">
        <Space direction="vertical" size={16} className="full-width">
          <div className="prompt-status-grid">
            <div>
              <span>后台版本</span>
              <strong>{meta ? `#${meta.promptRevision}` : checking ? '检查中' : '未读取'}</strong>
            </div>
            <div>
              <span>本机版本</span>
              <strong>{localRevision > 0 ? `#${localRevision}` : '未同步'}</strong>
            </div>
            <div>
              <span>模块数量</span>
              <strong>{meta?.promptCount ?? '-'}</strong>
            </div>
          </div>
          <Alert
            type={!meta ? 'info' : hasPromptUpdate ? 'warning' : 'success'}
            showIcon
            message={!meta ? '还未读取后台版本' : hasPromptUpdate ? '后台提示词有更新' : '本机提示词已是最新'}
            description={
              !meta
                ? '点击“检查后台版本”或“更新提示词”，系统会连接后台读取最新状态。'
                : hasPromptUpdate
                ? '点击“更新提示词”，前端生成内容时会立刻使用后台发布的新提示词。'
                : lastSync
                  ? `最近同步时间：${new Date(lastSync).toLocaleString()}${typeof imported === 'number' ? `，本次更新 ${imported} 个提示词。` : ''}`
                  : '还没有同步记录，可以先点击检查或直接更新。'
            }
          />
          <div className="model-note">
            <CheckCircle2 size={18} />
            <span>提示词正文只在网页后台维护；这里不展示内容，只负责检查和更新。</span>
          </div>
          {syncedNames.length > 0 && (
            <div className="prompt-synced-list">
              <span>已同步到前台 APP：</span>
              {syncedNames.map((name) => (
                <Tag color="green" key={name}>{name}</Tag>
              ))}
            </div>
          )}
          <Space wrap>
            <Button type="primary" icon={<DownloadCloud size={16} />} loading={syncing} onClick={syncPrompts}>
              更新提示词
            </Button>
            <Button icon={<RefreshCw size={16} />} loading={checking} onClick={checkPromptMeta}>
              检查后台版本
            </Button>
          </Space>
        </Space>
      </Card>
    </section>
  );
}

function ModelManagerPanel(): JSX.Element {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [form] = Form.useForm<ModelConfigInput>();
  const [editingId, setEditingId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const kind = Form.useWatch('kind', form) ?? DEFAULT_MODEL_INPUT.kind;
  const provider = Form.useWatch('provider', form) ?? DEFAULT_MODEL_INPUT.provider;

  const providerOptions = useMemo(
    () => PROVIDERS.filter((item) => item.kinds.includes(kind)).map((item) => ({ label: item.label, value: item.value })),
    [kind]
  );

  useEffect(() => {
    form.setFieldsValue(DEFAULT_MODEL_INPUT);
    void loadModels();
  }, [form]);

  useEffect(() => {
    const providerMeta = PROVIDERS.find((item) => item.value === provider);
    if (providerMeta && !providerMeta.kinds.includes(kind)) {
      const fallback = PROVIDERS.find((item) => item.kinds.includes(kind));
      form.setFieldsValue({ provider: fallback?.value, baseUrl: fallback?.defaultBaseUrl });
      return;
    }

    if (providerMeta && !editingId) {
      form.setFieldsValue({ baseUrl: providerMeta.defaultBaseUrl });
    }
  }, [editingId, form, kind, provider]);

  async function loadModels(): Promise<void> {
    setModels(await window.electron.listModels());
  }

  async function saveModel(): Promise<void> {
    setLoading(true);
    setError('');
    try {
      const values = await form.validateFields();
      await window.electron.saveModel({ ...values, id: editingId });
      message.success('模型配置已保存');
      resetForm();
      await loadModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存模型失败');
    } finally {
      setLoading(false);
    }
  }

  async function checkModel(input?: ModelConfig): Promise<void> {
    setChecking(true);
    setError('');
    try {
      const values = input ?? (await form.validateFields());
      const result = await window.electron.checkModel({ ...values, id: input?.id ?? editingId });
      result.ok ? message.success(result.message) : message.warning(result.message);
      await loadModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : '检测模型失败');
    } finally {
      setChecking(false);
    }
  }

  async function deleteModel(id: string): Promise<void> {
    await window.electron.deleteModel(id);
    message.success('模型配置已删除');
    if (editingId === id) resetForm();
    await loadModels();
  }

  function editModel(model: ModelConfig): void {
    setEditingId(model.id);
    form.setFieldsValue(model);
  }

  function resetForm(): void {
    setEditingId(undefined);
    form.setFieldsValue(DEFAULT_MODEL_INPUT);
  }

  return (
    <div className="tool-grid">
      <section className="panel">
        {error && <ErrorBanner message={error} />}
        <Card title={editingId ? '编辑模型' : '添加模型'} variant="borderless">
          <Form form={form} layout="vertical" initialValues={DEFAULT_MODEL_INPUT}>
            <Form.Item name="kind" label="模型类型" rules={[{ required: true }]}>
              <Select options={[{ label: '语言大模型', value: 'language' }, { label: '生图大模型', value: 'image' }]} />
            </Form.Item>
            <Form.Item name="provider" label="服务商" rules={[{ required: true }]}>
              <Select options={providerOptions} />
            </Form.Item>
            <Form.Item name="name" label="配置名称" rules={[{ required: true, message: '请输入配置名称' }]}>
              <Input placeholder="例如：主力文案模型" />
            </Form.Item>
            <Form.Item name="model" label="模型 ID" rules={[{ required: true, message: '请输入模型 ID' }]}>
              <Input placeholder="例如：gpt-5.5、gpt-image-2" />
            </Form.Item>
            <Form.Item name="baseUrl" label="Base URL" rules={[{ required: true, message: '请输入 Base URL' }]}>
              <Input placeholder="https://api.example.com/v1" />
            </Form.Item>
            <Form.Item name="apiKey" label="API Key" rules={[{ required: true, message: '请输入 API Key' }]}>
              <Input.Password placeholder="sk-..." autoComplete="current-password" />
            </Form.Item>
            <Form.Item name="enabled" label="后台启用" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="停用" />
            </Form.Item>
            <Space wrap>
              <Button type="primary" icon={<Save size={16} />} loading={loading} onClick={saveModel}>保存</Button>
              <Button icon={<PlugZap size={16} />} loading={checking} onClick={() => checkModel()}>检测连接</Button>
              <Button onClick={resetForm}>清空</Button>
            </Space>
          </Form>
        </Card>
        <Card variant="borderless">
          <div className="model-note">
            <CheckCircle2 size={18} />
            <span>模型配置保存在 Electron 后台，脚本、朋友圈和图文模块会读取已启用的大模型。</span>
          </div>
        </Card>
      </section>
      <section className="panel">
        <ModelList title="语言大模型" items={models.filter((model) => model.kind === 'language')} checking={checking} onCheck={checkModel} onEdit={editModel} onDelete={deleteModel} />
        <ModelList title="生图大模型" items={models.filter((model) => model.kind === 'image')} checking={checking} onCheck={checkModel} onEdit={editModel} onDelete={deleteModel} />
      </section>
    </div>
  );
}

interface ModelListProps {
  title: string;
  items: ModelConfig[];
  checking: boolean;
  onCheck: (model: ModelConfig) => Promise<void>;
  onEdit: (model: ModelConfig) => void;
  onDelete: (id: string) => Promise<void>;
}

function ModelList({ title, items, checking, onCheck, onEdit, onDelete }: ModelListProps): JSX.Element {
  return (
    <Card title={title} variant="borderless">
      {items.length === 0 ? (
        <EmptyState title="暂无模型" description="添加后会显示在这里，后台服务会优先使用已启用模型。" />
      ) : (
        <div className="model-list">
          {items.map((model) => (
            <article className="model-card" key={model.id}>
              <div className="model-card-main">
                <strong>{model.name}</strong>
                <span>{model.provider} / {model.model}</span>
                <span>{model.baseUrl}</span>
              </div>
              <div className="model-card-status">
                <Tag color={model.enabled ? 'success' : 'default'}>{model.enabled ? '已启用' : '未启用'}</Tag>
                {model.lastStatus && (
                  <Tag color={model.lastStatus === 'success' ? 'green' : 'red'}>
                    {model.lastStatus === 'success' ? '检测通过' : '检测失败'}
                  </Tag>
                )}
              </div>
              {model.lastMessage && <p className="model-message">{model.lastMessage}</p>}
              <Space wrap>
                <Button size="small" icon={<PlugZap size={14} />} loading={checking} onClick={() => onCheck(model)}>检测</Button>
                <Button size="small" onClick={() => onEdit(model)}>编辑</Button>
                <Popconfirm title="删除这个模型配置？" okText="删除" cancelText="取消" onConfirm={() => onDelete(model.id)}>
                  <Button size="small" danger icon={<Trash2 size={14} />}>删除</Button>
                </Popconfirm>
              </Space>
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}
