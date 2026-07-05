const STORAGE_KEY = 'word-quiz-state-v2';

const freshState = () => ({
  learned: [],
  testStats: { correct: 0, incorrect: 0, sessions: 0 },
  gameStats: { matchBestSeconds: null, speedBest: 0 },
});

export const loadProgress = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return freshState();
    const defaults = freshState();
    return {
      learned: Array.isArray(parsed.learned) ? [...new Set(parsed.learned)] : [],
      testStats: { ...defaults.testStats, ...parsed.testStats },
      gameStats: { ...defaults.gameStats, ...parsed.gameStats },
    };
  } catch (error) {
    console.warn('İlerleme kaydı okunamadı.', error);
    return freshState();
  }
};

export const saveProgress = (progress) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
};
