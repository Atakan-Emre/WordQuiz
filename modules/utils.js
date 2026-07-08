export const DOMAIN_LABELS = { health: 'Sağlık', social: 'Sosyal', science: 'Fen' };

export const normalize = (value = '') =>
  value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

export const shuffle = (items) => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
};

export const filterByWeek = (items, week) =>
  week === 'all' ? [...items] : items.filter((item) => String(item.week) === String(week));

export const buildChoices = (entry, vocabulary, direction = 'word-to-meaning') => {
  const field = direction === 'word-to-meaning' ? 'meaning' : 'word';
  const correct = entry[field];
  const pool = [...new Set(vocabulary.map((item) => item[field]))].filter(
    (value) => normalize(value) !== normalize(correct),
  );
  return { correct, choices: shuffle([correct, ...shuffle(pool).slice(0, 3)]) };
};

export const createSynonymChips = (synonyms = [], options = {}) => {
  const { limit = Infinity, rootTag = 'div', className = '' } = options;
  if (!synonyms.length) return null;

  const section = document.createElement(rootTag);
  section.className = `synonym-strip ${className}`.trim();

  const label = document.createElement('span');
  label.className = 'synonym-label';
  label.textContent = 'Eş anlamlı';

  const chips = document.createElement('span');
  chips.className = 'synonym-chips';

  const visibleSynonyms = synonyms.slice(0, limit);
  visibleSynonyms.forEach((synonym) => {
    const chip = document.createElement('span');
    chip.className = 'synonym-chip';
    chip.textContent = synonym;
    chips.appendChild(chip);
  });

  if (synonyms.length > visibleSynonyms.length) {
    const more = document.createElement('span');
    more.className = 'synonym-chip synonym-chip--more';
    more.textContent = `+${synonyms.length - visibleSynonyms.length}`;
    chips.appendChild(more);
  }

  section.append(label, chips);
  return section;
};

export const renderSynonymChips = (target, synonyms = [], options = {}) => {
  target.replaceChildren();
  const section = createSynonymChips(synonyms, { ...options, rootTag: 'span' });
  target.hidden = !section;
  if (section) target.append(...section.childNodes);
};

export const createExampleList = (examples) => {
  const list = document.createElement('div');
  list.className = 'example-list';
  examples.forEach((example) => {
    const article = document.createElement('article');
    article.className = `example-card example-card--${example.domain}`;
    const label = document.createElement('span');
    label.className = 'domain-label';
    label.textContent = DOMAIN_LABELS[example.domain] || example.domain;
    const sentence = document.createElement('p');
    sentence.className = 'example-sentence';
    sentence.textContent = example.sentence;
    const translation = document.createElement('p');
    translation.className = 'example-translation';
    translation.textContent = example.translation;
    article.append(label, sentence, translation);
    list.appendChild(article);
  });
  return list;
};

export const formatTime = (seconds) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
};
