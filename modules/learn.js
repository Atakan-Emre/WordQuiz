import { createExampleList, DOMAIN_LABELS, filterByWeek, normalize, shuffle } from './utils.js';

const PAGE_SIZE = 30;
const SWIPE_BATCH_SIZE = 20;

export class LearnModule {
  constructor(root, vocabulary, progress, onProgress) {
    this.root = root;
    this.vocabulary = vocabulary;
    this.order = [...vocabulary];
    this.progress = progress;
    this.onProgress = onProgress;
    this.filtered = [];
    this.index = 0;
    this.listLimit = PAGE_SIZE;
    this.swipeRendered = 0;
    this.mode = 'card';
    this.bindElements();
    this.bindEvents();
    this.applyFilters(false);
  }

  bindElements() {
    const byId = (id) => this.root.querySelector(`#${id}`);
    this.week = byId('learnWeek');
    this.search = byId('learnSearch');
    this.cardMode = byId('learnCardMode');
    this.listMode = byId('learnListMode');
    this.swipeMode = byId('learnSwipeMode');
    this.swipeFeed = byId('swipeFeed');
    this.word = byId('learnWord');
    this.meaning = byId('learnMeaning');
    this.examples = byId('learnExamples');
    this.details = byId('learnDetails');
    this.flashcard = byId('flashcardFlip');
    this.badge = byId('learnWeekBadge');
    this.position = byId('learnPosition');
    this.empty = byId('learnEmpty');
    this.previous = byId('learnPrevious');
    this.next = byId('learnNext');
    this.mark = byId('markLearned');
    this.list = byId('learnList');
    this.loadMore = byId('loadMoreWords');
    this.shuffleButton = byId('shuffleLearn');
    this.modeButtons = [...this.root.querySelectorAll('[data-learn-mode]')];
  }

  bindEvents() {
    this.week.addEventListener('change', () => this.applyFilters(false));
    this.search.addEventListener('input', () => this.applyFilters(false));
    this.previous.addEventListener('click', () => this.move(-1));
    this.next.addEventListener('click', () => this.move(1));
    this.flashcard.addEventListener('click', () => this.flipCard());
    this.mark.addEventListener('click', () => this.toggleLearned(this.current()?.id));
    this.loadMore.addEventListener('click', () => {
      this.listLimit += PAGE_SIZE;
      this.renderList();
    });
    this.shuffleButton.addEventListener('click', () => this.shuffleWords());
    this.swipeFeed.addEventListener('scroll', () => {
      const threshold = this.swipeFeed.clientHeight * 1.5;
      if (
        this.swipeFeed.scrollTop + this.swipeFeed.clientHeight >= this.swipeFeed.scrollHeight - threshold
      ) {
        this.appendSwipeBatch();
      }
    });
    this.modeButtons.forEach((button) =>
      button.addEventListener('click', () => this.setMode(button.dataset.learnMode)),
    );
  }

  current() {
    return this.filtered[this.index] || null;
  }

  applyFilters(preserve = true) {
    const currentId = preserve ? this.current()?.id : null;
    const query = normalize(this.search.value);
    this.filtered = filterByWeek(this.order, this.week.value).filter(
      (item) => !query || normalize(`${item.word} ${item.meaning}`).includes(query),
    );
    const preserved = this.filtered.findIndex((item) => item.id === currentId);
    this.index = preserved >= 0 ? preserved : 0;
    this.listLimit = PAGE_SIZE;
    this.swipeRendered = 0;
    this.render();
  }

  setMode(mode) {
    this.mode = mode;
    this.modeButtons.forEach((button) => {
      const active = button.dataset.learnMode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    this.cardMode.hidden = mode !== 'card';
    this.listMode.hidden = mode !== 'list';
    this.swipeMode.hidden = mode !== 'swipe';
    if (mode === 'list') this.renderList();
    if (mode === 'swipe') this.renderSwipe();
  }

  render() {
    this.renderCard();
    if (this.mode === 'list') this.renderList();
    if (this.mode === 'swipe') this.renderSwipe();
  }

  renderCard() {
    const entry = this.current();
    const hasEntry = Boolean(entry);
    this.empty.hidden = hasEntry;
    this.root.querySelector('.flashcard-scene').hidden = !hasEntry;
    this.root.querySelector('.card-meta').hidden = !hasEntry;
    this.previous.disabled = !hasEntry || this.index === 0;
    this.next.disabled = !hasEntry || this.index === this.filtered.length - 1;
    this.mark.disabled = !hasEntry;
    this.details.hidden = true;
    this.flashcard.classList.remove('is-flipped');
    this.flashcard.setAttribute('aria-expanded', 'false');
    this.flashcard.setAttribute('aria-label', 'Kartı çevir ve Türkçe anlamını göster');
    if (!entry) return;
    this.word.textContent = entry.word;
    this.meaning.textContent = entry.meaning;
    this.badge.textContent = `${entry.week}. Hafta`;
    this.position.textContent = `${this.index + 1} / ${this.filtered.length}`;
    this.examples.replaceChildren(...createExampleList(entry.examples).children);
    this.updateMarkButton(entry.id);
  }

  flipCard() {
    if (!this.current()) return;
    const flipped = !this.flashcard.classList.contains('is-flipped');
    this.flashcard.classList.toggle('is-flipped', flipped);
    this.details.hidden = !flipped;
    this.flashcard.setAttribute('aria-expanded', String(flipped));
    this.flashcard.setAttribute(
      'aria-label',
      flipped ? 'Kartı çevir ve İngilizce kelimeye dön' : 'Kartı çevir ve Türkçe anlamını göster',
    );
  }

  move(offset) {
    const target = this.index + offset;
    if (target < 0 || target >= this.filtered.length) return;
    this.index = target;
    this.renderCard();
    this.root.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  shuffleWords() {
    this.order = shuffle(this.order);
    this.shuffleButton.classList.add('is-shuffling');
    setTimeout(() => this.shuffleButton.classList.remove('is-shuffling'), 350);
    this.applyFilters(false);
  }

  toggleLearned(id) {
    if (!id) return;
    const learned = new Set(this.progress.learned);
    learned.has(id) ? learned.delete(id) : learned.add(id);
    this.progress.learned = [...learned];
    this.onProgress();
    if (this.current()?.id === id) this.updateMarkButton(id);
    this.root.querySelectorAll(`[data-learned-id="${id}"]`).forEach((button) => {
      button.classList.toggle('is-selected', learned.has(id));
      button.textContent = learned.has(id) ? '✓ Öğrenildi' : '✓ Öğrendim';
    });
    const status = this.root.querySelector(`[data-entry-id="${id}"] .row-status`);
    if (status) status.textContent = learned.has(id) ? 'Öğrenildi' : '';
  }

  updateMarkButton(id) {
    const learned = this.progress.learned.includes(id);
    this.mark.classList.toggle('is-selected', learned);
    this.mark.textContent = learned ? '✓ Öğrenildi' : '✓ Öğrendim';
  }

  renderList() {
    this.list.replaceChildren();
    const items = this.filtered.slice(0, this.listLimit);
    items.forEach((entry) => {
      const row = document.createElement('article');
      row.className = 'vocab-row';
      row.dataset.entryId = entry.id;
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'vocab-row-trigger';
      trigger.setAttribute('aria-expanded', 'false');
      const learned = this.progress.learned.includes(entry.id);
      trigger.innerHTML = `<span class="row-number">${String(entry.number).padStart(3, '0')}</span><span class="row-language"><small>EN</small><span class="row-word"></span></span><span class="row-language row-language--meaning"><small>TR</small><span class="row-meaning"></span></span><span class="row-week">${entry.week}. Hafta</span><span class="row-status">${learned ? 'Öğrenildi' : ''}</span><span class="row-chevron">⌄</span>`;
      trigger.querySelector('.row-word').textContent = entry.word;
      trigger.querySelector('.row-meaning').textContent = entry.meaning;
      const details = document.createElement('div');
      details.className = 'vocab-row-details';
      details.hidden = true;
      const learnedButton = document.createElement('button');
      learnedButton.type = 'button';
      learnedButton.className = `button button--soft row-learned${learned ? ' is-selected' : ''}`;
      learnedButton.dataset.learnedId = entry.id;
      learnedButton.textContent = learned ? '✓ Öğrenildi' : '✓ Öğrendim';
      learnedButton.addEventListener('click', () => this.toggleLearned(entry.id));
      details.append(createExampleList(entry.examples), learnedButton);
      trigger.addEventListener('click', () => {
        details.hidden = !details.hidden;
        trigger.setAttribute('aria-expanded', String(!details.hidden));
      });
      row.append(trigger, details);
      this.list.appendChild(row);
    });
    this.loadMore.hidden = this.listLimit >= this.filtered.length;
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'list-empty';
      empty.textContent = 'Bu filtrede kelime bulunamadı.';
      this.list.appendChild(empty);
    }
  }

  renderSwipe() {
    this.swipeFeed.replaceChildren();
    this.swipeFeed.scrollTop = 0;
    this.swipeRendered = 0;
    this.appendSwipeBatch();
    if (!this.filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'swipe-empty';
      empty.textContent = 'Bu filtrede kelime bulunamadı.';
      this.swipeFeed.appendChild(empty);
    }
  }

  appendSwipeBatch() {
    if (this.swipeRendered >= this.filtered.length) return;
    const entries = this.filtered.slice(
      this.swipeRendered,
      this.swipeRendered + SWIPE_BATCH_SIZE,
    );
    entries.forEach((entry, offset) => {
      const absoluteIndex = this.swipeRendered + offset;
      const slide = document.createElement('article');
      slide.className = 'swipe-slide';

      const header = document.createElement('div');
      header.className = 'swipe-slide-meta';
      header.innerHTML = `<span>${entry.week}. Hafta</span><small>${absoluteIndex + 1} / ${this.filtered.length}</small>`;

      const content = document.createElement('div');
      content.className = 'swipe-slide-content';
      const enLabel = document.createElement('small');
      enLabel.textContent = 'English';
      const word = document.createElement('h3');
      word.textContent = entry.word;
      const divider = document.createElement('i');
      const trLabel = document.createElement('small');
      trLabel.textContent = 'Türkçe';
      const meaning = document.createElement('h4');
      meaning.textContent = entry.meaning;
      content.append(enLabel, word, divider, trLabel, meaning);

      const example = entry.examples[absoluteIndex % entry.examples.length];
      const context = document.createElement('div');
      context.className = 'swipe-context';
      const contextLabel = document.createElement('span');
      contextLabel.textContent = DOMAIN_LABELS[example.domain] || example.domain;
      const sentence = document.createElement('p');
      sentence.textContent = example.sentence;
      const translation = document.createElement('small');
      translation.textContent = example.translation;
      context.append(contextLabel, sentence, translation);

      const learned = this.progress.learned.includes(entry.id);
      const learnedButton = document.createElement('button');
      learnedButton.type = 'button';
      learnedButton.className = `swipe-learn-button${learned ? ' is-selected' : ''}`;
      learnedButton.dataset.learnedId = entry.id;
      learnedButton.textContent = learned ? '✓ Öğrenildi' : '✓ Öğrendim';
      learnedButton.addEventListener('click', () => this.toggleLearned(entry.id));

      slide.append(header, content, context, learnedButton);
      this.swipeFeed.appendChild(slide);
    });
    this.swipeRendered += entries.length;
  }
}
