function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const STORAGE_KEYS = {
  lastProcessedText: 'lastProcessedText',
  lastPunctuation: 'lastPunctuation',
  lastSearch: 'lastSearch'
};

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value || '';
}

function setHtml(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = value || '';
}

function setPlain(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || '';
}

async function readStorage(key) {
  try {
    const data = await chrome.storage.local.get(key);
    return data?.[key] ?? null;
  } catch (e) {
    return null;
  }
}

async function askWorker(type) {
  try {
    return await chrome.runtime.sendMessage({ type });
  } catch (e) {
    return null;
  }
}

async function getPayloadForView(view) {
  if (view === 'word') {
    return (await readStorage(STORAGE_KEYS.lastSearch)) || (await askWorker('GET_LAST_SEARCH'));
  }
  if (view === 'punctuation') {
    return (await readStorage(STORAGE_KEYS.lastPunctuation)) || (await askWorker('GET_LAST_PUNCTUATION'));
  }
  return (await readStorage(STORAGE_KEYS.lastProcessedText)) || (await askWorker('GET_LAST_PROCESSED_TEXT'));
}

function renderWord(data) {
  document.getElementById('pageTitle').textContent = 'Ударение в слове';
  document.getElementById('leftTitle').textContent = 'Слово';
  document.getElementById('rightTitle').textContent = 'Ударение';
  setText('originalText', data?.word || '');
  setText('accentedText', data?.stressed || '');
  if (data?.word) {
    setHtml('resolvedWords', `<article class="card-item"><div class="card-main"><strong>${escapeHtml(data.word)}</strong><span>${escapeHtml(data.stressed || '')}</span></div><div class="card-meta"><span>Источник: ${escapeHtml(data.source || 'unknown')}</span></div></article>`);
  } else {
    setHtml('resolvedWords', '<p class="muted">Нет данных для одного слова.</p>');
  }
  setPlain('unresolvedWords', data?.note || 'Ударение может стоять неправильно, обязательно перепроверяйте.');
}

function renderPunctuation(data) {
  document.getElementById('pageTitle').textContent = 'Запятые в предложении';
  document.getElementById('leftTitle').textContent = 'Исходный текст';
  document.getElementById('rightTitle').textContent = 'Текст с запятыми';
  setText('originalText', data?.original || '');
  setText('accentedText', data?.result || '');
  const rules = (data?.explanations || []);
  setHtml('resolvedWords',
    rules.length
      ? rules.map(x => `<article class="card-item"><div class="card-main"><strong>Правило</strong><span>${escapeHtml(x)}</span></div></article>`).join('')
      : '<p class="muted">Правила не найдены.</p>'
  );
  setPlain('unresolvedWords', data?.note || 'Пунктуация зависит от смысла. Обязательно перепроверьте результат.');
}

function renderAccentText(data) {
  document.getElementById('pageTitle').textContent = 'Текст с ударениями';
  document.getElementById('leftTitle').textContent = 'Исходный текст';
  document.getElementById('rightTitle').textContent = 'Обработанный текст';
  setText('originalText', data?.originalText || '');
  setText('accentedText', data?.accentedText || '');
  const resolved = data?.resolvedWords || [];
  if (!resolved.length) {
    setHtml('resolvedWords', '<p class="muted">Пока нет найденных слов.</p>');
  } else {
    setHtml('resolvedWords', resolved.map((item) => `
      <article class="card-item">
        <div class="card-main">
          <strong>${escapeHtml(item.word)}</strong>
          <span>${escapeHtml(item.stressed || '')}</span>
        </div>
        <div class="card-meta"><span>Источник: ${escapeHtml(item.source || 'unknown')}</span></div>
      </article>`).join(''));
  }
  const unresolved = (data?.unresolvedWords || []).map((x) => typeof x === 'string' ? x : `${x.word || ''} → ${x.stressed || ''}`);
  setPlain('unresolvedWords', unresolved.length ? unresolved.join('\n') : 'Все слова нашлись в словаре или API.');
}

function renderEmpty(view) {
  const map = {
    word: 'Не удалось получить данные по слову. Попробуй выделить слово ещё раз.',
    punctuation: 'Не удалось получить результат пунктуации. Попробуй обработать текст ещё раз.',
    accent: 'Не удалось получить результат по ударениям. Попробуй обработать текст ещё раз.'
  };
  setPlain('unresolvedWords', map[view] || 'Нет данных.');
  setHtml('resolvedWords', '<p class="muted">Нет данных.</p>');
}

async function init() {
  const params = new URLSearchParams(location.search);
  const view = params.get('view') || 'accent';
  const data = await getPayloadForView(view);

  if (view === 'word') {
    renderWord(data);
  } else if (view === 'punctuation') {
    renderPunctuation(data);
  } else {
    renderAccentText(data);
  }

  const hasData = Boolean(
    document.getElementById('originalText').value ||
    document.getElementById('accentedText').value
  );
  if (!hasData) renderEmpty(view);
  return hasData;
}

document.getElementById('copyBtn').addEventListener('click', async () => {
  const value = document.getElementById('accentedText').value;
  if (!value) return;
  await navigator.clipboard.writeText(value);
});

(async function initWithRetry() {
  for (let i = 0; i < 12; i++) {
    const ok = await init();
    if (ok) return;
    await new Promise(r => setTimeout(r, 250));
  }
})();
