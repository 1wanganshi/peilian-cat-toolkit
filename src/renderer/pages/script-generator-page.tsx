import { Button, Card, Input, Radio, Space, Spin, Tag, message } from 'antd';
import { Download, Sparkles } from 'lucide-react';
import type { JSX } from 'react';
import { useState } from 'react';
import type { VideoScript, VideoTopic } from '../../shared/types';
import { EmptyState } from '../components/empty-state';
import { ErrorBanner } from '../components/error-banner';

const DURATIONS = [15, 30, 60];

export function ScriptGeneratorPage(): JSX.Element {
  const [topic, setTopic] = useState('');
  const [requirements, setRequirements] = useState('');
  const [duration, setDuration] = useState(30);
  const [topics, setTopics] = useState<VideoTopic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<VideoTopic | null>(null);
  const [script, setScript] = useState<VideoScript | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function searchTopics(): Promise<void> {
    if (!topic.trim()) {
      setError('请输入视频主题');
      return;
    }

    setLoading(true);
    setError('');
    setScript(null);
    try {
      const result = await window.electron.searchHotTopics(topic);
      setTopics(result);
      setSelectedTopic(result[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '选题搜索失败');
    } finally {
      setLoading(false);
    }
  }

  async function generateScript(): Promise<void> {
    if (!selectedTopic) {
      setError('请选择一个选题');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await window.electron.generateScript({ topic: selectedTopic, duration, requirements });
      setScript(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '脚本生成失败');
    } finally {
      setLoading(false);
    }
  }

  async function exportScript(format: 'txt' | 'md' | 'pdf'): Promise<void> {
    if (!script) return;
    const result = await window.electron.exportScript(script, format);
    message.success(`已导出：${result.filePath}`);
  }

  return (
    <div className="tool-grid">
      <section className="panel">
        <Card title="输入主题" bordered={false}>
          <Space direction="vertical" size={16} className="full-width">
            <Input.Search
              size="large"
              placeholder="例如：少儿钢琴陪练、亲子阅读、口播变现"
              value={topic}
              enterButton="搜索选题"
              loading={loading}
              onChange={(event) => setTopic(event.target.value)}
              onSearch={searchTopics}
            />
            <Input.TextArea
              rows={4}
              placeholder="补充要求：人设、平台、禁忌、产品卖点等"
              value={requirements}
              onChange={(event) => setRequirements(event.target.value)}
            />
            <Radio.Group
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
              optionType="button"
              buttonStyle="solid"
            >
              {DURATIONS.map((item) => (
                <Radio.Button key={item} value={item}>
                  {item}秒
                </Radio.Button>
              ))}
            </Radio.Group>
          </Space>
        </Card>

        <Card title="选题列表" bordered={false}>
          {topics.length === 0 ? (
            <EmptyState title="暂无选题" description="输入主题后会生成 5 个可拍摄方向。" />
          ) : (
            <div className="topic-list">
              {topics.map((item) => (
                <button
                  key={item.title}
                  className={`topic-item ${selectedTopic?.title === item.title ? 'active' : ''}`}
                  onClick={() => setSelectedTopic(item)}
                  type="button"
                >
                  <strong>{item.title}</strong>
                  <span>{item.reason}</span>
                  <Tag color="success">热度 {item.heatScore}</Tag>
                </button>
              ))}
            </div>
          )}
          <Button type="primary" icon={<Sparkles size={16} />} block onClick={generateScript} disabled={!selectedTopic}>
            生成脚本
          </Button>
        </Card>
      </section>

      <section className="panel">
        {error && <ErrorBanner message={error} />}
        {loading && <Spin className="center-spin" tip="正在生成内容..." />}
        {!loading && !script && <EmptyState title="等待脚本" description="选择选题后生成标题、钩子、分镜和标签。" />}
        {script && (
          <Card title={script.title} bordered={false}>
            <div className="script-result">
              <h2>开头钩子</h2>
              <p className="highlight">{script.hook}</p>
              <h2>主体分镜</h2>
              {script.body.map((scene) => (
                <div className="scene" key={scene.scene}>
                  <strong>分镜 {scene.scene} · {scene.duration}</strong>
                  <p>{scene.content}</p>
                  <span>画面：{scene.visual}</span>
                  <span>字幕：{scene.textOverlay}</span>
                </div>
              ))}
              <h2>结尾引导</h2>
              <p>{script.ending}</p>
              <div className="tag-row">{script.hashtags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</div>
              <Space wrap>
                <Button icon={<Download size={16} />} onClick={() => exportScript('md')}>导出 MD</Button>
                <Button icon={<Download size={16} />} onClick={() => exportScript('txt')}>导出 TXT</Button>
                <Button icon={<Download size={16} />} onClick={() => exportScript('pdf')}>导出 PDF</Button>
              </Space>
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}
