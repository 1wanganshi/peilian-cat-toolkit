import type { TodayVideoTopic, VideoScript, VideoTopic } from '../../shared/types';
import { AiService } from './ai-service';
import { SearchEngine } from './search-engine';

export class ScriptGenerator {
  private readonly searchEngine = new SearchEngine();
  private readonly aiService = new AiService();
  private todayCache?: { date: string; topics: TodayVideoTopic[] };

  async searchAndGenerateTopics(topic: string): Promise<VideoTopic[]> {
    const hotContent = await this.searchEngine.searchHotContent(topic, ['douyin', 'xiaohongshu', 'bilibili']);
    return this.aiService.generateTopics(topic, hotContent);
  }

  async generateTodayTopics(forceRefresh = false): Promise<TodayVideoTopic[]> {
    const today = new Date().toISOString().slice(0, 10);
    if (!forceRefresh && this.todayCache?.date === today && this.todayCache.topics.length > 0) {
      return this.todayCache.topics;
    }

    const hotContent = await this.searchEngine.searchEnglishEnlightenmentTopics();
    const topics = await this.aiService.generateTodayTopics(hotContent);
    if (topics.length === 0) {
      throw new Error('选题整理失败，请重新生成。');
    }

    this.todayCache = { date: today, topics };
    return topics;
  }

  async generateScript(topic: VideoTopic | TodayVideoTopic, duration: number, requirements?: string): Promise<VideoScript> {
    if (!topic) {
      throw new Error('请选择一个选题');
    }

    return this.aiService.generateScript(topic, duration, requirements);
  }
}
