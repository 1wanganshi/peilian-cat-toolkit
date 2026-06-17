import { Button, Card, Input, Space, Spin, Tag, message } from 'antd';
import { CalendarDays, ChevronDown, ChevronUp, Download, RefreshCw, Sparkles } from 'lucide-react';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { HistoryItem, GenerateScriptRequest, TodayVideoTopic, VideoScript, VideoTopic } from '../../shared/types';
import { EmptyState } from '../components/empty-state';
import { ErrorBanner } from '../components/error-banner';

type HistoryRouteState = {
  historyItem?: HistoryItem;
};

type ScriptOption = {
  id: string;
  topic: VideoTopic | TodayVideoTopic;
  status: 'pending' | 'running' | 'done' | 'error';
  script?: VideoScript;
  error?: string;
};

export function ScriptGeneratorPage(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const generationRunId = useRef(0);
  const [topic, setTopic] = useState('');
  const [requirements, setRequirements] = useState('');
  const [freeTopicOpen, setFreeTopicOpen] = useState(false);
  const [topics, setTopics] = useState<VideoTopic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<VideoTopic | TodayVideoTopic | null>(null);
  const [todayTopics, setTodayTopics] = useState<TodayVideoTopic[]>([]);
  const [scriptOptions, setScriptOptions] = useState<ScriptOption[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [todayLoading, setTodayLoading] = useState(false);
  const [todaySteps, setTodaySteps] = useState<Array<{ text: string; status: 'running' | 'done' }>>([]);
  const [error, setError] = useState('');
  const candidateTopics = todayTopics.length > 0 ? todayTopics : topics;
  const targetTopics = candidateTopics.slice(0, 4);
  const selectedScriptOption = scriptOptions.find((option) => option.id === selectedScriptId) ?? scriptOptions.find((option) => option.script);
  const script = selectedScriptOption?.script ?? null;

  useEffect(() => {
    const item = (location.state as HistoryRouteState | null)?.historyItem;
    if (!item || item.type !== 'script') return;

    const content = item.content as { request?: GenerateScriptRequest; result?: VideoScript } | undefined;
    if (content?.result) {
      const historyTopic = content.request?.topic ?? { title: content.result.title, heatScore: 0, reason: '', references: [] };
      const historyOption: ScriptOption = {
        id: getTopicKey(historyTopic, 0),
        topic: historyTopic,
        status: 'done',
        script: content.result
      };
      setScriptOptions([historyOption]);
      setSelectedScriptId(historyOption.id);
      setSelectedTopic(historyTopic);
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
    setScriptOptions([]);
    setSelectedScriptId(null);
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
    setScriptOptions([]);
    setSelectedScriptId(null);
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
        { text: '已准备生成 4 条脚本', status: 'done' }
      ]);
      setTodayTopics(result);
      setSelectedTopic(result[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '系统推荐选题生成失败，请稍后重试。');
    } finally {
      setTodayLoading(false);
    }
  }

  async function generateScripts(): Promise<void> {
    const targets = targetTopics;
    if (targets.length === 0) {
      setError('请先生成选题');
      return;
    }

    const runId = generationRunId.current + 1;
    generationRunId.current = runId;
    setScriptOptions(targets.map((item, index) => ({
      id: getTopicKey(item, index),
      topic: item,
      status: 'pending'
    })));
    setSelectedScriptId(null);
    setLoading(true);
    setError('');
    try {
      await Promise.all(targets.map(async (item, index) => {
        const id = getTopicKey(item, index);
        setScriptOptions((current) => updateScriptOption(current, id, { status: 'running', error: undefined }));

        try {
          const result = await window.electron.generateScript({
            topic: item,
            duration: 30,
            requirements
          });
          if (generationRunId.current !== runId) return;
          setScriptOptions((current) => updateScriptOption(current, id, { status: 'done', script: result }));
          setSelectedScriptId((current) => current ?? id);
        } catch (err) {
          if (generationRunId.current !== runId) return;
          setScriptOptions((current) => updateScriptOption(current, id, {
            status: 'error',
            error: err instanceof Error ? err.message : '脚本生成失败，请稍后重试。'
          }));
        }
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : '脚本生成失败，请稍后重试。');
    } finally {
      if (generationRunId.current === runId) setLoading(false);
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

        <Card title="生成短视频脚本" bordered={false}>
          {targetTopics.length === 0 ? (
            <EmptyState title="还未生成选题" description="先生成系统推荐选题，或打开自由选题生成自定义方向。" />
          ) : (
            <div className="selected-topic-panel">
              <strong>已准备 {targetTopics.length} 个选题</strong>
              <p>点击生成后会同时生成 {targetTopics.length} 条脚本。</p>
            </div>
          )}
          <Space direction="vertical" size={10} className="full-width">
            <Button type="primary" icon={<Sparkles size={16} />} block loading={loading} onClick={() => generateScripts()} disabled={targetTopics.length === 0}>
              生成内容
            </Button>
            {script && <div className="loading-hint">内容已生成，可在右侧查看并导出。</div>}
          </Space>
        </Card>
      </section>

      <section className="panel">
        {error && <ErrorBanner message={error} />}
        {loading && scriptOptions.length === 0 && <Spin className="center-spin" tip="正在生成内容..." />}
        {!loading && !script && candidateTopics.length === 0 && (
          <EmptyState title="等待内容" description="可以先生成系统推荐选题，或打开自由选题后搜索。" />
        )}

        {candidateTopics.length > 0 && scriptOptions.length === 0 && (
          <div className="topic-grid">
            {targetTopics.map((item) => (
              <Card key={'id' in item ? item.id : item.title} className="topic-result-card" title={item.title} variant="borderless">
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
                </Space>
              </Card>
            ))}
          </div>
        )}

        {scriptOptions.length > 0 && (
          <div className="script-option-grid">
            {scriptOptions.map((option) => (
              <Card
                key={option.id}
                className={`script-option-card ${selectedScriptOption?.id === option.id ? 'active' : ''}`}
                title={option.script?.title || option.topic.title}
                variant="borderless"
                onClick={() => option.script && setSelectedScriptId(option.id)}
              >
                <Space direction="vertical" size={10} className="full-width">
                  <div className="script-option-meta">
                    <Tag color={scriptStatusColor(option.status)}>{scriptStatusText(option.status)}</Tag>
                    {'heatScore' in option.topic && <Tag color="success">热度 {option.topic.heatScore}</Tag>}
                  </div>
                  {option.script ? (
                    <p>{option.script.hook || option.script.body[0]?.content || ''}</p>
                  ) : option.error ? (
                    <p className="loading-hint">{option.error}</p>
                  ) : (
                    <p className="loading-hint">{option.status === 'running' ? '正在生成...' : '等待生成...'}</p>
                  )}
                  {option.script && (
                    <Button type={selectedScriptOption?.id === option.id ? 'primary' : 'default'} onClick={() => setSelectedScriptId(option.id)}>
                      {selectedScriptOption?.id === option.id ? '正在查看' : '查看这条'}
                    </Button>
                  )}
                </Space>
              </Card>
            ))}
          </div>
        )}

        {script && (
          <Card title={script.title || '生成内容'} bordered={false}>
            <div className="script-result">
              {script.hook && <p className="highlight">{script.hook}</p>}
              {(Array.isArray(script.body) ? script.body : []).map((scene, index) => (
                <div className="scene" key={`${scene.scene}-${index}`}>
                  <p>{scene.content || ''}</p>
                </div>
              ))}
              {(!Array.isArray(script.body) || script.body.length === 0) && (
                <p className="loading-hint">生成结果结构不完整，请点击重新生成。</p>
              )}
              {script.ending && <p>{script.ending}</p>}
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

function getTopicKey(topic: VideoTopic | TodayVideoTopic, index: number): string {
  return 'id' in topic ? topic.id : `${topic.title}-${index}`;
}

function updateScriptOption(options: ScriptOption[], id: string, patch: Partial<ScriptOption>): ScriptOption[] {
  return options.map((option) => option.id === id ? { ...option, ...patch } : option);
}

function scriptStatusText(status: ScriptOption['status']): string {
  if (status === 'done') return '已生成';
  if (status === 'running') return '生成中';
  if (status === 'error') return '失败';
  return '等待';
}

function scriptStatusColor(status: ScriptOption['status']): string {
  if (status === 'done') return 'green';
  if (status === 'running') return 'blue';
  if (status === 'error') return 'red';
  return 'default';
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
