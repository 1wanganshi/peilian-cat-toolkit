import { Button, Card, Image, Input, Modal, Popconfirm, Select, Space, Tag, message } from 'antd';
import { Copy, ExternalLink, Search, Trash2 } from 'lucide-react';
import type { JSX, MouseEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { HistoryItem, HistoryItemType } from '../../shared/types';
import { EmptyState } from '../components/empty-state';
import { ErrorBanner } from '../components/error-banner';

const TYPE_LABELS: Record<HistoryItemType | 'all', string> = {
  all: '全部',
  script: '脚本',
  moments: '朋友圈',
  'moment-image': '朋友圈配图',
  'today-moment': '今日朋友圈',
  article: '图文',
  'article-image': '图文图片'
};

const USE_PATHS: Partial<Record<HistoryItemType, string>> = {
  script: '/scripts',
  moments: '/moments',
  'moment-image': '/moments',
  'today-moment': '/moments',
  article: '/articles'
};

type HistoryImage = {
  id: string;
  label: string;
  src: string;
  base64?: string;
};

export function HistoryPage(): JSX.Element {
  const navigate = useNavigate();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [keyword, setKeyword] = useState('');
  const [type, setType] = useState<HistoryItemType | 'all'>('all');
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const typeOptions = useMemo(
    () => Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label })),
    []
  );

  const selectedContent = selectedItem ? formatHistoryContent(selectedItem) : '';
  const selectedImages = selectedItem ? getHistoryImages(selectedItem) : [];
  const canUseSelected = Boolean(selectedItem && USE_PATHS[selectedItem.type]);

  useEffect(() => {
    void loadHistory();
  }, []);

  async function loadHistory(nextType = type, nextKeyword = keyword): Promise<void> {
    setLoading(true);
    setError('');
    try {
      setItems(await window.electron.listHistory({ type: nextType, keyword: nextKeyword, limit: 300 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : '历史记录加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function copyItem(item: HistoryItem): Promise<void> {
    await navigator.clipboard.writeText(formatHistoryContent(item));
    message.success('历史文字已复制');
  }

  async function copyHistoryImage(image: HistoryImage): Promise<void> {
    if (image.base64) {
      await window.electron.copyImageToClipboard(image.base64);
      message.success(`${image.label}已复制到剪贴板`);
      return;
    }

    await navigator.clipboard.writeText(image.src);
    message.success('图片链接已复制');
  }

  function useItem(item: HistoryItem): void {
    const path = USE_PATHS[item.type];
    if (!path) {
      const images = getHistoryImages(item);
      if (images[0]) {
        void copyHistoryImage(images[0]);
      } else {
        void copyItem(item);
      }
      return;
    }
    navigate(path, { state: { historyItem: item } });
  }

  async function deleteItem(id: string): Promise<void> {
    await window.electron.deleteHistory(id);
    setItems((current) => current.filter((item) => item.id !== id));
    setSelectedItem((current) => current?.id === id ? null : current);
    message.success('已删除');
  }

  async function clearHistory(): Promise<void> {
    await window.electron.clearHistory();
    setItems([]);
    setSelectedItem(null);
    message.success('历史记录已清空');
  }

  function stop(event: MouseEvent): void {
    event.stopPropagation();
  }

  return (
    <div className="single-column">
      <Card title="历史记录" variant="borderless">
        <div className="history-toolbar">
          <Space wrap>
            <Select
              value={type}
              options={typeOptions}
              onChange={(value) => {
                setType(value);
                void loadHistory(value, keyword);
              }}
              className="history-type-select"
            />
            <Input
              allowClear
              prefix={<Search size={15} />}
              value={keyword}
              placeholder="搜索标题、摘要或内容"
              onChange={(event) => setKeyword(event.target.value)}
              onPressEnter={() => loadHistory()}
              className="history-search"
            />
            <Button loading={loading} onClick={() => loadHistory()}>搜索</Button>
          </Space>
          <Popconfirm title="清空历史记录？" okText="清空" cancelText="取消" onConfirm={clearHistory}>
            <Button danger icon={<Trash2 size={15} />} disabled={items.length === 0}>清空</Button>
          </Popconfirm>
        </div>
      </Card>

      {error && <ErrorBanner message={error} />}

      {items.length === 0 ? (
        <EmptyState title="暂无历史记录" description="生成内容后会自动保存到这里。" />
      ) : (
        <div className="history-list">
          {items.map((item) => {
            const images = getHistoryImages(item);
            return (
              <Card
                key={item.id}
                title={item.title}
                variant="borderless"
                className="history-card"
                onClick={() => setSelectedItem(item)}
                extra={
                  <Space wrap onClick={stop}>
                    <Button size="small" icon={<ExternalLink size={14} />} onClick={() => setSelectedItem(item)}>打开</Button>
                    <Button size="small" icon={<Copy size={14} />} onClick={() => copyItem(item)}>复制文字</Button>
                    {images[0] && <Button size="small" icon={<Copy size={14} />} onClick={() => copyHistoryImage(images[0])}>复制图片</Button>}
                    <Button size="small" type="primary" onClick={() => useItem(item)} disabled={!USE_PATHS[item.type] && images.length === 0}>使用</Button>
                    <Popconfirm title="删除这条记录？" okText="删除" cancelText="取消" onConfirm={() => deleteItem(item.id)}>
                      <Button size="small" danger icon={<Trash2 size={14} />}>删除</Button>
                    </Popconfirm>
                  </Space>
                }
              >
                <Space direction="vertical" size={10} className="full-width">
                  <Space wrap>
                    <Tag color={tagColor(item.type)}>{TYPE_LABELS[item.type]}</Tag>
                    <span className="muted-text">{formatTime(item.createdAt)}</span>
                  </Space>
                  {images.length > 0 && (
                    <div className="history-image-strip" onClick={stop}>
                      {images.slice(0, 4).map((image) => (
                        <Image key={image.id} src={image.src} alt={image.label} preview={false} />
                      ))}
                      {images.length > 4 && <span>+{images.length - 4}</span>}
                    </div>
                  )}
                  {item.summary && <p className="history-summary">{item.summary}</p>}
                  <span className="history-open-hint">点击卡片打开详情，可复制文字、复制图片或继续使用</span>
                </Space>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        title={selectedItem?.title ?? '历史详情'}
        open={Boolean(selectedItem)}
        width={920}
        onCancel={() => setSelectedItem(null)}
        footer={selectedItem ? (
          <Space wrap>
            <Button icon={<Copy size={15} />} onClick={() => copyItem(selectedItem)}>复制文字</Button>
            {selectedImages[0] && <Button icon={<Copy size={15} />} onClick={() => copyHistoryImage(selectedImages[0])}>复制首图</Button>}
            <Button type="primary" disabled={!canUseSelected && selectedImages.length === 0} onClick={() => useItem(selectedItem)}>
              使用
            </Button>
            <Button onClick={() => setSelectedItem(null)}>关闭</Button>
          </Space>
        ) : null}
      >
        {selectedItem && (
          <div className="history-detail">
            <Space wrap>
              <Tag color={tagColor(selectedItem.type)}>{TYPE_LABELS[selectedItem.type]}</Tag>
              <span className="muted-text">{formatTime(selectedItem.createdAt)}</span>
            </Space>
            {selectedImages.length > 0 && (
              <div className="history-image-grid">
                {selectedImages.map((image) => (
                  <figure key={image.id}>
                    <Image src={image.src} alt={image.label} />
                    <figcaption>
                      <span>{image.label}</span>
                      <Button size="small" icon={<Copy size={14} />} onClick={() => copyHistoryImage(image)}>
                        复制图片
                      </Button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
            {selectedItem.summary && <p className="history-summary">{selectedItem.summary}</p>}
            <pre className="history-content">{selectedContent}</pre>
          </div>
        )}
      </Modal>
    </div>
  );
}

function getHistoryImages(item: HistoryItem): HistoryImage[] {
  const content = item.content;
  if (!content || typeof content !== 'object') return [];

  const value = content as Record<string, unknown>;
  const result = value.result as Record<string, unknown> | undefined;
  if (!result) return [];

  const images: HistoryImage[] = [];
  if (item.type === 'moment-image') {
    pushImage(images, result.imageUrl, '朋友圈配图');
    pushImage(images, result.image, '朋友圈配图');
  }

  if (item.type === 'article') {
    const articleImages = Array.isArray(result.images) ? result.images : [];
    articleImages.forEach((image, index) => pushImage(images, image, `图文图片 ${index + 1}`));
  }

  if (item.type === 'article-image') {
    pushImage(images, result.image, '图文配图');
  }

  if (item.type === 'today-moment') {
    const entries = Array.isArray(result.entries) ? result.entries : [];
    entries.forEach((entry, entryIndex) => {
      const entryRecord = entry as Record<string, unknown>;
      const materials = Array.isArray(entryRecord.materials) ? entryRecord.materials as Array<Record<string, unknown>> : [];
      materials
        .filter((material) => material.type === 'image')
        .forEach((material, materialIndex) => pushImage(images, material.url, `朋友圈 ${entryIndex + 1} 素材 ${materialIndex + 1}`));
    });

    const materials = Array.isArray(result.materials) ? result.materials as Array<Record<string, unknown>> : [];
    materials
      .filter((material) => material.type === 'image')
      .forEach((material, index) => pushImage(images, material.url, `今日素材 ${index + 1}`));
  }

  return images;
}

function pushImage(images: HistoryImage[], value: unknown, label: string): void {
  const image = toHistoryImage(value, label, `${label}-${images.length}`);
  if (image) images.push(image);
}

function toHistoryImage(value: unknown, label: string, id: string): HistoryImage | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const source = value.trim();
  if (/^data:image\//iu.test(source)) {
    return {
      id,
      label,
      src: source,
      base64: source
    };
  }
  if (/^https?:\/\//iu.test(source)) {
    return { id, label, src: source };
  }
  if (looksLikeBase64Image(source)) {
    return {
      id,
      label,
      src: `data:image/${inferImageType(source)};base64,${source}`,
      base64: source
    };
  }
  return undefined;
}

function looksLikeBase64Image(value: string): boolean {
  return value.length > 80 && /^[a-zA-Z0-9+/=\s]+$/u.test(value);
}

function inferImageType(base64Image: string): 'svg+xml' | 'png' {
  try {
    const header = atob(base64Image.slice(0, 120));
    return header.trimStart().startsWith('<svg') ? 'svg+xml' : 'png';
  } catch {
    return 'png';
  }
}

function formatHistoryContent(item: HistoryItem): string {
  const content = item.content;
  if (typeof content === 'string') return content;
  if (!content || typeof content !== 'object') return String(content ?? '');

  const value = content as Record<string, unknown>;
  const result = value.result as Record<string, unknown> | undefined;
  if (!result) return stringify(content);

  if (item.type === 'script') return formatScript(result);
  if (item.type === 'moments') return formatMoments(result);
  if (item.type === 'today-moment') return formatTodayMoment(result);
  if (item.type === 'article') return formatArticle(result);
  if (item.type === 'moment-image' || item.type === 'article-image') return formatImage(result);
  return stringify(content);
}

function formatScript(result: Record<string, unknown>): string {
  const body = Array.isArray(result.body)
    ? result.body.map((scene) => {
      const item = scene as Record<string, unknown>;
      return String(item.content ?? '');
    }).filter(Boolean).join('\n\n')
    : '';
  const tags = Array.isArray(result.hashtags) ? result.hashtags.join(' ') : '';
  return [result.title, result.hook, body, result.ending, tags].filter(Boolean).join('\n\n');
}

function formatMoments(result: Record<string, unknown>): string {
  if (!Array.isArray(result.results)) return stringify(result);
  return result.results.map((entry) => {
    const item = entry as Record<string, unknown>;
    return `文案 ${item.index ?? ''}\n${item.text ?? ''}`;
  }).join('\n\n');
}

function formatTodayMoment(result: Record<string, unknown>): string {
  const entries = Array.isArray(result.entries) ? result.entries : [];
  if (!entries.length) return `日期：${result.date ?? ''}\n\n${result.rewriteContent ?? result.rawContent ?? ''}`;
  return entries.map((entry, index) => {
    const item = entry as Record<string, unknown>;
    const materials = Array.isArray(item.materials) ? item.materials.length : 0;
    return `朋友圈 ${index + 1}\n${item.rewriteContent ?? item.rawContent ?? ''}\n素材：${materials} 个`;
  }).join('\n\n');
}

function formatArticle(result: Record<string, unknown>): string {
  const publishContent = result.publishContent as Record<string, unknown> | undefined;
  const cards = Array.isArray(result.cards)
    ? result.cards.map((card) => {
      const item = card as Record<string, unknown>;
      return `卡片 ${item.index ?? ''}：${item.title ?? ''}\n${item.body ?? ''}`;
    }).join('\n\n')
    : '';
  return [`标题：${publishContent?.title ?? result.topic ?? ''}`, publishContent?.body, cards].filter(Boolean).join('\n\n');
}

function formatImage(result: Record<string, unknown>): string {
  return [
    result.selectedText ? `文案：${result.selectedText}` : '',
    result.imagePrompt ? `提示词：${result.imagePrompt}` : '',
    result.image ? `图片：已生成，${String(result.image).length} 字符` : '',
    result.imageUrl ? `图片：已生成，${String(result.imageUrl).length} 字符` : ''
  ].filter(Boolean).join('\n\n') || stringify(result);
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? '');
  }
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

function tagColor(type: HistoryItemType): string {
  if (type === 'script') return 'blue';
  if (type === 'moments' || type === 'today-moment') return 'green';
  if (type === 'moment-image' || type === 'article-image') return 'gold';
  return 'purple';
}
