import { buildChoices, filterByWeek, shuffle } from './utils.js?v=20260708-synonyms';

export class TestModule {
  constructor(root, vocabulary, progress, onProgress) {
    this.root = root;
    this.vocabulary = vocabulary;
    this.progress = progress;
    this.onProgress = onProgress;
    this.questions = [];
    this.answers = [];
    this.index = 0;
    this.correct = 0;
    this.answered = false;
    this.bindElements();
    this.bindEvents();
  }

  bindElements() {
    const byId = (id) => this.root.querySelector(`#${id}`);
    this.setup = byId('testSetup');
    this.session = byId('testSession');
    this.results = byId('testResults');
    this.week = byId('testWeek');
    this.count = byId('testCount');
    this.directionSelect = byId('testDirection');
    this.startButton = byId('startTest');
    this.position = byId('testPosition');
    this.liveScore = byId('testLiveScore');
    this.progressFill = byId('testProgressFill');
    this.promptLabel = byId('testPromptLabel');
    this.prompt = byId('testPrompt');
    this.options = byId('testOptions');
    this.feedback = byId('testFeedback');
    this.feedbackIcon = byId('testFeedbackIcon');
    this.feedbackTitle = byId('testFeedbackTitle');
    this.feedbackText = byId('testFeedbackText');
    this.continueButton = byId('continueTest');
    this.resultRing = byId('resultRing');
    this.resultTitle = byId('resultTitle');
    this.resultSummary = byId('resultSummary');
    this.retry = byId('retryTest');
    this.review = byId('reviewTest');
    this.wrongReview = byId('wrongReview');
  }

  bindEvents() {
    this.startButton.addEventListener('click', () => this.start());
    this.continueButton.addEventListener('click', () => this.advance());
    this.retry.addEventListener('click', () => this.showSetup());
    this.review.addEventListener('click', () => {
      this.wrongReview.hidden = !this.wrongReview.hidden;
      this.review.textContent = this.wrongReview.hidden ? 'Yanlışları incele' : 'İncelemeyi kapat';
    });
  }

  start() {
    const pool = filterByWeek(this.vocabulary, this.week.value);
    this.direction = this.directionSelect.value;
    this.questions = shuffle(pool).slice(0, Number(this.count.value));
    this.answers = [];
    this.index = 0;
    this.correct = 0;
    this.setup.hidden = true;
    this.results.hidden = true;
    this.session.hidden = false;
    this.renderQuestion();
  }

  renderQuestion() {
    const entry = this.questions[this.index];
    this.answered = false;
    this.position.textContent = `Soru ${this.index + 1} / ${this.questions.length}`;
    this.liveScore.textContent = `${this.correct} doğru`;
    this.progressFill.style.width = `${(this.index / this.questions.length) * 100}%`;
    this.promptLabel.textContent = this.direction === 'word-to-meaning' ? 'Doğru anlamı seç' : 'Doğru İngilizce kelimeyi seç';
    this.prompt.textContent = this.direction === 'word-to-meaning' ? entry.word : entry.meaning;
    this.feedback.hidden = true;
    this.continueButton.hidden = true;
    const { correct, choices } = buildChoices(entry, this.vocabulary, this.direction);
    this.currentCorrect = correct;
    this.options.replaceChildren();
    choices.forEach((choice) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'choice-button';
      button.textContent = choice;
      button.addEventListener('click', () => this.answer(choice));
      this.options.appendChild(button);
    });
  }

  answer(selected) {
    if (this.answered) return;
    this.answered = true;
    const entry = this.questions[this.index];
    const isCorrect = selected === this.currentCorrect;
    if (isCorrect) this.correct += 1;
    this.progress.testStats[isCorrect ? 'correct' : 'incorrect'] += 1;
    this.answers.push({ entry, selected, correct: this.currentCorrect, isCorrect });
    this.onProgress();
    [...this.options.children].forEach((button) => {
      button.disabled = true;
      if (button.textContent === this.currentCorrect) button.classList.add('is-correct');
      if (button.textContent === selected && !isCorrect) button.classList.add('is-wrong');
    });
    this.liveScore.textContent = `${this.correct} doğru`;
    this.feedback.hidden = false;
    this.feedback.className = `inline-feedback ${isCorrect ? 'is-correct' : 'is-wrong'}`;
    this.feedbackIcon.textContent = isCorrect ? '✓' : '×';
    this.feedbackTitle.textContent = isCorrect ? 'Doğru cevap' : 'Yanlış cevap';
    this.feedbackText.textContent = `${entry.word}: ${entry.meaning}`;
    this.continueButton.hidden = false;
    this.continueButton.textContent = this.index === this.questions.length - 1 ? 'Sonucu gör →' : 'Sonraki soru →';
  }

  advance() {
    if (!this.answered) return;
    if (this.index === this.questions.length - 1) {
      this.finish();
      return;
    }
    this.index += 1;
    this.renderQuestion();
  }

  finish() {
    this.progress.testStats.sessions += 1;
    this.onProgress();
    this.session.hidden = true;
    this.results.hidden = false;
    const percent = Math.round((this.correct / this.questions.length) * 100);
    this.resultRing.textContent = `${percent}%`;
    this.resultRing.style.setProperty('--score', `${percent * 3.6}deg`);
    this.resultTitle.textContent = percent >= 80 ? 'Çok iyi gidiyorsun' : percent >= 60 ? 'İyi bir temel var' : 'Bir tur daha faydalı olur';
    this.resultSummary.textContent = `${this.questions.length} soruda ${this.correct} doğru, ${this.questions.length - this.correct} yanlış yaptın.`;
    this.renderWrongReview();
  }

  renderWrongReview() {
    this.wrongReview.replaceChildren();
    const wrong = this.answers.filter((answer) => !answer.isCorrect);
    this.review.hidden = wrong.length === 0;
    this.wrongReview.hidden = true;
    wrong.forEach((answer) => {
      const row = document.createElement('div');
      const word = document.createElement('strong');
      word.textContent = answer.entry.word;
      const meaning = document.createElement('span');
      meaning.textContent = answer.entry.meaning;
      row.append(word, meaning);
      this.wrongReview.appendChild(row);
    });
  }

  showSetup() {
    this.results.hidden = true;
    this.session.hidden = true;
    this.setup.hidden = false;
  }
}
