import { create } from 'zustand';
import type { ArticleGenerationProgress, ArticleImageResult, ArticlePackage } from '../../shared/types';

type ArticleGenerationState = {
  topic: string;
  article: ArticlePackage | null;
  loading: boolean;
  imageLoadingIndex: number | null;
  error: string;
  progressItems: ArticleGenerationProgress[];
  activeRequestId: string;
  setTopic: (topic: string) => void;
  startGeneration: () => Promise<void>;
  regenerateImage: (index: number) => Promise<ArticleImageResult | undefined>;
  regenerateFailedImages: () => Promise<void>;
  loadArticleFromHistory: (article: ArticlePackage) => void;
};

let progressUnsubscribe: (() => void) | undefined;

export const useArticleGenerationStore = create<ArticleGenerationState>((set, get) => ({
  topic: '',
  article: null,
  loading: false,
  imageLoadingIndex: null,
  error: '',
  progressItems: [],
  activeRequestId: '',

  setTopic: (topic) => set({ topic }),

  loadArticleFromHistory: (article) => set({
    topic: article.topic || article.publishContent?.title || '',
    article,
    loading: false,
    imageLoadingIndex: null,
    error: '',
    progressItems: [],
    activeRequestId: ''
  }),

  startGeneration: async () => {
    if (get().loading) return;

    const normalizedTopic = get().topic.trim();
    if (!normalizedTopic) {
      set({ error: '请输入英语教育相关选题' });
      return;
    }

    const requestId = crypto.randomUUID();
    set({
      loading: true,
      error: '',
      article: null,
      activeRequestId: requestId,
      progressItems: [
        {
          requestId,
          step: '开始',
          message: `收到选题“${normalizedTopic}”，准备生成抖音图文内容`,
          status: 'running',
          createdAt: new Date().toISOString()
        }
      ]
    });

    try {
      const article = await window.electron.generateArticleWithProgress(normalizedTopic, requestId);
      if (get().activeRequestId === requestId) {
        set({ article, error: '' });
      }
    } catch (err) {
      if (get().activeRequestId === requestId) {
        set({ error: normalizeGenerationError(err) });
      }
    } finally {
      if (get().activeRequestId === requestId) {
        set({ loading: false });
      }
    }
  },

  regenerateImage: async (index) => {
    const current = get().article;
    if (!current) return undefined;

    const card = current.cards[index];
    set({ imageLoadingIndex: card.index, error: '' });
    try {
      const result = await window.electron.regenerateArticleImage(card);
      set((state) => {
        if (!state.article) return state;
        const images = [...state.article.images];
        images[index] = result.image;
        const failedImages = result.failedImage
          ? state.article.failedImages.some((item) => item.index === result.failedImage?.index)
            ? state.article.failedImages.map((item) => item.index === result.failedImage?.index ? result.failedImage : item)
            : [...state.article.failedImages, result.failedImage]
          : state.article.failedImages.filter((item) => item.index !== result.index);

        return {
          article: { ...state.article, images, failedImages },
          error: result.failedImage ? `第 ${result.index} 张图片生成失败：${result.failedImage.message}` : ''
        };
      });
      return result;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : `第 ${card.index} 张图片生成失败，请重试` });
      return undefined;
    } finally {
      set({ imageLoadingIndex: null });
    }
  },

  regenerateFailedImages: async () => {
    const failedIndexes = get().article?.failedImages.map((item) => item.index - 1) ?? [];
    for (const index of failedIndexes) {
      await get().regenerateImage(index);
    }
  }
}));

export function ensureArticleGenerationProgressListener(): () => void {
  if (!progressUnsubscribe) {
    progressUnsubscribe = window.electron.onArticleGenerationProgress((progress) => {
      const { activeRequestId } = useArticleGenerationStore.getState();
      if (progress.requestId !== activeRequestId) return;

      useArticleGenerationStore.setState((state) => {
        const article = applyProgressData(state.article, progress.data);
        return {
          article,
          progressItems: [...state.progressItems, progress].slice(-80)
        };
      });
    });
  }

  return () => {
    progressUnsubscribe?.();
    progressUnsubscribe = undefined;
  };
}

function applyProgressData(
  current: ArticlePackage | null,
  data: ArticleGenerationProgress['data'] | undefined
): ArticlePackage | null {
  if (data?.article) {
    return data.article;
  }

  if (!current || !data?.imageResult) {
    return current;
  }

  const { imageResult } = data;
  const imageIndex = imageResult.index - 1;
  const images = [...current.images];
  images[imageIndex] = imageResult.image;
  const failedImages = imageResult.failedImage
    ? current.failedImages.some((item) => item.index === imageResult.failedImage?.index)
      ? current.failedImages.map((item) => item.index === imageResult.failedImage?.index ? imageResult.failedImage : item)
      : [...current.failedImages, imageResult.failedImage]
    : current.failedImages.filter((item) => item.index !== imageResult.index);

  return { ...current, images, failedImages };
}

function normalizeGenerationError(err: unknown): string {
  const messageText = err instanceof Error ? err.message : '生成失败，请重试';
  if (messageText.includes('联网搜索失败')) {
    return '联网搜索失败，请检查网络后重试。';
  }
  if (messageText.includes('请输入') || messageText.includes('英语')) {
    return messageText;
  }
  return `AI 生成失败，请重试。${messageText}`;
}
