import type { HotContent, Platform } from '../../shared/types';

const PLATFORM_LABELS: Record<Platform, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  bilibili: 'B站',
  zhihu: '知乎',
  wechat: '公众号'
};

const PLATFORM_QUERY_HINTS: Record<Platform, string> = {
  douyin: 'site:douyin.com OR 抖音 图文 爆款',
  xiaohongshu: 'site:xiaohongshu.com OR 小红书 干货 收藏',
  bilibili: 'site:bilibili.com OR B站 高播放',
  zhihu: 'site:zhihu.com OR 知乎 家长 问题',
  wechat: 'site:mp.weixin.qq.com OR 公众号 亲子教育'
};

type SearchEntry = {
  title: string;
  url: string;
  summary: string;
};

export class SearchEngine {
  async searchEnglishEnlightenmentTopics(): Promise<HotContent[]> {
    const keywords = [
      '英语启蒙 热点',
      '儿童英语学习 家长 痛点',
      '幼儿英语启蒙 方法',
      '英语磨耳朵 是否有效',
      '自然拼读 儿童英语',
      '分级阅读 英语启蒙',
      '孩子英语不开口 原因',
      '家庭英语启蒙 误区',
      '儿童英语输入 输出',
      '亲子英语学习'
    ];

    if (process.env.PEILIAN_MOCK_SEARCH === '1') {
      return keywords.slice(0, 5).flatMap((keyword) =>
        this.mockSearchHotContent(keyword, ['zhihu', 'wechat', 'xiaohongshu']).slice(0, 2)
      );
    }

    const searches = keywords.map((keyword) =>
      this.searchHotContent(keyword, ['zhihu', 'wechat', 'xiaohongshu']).catch(() => [])
    );
    const results = (await Promise.all(searches)).flat();
    const uniqueResults = Array.from(new Map(results.map((item) => [item.url || item.title, item])).values());

    if (uniqueResults.length === 0) {
      throw new Error('今日选题搜索失败，请稍后重试。');
    }

    return uniqueResults
      .sort((a, b) => b.views + b.likes * 5 + b.comments * 8 - (a.views + a.likes * 5 + a.comments * 8))
      .slice(0, 24);
  }

  async searchHotContent(topic: string, platforms: Platform[]): Promise<HotContent[]> {
    const normalizedTopic = topic.trim();
    if (!normalizedTopic) {
      throw new Error('请输入要搜索的主题');
    }

    if (process.env.PEILIAN_MOCK_SEARCH === '1') {
      return this.mockSearchHotContent(normalizedTopic, platforms);
    }

    const searches = platforms.map((platform) => this.searchPlatform(platform, normalizedTopic));
    const settled = await Promise.allSettled(searches);
    const results = settled.flatMap((item) => item.status === 'fulfilled' ? item.value : []);

    if (results.length === 0) {
      throw new Error('联网搜索失败，请检查网络后重试');
    }

    return results.sort((a, b) => b.views + b.likes * 5 - (a.views + a.likes * 5));
  }

  private async searchPlatform(platform: Platform, topic: string): Promise<HotContent[]> {
    const query = `${topic} ${PLATFORM_QUERY_HINTS[platform]}`;
    const entries = await this.searchBingRss(query);
    return entries.slice(0, 4).map((entry, index) => this.toHotContent(platform, entry, index));
  }

  private async searchBingRss(query: string): Promise<SearchEntry[]> {
    const url = new URL('https://www.bing.com/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'rss');
    url.searchParams.set('setlang', 'zh-CN');
    url.searchParams.set('cc', 'CN');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/rss+xml, application/xml, text/xml',
          'User-Agent': 'Mozilla/5.0 PeilianCatToolkit/0.1'
        },
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`Bing search failed: ${response.status}`);
      }
      return this.parseRss(await response.text());
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseRss(xml: string): SearchEntry[] {
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gu)].map((match) => {
      const item = match[1];
      return {
        title: this.decodeXml(this.pickTag(item, 'title')),
        url: this.decodeXml(this.pickTag(item, 'link')),
        summary: this.decodeXml(this.pickTag(item, 'description'))
      };
    }).filter((item) => item.title && item.url);
  }

  private pickTag(xml: string, tag: string): string {
    const match = xml.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'u'));
    return match?.[1]?.trim() ?? '';
  }

  private decodeXml(value: string): string {
    return value
      .replace(/<[^>]+>/gu, '')
      .replace(/&amp;/gu, '&')
      .replace(/&lt;/gu, '<')
      .replace(/&gt;/gu, '>')
      .replace(/&quot;/gu, '"')
      .replace(/&#39;/gu, "'")
      .replace(/&#x([0-9a-f]+);/giu, (_match, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/gu, (_match, code: string) => String.fromCodePoint(Number(code)))
      .trim();
  }

  private toHotContent(platform: Platform, entry: SearchEntry, index: number): HotContent {
    const scoreSeed = `${entry.title}${entry.summary}`.length + index * 17;
    return {
      platform,
      title: entry.title,
      views: 180000 + scoreSeed * 1200,
      likes: 9000 + scoreSeed * 180,
      comments: 400 + scoreSeed * 12,
      url: entry.url
    };
  }

  private mockSearchHotContent(topic: string, platforms: Platform[]): HotContent[] {
    return platforms.flatMap((platform) => [0, 1, 2].map((index) => {
      const views = 260000 + topic.length * 18000 + index * 72000;
      const likes = 18000 + topic.length * 900 + index * 4200;
      return {
        platform,
        title: `${PLATFORM_LABELS[platform]}热榜：${topic}${this.titleSuffix(index)}`,
        views,
        likes,
        comments: 600 + topic.length * 30 + index * 210,
        url: `https://example.com/${platform}/${encodeURIComponent(topic)}-${index + 1}`
      };
    }));
  }

  private titleSuffix(index: number): string {
    return ['爆款拆解', '高互动模板', '新手避坑清单'][index] ?? '内容参考';
  }
}
