const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
const accentInput = document.getElementById("accentInput");
const accentOutput = document.getElementById("accentOutput");
const punctuationInput = document.getElementById("punctuationInput");
const punctuationOutput = document.getElementById("punctuationOutput");
const punctuationRules = document.getElementById("punctuationRules");
const editPunctuationBtn = document.getElementById("editPunctuationBtn");
const saveEditedPunctuationBtn = document.getElementById("saveEditedPunctuationBtn");
const punctuationEditHint = document.getElementById("punctuationEditHint");
const manualAccentWord = document.getElementById("manualAccentWord");
const accentBuilder = document.getElementById("accentBuilder");
const manualAccentStatus = document.getElementById("manualAccentStatus");
const saveStressCardBtn = document.getElementById("saveStressCardBtn");
const saveAccentTextCardsBtn = document.getElementById("saveAccentTextCardsBtn");
const VOWELS = "аеёиоуыэюяАЕЁИОУЫЭЮЯ";
let currentSearch = null;
let selectedAccentIndex = null;
let lastPunctuationResult = null;
const accentTab = document.getElementById("accentTab");
const punctuationTab = document.getElementById("punctuationTab");
const tabAccentBtn = document.getElementById("tabAccentBtn");
const tabPunctuationBtn = document.getElementById("tabPunctuationBtn");
const reviewModeSelect = document.getElementById("reviewModeSelect");
const editAccentOutputBtn = document.getElementById("editAccentOutputBtn");
const saveAccentOutputBtn = document.getElementById("saveAccentOutputBtn");
const claimChestBtn = document.getElementById("claimChestBtn");
const actionStatus = document.getElementById("actionStatus");
const stressCardStatus = document.getElementById("stressCardStatus");
const accentTextCardStatus = document.getElementById("accentTextCardStatus");
const punctuationCardStatus = document.getElementById("punctuationCardStatus");
const favoriteWordStatus = document.getElementById("favoriteWordStatus");
const accentFavoriteStatus = document.getElementById("accentFavoriteStatus");
const punctuationFavoriteStatus = document.getElementById("punctuationFavoriteStatus");

function switchTab(tab) {
  const accentActive = tab === 'accent';
  accentTab.hidden = !accentActive;
  punctuationTab.hidden = accentActive;
  tabAccentBtn.classList.toggle('tab-btn--active', accentActive);
  tabPunctuationBtn.classList.toggle('tab-btn--active', !accentActive);
}

tabAccentBtn.addEventListener('click', () => switchTab('accent'));
tabPunctuationBtn.addEventListener('click', () => switchTab('punctuation'));


function setPunctuationEditing(isEditing) {
  punctuationOutput.readOnly = !isEditing;
  editPunctuationBtn.textContent = isEditing ? 'Отменить ручную правку' : 'Исправить вручную';
  saveEditedPunctuationBtn.hidden = !isEditing;
  punctuationEditHint.textContent = isEditing
    ? 'Теперь можно исправить запятые вручную в поле результата. После правок нажмите «Сохранить правки».'
    : 'Сначала нажмите «Поставить запятые». Если ответ неверный, нажмите «Исправить вручную», поправьте текст и сохраните правки отдельной кнопкой.';
}


async function saveCurrentStressToCards() {
  if (!currentSearch?.word) await performSearch();
  if (!currentSearch?.word || !currentSearch?.stressed) return false;
  await chrome.runtime.sendMessage({ type: "SAVE_STRESS_CARD", word: currentSearch.word, stressed: currentSearch.stressed, source: currentSearch.source || "manual_search", note: currentSearch.note || "Добавлено пользователем в карточки.", favorite: false });
  await loadState();
  return true;
}


async function loadState() {
  const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  renderStats(state.stats);
  renderGamification(state);
  renderCards(state.cards);
  renderFavorites(state.favorites);
  renderDue(state.priorityReviewCards || state.dueCards || [], state.stats);

  const lastProcessed = await chrome.runtime.sendMessage({ type: "GET_LAST_PROCESSED_TEXT" });
  if (lastProcessed?.accentedText) {
    accentOutput.value = lastProcessed.accentedText;
    if (!accentInput.value && lastProcessed.originalText) accentInput.value = lastProcessed.originalText;
  }

  const lastPunctuation = await chrome.runtime.sendMessage({ type: "GET_LAST_PUNCTUATION" });
  if (lastPunctuation?.result) {
    punctuationOutput.value = lastPunctuation.result;
    if (!punctuationInput.value && lastPunctuation.original) punctuationInput.value = lastPunctuation.original;
    punctuationRules.innerHTML = renderRules(lastPunctuation.explanations, lastPunctuation.note);
    lastPunctuationResult = lastPunctuation;
    setPunctuationEditing(false);
  }
}

function renderStats(stats) {
  document.getElementById("stats").innerHTML = `
    <article class="stat-card"><strong>${stats.total}</strong><span>карточек всего</span></article>
    <article class="stat-card"><strong>${stats.weakCount ?? stats.due}</strong><span>слабых мест сейчас</span></article>
    <article class="stat-card"><strong>${stats.currentStreak}</strong><span>серия дней</span></article>
    <article class="stat-card"><strong>${stats.bestStreak}</strong><span>лучший стрик</span></article>
    <article class="stat-card"><strong>${stats.accuracy}%</strong><span>точность</span></article>
    <article class="stat-card"><strong>${stats.level}</strong><span>уровень</span></article>
    <article class="stat-card"><strong>${stats.rating}</strong><span>рейтинг</span></article>
    <article class="stat-card"><strong>${stats.goalProgress}</strong><span>дневная цель</span></article>
  `;
}



function renderGamification(bundle) {
  const g = bundle?.gamification || {};
  const stats = bundle?.stats || {};
  const leaguePanel = document.getElementById('leaguePanel');
  const missionsPanel = document.getElementById('missionsPanel');
  const weakSpotsPanel = document.getElementById('weakSpotsPanel');
  const chestStatus = document.getElementById('chestStatus');
  const achievementsPanel = document.getElementById('achievementsPanel');
  const trainWeakSpotsBtn = document.getElementById('trainWeakSpotsBtn');

  const progressPct = Math.min(100, Math.round(((g.rememberedToday || 0) / (g.dailyGoal || 10)) * 100));
  if (leaguePanel) {
    leaguePanel.innerHTML = `
      <div class="gamify-row"><strong>Лига:</strong> <span class="league-chip league-${(g.league || 'Бронза').toLowerCase()}">${g.league || 'Бронза'}</span></div>
      <div class="gamify-row"><strong>Сегодня:</strong> ${g.rememberedToday || 0}/${g.dailyGoal || 10}</div>
      <div class="progress progress--animated"><span style="width:${progressPct}%"></span></div>
      <div class="gamify-row"><strong>Следующая лига:</strong> ${g.nextLeague ? `с ${g.nextLeague} уровня` : 'максимальная'}</div>
      <div class="gamify-row"><strong>Сундук:</strong> ${g.chestAvailable ? '<span class="chest-ready">готов к открытию ✨</span>' : 'пока недоступен'}</div>
    `;
  }
  if (missionsPanel) {
    const missions = g.missions || [];
    missionsPanel.innerHTML = missions.map((m, idx) => `
      <article class="mission-item mission-item--animated" style="animation-delay:${idx * 80}ms">
        <div><strong>${m.title}</strong></div>
        <div class="muted">${m.progress}/${m.target}</div>
        <div class="progress progress--animated"><span style="width:${Math.min(100, Math.round((m.progress/m.target)*100))}%"></span></div>
      </article>
    `).join('') || '<p class="muted">Пока миссий нет.</p>';
  }
  if (weakSpotsPanel) {
    const weak = g.weakSpots || [];
    weakSpotsPanel.innerHTML = weak.length
      ? '<h3>Слабые места недели</h3>' + weak.map((w, idx) => { const weakLabel = w.label || w.word || w.prompt || 'Карточка'; return `<div class="weak-item" style="animation-delay:${idx * 70}ms">• ${escapeHtml(weakLabel)} — ошибок: <strong>${w.forgets}</strong></div>`; }).join('')
      : '<p class="muted">На этой неделе слабые места ещё не накопились.</p>';
    if (trainWeakSpotsBtn) trainWeakSpotsBtn.disabled = !weak.length;
  }
  const badges = [];
  if ((stats.total || 0) >= 1) badges.push({title:'Первый шаг', emoji:'🌱'});
  if ((stats.currentStreak || 0) >= 3) badges.push({title:'Стрик 3 дня', emoji:'🔥'});
  if ((stats.level || 1) >= 5) badges.push({title:'Уровень 5', emoji:'🏅'});
  if ((g.rememberedToday || 0) >= (g.dailyGoal || 10)) badges.push({title:'Дневная цель', emoji:'🎯'});
  if ((g.weakSpots || []).length) badges.push({title:'Охотник за ошибками', emoji:'🧠'});
  if (achievementsPanel) {
    achievementsPanel.innerHTML = badges.length
      ? badges.map((b, idx) => `<div class="achievement-badge" style="animation-delay:${idx * 90}ms"><span>${b.emoji}</span><strong>${escapeHtml(b.title)}</strong></div>`).join('')
      : '<p class="muted">Реши пару карточек — и здесь появятся первые достижения.</p>';
  }
  if (chestStatus) chestStatus.textContent = g.chestAvailable ? 'Закрой цель и забери бонус XP.' : 'Сундук откроется после выполнения дневной цели.';
}
function formatDue(value) {
  return new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cardMarkup(card, extraActions = "") {
  const title = card.kind === "punctuation" ? "Пунктуация" : "Ударение";
  const prompt = card.kind === "punctuation" ? (card.prompt || card.word) : card.word;
  const answer = card.kind === "punctuation" ? (card.answer || card.stressed) : card.stressed;
  return `
    <article class="card-item">
      <div class="card-main">
        <div>
          <div class="muted">${title}</div>
          <strong>${escapeHtml(prompt)}</strong>
          <div class="accent">${escapeHtml(answer)}</div>
        </div>
        <button class="tiny ${card.favorite ? "warn" : "ghost"}" data-action="favorite" data-word="${escapeHtml(card.id)}">${card.favorite ? "★" : "☆"}</button>
      </div>
      <div class="card-meta">
        <span>Источник: ${escapeHtml(card.source || "unknown")}</span>
        <span>Повторение: ${formatDue(card.dueAt)}</span>
      </div>
      ${card.kind === "punctuation" && card.rule ? `<div class="muted">Правило: ${escapeHtml(card.rule)}</div>` : ""}
      ${extraActions}
    </article>
  `;
}

function renderCards(cards) {
  const root = document.getElementById("cards");
  if (!cards.length) {
    root.innerHTML = `<p class="muted">Пока нет карточек. Выдели текст на странице, найди слово или сохрани предложение с запятыми.</p>`;
    return;
  }
  root.innerHTML = cards.slice(0, 100).map((card) => cardMarkup(card)).join("");
}

function renderFavorites(cards) {
  const root = document.getElementById("favorites");
  if (!cards.length) {
    root.innerHTML = `<p class="muted">Пока пусто. Отмечай сложные слова и предложения.</p>`;
    return;
  }
  root.innerHTML = cards.slice(0, 12).map((card) => cardMarkup(card, `<div class="actions compact"><button class="tiny secondary" data-grade="remember" data-word="${escapeHtml(card.id)}">Помню</button><button class="tiny danger" data-grade="forget" data-word="${escapeHtml(card.id)}">Не помню</button></div>`)).join("");
}

function renderDue(cards, stats = {}) {
  const root = document.getElementById("dueCards");
  if (!cards.length) {
    root.innerHTML = `<p class="muted">Сейчас нет ни слабых мест недели, ни карточек, которые срочно просятся в повторение.</p>`;
    return;
  }
  const intro = (stats.weakCount || 0) > 0
    ? `<p class="mini-help">Здесь сначала показываются слабые места недели — карточки, по которым у тебя было больше всего ошибок за последние 7 дней.</p>`
    : `<p class="mini-help">Слабых мест недели пока нет, поэтому здесь показана ближайшая очередь карточек к повторению.</p>`;
  root.innerHTML = intro + cards.slice(0, 12).map((card) => cardMarkup(card, `<div class="actions compact"><button class="tiny secondary" data-grade="remember" data-word="${escapeHtml(card.id)}">Помню</button><button class="tiny danger" data-grade="forget" data-word="${escapeHtml(card.id)}">Не помню</button></div>`)).join("");
}

function renderSearch(data) {
  currentSearch = data?.exact || null;
  if (currentSearch?.word) {
    manualAccentWord.value = currentSearch.word;
    selectedAccentIndex = null;
    renderAccentBuilder();
  }
  if (!data?.normalizedQuery) {
    searchResults.innerHTML = `<p class="muted">Введите слово для поиска.</p>`;
    return;
  }

  const exactBlock = data.exact
    ? `<div class="hero-mini">
        <div>
          <div class="muted">Результат</div>
          <div class="big-word">${escapeHtml(data.exact.stressed)}</div>
          <div class="muted">${escapeHtml(data.exact.note || "Ударение может стоять неправильно, обязательно перепроверяйте.")}</div>
        </div>
        <div class="badge ${data.exact.fallback ? "danger" : ""}">${escapeHtml(data.exact.source || "unknown")}</div>
      </div>`
    : `<p class="muted">Точное совпадение не найдено.</p>`;

  const related = data.results
    .slice(0, 8)
    .map(
      (item) => `
      <article class="card-item compact-card">
        <div class="card-main"><strong>${escapeHtml(item.word)}</strong><span>${escapeHtml(item.stressed)}</span></div>
        <div class="card-meta"><span>${escapeHtml(item.location)}</span><span>${escapeHtml(item.source)}</span></div>
      </article>`
    )
    .join("");

  searchResults.innerHTML = `${exactBlock}${related}`;
}

function buildStressedWord(word, stressIndex) {
  if (stressIndex == null || stressIndex < 0 || stressIndex >= word.length) return word;
  return `${word.slice(0, stressIndex + 1)}́${word.slice(stressIndex + 1)}`;
}




async function safeAction(action, okMessage) {
  try {
    const result = await action();
    if (actionStatus && okMessage) actionStatus.textContent = okMessage;
    return result;
  } catch (error) {
    console.error(error);
    if (actionStatus) actionStatus.textContent = 'Не удалось выполнить действие. Перезагрузи расширение и попробуй ещё раз.';
    throw error;
  }
}


function showInlineStatus(node, message, variant = 'success') {
  if (!node) return;
  node.hidden = false;
  node.className = `inline-status inline-status--${variant}`;
  node.textContent = message;
}

function clearInlineStatus(node) {
  if (!node) return;
  node.hidden = true;
  node.textContent = '';
  node.className = 'inline-status';
}

function renderAccentBuilder() {
  const word = manualAccentWord.value.trim();
  if (!word) {
    accentBuilder.innerHTML = 'Введите слово для выбора ударной гласной.';
    return;
  }
  const letters = [...word].map((char, idx) => {
    const isVowel = VOWELS.includes(char);
    const classes = ['accent-letter'];
    if (isVowel) classes.push('accent-letter--vowel');
    if (selectedAccentIndex === idx) classes.push('accent-letter--selected');
    return `<button type="button" class="${classes.join(' ')}" data-idx="${idx}" data-vowel="${isVowel ? '1' : '0'}">${escapeHtml(char)}</button>`;
  }).join('');
  accentBuilder.innerHTML = `${letters}<div class="preview-line">Итог: <strong>${escapeHtml(buildStressedWord(word, selectedAccentIndex))}</strong></div>`;
  accentBuilder.querySelectorAll('[data-vowel="1"]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedAccentIndex = Number(button.dataset.idx);
      renderAccentBuilder();
    });
  });
}

function renderRules(explanations = [], note = '') {
  const expl = explanations.length ? explanations.map((item) => `<li>${escapeHtml(item)}</li>`).join('') : '<li>Правило не распознано автоматически.</li>';
  return `<ul class="rules-list">${expl}</ul>${note ? `<p>${escapeHtml(note)}</p>` : ''}`;
}

async function refreshAfterMutation() {
  await loadState();
  if (searchInput.value.trim()) {
    const result = await chrome.runtime.sendMessage({ type: "SEARCH_STRESS", query: searchInput.value.trim(), save: true });
    renderSearch(result);
  }
}

document.getElementById("reviewNowBtn").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "OPEN_TRAINING_SESSION", mode: reviewModeSelect.value || "all", count: 10 });
  window.close();
});

document.getElementById("scheduleReminderBtn").addEventListener("click", async () => {
  await safeAction(
    () => chrome.runtime.sendMessage({ type: "SCHEDULE_SMART_REMINDER", minutes: 1 }),
    "Умное напоминание запланировано примерно через 1 минуту."
  );
});

document.getElementById("exportBtn").addEventListener("click", async () => {
  const payload = await chrome.runtime.sendMessage({ type: "EXPORT_CARDS" });
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "accent-coach-export.json";
  a.click();
  URL.revokeObjectURL(url);
});

async function performSearch() {
  const result = await chrome.runtime.sendMessage({ type: "SEARCH_STRESS", query: searchInput.value.trim(), save: true });
  renderSearch(result);
  await loadState();
}

document.getElementById("searchBtn").addEventListener("click", performSearch);
searchInput.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  await performSearch();
});

manualAccentWord.addEventListener('input', () => {
  selectedAccentIndex = null;
  renderAccentBuilder();
});

document.getElementById('saveAccentOverrideBtn').addEventListener('click', async () => {
  const word = manualAccentWord.value.trim();
  if (!word) {
    manualAccentStatus.textContent = 'Сначала введи слово.';
    return;
  }
  if (selectedAccentIndex == null) {
    manualAccentStatus.textContent = 'Нажми на правильную гласную.';
    return;
  }
  const stressed = buildStressedWord(word, selectedAccentIndex);
  const payload = await chrome.runtime.sendMessage({ type: 'SAVE_STRESS_OVERRIDE', word, stressed });
  manualAccentStatus.textContent = payload?.ok ? `Сохранено: ${stressed}` : 'Не удалось сохранить исправление.';
  searchInput.value = word;
  await performSearch();
  if (accentInput.value.trim()) {
    const payload2 = await chrome.runtime.sendMessage({ type: "ACCENT_TEXT", text: accentInput.value, saveWords: true, favoriteWords: false });
    accentOutput.value = payload2?.accentedText || accentOutput.value;
  }
});


saveStressCardBtn.addEventListener("click", async () => {
  clearInlineStatus(stressCardStatus);
  const word = (currentSearch?.word || searchInput.value || '').trim();
  await safeAction(async () => {
    await saveCurrentStressToCards();
    await loadState();
    showInlineStatus(
      stressCardStatus,
      `Карточка «${word}» сохранена. Если нажать ещё раз, запись обновится и останется в карточках.`,
      'success'
    );
  }, "");
});

document.getElementById("saveFavoriteBtn").addEventListener("click", async () => {
  clearInlineStatus(favoriteWordStatus);
  if (!currentSearch?.word) await performSearch();
  if (!currentSearch?.word) return;
  await safeAction(async () => {
    const alreadyFavorite = Boolean(currentSearch?.favorite);
    if (!currentSearch?.stressed) return;
    await chrome.runtime.sendMessage({
      type: "SAVE_STRESS_CARD",
      word: currentSearch.word,
      stressed: currentSearch.stressed,
      source: currentSearch.source || "manual_search",
      note: currentSearch.note || "Добавлено пользователем в избранное.",
      favorite: true
    });
    await chrome.runtime.sendMessage({ type: "TOGGLE_FAVORITE", word: currentSearch.id || currentSearch.word, value: true });
    await refreshAfterMutation();
    showInlineStatus(
      favoriteWordStatus,
      alreadyFavorite
        ? `Слово «${currentSearch.word}» уже было в избранном. Карточка обновлена и останется в приоритете повторения.`
        : `Слово «${currentSearch.word}» добавлено в избранное. Оно будет чаще попадать в слабые места и напоминания.`,
      alreadyFavorite ? 'info' : 'success'
    );
  }, "");
});

document.getElementById("accentBtn").addEventListener("click", async () => {
  const payload = await chrome.runtime.sendMessage({ type: "ACCENT_TEXT", text: accentInput.value, saveWords: true, favoriteWords: false });
  accentOutput.value = payload?.accentedText || "";
  await loadState();
});

saveAccentTextCardsBtn.addEventListener("click", async () => {
  clearInlineStatus(accentTextCardStatus);
  await safeAction(async () => {
    const payload = await chrome.runtime.sendMessage({ type: "ACCENT_TEXT", text: accentInput.value, saveWords: true, favoriteWords: false });
    accentOutput.value = payload?.accentedText || "";
    const count = payload?.resolvedWords?.length || 0;
    await loadState();
    showInlineStatus(
      accentTextCardStatus,
      count > 0
        ? `Слова из текста сохранены в карточки: ${count}. При повторном нажатии записи обновятся.`
        : 'В тексте не найдено новых слов для карточек, но уже сохранённые записи можно обновлять повторным нажатием.',
      count > 0 ? 'success' : 'info'
    );
  }, "");
});

document.getElementById("accentAndFavoriteBtn").addEventListener("click", async () => {
  clearInlineStatus(accentFavoriteStatus);
  await safeAction(async () => {
    const payload = await chrome.runtime.sendMessage({ type: "ACCENT_TEXT", text: accentInput.value, saveWords: true, favoriteWords: true });
    accentOutput.value = payload?.accentedText || "";
    const count = payload?.resolvedWords?.length || 0;
    await loadState();
    showInlineStatus(
      accentFavoriteStatus,
      count > 0
        ? `Слова из текста помечены как сложные: ${count}. Они будут чаще появляться в повторении, уведомлениях и слабых местах недели.`
        : 'Сложные слова не найдены или уже были помечены раньше. Повторное нажатие обновляет их приоритет.',
      count > 0 ? 'success' : 'info'
    );
  }, "");
});

document.getElementById("copyAccentedBtn").addEventListener("click", async () => {
  if (!accentOutput.value) return;
  await navigator.clipboard.writeText(accentOutput.value);
});


editAccentOutputBtn.addEventListener("click", async () => {
  const text = accentOutput.value || '';
  const start = accentOutput.selectionStart || 0;
  const end = accentOutput.selectionEnd || 0;
  const selected = text.slice(start, end).replace(/́/g, '').trim();
  const normalized = selected.toLowerCase().replace(/[^а-яё-]/g, '');
  if (!normalized) {
    manualAccentStatus.textContent = 'Сначала выдели слово в поле результата.';
    return;
  }
  manualAccentWord.value = normalized;
  selectedAccentIndex = null;
  renderAccentBuilder();
  manualAccentStatus.textContent = 'Теперь выбери правильную гласную и нажми «Сохранить исправление».';
});

saveAccentOutputBtn.addEventListener("click", async () => {
  if (!accentInput.value.trim()) return;
  const payload = await chrome.runtime.sendMessage({ type: "ACCENT_TEXT", text: accentInput.value, saveWords: true, favoriteWords: false });
  accentOutput.value = payload?.accentedText || accentOutput.value;
  manualAccentStatus.textContent = 'Текст пересобран с учётом ручных исправлений.';
  await loadState();
});

document.getElementById('punctuateBtn').addEventListener('click', async () => {
  const payload = await chrome.runtime.sendMessage({ type: 'PUNCTUATE_TEXT', text: punctuationInput.value });
  punctuationOutput.value = payload?.result || '';
  punctuationRules.innerHTML = renderRules(payload?.explanations || [], payload?.note || '');
  lastPunctuationResult = payload;
  setPunctuationEditing(false);
  await loadState();
});


editPunctuationBtn.addEventListener('click', async () => {
  if (!punctuationOutput.value.trim()) return;
  const isEditing = punctuationOutput.readOnly;
  if (!isEditing && lastPunctuationResult?.result) {
    punctuationOutput.value = lastPunctuationResult.result;
  }
  setPunctuationEditing(isEditing);
});

saveEditedPunctuationBtn.addEventListener('click', async () => {
  const original = punctuationInput.value.trim();
  const corrected = punctuationOutput.value.trim();
  const manualRule = document.getElementById('manualRuleInput')?.value?.trim() || '';
  if (!original || !corrected) return;
  lastPunctuationResult = {
    ...(lastPunctuationResult || {}),
    original,
    result: corrected,
    explanations: [...(lastPunctuationResult?.explanations || []), 'Текст вручную исправлен пользователем.'],
    note: 'Исправлено вручную пользователем'
  };
  await chrome.runtime.sendMessage({ type: 'SET_LAST_PUNCTUATION', payload: lastPunctuationResult });
  punctuationRules.innerHTML = renderRules(lastPunctuationResult.explanations, lastPunctuationResult.note) + '<p>Ручные правки сохранены.</p>';
  setPunctuationEditing(false);
});

document.getElementById('savePunctuationBtn').addEventListener('click', async () => {
  const original = punctuationInput.value.trim();
  const corrected = punctuationOutput.value.trim();
  const manualRule = document.getElementById('manualRuleInput')?.value?.trim() || '';
  const wasManuallyEdited = !punctuationOutput.readOnly || (lastPunctuationResult?.note || '').toLowerCase().includes('вручную') || corrected !== (lastPunctuationResult?.result || corrected);
  if (!original || !corrected) return;
  clearInlineStatus(punctuationCardStatus);
  if (wasManuallyEdited && !manualRule) {
    showInlineStatus(
      punctuationCardStatus,
      'Предложение можно сохранить, но сначала обязательно впишите ниже своё правило. Если вы исправили запятые вручную, правило обязательно.',
      'warning'
    );
    return;
  }
  await safeAction(async () => {
    await chrome.runtime.sendMessage({
      type: 'SAVE_PUNCTUATION_CARD',
      originalText: original,
      correctedText: corrected,
      explanations: (lastPunctuationResult?.explanations || []).concat(manualRule ? ['Пользовательское правило: ' + manualRule] : []),
      note: manualRule ? 'Сохранено с пользовательским правилом' : (lastPunctuationResult?.note || 'Исправлено вручную пользователем'),
      favorite: false
    });
    await loadState();
    showInlineStatus(
      punctuationCardStatus,
      manualRule
        ? 'Предложение сохранено в карточки вместе с вашим правилом. При повторном нажатии запись обновится.'
        : 'Предложение сохранено в карточки, но если вы меняли запятые вручную, не забудьте ниже вписать своё правило.',
      'success'
    );
  }, '');
});

document.getElementById('savePunctuationFavoriteBtn')?.addEventListener('click', async () => {
  const original = punctuationInput.value.trim();
  const corrected = punctuationOutput.value.trim();
  const manualRule = document.getElementById('manualRuleInput')?.value?.trim() || '';
  const wasManuallyEdited = !punctuationOutput.readOnly || (lastPunctuationResult?.note || '').toLowerCase().includes('вручную') || corrected !== (lastPunctuationResult?.result || corrected);
  if (!original || !corrected) return;
  clearInlineStatus(punctuationFavoriteStatus);
  if (wasManuallyEdited && !manualRule) {
    showInlineStatus(
      punctuationFavoriteStatus,
      'Сначала впишите своё правило ниже. Для вручную исправленных запятых правило обязательно.',
      'warning'
    );
    return;
  }
  await safeAction(async () => {
    await chrome.runtime.sendMessage({
      type: 'SAVE_PUNCTUATION_CARD',
      originalText: original,
      correctedText: corrected,
      explanations: (lastPunctuationResult?.explanations || []).concat(manualRule ? ['Пользовательское правило: ' + manualRule] : []),
      note: manualRule ? 'Сохранено с пользовательским правилом' : (lastPunctuationResult?.note || 'Исправлено вручную пользователем'),
      favorite: true
    });
    await loadState();
    showInlineStatus(
      punctuationFavoriteStatus,
      'Предложение сделано приоритетным. Оно будет чаще появляться в уведомлениях, слабых местах недели и повторении.',
      'success'
    );
  }, '');
});

document.getElementById('copyPunctuationBtn').addEventListener('click', async () => {
  if (!punctuationOutput.value) return;
  await navigator.clipboard.writeText(punctuationOutput.value);
});

document.body.addEventListener("click", async (event) => {
  const favoriteBtn = event.target.closest("[data-action='favorite']");
  if (favoriteBtn) {
    const id = favoriteBtn.dataset.word;
    const next = favoriteBtn.textContent.trim() !== "★";
    await chrome.runtime.sendMessage({ type: "TOGGLE_FAVORITE", word: id, value: next });
    await refreshAfterMutation();
    return;
  }

  const gradeBtn = event.target.closest("[data-grade]");
  if (gradeBtn) {
    await chrome.runtime.sendMessage({ type: "GRADE_CARD", word: gradeBtn.dataset.word, result: gradeBtn.dataset.grade });
    await refreshAfterMutation();
  }
});
renderAccentBuilder();
switchTab('accent');
loadState();

setPunctuationEditing(false);


document.getElementById('openCardsBtn').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'OPEN_CARDS_PAGE' });
});

document.getElementById('testNotificationBtn').addEventListener('click', async () => {
  await safeAction(
    () => chrome.runtime.sendMessage({ type: 'TEST_NOTIFICATION_NOW' }),
    "Тестовое уведомление отправлено. Если системные уведомления для Chrome разрешены, оно должно появиться сразу."
  );
});

document.getElementById('trainWeakSpotsBtn')?.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'OPEN_TRAINING_SESSION', mode: 'weak', count: 10 });
  window.close();
});


claimChestBtn?.addEventListener('click', async () => {
  const result = await chrome.runtime.sendMessage({ type: 'CLAIM_DAILY_CHEST' });
  const chestStatus = document.getElementById('chestStatus');
  if (result?.ok) chestStatus.textContent = `Сундук открыт! +30 XP, уровень ${result.level}.`;
  else if (result?.reason === 'already_claimed') chestStatus.textContent = 'Ты уже открыл сундук сегодня.';
  else chestStatus.textContent = 'Сначала закрой дневную цель.';
  await loadState();
});


document.getElementById("startTrainingQuickBtn")?.addEventListener("click", async () => {
  const mode = document.getElementById("reviewModeSelect")?.value || "all";
  await chrome.runtime.sendMessage({ type: "OPEN_TRAINING_SESSION", mode, count: 10 });
});



function punctuate(text) {
  let t = text;
  const rules = [];

  const apply = (pattern, replacement, note) => {
    const next = t.replace(pattern, replacement);
    if (next !== t) {
      t = next;
      rules.push(note);
    }
  };

  // сложные союзы
  apply(/\s+(потому что)\b/gi, ', $1', "Запятая перед 'потому что'");
  apply(/\s+(так как)\b/gi, ', $1', "Запятая перед 'так как'");
  apply(/\s+(несмотря на то что)\b/gi, ', $1', "Запятая перед 'несмотря на то что'");
  apply(/\s+(в то время как)\b/gi, ', $1', "Запятая перед 'в то время как'");

  // базовые союзы
  apply(/\s+(что|чтобы|если|когда|хотя|пока)\b/gi, ', $1', "Запятая перед союзом");

  // противительные
  apply(/\s+(но|а|однако|зато)\s+/gi, ', $1 ', "Запятая перед противительным союзом");

  // вводные слова
  apply(/(^|\s)(конечно|наверное|возможно|кстати|во-первых|во-вторых)(\s)/gi, '$1$2,$3', "Вводное слово");

  // деепричастия (очень грубо)
  apply(/(\w+я)(\s+)/gi, '$1,$2', "Деепричастный оборот");

  t = t.replace(/\s+,/g, ',').replace(/,{2,}/g, ',');
  return { result: t, explanation: rules.join('; ') };
}



function punctuate(text) {
  let t = text;
  const rules = [];

  const apply = (pattern, replacement, note) => {
    const next = t.replace(pattern, replacement);
    if (next !== t) {
      t = next;
      rules.push(note);
    }
  };

  // 1. СПП (придаточные)
  apply(/\s+(что|чтобы|если|когда|потому что|так как|хотя|пока|где|который|когда)\b/gi,
        ', $1',
        "Запятая в сложноподчинённом предложении");

  // 2. Противительные союзы
  apply(/\s+(но|а|однако|зато|да)\s+/gi,
        ', $1 ',
        "Запятая перед противительным союзом");

  // 3. Однородные члены (очень базово)
  apply(/(\w+)\s+(и|или|либо)\s+(\w+)/gi,
        '$1, $2 $3',
        "Запятая между однородными членами (упрощённо)");

  // 4. Вводные слова
  apply(/(^|\s)(конечно|наверное|возможно|кстати|во-первых|во-вторых|например)(\s)/gi,
        '$1$2,$3',
        "Вводное слово");

  // 5. Причастные обороты
  apply(/(\w+)(\s+)(который\s+[^,.]+)/gi,
        '$1,$2$3,',
        "Причастный оборот");

  // 6. Деепричастные обороты
  apply(/(\w+я)(\s+)(\w+)/gi,
        '$1,$2$3',
        "Деепричастный оборот");

  // 7. Уточнения
  apply(/(\w+)(\s+)(то есть|а именно|например)(\s+)/gi,
        '$1,$2$3,$4',
        "Уточняющее слово");

  // очистка
  t = t
    .replace(/\s+,/g, ',')
    .replace(/,{2,}/g, ',')
    .replace(/,\s+,/g, ',')
    .replace(/^,/, '');

  return {
    result: t,
    explanation: rules.join(' | ')
  };
}


document.getElementById("startEgeExamBtn")?.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "OPEN_EGE_EXAM" });
});
