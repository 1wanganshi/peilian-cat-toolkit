import { Button, Card, Image, Input, Radio, Space, Tabs, Upload, message } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { Copy, Download, ImagePlus, RefreshCw, Sparkles, UploadCloud } from 'lucide-react';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import type { MomentsGenerateTextResult, MomentsImageResult, MomentsRewriteResult } from '../../shared/types';
import { EmptyState } from '../components/empty-state';
import { ErrorBanner } from '../components/error-banner';

const rewriteStyles = ['日常真实风', '轻松幽默风', '温柔治愈风', '高级简短风', '朋友聊天风'];
const generateStyles = [...rewriteStyles, '情绪感悟风', '带货种草风'];

type ReferenceImage = {
  name: string;
  base64: string;
};

export function MomentsPage(): JSX.Element {
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
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  const selectedTextIndex = useMemo(
    () => generated?.results.find((item) => item.text === selectedText)?.index,
    [generated, selectedText]
  );

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
        items={[
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
