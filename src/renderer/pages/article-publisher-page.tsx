import { Button, Card, Image, Input, Space, Tag, message } from 'antd';
import { CheckCircle2, Copy, Download, Images, Loader2, RefreshCw, Sparkles, Terminal, XCircle } from 'lucide-react';
import type { JSX } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ArticlePackage, HistoryItem } from '../../shared/types';
import { EmptyState } from '../components/empty-state';
import { ErrorBanner } from '../components/error-banner';
import { useArticleGenerationStore } from '../stores/article-generation-store';

type HistoryRouteState = {
  historyItem?: HistoryItem;
};

export function ArticlePublisherPage(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const progressEndRef = useRef<HTMLDivElement | null>(null);
  const {
    topic,
    article,
    loading,
    imageLoadingIndex,
    error,
    progressItems,
    setTopic,
    startGeneration,
    regenerateImage,
    regenerateFailedImages,
    loadArticleFromHistory
  } = useArticleGenerationStore();

  const fullPublishText = useMemo(() => {
    if (!article) return '';
    return `${article.publishContent.title}\n\n${article.publishContent.body}\n\n${article.publishContent.hashtags.join(' ')}`;
  }, [article]);

  useEffect(() => {
    progressEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [progressItems]);

  useEffect(() => {
    const item = (location.state as HistoryRouteState | null)?.historyItem;
    if (!item || item.type !== 'article') return;

    const content = item.content as { result?: ArticlePackage } | undefined;
    if (content?.result) {
      loadArticleFromHistory(content.result);
      message.success('已使用历史图文内容');
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [loadArticleFromHistory, location.pathname, location.state, navigate]);

  async function copyText(text: string, label: string): Promise<void> {
    await navigator.clipboard.writeText(text);
    message.success(`${label}已复制`);
  }

  async function downloadImage(image: string, index: number): Promise<void> {
    const result = await window.electron.downloadImage(image, `douyin-card-${index + 1}.png`);
    message.success(`已保存：${result.filePath}`);
  }

  async function downloadAllImages(): Promise<void> {
    if (!article) return;
    const result = await window.electron.exportArticlePackage(article);
    message.success(`已打包：${result.filePath}`);
  }

  async function downloadPublishText(): Promise<void> {
    if (!article) return;
    const result = await window.electron.exportArticleText(article);
    message.success(`已导出：${result.filePath}`);
  }

  async function handleRegenerateImage(index: number): Promise<void> {
    const result = await regenerateImage(index);
    if (result && !result.failedImage) {
      message.success(`第 ${result.index} 张图片已重新生成`);
    }
  }

  return (
    <div className="single-column">
      <Card title="AI 图文发布" variant="borderless">
        <Space.Compact className="full-width">
          <Input
            size="large"
            value={topic}
            placeholder="例如：孩子英语启蒙的5个方法、3-6岁孩子适合听哪些英语故事"
            onChange={(event) => setTopic(event.target.value)}
            onPressEnter={startGeneration}
          />
          <Button type="primary" size="large" loading={loading} icon={<Sparkles size={16} />} onClick={startGeneration}>
            生成图文内容
          </Button>
        </Space.Compact>
      </Card>

      {error && <ErrorBanner message={error} />}
      {loading && (
        <Card variant="borderless">
          <div className="generation-stream">
            <div className="generation-stream-header">
              <div>
                <span>生成现场</span>
                <strong>{progressItems.at(-1)?.step ?? '准备中'}</strong>
              </div>
              <Loader2 className="stream-spin" size={22} aria-hidden="true" />
            </div>
            <div className="generation-stream-body">
              {progressItems.map((item, index) => (
                <article className={`stream-line stream-line-${item.status}`} key={`${item.createdAt}-${index}`}>
                  <div className="stream-icon">
                    {item.status === 'success' ? <CheckCircle2 size={16} /> : item.status === 'error' ? <XCircle size={16} /> : <Terminal size={16} />}
                  </div>
                  <div>
                    <div className="stream-line-top">
                      <strong>{item.step}</strong>
                      <span>{formatProgressTime(item.createdAt)}</span>
                    </div>
                    <p>{item.message}</p>
                    {item.detail && <pre>{item.detail}</pre>}
                  </div>
                </article>
              ))}
              <div ref={progressEndRef} />
            </div>
          </div>
        </Card>
      )}

      {!loading && !article && (
        <EmptyState title="等待生成" description="输入英语启蒙、少儿英语或儿童英语教育相关选题，生成抖音图文卡片和发布文案。" />
      )}

      {article && (
        <>
          {article.failedImages.length > 0 && (
            <Card variant="borderless">
              <Space wrap>
                <ErrorBanner message={`第 ${article.failedImages.map((item) => item.index).join('、')} 张图片生成失败，可单张重新生成或重试全部失败图片。`} />
                <Button icon={<RefreshCw size={15} />} loading={imageLoadingIndex !== null} onClick={regenerateFailedImages}>
                  重试失败图片
                </Button>
              </Space>
            </Card>
          )}

          <Card
            title="图片预览区"
            variant="borderless"
            extra={<Button icon={<Images size={16} />} disabled={loading} onClick={downloadAllImages}>下载全部图片</Button>}
          >
            <div className="douyin-card-grid">
              {article.cards.map((card, index) => (
                <article className="douyin-card-preview" key={`${card.index}-${card.title}`}>
                  <div className="douyin-card-image">
                    {article.images[index] ? (
                      <Image src={`data:image/${inferImageType(article.images[index])};base64,${article.images[index]}`} alt={card.title} />
                    ) : (
                      <EmptyState title={loading ? '图片生成中' : '图片失败'} description={loading ? card.title : '可重新生成这一张图片。'} />
                    )}
                  </div>
                  <div className="douyin-card-actions">
                    {article.images[index] && (
                      <Button size="small" icon={<Download size={14} />} onClick={() => downloadImage(article.images[index], index)}>
                        下载
                      </Button>
                    )}
                    <Button
                      size="small"
                      icon={<RefreshCw size={14} />}
                      loading={imageLoadingIndex === card.index}
                      onClick={() => handleRegenerateImage(index)}
                    >
                      重新生成图片
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </Card>

          <Card title="发布内容区" variant="borderless">
            <div className="publish-content">
              <section>
                <h2>标题</h2>
                <p>{article.publishContent.title}</p>
                <Button icon={<Copy size={15} />} onClick={() => copyText(article.publishContent.title, '标题')}>复制标题</Button>
              </section>
              <section>
                <h2>正文</h2>
                <p>{article.publishContent.body}</p>
                <Button icon={<Copy size={15} />} onClick={() => copyText(article.publishContent.body, '正文')}>复制正文</Button>
              </section>
              <section>
                <h2>话题标签</h2>
                <div className="tag-row">{article.publishContent.hashtags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</div>
                <Button icon={<Copy size={15} />} onClick={() => copyText(article.publishContent.hashtags.join(' '), '话题')}>复制话题</Button>
              </section>
              <Space wrap>
                <Button type="primary" icon={<Copy size={15} />} onClick={() => copyText(fullPublishText, '完整发布内容')}>
                  复制完整发布内容
                </Button>
                <Button icon={<Download size={15} />} onClick={downloadPublishText}>
                  下载发布内容 TXT
                </Button>
              </Space>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function formatProgressTime(value: string): string {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

function inferImageType(base64Image: string): 'svg+xml' | 'png' {
  try {
    const header = atob(base64Image.slice(0, 80));
    return header.trimStart().startsWith('<svg') ? 'svg+xml' : 'png';
  } catch {
    return 'png';
  }
}
