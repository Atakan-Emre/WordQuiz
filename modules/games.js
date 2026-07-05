import { buildChoices, filterByWeek, formatTime, shuffle } from './utils.js';

export class GamesModule {
  constructor(root, vocabulary, progress, onProgress) {
    this.root = root;
    this.vocabulary = vocabulary;
    this.progress = progress;
    this.onProgress = onProgress;
    this.matchTimer = null;
    this.speedTimer = null;
    this.bindElements();
    this.bindEvents();
  }

  bindElements() {
    const byId = (id) => this.root.querySelector(`#${id}`);
    this.week = byId('gameWeek');
    this.menu = byId('gameMenu');
    this.matching = byId('matchingGame');
    this.speed = byId('speedGame');
    this.matchGrid = byId('matchGrid');
    this.matchMoves = byId('matchMoves');
    this.matchTime = byId('matchTime');
    this.matchMessage = byId('matchMessage');
    this.newMatch = byId('newMatchRound');
    this.speedIntro = byId('speedIntro');
    this.speedQuestion = byId('speedQuestion');
    this.speedResult = byId('speedResult');
    this.speedTimerEl = byId('speedTimer');
    this.speedScoreEl = byId('speedScore');
    this.speedStreakEl = byId('speedStreak');
    this.speedWord = byId('speedWord');
    this.speedOptions = byId('speedOptions');
    this.speedFinalScore = byId('speedFinalScore');
    this.speedBestLabel = byId('speedBestLabel');
    this.startSpeed = byId('startSpeedGame');
    this.restartSpeed = byId('restartSpeedGame');
  }

  bindEvents() {
    this.root.querySelectorAll('[data-game]').forEach((button) =>
      button.addEventListener('click', () => this.openGame(button.dataset.game)),
    );
    this.root.querySelectorAll('[data-back-games]').forEach((button) =>
      button.addEventListener('click', () => this.showMenu()),
    );
    this.newMatch.addEventListener('click', () => this.startMatching());
    this.startSpeed.addEventListener('click', () => this.startSpeedRound());
    this.restartSpeed.addEventListener('click', () => this.startSpeedRound());
    this.week.addEventListener('change', () => this.showMenu());
  }

  pool() {
    return filterByWeek(this.vocabulary, this.week.value);
  }

  openGame(game) {
    this.menu.hidden = true;
    this.matching.hidden = game !== 'matching';
    this.speed.hidden = game !== 'speed';
    game === 'matching' ? this.startMatching() : this.resetSpeed();
  }

  showMenu() {
    this.stopTimers();
    this.matching.hidden = true;
    this.speed.hidden = true;
    this.menu.hidden = false;
  }

  startMatching() {
    clearInterval(this.matchTimer);
    this.matchSelection = [];
    this.matchLocked = false;
    this.matchedCount = 0;
    this.moves = 0;
    this.elapsed = 0;
    this.matchMoves.textContent = '0 hamle';
    this.matchTime.textContent = '00:00';
    this.matchMessage.textContent = '';
    const pairs = shuffle(this.pool()).slice(0, 6);
    const cards = shuffle(
      pairs.flatMap((entry) => [
        { pair: entry.id, type: 'word', text: entry.word },
        { pair: entry.id, type: 'meaning', text: entry.meaning },
      ]),
    );
    this.matchGrid.replaceChildren();
    cards.forEach((card) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `match-card match-card--${card.type}`;
      button.dataset.pair = card.pair;
      button.textContent = card.text;
      button.addEventListener('click', () => this.selectMatch(button));
      this.matchGrid.appendChild(button);
    });
    this.matchTimer = setInterval(() => {
      this.elapsed += 1;
      this.matchTime.textContent = formatTime(this.elapsed);
    }, 1000);
  }

  selectMatch(button) {
    if (this.matchLocked || button.classList.contains('is-matched') || this.matchSelection.includes(button)) return;
    button.classList.add('is-selected');
    this.matchSelection.push(button);
    if (this.matchSelection.length < 2) return;
    this.moves += 1;
    this.matchMoves.textContent = `${this.moves} hamle`;
    const [first, second] = this.matchSelection;
    const matched = first.dataset.pair === second.dataset.pair;
    if (matched) {
      first.classList.replace('is-selected', 'is-matched');
      second.classList.replace('is-selected', 'is-matched');
      this.matchSelection = [];
      this.matchedCount += 2;
      if (this.matchedCount === this.matchGrid.children.length) this.finishMatching();
      return;
    }
    this.matchLocked = true;
    first.classList.add('is-wrong');
    second.classList.add('is-wrong');
    setTimeout(() => {
      [first, second].forEach((card) => card.classList.remove('is-selected', 'is-wrong'));
      this.matchSelection = [];
      this.matchLocked = false;
    }, 650);
  }

  finishMatching() {
    clearInterval(this.matchTimer);
    const previous = this.progress.gameStats.matchBestSeconds;
    if (previous === null || this.elapsed < previous) this.progress.gameStats.matchBestSeconds = this.elapsed;
    this.onProgress();
    this.matchMessage.textContent = `Tur tamamlandı: ${this.moves} hamle, ${formatTime(this.elapsed)}.`;
  }

  resetSpeed() {
    clearInterval(this.speedTimer);
    this.speedIntro.hidden = false;
    this.speedQuestion.hidden = true;
    this.speedResult.hidden = true;
    this.speedTimerEl.textContent = '45';
    this.speedScoreEl.textContent = '0 puan';
    this.speedStreakEl.textContent = '0 seri';
  }

  startSpeedRound() {
    clearInterval(this.speedTimer);
    this.speedPool = shuffle(this.pool());
    this.speedIndex = 0;
    this.speedScore = 0;
    this.speedStreak = 0;
    this.timeLeft = 45;
    this.speedIntro.hidden = true;
    this.speedResult.hidden = true;
    this.speedQuestion.hidden = false;
    this.updateSpeedHeader();
    this.renderSpeedQuestion();
    this.speedTimer = setInterval(() => {
      this.timeLeft -= 1;
      this.speedTimerEl.textContent = this.timeLeft;
      if (this.timeLeft <= 0) this.finishSpeed();
    }, 1000);
  }

  renderSpeedQuestion() {
    if (this.speedIndex >= this.speedPool.length) {
      this.speedPool = shuffle(this.pool());
      this.speedIndex = 0;
    }
    const entry = this.speedPool[this.speedIndex];
    const { correct, choices } = buildChoices(entry, this.vocabulary);
    this.speedWord.textContent = entry.word;
    this.speedOptions.replaceChildren();
    choices.forEach((choice) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'choice-button';
      button.textContent = choice;
      button.addEventListener('click', () => {
        if (choice === correct) {
          this.speedStreak += 1;
          this.speedScore += 10 + (this.speedStreak % 3 === 0 ? 5 : 0);
        } else {
          this.speedStreak = 0;
        }
        this.speedIndex += 1;
        this.updateSpeedHeader();
        this.renderSpeedQuestion();
      });
      this.speedOptions.appendChild(button);
    });
  }

  updateSpeedHeader() {
    this.speedTimerEl.textContent = this.timeLeft;
    this.speedScoreEl.textContent = `${this.speedScore} puan`;
    this.speedStreakEl.textContent = `${this.speedStreak} seri`;
  }

  finishSpeed() {
    clearInterval(this.speedTimer);
    this.speedQuestion.hidden = true;
    this.speedResult.hidden = false;
    if (this.speedScore > this.progress.gameStats.speedBest) this.progress.gameStats.speedBest = this.speedScore;
    this.onProgress();
    this.speedFinalScore.textContent = `${this.speedScore} puan`;
    this.speedBestLabel.textContent = `En iyi skorun: ${this.progress.gameStats.speedBest}`;
  }

  stopTimers() {
    clearInterval(this.matchTimer);
    clearInterval(this.speedTimer);
  }

  deactivate() {
    this.stopTimers();
  }
}
