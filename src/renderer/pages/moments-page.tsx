import { Alert, Button, Card, Image, Input, Radio, Space, Tabs, Upload, message } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { Copy, Download, ImagePlus, RefreshCw, Sparkles, UploadCloud } from 'lucide-react';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type {
  HistoryItem,
  MomentMaterial,
  MomentsGenerateTextResult,
  MomentsImageResult,
  MomentsRewriteResult,
  TodayMomentSuggestionItem,
  TodayMomentSuggestionResult
} from '../../shared/types';
import { EmptyState } from '../components/empty-state';
import { ErrorBanner } from '../components/error-banner';

const rewriteStyles = ['日常真实风', '轻松幽默风', '温柔治愈风', '高级简短风', '朋友聊天风'];
const generateStyles = [...rewriteStyles, '情绪感悟风', '带货种草风'];

type ReferenceImage = {
  name: string;
  base64: string;
};

type HistoryRouteState = {
  historyItem?: HistoryItem;
};

export function MomentsPage(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const [originalText, setOriginalText] = useState('');
  const [rewriteStyle, setRewriteStyle] = useState(rewriteStyles[0]);
  const [rewrite, setRewrite] = useState<MomentsRewriteResult | null>(null);
  const [idea, setIdea] = useState('');
  const [generateStyle, setGenerateStyle] = useState(generateStyles[0]);
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [referenceImage, setReferenceImage] = useState<ReferenceImage | null>(null);
  const [generated, setGenerated] = useState<MomentsGenerateTextResult | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [momentImage, setMomentImage] = useState<MomentsImageResult | null>(null);
  const [todaySuggestion, setTodaySuggestion] = useState<TodayMomentSuggestionResult | null>(null);
  const [activeTab, setActiveTab] = useState('today');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  const selectedTextIndex = useMemo(
    () => generated?.results.find((item) => item.text === selectedText)?.index,
    [generated, selectedText]
  );
  const todayEntries = useMemo<TodayMomentSuggestionItem[]>(() => {
    if (!todaySuggestion) return [];
    if (Array.isArray(todaySuggestion.entries) && todaySuggestion.entries.length > 0) return todaySuggestion.entries;
    return [{
      id: 'legacy-today-moment',
      rawContent: todaySuggestion.rawContent,
      rewriteContent: todaySuggestion.rewriteContent,
      materials: todaySuggestion.materials
    }];
  }, [todaySuggestion]);

  useEffect(() => {
    const item = (location.state as HistoryRouteState | null)?.historyItem;
    if (!item) return;

    const content = item.content as { result?: unknown; request?: Record<string, unknown> } | undefined;
    const result = content?.result;
    if (item.type === 'moments' && result && typeof result === 'object') {
      const momentResult = result as MomentsRewriteResult | MomentsGenerateTextResult;
      if (momentResult.type === 'rewrite') {
        setRewrite(momentResult);
        setOriginalText(momentResult.sourceText);
        setRewriteStyle(momentResult.style);
        setActiveTab('rewrite');
      } else {
        setGenerated(momentResult);
        setIdea(momentResult.idea);
        setGenerateStyle(momentResult.style);
        setSelectedText(momentResult.results[0]?.text ?? '');
        setMomentImage(null);
        setActiveTab('generate');
      }
      setError('');
      message.success('已使用历史朋友圈内容');
      navigate(location.pathname, { replace: true, state: null });
      return;
    }

    if (item.type === 'moment-image' && result && typeof result === 'object') {
      const imageResult = result as MomentsImageResult & { text?: string };
      setMomentImage(imageResult);
      setSelectedText(imageResult.text ?? imageResult.selectedText ?? '');
      setGenerated({
        type: 'generate',
        idea: String(content?.request?.idea ?? ''),
        style: String(content?.request?.style ?? generateStyle),
        results: [{ index: 1, text: imageResult.text ?? imageResult.selectedText ?? '' }]
      });
      setActiveTab('generate');
      setError('');
      message.success('已使用历史朋友圈配图');
      navigate(location.pathname, { replace: true, state: null });
      return;
    }

    if (item.type === 'today-moment' && result && typeof result === 'object') {
      setTodaySuggestion(result as TodayMomentSuggestionResult);
      setActiveTab('today');
      setError('');
      message.success('已使用历史今日朋友圈');
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [generateStyle, location.pathname, location.state, navigate]);

  async function rewriteMoments(): Promise<void> {
    if (!originalText.trim()) {
      setError('请输入要改写的朋友圈内容');
      return;
    }
    setLoading('rewrite');
    setError('');
    try {
      setRewrite(await window.electron.rewriteMoments(originalText, rewriteStyle));
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败了，可以再试一次');
    } finally {
      setLoading('');
    }
  }

  async function generateTexts(): Promise<MomentsGenerateTextResult | undefined> {
    if (!idea.trim()) {
      setError('请输入你的朋友圈想法');
      return undefined;
    }
    setLoading('texts');
    setError('');
    try {
      const result = await window.electron.generateMomentTexts({ idea, style: generateStyle });
      setGenerated(result);
      setSelectedText(result.results[0]?.text ?? '');
      setMomentImage(null);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败了，可以再试一次');
      return undefined;
    } finally {
      setLoading('');
    }
  }

  async function generateImage(text = selectedText): Promise<void> {
    if (!text.trim()) {
      setError('请先选择一条朋友圈文案再生成配图');
      return;
    }
    setLoading('image');
    setError('');
    try {
      setMomentImage(await window.electron.generateMomentImage({
        selectedText: text,
        referenceImage: referenceImage?.base64,
        referenceImageName: referenceImage?.name
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : '图片生成失败，请重新生成');
    } finally {
      setLoading('');
    }
  }

  async function generateAll(): Promise<void> {
    if (!idea.trim()) {
      setError('请输入你的朋友圈想法');
      return;
    }
    setLoading('all');
    setError('');
    try {
      const result = await window.electron.generateMomentsWithImage({
        idea,
        style: generateStyle,
        referenceImage: referenceImage?.base64,
        referenceImageName: referenceImage?.name
      });
      const textResult: MomentsGenerateTextResult = {
        type: 'generate',
        idea,
        style: generateStyle,
        results: [{ index: 1, text: result.text }]
      };
      setGenerated(textResult);
      setSelectedText(result.text);
      setMomentImage(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败了，可以再试一次');
    } finally {
      setLoading('');
    }
  }

  async function generateTodaySuggestion(): Promise<void> {
    if (loading === 'today') return;
    setLoading('today');
    setError('');
    try {
      setTodaySuggestion(await window.electron.generateTodayMomentSuggestion());
      message.success('今日朋友圈建议已生成');
    } catch (err) {
      setError(err instanceof Error ? err.message : '今日朋友圈建议生成失败，请重新尝试。');
    } finally {
      setLoading('');
    }
  }

  async function copyText(text: string, label = '内容'): Promise<void> {
    await navigator.clipboard.writeText(text);
    message.success(`${label}已复制`);
  }

  async function downloadGeneratedImage(): Promise<void> {
    if (!momentImage) return;
    const result = await window.electron.downloadImage(momentImage.imageUrl, '朋友圈配图.png');
    message.success(`已保存：${result.filePath}`);
  }

  async function handleUpload(file: File): Promise<boolean> {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('图片格式不支持，请上传 PNG、JPG 或 WebP');
      return false;
    }
    try {
      const base64 = await fileToBase64(file);
      setReferenceImage({ name: file.name, base64 });
      setError('');
      return false;
    } catch {
      setError('图片上传失败，请重新上传');
      return false;
    }
  }

  return (
    <div className="single-column">
      {error && <ErrorBanner message={error} />}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'today',
            label: '今日朋友圈建议',
            children: (
              <div className="today-moment-workbench">
                <section className="today-moment-hero">
                  <div>
                    <span>后台规划联动</span>
                    <h2>一键生成今天该发的朋友圈</h2>
                    <p>自动读取后台今天启用的朋友圈规划，调用 AI 二创文案，并带出当天配置好的图片、视频或文件素材。</p>
                  </div>
                  <Button
                    type="primary"
                    size="large"
                    loading={loading === 'today'}
                    disabled={loading === 'today'}
                    icon={<Sparkles size={18} />}
                    onClick={generateTodaySuggestion}
                  >
                    今日朋友圈建议
                  </Button>
                </section>

                {loading === 'today' && <Alert type="info" showIcon message="正在获取今日朋友圈内容并生成建议..." />}

                <div className="tool-grid">
                  <Card title="AI 二创文案" variant="borderless">
                    {!todaySuggestion ? (
                      <EmptyState title="等待生成" description="点击上方按钮后，这里会显示适合今天发布的朋友圈文案。" />
                    ) : (
                      <div className="version-list">
                        {todayEntries.map((entry, index) => (
                          <div className="version-card" key={entry.id}>
                            <strong>{todaySuggestion.date} 朋友圈文案 {index + 1}</strong>
                            <p>{entry.rewriteContent}</p>
                            <Space wrap>
                              <Button icon={<Copy size={15} />} onClick={() => copyText(entry.rewriteContent, `今日朋友圈文案 ${index + 1}`)}>
                                复制文案
                              </Button>
                              <Button icon={<RefreshCw size={15} />} loading={loading === 'today'} onClick={generateTodaySuggestion}>
                                重新生成
                              </Button>
                            </Space>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                  <Card title="今日素材" variant="borderless">
                    {!todaySuggestion ? (
                      <EmptyState title="等待素材" description="后台配置的今日素材会和文案一起展示。" />
                    ) : (
                      <div className="today-material-groups">
                        {todayEntries.map((entry, index) => (
                          <MaterialList key={entry.id} title={`朋友圈 ${index + 1} 素材`} materials={entry.materials} />
                        ))}
                      </div>
                    )}
                  </Card>
                </div>
              </div>
            )
          },
          {
            key: 'rewrite',
            label: '朋友圈改写',
            children: (
              <div className="tool-grid">
                <Card title="朋友圈原文" variant="borderless">
                  <Space direction="vertical" size={16} className="full-width">
                    <Input.TextArea
                      rows={8}
                      value={originalText}
                      placeholder="粘贴要改写的朋友圈内容"
                      onChange={(event) => setOriginalText(event.target.value)}
                    />
                    <Radio.Group
                      value={rewriteStyle}
                      onChange={(event) => setRewriteStyle(event.target.value)}
                      options={rewriteStyles.map((style) => ({ label: style, value: style }))}
                    />
                    <Space wrap>
                      <Button type="primary" loading={loading === 'rewrite'} icon={<Sparkles size={16} />} onClick={rewriteMoments}>
                        开始改写
                      </Button>
                      <Button icon={<RefreshCw size={15} />} onClick={rewriteMoments} disabled={!rewrite}>
                        重新生成
                      </Button>
                    </Space>
                  </Space>
                </Card>
                <Card title="改写结果" variant="borderless">
                  {!rewrite ? (
                    <EmptyState title="暂无结果" description="生成后会展示 3 个不同版本，每条都可以直接复制。" />
                  ) : (
                    <div className="version-list">
                      {rewrite.results.map((item) => (
                        <div className="version-card" key={item.index}>
                          <strong>版本 {item.index}</strong>
                          <p>{item.text}</p>
                          <Button icon={<Copy size={15} />} onClick={() => copyText(item.text, `版本 ${item.index}`)}>复制</Button>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            )
          },
          {
            key: 'generate',
            label: '朋友圈生成 + AI 配图',
            children: (
              <div className="tool-grid">
                <Card title="生成设置" variant="borderless">
                  <Space direction="vertical" size={16} className="full-width">
                    <Input.TextArea
                      rows={5}
                      value={idea}
                      placeholder="例如：今天终于把拖了很久的事做完了"
                      onChange={(event) => setIdea(event.target.value)}
                    />
                    <Radio.Group
                      value={generateStyle}
                      onChange={(event) => setGenerateStyle(event.target.value)}
                      options={generateStyles.map((style) => ({ label: style, value: style }))}
                    />
                    <Upload
                      listType="picture-card"
                      beforeUpload={handleUpload}
                      maxCount={1}
                      accept="image/png,image/jpeg,image/webp"
                      fileList={files}
                      onChange={(info) => setFiles(info.fileList)}
                      onRemove={() => {
                        setReferenceImage(null);
                        setFiles([]);
                      }}
                    >
                      <UploadCloud size={22} />
                    </Upload>
                    <Space wrap>
                      <Button type="primary" loading={loading === 'all'} icon={<Sparkles size={16} />} onClick={generateAll}>
                        生成朋友圈
                      </Button>
                      <Button loading={loading === 'image'} icon={<ImagePlus size={15} />} onClick={() => generateImage()}>
                        生成配图
                      </Button>
                      <Button loading={loading === 'all'} icon={<RefreshCw size={15} />} onClick={generateAll}>
                        重新生成全部
                      </Button>
                    </Space>
                  </Space>
                </Card>
                <Card title="生成结果" variant="borderless">
                  {!generated ? (
                    <EmptyState title="暂无结果" description="生成后选择一条文案，再生成或更新 AI 配图。" />
                  ) : (
                    <div className="generated-moment">
                      <div className="version-list">
                        {generated.results.map((item) => (
                          <button
                            className={`version-card moment-choice ${selectedText === item.text ? 'active' : ''}`}
                            key={item.index}
                            type="button"
                            onClick={() => setSelectedText(item.text)}
                          >
                            <strong>文案 {item.index}</strong>
                            <p>{item.text}</p>
                          </button>
                        ))}
                      </div>
                      <Space wrap>
                        <Button icon={<Copy size={15} />} disabled={!selectedText} onClick={() => copyText(selectedText, `文案 ${selectedTextIndex ?? ''}`)}>
                          复制朋友圈文案
                        </Button>
                        <Button icon={<RefreshCw size={15} />} loading={loading === 'texts'} onClick={generateTexts}>
                          重新生成文案
                        </Button>
                        <Button icon={<ImagePlus size={15} />} loading={loading === 'image'} disabled={!selectedText} onClick={() => generateImage()}>
                          重新生成配图
                        </Button>
                      </Space>

                      {momentImage ? (
                        <div className="moment-image-result">
                          <Image src={`data:image/${inferImageType(momentImage.imageUrl)};base64,${momentImage.imageUrl}`} alt="朋友圈配图" />
                          <Button icon={<Download size={15} />} onClick={downloadGeneratedImage}>下载图片</Button>
                        </div>
                      ) : (
                        <EmptyState title="还没有配图" description="选择文案后点击生成配图。" />
                      )}
                    </div>
                  )}
                </Card>
              </div>
            )
          }
        ]}
      />
    </div>
  );
}

function MaterialList({ materials, title = '今日朋友圈素材' }: { materials: MomentMaterial[]; title?: string }): JSX.Element {
  if (materials.length === 0) {
    return <EmptyState title="暂无素材" description="后台今天没有配置朋友圈素材。" />;
  }

  return (
    <div className="material-section">
      <strong>{title}</strong>
      <div className="moment-material-grid">
        {materials.map((material) => (
          <div className="moment-material-card" key={material.id}>
            {material.type === 'image' ? (
              <Image src={material.url} alt={material.name} />
            ) : material.type === 'video' ? (
              <video src={material.url} controls preload="metadata" />
            ) : (
              <div className="file-preview">{material.name}</div>
            )}
            <div>
              <span>{material.name}</span>
              <small>{material.type}</small>
            </div>
            <Button href={material.url} target="_blank" rel="noreferrer" icon={<Download size={15} />}>
              下载
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? '');
      resolve(value.includes(',') ? value.split(',')[1] : value);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
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
