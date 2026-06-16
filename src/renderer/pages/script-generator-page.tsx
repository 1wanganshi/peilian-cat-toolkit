import { Button, Card, Input, Space, Spin, Tag, message } from 'antd';
import { CalendarDays, ChevronDown, ChevronUp, Download, RefreshCw, Sparkles } from 'lucide-react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { HistoryItem, GenerateScriptRequest, TodayVideoTopic, VideoScript, VideoTopic } from '../../shared/types';
import { EmptyState } from '../components/empty-state';
import { ErrorBanner } from '../components/error-banner';

type HistoryRouteState = {
  historyItem?: HistoryItem;
};

export function ScriptGeneratorPage(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const [topic, setTopic] = useState('');
  const [requirements, setRequirements] = useState('');
  const [freeTopicOpen, setFreeTopicOpen] = useState(false);
  const [topics, setTopics] = useState<VideoTopic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<VideoTopic | TodayVideoTopic | null>(null);
  const [todayTopics, setTodayTopics] = useState<TodayVideoTopic[]>([]);
  const [script, setScript] = useState<VideoScript | null>(null);
  const [loading, setLoading] = useState(false);
  const [todayLoading, setTodayLoading] = useState(false);
  const [todaySteps, setTodaySteps] = useState<Array<{ text: string; status: 'running' | 'done' }>>([]);
  const [error, setError] = useState('');
  const candidateTopics = todayTopics.length > 0 ? todayTopics : topics;

  useEffect(() => {
    const item = (location.state as HistoryRouteState | null)?.historyItem;
    if (!item || item.type !== 'script') return;

    const content = item.content as { request?: GenerateScriptRequest; result?: VideoScript } | undefined;
    if (content?.result) {
      setScript(content.result);
      setSelectedTopic(content.request?.topic ?? null);
      setRequirements(content.request?.requirements ?? '');
      setTopics([]);
      setTodayTopics([]);
      setError('');
      message.success('已使用历史脚本');
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  async function searchTopics(): Promise<void> {
    if (!topic.trim()) {
      setError('请输入选题');
      return;
    }

    setLoading(true);
    setError('');
    setScript(null);
    try {
      const result = await window.electron.searchHotTopics(topic);
      setTopics(result);
      setSelectedTopic(result[0] ?? null);
      setFreeTopicOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '选题搜索失败');
    } finally {
      setLoading(false);
    }
  }

  async function loadTodayTopics(forceRefresh = false): Promise<void> {
    setTodayLoading(true);
    setTodaySteps([{ text: '正在连接系统推荐源', status: 'running' }]);
    setError('');
    setScript(null);
    try {
      window.setTimeout(() => setTodaySteps([
        { text: '已连接系统推荐源', status: 'done' },
        { text: '正在搜索英语启蒙热点', status: 'running' }
      ]), 420);
      window.setTimeout(() => setTodaySteps([
        { text: '已连接系统推荐源', status: 'done' },
        { text: '已完成热点搜索', status: 'done' },
        { text: '正在整理 4 个推荐选题', status: 'running' }
      ]), 900);
      const result = await window.electron.generateTodayTopics(forceRefresh);
      setTodaySteps([
        { text: '已连接系统推荐源', status: 'done' },
        { text: '已完成热点搜索', status: 'done' },
        { text: '已整理 4 个推荐选题', status: 'done' },
        { text: '请选择一个选题生成内容', status: 'done' }
      ]);
      setTodayTopics(result);
      setSelectedTopic(result[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '系统推荐选题生成失败，请稍后重试。');
    } finally {
      setTodayLoading(false);
    }
  }

  async function generateScript(topicItem?: VideoTopic | TodayVideoTopic | null): Promise<void> {
    const target = topicItem ?? selectedTopic;
    if (!target) {
      setError('请选择一个选题');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await window.electron.generateScript({
        topic: target,
        duration: 30,
        requirements
      });
      setScript(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '脚本生成失败，请稍后重试。');
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
        <Card
          title="输入自由选题"
          bordered={false}
          extra={
            <Button
              size="small"
              type="text"
              icon={freeTopicOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              onClick={() => setFreeTopicOpen((value) => !value)}
            >
              {freeTopicOpen ? '隐藏' : '打开'}
            </Button>
          }
        >
          {freeTopicOpen ? (
            <Space direction="vertical" size={16} className="full-width">
              <Input.Search
                size="large"
                placeholder="例如：少儿英语启蒙、自然拼读、亲子阅读"
                value={topic}
                enterButton="生成自由选题"
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
            </Space>
          ) : (
            <div className="model-note">
              <Sparkles size={18} />
              <span>需要自定义主题时再打开；系统推荐选题可以直接使用。</span>
            </div>
          )}
        </Card>

        <Card title="系统推荐选题" bordered={false}>
          <Space direction="vertical" size={12} className="full-width">
            <div className="model-note">
              <CalendarDays size={18} />
              <span>点击后自动搜索英语启蒙热点，再整理成 4 个适合短视频创作的推荐选题。</span>
            </div>
            <Space wrap>
              <Button
                type="primary"
                icon={<Sparkles size={16} />}
                loading={todayLoading}
                onClick={() => loadTodayTopics(false)}
              >
                生成系统推荐选题
              </Button>
              <Button icon={<RefreshCw size={16} />} loading={todayLoading} onClick={() => loadTodayTopics(true)}>
                重新生成推荐选题
              </Button>
            </Space>
            {(todayLoading || todaySteps.length > 0) && <TopicProgress steps={todaySteps} />}
          </Space>
        </Card>

        <Card title="选择选题后生成内容" bordered={false}>
          {!selectedTopic ? (
            <EmptyState title="还未选择选题" description="先在右侧选择系统推荐选题，或打开自由选题生成自定义方向。" />
          ) : (
            <div className="selected-topic-panel">
              <strong>{selectedTopic.title}</strong>
              <p>{'coreIdea' in selectedTopic ? selectedTopic.coreIdea : selectedTopic.reason}</p>
              {'heatScore' in selectedTopic && <Tag color="success">热度 {selectedTopic.heatScore}</Tag>}
            </div>
          )}
          <Space direction="vertical" size={10} className="full-width">
            <Button type="primary" icon={<Sparkles size={16} />} block loading={loading} onClick={() => generateScript()} disabled={!selectedTopic}>
              生成内容
            </Button>
            {script && <div className="loading-hint">内容已生成，可在右侧查看并导出。</div>}
          </Space>
        </Card>
      </section>

      <section className="panel">
        {error && <ErrorBanner message={error} />}
        {loading && <Spin className="center-spin" tip="正在生成内容..." />}
        {!loading && !script && candidateTopics.length === 0 && (
          <EmptyState title="等待内容" description="可以先生成系统推荐选题，或打开自由选题后搜索。" />
        )}

        {candidateTopics.length > 0 && !script && (
          <div className="topic-grid">
            {candidateTopics.map((item) => (
              <Card key={'id' in item ? item.id : item.title} className={`topic-result-card ${selectedTopic?.title === item.title ? 'active' : ''}`} title={item.title} variant="borderless">
                <Space direction="vertical" size={12} className="full-width">
                  {'coreIdea' in item ? (
                    <>
                      <p>{item.coreIdea}</p>
                      <div className="fact-list">
                        {item.facts.map((fact, index) => (
                          <div className="fact-item" key={`${item.id}-${index}`}>
                            <Tag color="blue">{index + 1}</Tag>
                            <span>{fact}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <p>{item.reason}</p>
                      <Tag color="success">热度 {item.heatScore}</Tag>
                    </>
                  )}
                  <Button type={selectedTopic?.title === item.title ? 'primary' : 'default'} onClick={() => setSelectedTopic(item)} disabled={loading}>
                    {selectedTopic?.title === item.title ? '已选择' : '选择该选题'}
                  </Button>
                </Space>
              </Card>
            ))}
          </div>
        )}

        {script && (
          <Card title={script.title || '生成内容'} bordered={false}>
            <div className="script-result">
              <h2>开头钩子</h2>
              <p className="highlight">{script.hook}</p>
              <h2>主体分镜</h2>
              {(Array.isArray(script.body) ? script.body : []).map((scene, index) => (
                <div className="scene" key={scene.scene}>
                  <strong>分镜 {scene.scene || index + 1} · {scene.duration || '按内容节奏'}</strong>
                  <p>{scene.content || ''}</p>
                  <span>画面：{scene.visual || '按逐字稿节奏安排口播画面。'}</span>
                  <span>字幕：{scene.textOverlay || '-'}</span>
                </div>
              ))}
              {(!Array.isArray(script.body) || script.body.length === 0) && (
                <p className="loading-hint">生成结果结构不完整，请点击重新生成。</p>
              )}
              <h2>结尾引导</h2>
              <p>{script.ending}</p>
              <div className="tag-row">{(Array.isArray(script.hashtags) ? script.hashtags : []).map((tag) => <Tag key={tag}>{tag}</Tag>)}</div>
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

function TopicProgress({ steps }: { steps: Array<{ text: string; status: 'running' | 'done' }> }): JSX.Element {
  return (
    <div className="topic-progress">
      {steps.map((step, index) => (
        <div className={`topic-progress-line ${step.status}`} key={`${step.text}-${index}`}>
          <span>{step.status === 'done' ? '✓' : '•'}</span>
          <strong>{step.text}</strong>
        </div>
      ))}
    </div>
  );
}
