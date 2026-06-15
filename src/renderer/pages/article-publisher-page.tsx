import { Button, Card, Image, Input, Space, Tag, message } from 'antd';
import { CheckCircle2, Copy, Download, Images, Loader2, RefreshCw, Sparkles, Terminal, XCircle } from 'lucide-react';
import type { JSX } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ArticleGenerationProgress, ArticlePackage } from '../../shared/types';
import { EmptyState } from '../components/empty-state';
import { ErrorBanner } from '../components/error-banner';

export function ArticlePublisherPage(): JSX.Element {
  const [topic, setTopic] = useState('');
  const [article, setArticle] = useState<ArticlePackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageLoadingIndex, setImageLoadingIndex] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [progressItems, setProgressItems] = useState<ArticleGenerationProgress[]>([]);
  const activeRequestIdRef = useRef('');
  const progressEndRef = useRef<HTMLDivElement | null>(null);

  const fullPublishText = useMemo(() => {
    if (!article) return '';
    return `${article.publishContent.title}\n\n${article.publishContent.body}\n\n${article.publishContent.hashtags.join(' ')}`;
  }, [article]);

  useEffect(() => {
    const unsubscribe = window.electron.onArticleGenerationProgress((progress) => {
      if (progress.requestId !== activeRequestIdRef.current) return;
      setProgressItems((items) => [...items, progress].slice(-80));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    progressEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [progressItems]);

  async function generateArticle(): Promise<void> {
    if (!topic.trim()) {
      setError('请输入英语教育相关选题');
      return;
    }

    setLoading(true);
    setError('');
    setArticle(null);
    const requestId = crypto.randomUUID();
    activeRequestIdRef.current = requestId;
    setProgressItems([
      {
        requestId,
        step: '开始',
        message: `收到选题“${topic.trim()}”，准备生成抖音图文内容`,
        status: 'running',
        createdAt: new Date().toISOString()
      }
    ]);
    try {
      setArticle(await window.electron.generateArticleWithProgress(topic, requestId));
    } catch (err) {
      const messageText = err instanceof Error ? err.message : '生成失败，请重试';
      if (messageText.includes('联网搜索失败')) {
        setError('联网搜索失败，请检查网络后重试。');
      } else if (messageText.includes('请输入') || messageText.includes('英语')) {
        setError(messageText);
      } else {
        setError(`AI 生成失败，请重试。${messageText}`);
      }
    } finally {
      setLoading(false);
    }
  }

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

  async function regenerateImage(index: number): Promise<void> {
    if (!article) return;
    const card = article.cards[index];
    setImageLoadingIndex(card.index);
    setError('');
    try {
      const result = await window.electron.regenerateArticleImage(card);
      setArticle((current) => {
        if (!current) return current;
        const images = [...current.images];
        images[index] = result.image;
        const failedImages = result.failedImage
          ? current.failedImages.some((item) => item.index === result.failedImage?.index)
            ? current.failedImages.map((item) => item.index === result.failedImage?.index ? result.failedImage : item)
            : [...current.failedImages, result.failedImage]
          : current.failedImages.filter((item) => item.index !== result.index);
        return { ...current, images, failedImages };
      });
      if (result.failedImage) {
        setError(`第 ${result.index} 张图片生成失败：${result.failedImage.message}`);
      } else {
        message.success(`第 ${result.index} 张图片已重新生成`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `第 ${card.index} 张图片生成失败，请重试`);
    } finally {
      setImageLoadingIndex(null);
    }
  }

  async function regenerateFailedImages(): Promise<void> {
    if (!article) return;
    const failedIndexes = article.failedImages.map((item) => item.index - 1);
    for (const index of failedIndexes) {
      await regenerateImage(index);
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
            onPressEnter={generateArticle}
          />
          <Button type="primary" size="large" loading={loading} icon={<Sparkles size={16} />} onClick={generateArticle}>
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

      {!loading && article && (
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
            extra={<Button icon={<Images size={16} />} onClick={downloadAllImages}>下载全部图片</Button>}
          >
            <div className="douyin-card-grid">
              {article.cards.map((card, index) => (
                <article className="douyin-card-preview" key={`${card.index}-${card.title}`}>
                  <div className="douyin-card-image">
                    {article.images[index] ? (
                      <Image src={`data:image/${inferImageType(article.images[index])};base64,${article.images[index]}`} alt={card.title} />
                    ) : (
                      <EmptyState title="图片失败" description="可重新生成这一张图片。" />
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
                      onClick={() => regenerateImage(index)}
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
