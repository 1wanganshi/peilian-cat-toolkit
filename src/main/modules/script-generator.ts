import type { VideoScript, VideoTopic } from '../../shared/types';
import { AiService } from './ai-service';
import { SearchEngine } from './search-engine';

export class ScriptGenerator {
  private readonly searchEngine = new SearchEngine();
  private readonly aiService = new AiService();

  async searchAndGenerateTopics(topic: string): Promise<VideoTopic[]> {
    const hotContent = await this.searchEngine.searchHotContent(topic, ['douyin', 'xiaohongshu', 'bilibili']);
    return this.aiService.generateTopics(topic, hotContent);
  }

  async generateScript(topic: VideoTopic, duration: number, requirements?: string): Promise<VideoScript> {
    if (!topic) {
      throw new Error('请选择一个选题');
    }

    return this.aiService.generateScript(topic, duration, requirements);
  }
}
