import { GamesModule } from './modules/games.js';
import { LearnModule } from './modules/learn.js';
import { loadProgress, saveProgress } from './modules/storage.js';
import { TestModule } from './modules/test.js';

const THEME_KEY = 'word-quiz-theme';
const validViews = new Set(['learn', 'test', 'games']);

const elements = {
  navButtons: [...document.querySelectorAll('[data-view]')],
  viewPanels: [...document.querySelectorAll('[data-view-panel]')],
  themeToggle: document.getElementById('themeToggle'),
  learnedMetric: document.getElementById('learnedMetric'),
  accuracyMetric: document.getElementById('accuracyMetric'),
  gameMetric: document.getElementById('gameMetric'),
  progressLabel: document.getElementById('progressLabel'),
  progressFill: document.getElementById('progressFill'),
  progressTrack: document.querySelector('.progress-track'),
  appError: document.getElementById('appError'),
};

let progress = loadProgress();
let vocabulary = [];
let learnModule;
let testModule;
let gamesModule;
let activeView = 'learn';

const persistAndRefresh = () => {
  saveProgress(progress);
  renderOverview();
};

const renderOverview = () => {
  const validIds = new Set(vocabulary.map((entry) => entry.id));
  progress.learned = progress.learned.filter((id) => validIds.has(id));
  const learned = progress.learned.length;
  const testTotal = progress.testStats.correct + progress.testStats.incorrect;
  const accuracy = testTotal ? Math.round((progress.testStats.correct / testTotal) * 100) : 0;
  const completion = vocabulary.length ? Math.round((learned / vocabulary.length) * 100) : 0;
  elements.learnedMetric.textContent = learned;
  elements.accuracyMetric.textContent = `${accuracy}%`;
  elements.gameMetric.textContent = progress.gameStats.speedBest;
  elements.progressLabel.textContent = `${learned} / ${vocabulary.length || 500}`;
  elements.progressFill.style.width = `${completion}%`;
  elements.progressTrack.setAttribute('aria-valuenow', String(completion));
};

const switchView = (view, updateHash = true) => {
  if (!validViews.has(view)) view = 'learn';
  const previousView = activeView;
  if (activeView === 'games' && view !== 'games') gamesModule?.deactivate();
  activeView = view;
  if (view === 'games' && previousView !== 'games') gamesModule?.showMenu();
  elements.navButtons.forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('is-active', active);
    active ? button.setAttribute('aria-current', 'page') : button.removeAttribute('aria-current');
  });
  elements.viewPanels.forEach((panel) => {
    panel.hidden = panel.dataset.viewPanel !== view;
  });
  if (updateHash) history.replaceState(null, '', `#${view}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const setTheme = (theme) => {
  document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark';
  elements.themeToggle.innerHTML = `<span aria-hidden="true">${dark ? '☀' : '☾'}</span>`;
  elements.themeToggle.setAttribute('aria-label', dark ? 'Açık temayı aç' : 'Koyu temayı aç');
};

const initTheme = () => {
  const stored = localStorage.getItem(THEME_KEY);
  const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  setTheme(stored || preferred);
};

const bootstrap = async () => {
  try {
    const response = await fetch('data/vocabulary.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    vocabulary = await response.json();
    renderOverview();
    learnModule = new LearnModule(document.getElementById('learnView'), vocabulary, progress, persistAndRefresh);
    testModule = new TestModule(document.getElementById('testView'), vocabulary, progress, persistAndRefresh);
    gamesModule = new GamesModule(document.getElementById('gamesView'), vocabulary, progress, persistAndRefresh);
    const requestedView = window.location.hash.slice(1);
    switchView(validViews.has(requestedView) ? requestedView : 'learn', false);
  } catch (error) {
    console.error('Kelime verisi yüklenemedi.', error);
    elements.appError.hidden = false;
    elements.appError.textContent = 'Kelime verisi yüklenemedi. Uygulamayı yerel bir HTTP sunucusu üzerinden açın.';
  }
};

elements.navButtons.forEach((button) =>
  button.addEventListener('click', () => switchView(button.dataset.view)),
);

elements.themeToggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  setTheme(next);
});

window.addEventListener('hashchange', () => switchView(window.location.hash.slice(1), false));

initTheme();
bootstrap();
