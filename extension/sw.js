const MENU_SAVE_WORD_ID = "save-russian-stress-word";
const MENU_ACCENT_TEXT_ID = "accent-selected-russian-text";
const MENU_PUNCTUATE_TEXT_ID = "punctuate-selected-russian-text";
const REVIEW_ALARM_ID = "review-due-cards";
const REVIEW_TEST_ALARM_ID = "review-test-card";
const STORAGE_KEYS = {
  cards: "cards",
  settings: "settings",
  localDictionary: "bundledDictionary",
  lastProcessedText: "lastProcessedText",
  lastPunctuation: "lastPunctuation",
  profile: "profile",
  lastSearch: "lastSearch",
  trainingSession: "trainingSession",
  egeExamSession: "egeExamSession",
  notificationSession: "notificationSession"
};

const DEFAULT_SETTINGS = {
  apiBaseUrl: "",
  reviewCheckMinutes: 60,
  firstIntervalMinutes: 15,
  hardResetMinutes: 20,
  secondIntervalMinutes: 24 * 60,
  thirdIntervalMinutes: 3 * 24 * 60,
  defaultEase: 2.2,
  maxEase: 3.0,
  minEase: 1.3,
  autoSaveProcessedWords: 1,
  overlayEnabled: 0,
  overlayWordLimit: 30,
  dailyGoal: 10,
  examMode: 1,
  reviewBatchSize: 10
};

const DEFAULT_PROFILE = {
  xp: 0,
  level: 1,
  currentStreak: 0,
  bestStreak: 0,
  lastActiveDay: "",
  totalReviews: 0,
  totalCorrect: 0,
  rememberedToday: 0,
  dailyGoalHits: 0,
  chestClaimedDay: '',
  missionsCompleted: 0
};

let bundledDictionaryCache = null;
let egeWordsCache = null;

chrome.runtime.onInstalled.addListener(async () => {
  await ensureSettings();
  await ensureProfile();
  await ensureDictionaryLoaded();
  await ensureEgeWordsLoaded();
  await createContextMenus();
  await ensureReviewAlarm();
});
chrome.runtime.onStartup.addListener(async () => {
  await ensureSettings();
  await ensureProfile();
  await ensureDictionaryLoaded();
  await ensureReviewAlarm();
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  const selectionText = (info.selectionText || "").trim();
  if (!selectionText) return;

  if (info.menuItemId === MENU_SAVE_WORD_ID) {
    const words = extractUniqueWords(selectionText);
    if (!words.length) return showBasicNotification("Accent Coach", "Выдели русское слово.");
    const word = words[0];
    const exact = (await searchStress(word, { save: false })).exact;
    if (exact) {
      await storeLastSearch(exact);
      await openResultsPage('word');
      await showBasicNotification("Ударение найдено", `${exact.word} → ${exact.stressed}`);
    }
    return;
  }

  if (info.menuItemId === MENU_ACCENT_TEXT_ID) {
    const processed = await buildAccentedText(selectionText, { saveWords: false, favoriteWords: false });
    await storeLastProcessedText({ originalText: selectionText, accentedText: processed.accentedText, resolvedWords: processed.resolvedWords, unresolvedWords: processed.unresolvedWords, processedAt: Date.now(), sourceAction: 'accent-selection' });
    try {
      if (info.tabId || info.tabId === 0) {
        await chrome.tabs.sendMessage(info.tabId, {
          type: 'REPLACE_OR_SHOW_RESULT',
          title: 'Текст с ударениями',
          text: processed.accentedText,
          note: 'Заменяется только в редактируемых полях. В обычном тексте показывается плашка.'
        });
      }
    } catch (e) {}
    await openResultsPage('accent');
    await showBasicNotification("Ударения поставлены", `Обработано: ${processed.resolvedWords.length} слов.`);
    return;
  }

  if (info.menuItemId === MENU_PUNCTUATE_TEXT_ID) {
    const payload = await punctuateText(selectionText);
    await storeLastPunctuation(payload);
    await openResultsPage('punctuation');
    await showBasicNotification("Запятые поставлены", payload.result);
  }
});



chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== REVIEW_ALARM_ID && alarm.name !== REVIEW_TEST_ALARM_ID) return;
  const preferDifficult = true;
  const card = alarm.name === REVIEW_TEST_ALARM_ID
    ? ((await getNotificationCandidate(preferDifficult)) || (await getNotificationCandidate(false)))
    : ((await getNotificationCandidate(preferDifficult)) || await getNextDueCard());
  if (!card) return;

  const title = card.kind === 'punctuation'
    ? '📚 Повторим запятые?'
    : '📚 Повторим ударение?';

  await showSmartNotification(card, title);

  if (alarm.name === REVIEW_ALARM_ID) {
    await ensureReviewAlarm(true);
  }
});

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (notificationId !== 'study_card') return;
  const data = await chrome.storage.local.get('notificationSession');
  const session = data.notificationSession || {};
  const card = Array.isArray(session.cards) ? session.cards[0] : null;
  if (!card) return;

  if (buttonIndex === 0) {
    await openSingleCardTraining(card);
  } else {
    await snoozeCard(card.id, 30);
    await chrome.notifications.clear('study_card');
  }
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId !== 'study_card') return;
  const data = await chrome.storage.local.get('notificationSession');
  const session = data.notificationSession || {};
  const card = Array.isArray(session.cards) ? session.cards[0] : null;
  if (!card) return;
  await openSingleCardTraining(card);
});


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const asyncHandle = (promise) => { promise.then(sendResponse); return true; };
  if (msg?.type === 'GET_STATE') return asyncHandle(getStateSnapshot());
  if (msg?.type === 'SAVE_SETTINGS') return asyncHandle(saveSettings(msg.payload).then(async()=>{await ensureReviewAlarm(true); return {ok:true};}));
  if (msg?.type === 'IMPORT_CARDS') return asyncHandle(importCards(msg.payload).then(()=>({ok:true})));
  if (msg?.type === 'EXPORT_CARDS') return asyncHandle(exportCards());
  if (msg?.type === 'TRIGGER_REVIEW') { chrome.alarms.create(REVIEW_ALARM_ID, { when: Date.now() + 1000 }); sendResponse({ok:true}); return; }
  if (msg?.type === 'SEARCH_STRESS') return asyncHandle(searchStress(msg.query || '', { save: Boolean(msg.save) }));
  if (msg?.type === 'ACCENT_TEXT') return asyncHandle(buildAccentedText(msg.text || '', { saveWords: Boolean(msg.saveWords), favoriteWords: Boolean(msg.favoriteWords) }).then(async(payload)=>{ await storeLastProcessedText({ originalText: msg.text || '', accentedText: payload.accentedText, resolvedWords: payload.resolvedWords, unresolvedWords: payload.unresolvedWords, processedAt: Date.now(), sourceAction: 'popup-accent-text' }); return payload; }));
  if (msg?.type === 'GET_LAST_PROCESSED_TEXT') return asyncHandle(getLastProcessedText());
  if (msg?.type === 'GET_LAST_PUNCTUATION') return asyncHandle(getLastPunctuation());
  if (msg?.type === 'GET_LAST_SEARCH') return asyncHandle(getLastSearch());
  if (msg?.type === 'LOOKUP_SELECTION_OVERLAY') return asyncHandle(Promise.resolve({ ok:false }));
  if (msg?.type === 'TOGGLE_FAVORITE') return asyncHandle(toggleFavorite(msg.word, msg.value));
  if (msg?.type === 'GRADE_CARD') return asyncHandle(gradeCard(msg.word, msg.result).then(()=>({ok:true})));
  if (msg?.type === 'GET_REVIEW_CARD') return asyncHandle(getReviewCard(msg.cardId || null));
  if (msg?.type === 'OPEN_REVIEW_CARD') return asyncHandle(openTrainingSession(msg.mode || 'all', Number(msg.count || 10)).then(()=>({ok:true})));
  if (msg?.type === 'OPEN_TRAINING_SESSION') return asyncHandle(openTrainingSession(msg.mode || 'all', Number(msg.count || 10)).then(()=>({ok:true})));
  if (msg?.type === 'GET_TRAINING_SESSION') return asyncHandle(getTrainingSession().then((session)=>({session})));
  if (msg?.type === 'OPEN_EGE_EXAM') return asyncHandle(openEgeExam().then(()=>({ok:true})));
  if (msg?.type === 'GET_EGE_EXAM_SESSION') return asyncHandle(getEgeExamSession().then((session)=>({session})));
  if (msg?.type === 'GET_EGE_EXAM_RESULT') return asyncHandle(getEgeExamResult().then((result)=>({result})));
  if (msg?.type === 'SUBMIT_EGE_EXAM') return asyncHandle(submitEgeExam(msg.answers || [], Boolean(msg.expired)).then((result)=>({result})));

  if (msg?.type === 'OPEN_CARDS_PAGE') return asyncHandle(openCardsPage().then(()=>({ok:true})));
  if (msg?.type === 'OPEN_RESULTS_PAGE') return asyncHandle(openResultsPage(msg.view || 'accent').then(()=>({ok:true})));
  if (msg?.type === 'SAVE_STRESS_OVERRIDE') return asyncHandle(saveStressOverride(msg.word, msg.stressed));
  if (msg?.type === 'SAVE_STRESS_CARD') return asyncHandle(saveStressCard(msg));
  if (msg?.type === 'DELETE_CARD') return asyncHandle(deleteCard(msg.id));
  if (msg?.type === 'DELETE_CARDS_BY_WORDS') return asyncHandle(deleteCardsByWords(msg.words || []));
  if (msg?.type === 'SET_LAST_PUNCTUATION') return asyncHandle(storeLastPunctuation(msg.payload || {}).then(()=>({ok:true})));
  if (msg?.type === 'PUNCTUATE_TEXT') return asyncHandle(punctuateText(msg.text || '').then(async(payload)=>{ await storeLastPunctuation(payload); return payload; }));
  if (msg?.type === 'SAVE_PUNCTUATION_CARD') return asyncHandle(savePunctuationCard(msg));
  if (msg?.type === 'SCHEDULE_SMART_REMINDER') return asyncHandle(scheduleSmartReminder(msg.minutes || 1));
  if (msg?.type === 'TEST_NOTIFICATION_NOW') return asyncHandle(testNotificationNow());
  if (msg?.type === 'CLAIM_DAILY_CHEST') return asyncHandle(claimDailyChest());
});

async function createContextMenus() {
  try { await chrome.contextMenus.removeAll(); } catch (e) {}
  chrome.contextMenus.create({ id: MENU_SAVE_WORD_ID, title: 'Поставить ударение в одном слове', contexts: ['selection'] });
  chrome.contextMenus.create({ id: MENU_ACCENT_TEXT_ID, title: 'Поставить ударения в тексте', contexts: ['selection'] });
  chrome.contextMenus.create({ id: MENU_PUNCTUATE_TEXT_ID, title: 'Расставить запятые', contexts: ['selection'] });
}
async function ensureSettings() { const current = await chrome.storage.local.get(STORAGE_KEYS.settings); const merged = { ...DEFAULT_SETTINGS, ...(current[STORAGE_KEYS.settings] || {}) }; await chrome.storage.local.set({ [STORAGE_KEYS.settings]: merged }); return merged; }
async function getSettings() { const data = await chrome.storage.local.get(STORAGE_KEYS.settings); return { ...DEFAULT_SETTINGS, ...(data[STORAGE_KEYS.settings] || {}) }; }
async function saveSettings(payload) { const current = await getSettings(); const merged = { ...current, ...payload }; await chrome.storage.local.set({ [STORAGE_KEYS.settings]: merged }); return {ok:true}; }
async function ensureProfile() { const data = await chrome.storage.local.get(STORAGE_KEYS.profile); const profile = { ...DEFAULT_PROFILE, ...(data[STORAGE_KEYS.profile] || {}) }; await chrome.storage.local.set({ [STORAGE_KEYS.profile]: profile }); return profile; }
async function getProfile() { const data = await chrome.storage.local.get(STORAGE_KEYS.profile); return { ...DEFAULT_PROFILE, ...(data[STORAGE_KEYS.profile] || {}) }; }
async function saveProfile(profile) { await chrome.storage.local.set({ [STORAGE_KEYS.profile]: profile }); }
async function ensureReviewAlarm(force = false) { const settings = await getSettings(); const existing = await chrome.alarms.get(REVIEW_ALARM_ID); if (existing && !force) return; if (existing && force) await chrome.alarms.clear(REVIEW_ALARM_ID); await chrome.alarms.create(REVIEW_ALARM_ID, { periodInMinutes: settings.reviewCheckMinutes }); }

async function ensureDictionaryLoaded() {
  if (bundledDictionaryCache) return bundledDictionaryCache;
  const storage = await chrome.storage.local.get(STORAGE_KEYS.localDictionary);
  if (storage[STORAGE_KEYS.localDictionary]) { bundledDictionaryCache = storage[STORAGE_KEYS.localDictionary]; return bundledDictionaryCache; }
  const response = await fetch(chrome.runtime.getURL('data/local_dictionary.json'));
  bundledDictionaryCache = await response.json();
  await chrome.storage.local.set({ [STORAGE_KEYS.localDictionary]: bundledDictionaryCache });
  return bundledDictionaryCache;
}


async function ensureEgeWordsLoaded() {
  if (egeWordsCache) return egeWordsCache;
  try {
    const response = await fetch(chrome.runtime.getURL('data/ege_words.json'));
    const items = await response.json();
    egeWordsCache = new Set((items || []).map((x) => normalizeRussianWord(x)).filter(Boolean));
  } catch (e) {
    egeWordsCache = new Set();
  }
  return egeWordsCache;
}

function normalizeRussianWord(text) { return (text || '').toLowerCase().replace(/[^а-яё-]/g, '').replace(/^-+|-+$/g, ''); }
function extractUniqueWords(text) { const matches = String(text || '').toLowerCase().match(/[а-яё-]+/g) || []; return [...new Set(matches.map(normalizeRussianWord).filter(Boolean))]; }
function addAccent(word, index) { if (index < 0 || index >= word.length) return word; if (word[index + 1] === '́') return word; return `${word.slice(0, index + 1)}́${word.slice(index + 1)}`; }

async function fetchApiJson(path, options = {}) {
  const settings = await getSettings();
  if (!settings.apiBaseUrl) throw new Error('API disabled');
  const response = await fetch(`${settings.apiBaseUrl}${path}`, options);
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

async function resolveStress(word) {
  const dict = await ensureDictionaryLoaded();
  if (dict[word]) return { word, stressed: dict[word], source: 'local_dictionary', fallback: false, note: 'Из локального словаря.' };
  try {
    const api = await fetchApiJson(`/stress?word=${encodeURIComponent(word)}`);
    if (api?.stressed) return { word, stressed: api.stressed, source: api.source || 'api', fallback: api.source?.includes('fallback') || false, note: api.note || 'Ударение может стоять неправильно, обязательно перепроверяйте.' };
  } catch (e) {}
  const vowels = [...word.matchAll(/[аеёиоуыэюя]/g)].map((m) => m.index);
  if (!vowels.length) return { word, stressed: word, source: 'fallback_passthrough', fallback: true, note: 'Ударение не удалось определить.' };
  const pos = vowels.length === 1 ? vowels[0] : vowels[vowels.length - 1];
  return { word, stressed: addAccent(word, pos), source: 'extension_fallback', fallback: true, note: 'Ударение может стоять неправильно, обязательно перепроверяйте.' };
}

async function searchStress(query, { save = false } = {}) {
  const normalizedQuery = normalizeRussianWord(query);
  const cards = await getCards();
  const dict = await ensureDictionaryLoaded();
  const results = [];
  let exact = null;
  if (!normalizedQuery) return { normalizedQuery: '', exact: null, results: [] };
  if (cards[normalizedQuery]) {
    const card = cards[normalizedQuery];
    exact = { ...card, location: 'cards' };
    results.push({ ...card, location: 'cards' });
  }
  if (dict[normalizedQuery]) {
    const item = { id: normalizedQuery, word: normalizedQuery, stressed: dict[normalizedQuery], source: 'local_dictionary', location: 'dictionary', fallback: false, note: 'Из локального словаря.' };
    if (!exact) exact = item;
    results.push(item);
  }
  if (!exact) {
    const resolved = await resolveStress(normalizedQuery);
    exact = { id: normalizedQuery, ...resolved, location: 'resolved' };
    results.push(exact);
    if (save && resolved.stressed) await upsertStressCard(normalizedQuery, resolved.stressed, resolved.source, { favorite: false, note: resolved.note });
  }
  if (exact) await storeLastSearch(exact);
  for (const [id, card] of Object.entries(cards)) {
    if (card.kind === 'stress' && id !== normalizedQuery && id.includes(normalizedQuery)) results.push({ ...card, location: 'cards' });
  }
  return { normalizedQuery, exact, results: results.slice(0, 20) };
}

async function buildAccentedText(text, { saveWords = true, favoriteWords = false } = {}) {
  const words = extractUniqueWords(text);
  const resolvedWords = [];
  const unresolvedWords = [];
  const map = new Map();
  for (const word of words) {
    const resolved = await resolveStress(word);
    resolvedWords.push(resolved);
    map.set(word, resolved.stressed || word);
    if (resolved.fallback) unresolvedWords.push(resolved);
    if (saveWords && resolved.stressed) await upsertStressCard(word, resolved.stressed, resolved.source, { favorite: favoriteWords, note: resolved.note });
  }
  const accentedText = String(text || '').replace(/[А-Яа-яЁё-]+/g, (match) => {
    const normalized = normalizeRussianWord(match);
    const stressed = map.get(normalized);
    if (!stressed) return match;
    return preserveCase(match, stressed);
  });
  return { accentedText, resolvedWords, unresolvedWords };
}

function preserveCase(source, stressed) {
  if (!source) return stressed;
  if (source.toUpperCase() === source) return stressed.toUpperCase();
  if (source[0] === source[0].toUpperCase()) return stressed[0].toUpperCase() + stressed.slice(1);
  return stressed;
}


function localPunctuateText(text) {
  let result = String(text || '').trim();
  const explanations = [];
  const apply = (pattern, replacement, note) => {
    const next = result.replace(pattern, replacement);
    if (next !== result) {
      result = next;
      if (!explanations.includes(note)) explanations.push(note);
    }
  };
  apply(/\s+(потому что)/gi, ', $1', 'Запятая перед союзом «потому что».');
  apply(/\s+(так как)/gi, ', $1', 'Запятая перед союзом «так как».');
  apply(/\s+(так что)/gi, ', $1', 'Запятая перед союзом «так что».');
  apply(/\s+(но)\s+/gi, ', $1 ', 'Запятая перед противительным союзом «но».');
  apply(/\s+(а)\s+/gi, ', $1 ', 'Запятая перед союзом «а».');
  apply(/\s+(чтобы)/gi, ', $1', 'Запятая перед придаточным с союзом «чтобы».');
  apply(/\s+(что)/gi, ', $1', 'Запятая перед придаточным с союзом «что».');
  apply(/\s+(если)/gi, ', $1', 'Запятая перед придаточным с союзом «если».');
  apply(/\s+(когда)/gi, ', $1', 'Запятая перед придаточным с союзом «когда».');
  apply(/\s+(хотя)/gi, ', $1', 'Запятая перед придаточным с союзом «хотя».');
  apply(/\s+(словно|будто|как будто)/gi, ', $1', 'Запятая перед сравнительным или изъяснительным союзом.');
  apply(/^(Когда\s+[^,]{3,60}?)(\s+)(?=[А-Яа-яЁё])/i, '$1, ', 'Запятая после придаточного времени с союзом «когда».');
  apply(/^(Если\s+[^,]{3,60}?)(\s+)(?=[А-Яа-яЁё])/i, '$1, ', 'Запятая после придаточного условия с союзом «если».');
  apply(/^(Хотя\s+[^,]{3,60}?)(\s+)(?=[А-Яа-яЁё])/i, '$1, ', 'Запятая после придаточного уступки с союзом «хотя».');
  result = result.replace(/\s+,/g, ',').replace(/,\s*,/g, ',').replace(/\s{2,}/g, ' ').trim();
  if (result && !/[.!?]$/.test(result)) result += '.';
  if (!explanations.length) explanations.push('Точного автоматического правила не найдено. Проверь пунктуацию вручную.');
  return {
    original: text,
    result,
    explanations,
    note: 'Запятые расставляются локально по правилам внутри расширения. В сложных или авторских случаях обязательно перепроверь и при необходимости исправь вручную.'
  };
}

async function punctuateText(text) {
  const settings = await getSettings();
  if (settings.apiBaseUrl) {
    try {
      const data = await fetchApiJson('/punctuate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ text }) });
      return data;
    } catch (e) {}
  }
  return localPunctuateText(text);
}

async function saveStressCard({ word, stressed, source = 'manual_add', note = '', favorite = true }) {
  await upsertStressCard(normalizeRussianWord(word), stressed, source, { favorite, note: note || 'Добавлено пользователем в карточки.' });
  return { ok: true };
}

async function saveStressOverride(word, stressed) {
  await upsertStressCard(normalizeRussianWord(word), stressed, 'manual_override', { favorite: true, note: 'Исправлено вручную пользователем.' });
  return { ok: true };
}

async function savePunctuationCard({ originalText, correctedText, explanations = [], note = '', favorite = true }) {
  const rule = explanations.join(' · ') || note || 'Исправлено вручную пользователем';
  const id = `punct:${originalText}`;
  const cards = await getCards();
  const settings = await getSettings();
  const now = Date.now();
  cards[id] = {
    ...(cards[id] || {}),
    id,
    kind: 'punctuation',
    word: originalText.slice(0, 80),
    prompt: originalText,
    answer: correctedText,
    rule,
    source: 'manual_punctuation',
    createdAt: cards[id]?.createdAt || now,
    updatedAt: now,
    intervalMinutes: cards[id]?.intervalMinutes || settings.firstIntervalMinutes,
    ease: cards[id]?.ease || settings.defaultEase,
    reps: cards[id]?.reps || 0,
    dueAt: cards[id]?.dueAt || now + settings.firstIntervalMinutes * 60 * 1000,
    lastResult: cards[id]?.lastResult || null,
    reviewHistory: cards[id]?.reviewHistory || [],
    favorite: favorite,
    timesLookedUp: Number(cards[id]?.timesLookedUp || 0) + 1,
    score: Number(cards[id]?.score || 0)
  };
  await saveCards(cards);
  await touchDailyActivity();
  return { ok: true, id };
}

async function getCards() { const data = await chrome.storage.local.get(STORAGE_KEYS.cards); return data[STORAGE_KEYS.cards] || {}; }
async function saveCards(cards) { await chrome.storage.local.set({ [STORAGE_KEYS.cards]: cards }); }
async function upsertStressCard(word, stressed, source, extra = {}) {
  const cards = await getCards();
  const settings = await getSettings();
  const now = Date.now();
  const id = word;
  cards[id] = {
    ...(cards[id] || {}), id, kind: 'stress', word, stressed, answer: stressed, prompt: word,
    source, note: extra.note || cards[id]?.note || '',
    createdAt: cards[id]?.createdAt || now, updatedAt: now,
    intervalMinutes: cards[id]?.intervalMinutes || settings.firstIntervalMinutes,
    ease: cards[id]?.ease || settings.defaultEase,
    reps: cards[id]?.reps || 0,
    dueAt: cards[id]?.dueAt || now + settings.firstIntervalMinutes * 60 * 1000,
    lastResult: cards[id]?.lastResult || null,
    reviewHistory: cards[id]?.reviewHistory || [],
    favorite: extra.favorite === true ? true : cards[id]?.favorite || false,
    timesLookedUp: Number(cards[id]?.timesLookedUp || 0) + 1,
    score: Number(cards[id]?.score || 0)
  };
  await saveCards(cards);
  await touchDailyActivity();
}

async function toggleFavorite(id, value) { const cards = await getCards(); if (!cards[id]) return {ok:false}; cards[id].favorite = Boolean(value); cards[id].updatedAt = Date.now(); await saveCards(cards); return {ok:true, favorite: cards[id].favorite}; }

async function deleteCard(id) {
  const cards = await getCards();
  if (!cards[id]) return { ok: false, removed: 0 };
  delete cards[id];
  await saveCards(cards);
  return { ok: true, removed: 1 };
}

async function deleteCardsByWords(words) {
  const cards = await getCards();
  let removed = 0;
  for (const word of words) {
    const id = normalizeRussianWord(word);
    if (cards[id]) {
      delete cards[id];
      removed += 1;
    }
  }
  await saveCards(cards);
  return { ok: true, removed };
}

async function getNextDueCard() {
  const cards = await getCards();
  const settings = await getSettings();
  const now = Date.now();
  let due = Object.values(cards).filter((card)=>card.dueAt<=now).sort((a,b)=>a.dueAt-b.dueAt);
  if (settings.examMode) {
    const ege = await ensureEgeWordsLoaded();
    const prioritized = due.filter((card) => {
      if (card.kind === 'punctuation') return true;
      return ege.has(normalizeRussianWord(card.word || card.id || ''));
    });
    if (prioritized.length) due = prioritized;
  }
  return due[0] || null;
}
function dayKey(time = Date.now()) { return new Date(time).toISOString().slice(0, 10); }
async function touchDailyActivity() { const profile = await getProfile(); const today = dayKey(); if (!profile.lastActiveDay) { profile.lastActiveDay = today; profile.currentStreak = 1; profile.bestStreak = Math.max(profile.bestStreak, profile.currentStreak); } else if (profile.lastActiveDay !== today) { const yesterday = new Date(Date.now() - 24*60*60*1000).toISOString().slice(0,10); profile.currentStreak = profile.lastActiveDay === yesterday ? profile.currentStreak + 1 : 1; profile.lastActiveDay = today; profile.rememberedToday = 0; profile.bestStreak = Math.max(profile.bestStreak, profile.currentStreak); } await saveProfile(profile); }

function leagueForLevel(level) {
  if (level >= 15) return 'Золото';
  if (level >= 7) return 'Серебро';
  return 'Бронза';
}
function nextLeagueLevel(level) {
  if (level >= 15) return null;
  if (level >= 7) return 15;
  return 7;
}
function isSameDay(a, b) {
  return a && b && a === b;
}
async function addXp(points) {
  const profile = await getProfile();
  profile.xp += points;
  profile.level = Math.floor(profile.xp / 100) + 1;
  await saveProfile(profile);
}
async function claimDailyChest() {
  const profile = await getProfile();
  const settings = await getSettings();
  const today = dayKey();
  const goalReached = Number(profile.rememberedToday || 0) >= Number(settings.dailyGoal || 10);
  if (!goalReached) return { ok: false, reason: 'goal_not_reached' };
  if (isSameDay(profile.chestClaimedDay, today)) return { ok: false, reason: 'already_claimed' };
  profile.chestClaimedDay = today;
  profile.missionsCompleted = Number(profile.missionsCompleted || 0) + 1;
  await saveProfile(profile);
  await addXp(30);
  const fresh = await getProfile();
  return { ok: true, xp: fresh.xp, level: fresh.level };
}

function weakSpotsForWeek(cards) {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return cards
    .map((card) => {
      const history = Array.isArray(card.reviewHistory) ? card.reviewHistory : [];
      const recent = history.filter((x) => (x.at || 0) >= weekAgo);
      const forgets = recent.filter((x) => x.result === 'forget').length;
      return { ...card, forgets };
    })
    .filter((card) => card.forgets > 0)
    .sort((a, b) => {
      if (b.forgets !== a.forgets) return b.forgets - a.forgets;
      return Number(a.dueAt || 0) - Number(b.dueAt || 0);
    })
    .slice(0, 10);
}
function missionsFromState(profile, cards, settings) {
  const rememberedToday = Number(profile.rememberedToday || 0);
  const punctuationCards = cards.filter(x => x.kind === 'punctuation').length;
  const stressCards = cards.filter(x => x.kind === 'stress').length;
  return [
    {
      id: 'daily_goal',
      title: 'Закрой дневную цель',
      progress: Math.min(rememberedToday, Number(settings.dailyGoal || 10)),
      target: Number(settings.dailyGoal || 10),
      type: 'daily'
    },
    {
      id: 'stress_pack',
      title: 'Собери 20 карточек по ударениям',
      progress: Math.min(stressCards, 20),
      target: 20,
      type: 'stress'
    },
    {
      id: 'punctuation_pack',
      title: 'Собери 10 карточек по запятым',
      progress: Math.min(punctuationCards, 10),
      target: 10,
      type: 'punctuation'
    }
  ];
}

async function gradeCard(id, result) {
  const cards = await getCards();
  const settings = await getSettings();
  const card = cards[id];
  if (!card) return;
  const now = Date.now();

  if (result === 'remember') {
    card.reps += 1;
    if (card.reps === 1) card.intervalMinutes = settings.secondIntervalMinutes;
    else if (card.reps === 2) card.intervalMinutes = settings.thirdIntervalMinutes;
    else card.intervalMinutes = Math.round(card.intervalMinutes * Math.max(1.8, card.ease));
    card.ease = Math.min(card.ease + 0.15, settings.maxEase);
    card.lastResult = 'remember';
    card.score = Number(card.score || 0) + 3;
    card.favorite = false;
    await addXp(card.kind === 'punctuation' ? 8 : 6);
  } else {
    card.reps = 0;
    card.intervalMinutes = Math.max(10, Math.round(settings.hardResetMinutes / 2));
    card.ease = Math.max(card.ease - 0.25, settings.minEase);
    card.lastResult = 'forget';
    card.favorite = true;
    card.score = Math.max(0, Number(card.score || 0) - 2);
    await addXp(1);
  }

  card.reviewHistory = Array.isArray(card.reviewHistory) ? card.reviewHistory : [];
  card.reviewHistory.push({ result, at: now });
  card.updatedAt = now;
  card.dueAt = now + card.intervalMinutes * 60 * 1000;
  cards[id] = card;
  await saveCards(cards);

  const profile = await getProfile();
  await touchDailyActivity();
  profile.totalReviews += 1;
  if (result === 'remember') {
    profile.totalCorrect += 1;
    profile.rememberedToday = Number(profile.rememberedToday || 0) + 1;
    const settingsNow = await getSettings();
    if (profile.rememberedToday === Number(settingsNow.dailyGoal || 10)) {
      profile.dailyGoalHits += 1;
      await addXp(20);
    }
  }
  await saveProfile(profile);
}

function shuffle(items) { const copy = [...items]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; }

async function getNotificationCandidate(preferDifficult = true) {
  const cards = await getCards();
  const items = Object.values(cards || {});
  if (!items.length) return null;

  const now = Date.now();
  const due = items.filter((x) => Number(x.dueAt || 0) <= now);
  const difficult = items.filter((x) => x.favorite || x.lastResult === 'forget' || Number(x.score || 0) <= 1);

  const source = preferDifficult
    ? (difficult.length ? difficult : (due.length ? due : items))
    : (due.length ? due : items);

  source.sort((a, b) => {
    const af = a.lastResult === 'forget' ? 1 : 0;
    const bf = b.lastResult === 'forget' ? 1 : 0;
    if (af !== bf) return bf - af;
    const ascore = Number(a.score || 0);
    const bscore = Number(b.score || 0);
    if (ascore !== bscore) return ascore - bscore;
    return Number(a.dueAt || 0) - Number(b.dueAt || 0);
  });

  return source[0] || null;
}

async function showSmartNotification(card, title = '📚 Повторим?') {
  if (!card) return { ok: false, reason: 'empty' };
  const message = card.kind === 'punctuation'
    ? (card.prompt || card.word || '')
    : (card.word || '');

  const session = { cards: [card], mode: 'single', count: 1, createdAt: Date.now() };
  await chrome.storage.local.set({ [STORAGE_KEYS.notificationSession]: session });

  await chrome.notifications.clear('study_card');
  await chrome.notifications.create('study_card', {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
    buttons: [
      { title: 'Показать карточку' },
      { title: 'Позже' }
    ],
    priority: 2,
    requireInteraction: true
  });
  return { ok: true, cardId: card.id };
}

async function openSingleCardTraining(card) {
  const session = { cards: [card], mode: 'single', count: 1, createdAt: Date.now() };
  await chrome.storage.local.set({
    [STORAGE_KEYS.notificationSession]: session,
    [STORAGE_KEYS.trainingSession]: session
  });
  await chrome.tabs.create({ url: chrome.runtime.getURL('training.html') });
}

async function snoozeCard(cardId, minutes = 30) {
  const cards = await getCards();
  const card = cards[cardId];
  if (!card) return { ok: false };
  const now = Date.now();
  card.updatedAt = now;
  card.dueAt = now + Number(minutes) * 60 * 1000;
  cards[cardId] = card;
  await saveCards(cards);
  return { ok: true };
}

async function scheduleSmartReminder(minutes = 1) {
  let card = await getNotificationCandidate(true);
  if (!card) {
    await upsertStressCard('звонит', 'звони́т', 'test_seed', { favorite: true, note: 'Тестовая карточка для проверки уведомлений.' });
    card = await getNotificationCandidate(true);
  }
  if (!card) return { ok: false, reason: 'no_card' };

  const cards = await getCards();
  const current = cards[card.id];
  if (current) {
    const now = Date.now();
    current.updatedAt = now;
    current.dueAt = now + Math.max(0.5, Number(minutes)) * 60 * 1000;
    cards[card.id] = current;
    await saveCards(cards);
  }

  await chrome.alarms.clear(REVIEW_TEST_ALARM_ID);
  await chrome.alarms.create(REVIEW_TEST_ALARM_ID, { when: Date.now() + Math.max(0.5, Number(minutes)) * 60 * 1000 });
  return { ok: true, cardId: card.id };
}

async function testNotificationNow() {
  let card = await getNotificationCandidate(true);
  if (!card) {
    await upsertStressCard('звонит', 'звони́т', 'test_seed', { favorite: true, note: 'Тестовая карточка для проверки уведомлений.' });
    card = await getNotificationCandidate(true);
  }
  return await showSmartNotification(card, '📚 Умное напоминание');
}

async function getReviewCard(cardId = null) {
  const cards = await getCards();
  let card = null;
  if (cardId && cards[cardId]) card = cards[cardId];
  if (!card) card = await getNextDueCard();
  if (!card) return { ok: false, reason: 'empty' };
  return { ok: true, card };
}

async function openReviewCard(cardId = null, mode = 'all') {
  const params = new URLSearchParams();
  if (cardId) params.set('card', cardId);
  if (mode) params.set('mode', mode);
  const url = chrome.runtime.getURL(`review.html?${params.toString()}`);
  await chrome.tabs.create({ url });
}

async function showBasicNotification(title, message) { await chrome.notifications.create({ type:'basic', iconUrl:'icons/icon128.png', title, message, priority:1 }); }

async function saveTrainingSession(session) {
  await chrome.storage.local.set({ [STORAGE_KEYS.trainingSession]: session });
}

async function getTrainingSession() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.trainingSession);
  return data[STORAGE_KEYS.trainingSession] || { cards: [], mode: 'all', count: 0, createdAt: Date.now() };
}

async function buildTrainingCards(mode = 'all', count = 10) {
  const cards = await getCards();
  let items = Object.values(cards);
  if (mode === 'stress') items = items.filter((x) => x.kind === 'stress');
  if (mode === 'punctuation') items = items.filter((x) => x.kind === 'punctuation');
  if (mode === 'weak') items = weakSpotsForWeek(items);
  const dueFirst = items.filter((x) => x.dueAt <= Date.now());
  const source = dueFirst.length ? dueFirst : items;
  const shuffled = shuffle(source);
  return shuffled.slice(0, Math.max(1, count));
}

async function openTrainingSession(mode = 'all', count = 10) {
  const cards = await buildTrainingCards(mode, count);
  await saveTrainingSession({ cards, mode, count: cards.length, createdAt: Date.now() });
  await chrome.tabs.create({ url: chrome.runtime.getURL('training.html') });
}




async function saveEgeExamSession(session) {
  await chrome.storage.local.set({ [STORAGE_KEYS.egeExamSession]: session });
}

async function getEgeExamResult() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.egeExamResult);
  return data[STORAGE_KEYS.egeExamResult] || null;
}

async function saveEgeExamResult(result) {
  await chrome.storage.local.set({ [STORAGE_KEYS.egeExamResult]: result });
}

async function openEgeExamResultsPage() {
  await chrome.tabs.create({ url: chrome.runtime.getURL('ege_results.html') });
}

async function getEgeExamSession() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.egeExamSession);
  return data[STORAGE_KEYS.egeExamSession] || {
    questions: [],
    createdAt: Date.now(),
    durationSeconds: 600,
    startedAt: Date.now(),
    submittedAt: null,
    strictMode: true
  };
}


function buildStressOptions(stressed) {
  const clean = stressed.replaceAll('́', '');
  const vowels = 'аеёиоуыэюя';
  const positions = [];
  for (let i = 0; i < clean.length; i++) {
    if (vowels.includes(clean[i].toLowerCase())) positions.push(i);
  }
  const wrongVariants = [...new Set(positions.map((pos) => addAccent(clean, pos)).filter((variant) => variant !== stressed))];
  const selectedWrong = shuffle(wrongVariants).slice(0, 3);
  return shuffle([stressed, ...selectedWrong]).slice(0, 4);
}

function buildPunctuationOptions(correct, prompt) {
  const base = String(prompt || '').trim();
  const right = String(correct || '').trim();
  const normalize = (value) => String(value || '')
    .replace(/\s+,/g, ',')
    .replace(/,\s+/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const injectCommaAtRandomGap = (text) => {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (words.length < 4) return text;
    const positions = [];
    for (let i = 1; i < words.length - 1; i++) positions.push(i);
    const pos = positions[Math.floor(Math.random() * positions.length)];
    const copy = [...words];
    copy[pos - 1] = copy[pos - 1] + ',';
    return copy.join(' ');
  };

  const scrambleWithRandomCommas = (text) => {
    let value = String(text || '').replace(/,/g, '');
    for (let i = 0; i < 2; i++) value = injectCommaAtRandomGap(value);
    return value;
  };

  const variants = new Set([
    normalize(right),
    normalize(base),
    normalize(right.replace(/,/g, '')),
    normalize(base.replace(/\s+(что|чтобы|если|когда|хотя|пока)\b/i, ', $1')),
    normalize(base.replace(/\s+(потому что|так как|несмотря на то что|в то время как)\b/i, ', $1')),
    normalize(base.replace(/\s+(но|а|однако|зато)\s+/i, ', $1 ')),
    normalize(right.replace(/,\s*(что|чтобы|если|когда|хотя|пока)\b/i, ' $1,')),
    normalize(right.replace(/,\s*(но|а|однако|зато)\s+/i, ' $1, ')),
    normalize(injectCommaAtRandomGap(base)),
    normalize(injectCommaAtRandomGap(right.replace(/,/g, ''))),
    normalize(scrambleWithRandomCommas(base))
  ]);

  const wrong = [...variants].filter((v) => v && v !== normalize(right));
  const uniqueWrong = [...new Set(wrong)].filter((v) => v !== normalize(right));
  const selectedWrong = shuffle(uniqueWrong).slice(0, 3);
  return shuffle([normalize(right), ...selectedWrong]).slice(0, 4);
}

function inferTopic(question) {
  if (question.kind === 'stress') return 'Ударения';
  const p = (question.prompt || '').toLowerCase();
  if (/(потому что|так как|что|чтобы|если|когда|хотя)/.test(p)) return 'Сложноподчинённые предложения';
  if (/(но|а|однако|зато)/.test(p)) return 'Противительные союзы';
  return 'Пунктуация';
}

async function buildEgeQuestions() {
  const cards = Object.values(await getCards());
  const stressCards = shuffle(cards.filter((x) => x.kind === 'stress' && x.stressed)).slice(0, 5);
  const punctuationCards = shuffle(cards.filter((x) => x.kind === 'punctuation' && x.answer)).slice(0, 5);

  const questions = [];
  for (const card of stressCards) {
    questions.push({
      id: `ege-stress:${card.id}`,
      kind: 'stress',
      prompt: card.word,
      question: 'Укажите правильный вариант ударения',
      options: buildStressOptions(card.stressed),
      correct: card.stressed,
      explanation: card.note || 'Это словарное ударение.',
      topic: 'Ударения'
    });
  }

  for (const card of punctuationCards) {
    questions.push({
      id: `ege-punct:${card.id}`,
      kind: 'punctuation',
      prompt: card.prompt || card.word,
      question: 'Выберите вариант с правильной пунктуацией',
      options: buildPunctuationOptions(card.answer, card.prompt || card.word),
      correct: card.answer,
      explanation: card.rule || 'Проверь постановку запятых.',
      topic: inferTopic({ kind: 'punctuation', prompt: card.prompt || card.word })
    });
  }

  return shuffle(questions).slice(0, Math.min(10, questions.length));
}

async function openEgeExam() {
  const questions = await buildEgeQuestions();
  const session = {
    questions,
    createdAt: Date.now(),
    startedAt: Date.now(),
    durationSeconds: 10 * 60,
    submittedAt: null,
    strictMode: true
  };
  await saveEgeExamSession(session);
  await chrome.tabs.create({ url: chrome.runtime.getURL('ege_exam.html') });
}

function egeVerdict(scorePercent) {
  if (scorePercent >= 85) return '5 — отлично';
  if (scorePercent >= 70) return '4 — хорошо';
  if (scorePercent >= 50) return '3 — удовлетворительно';
  return '2 — нужно ещё тренироваться';
}


async function submitEgeExam(answers, forceExpired = false) {
  const session = await getEgeExamSession();
  if (session.submittedAt && session.result) {
    return session.result;
  }

  const questions = session.questions || [];
  const expired = forceExpired || ((Date.now() - Number(session.startedAt || Date.now())) >= Number(session.durationSeconds || 600) * 1000);

  const checked = questions.map((q) => {
    const found = answers.find((a) => a.id === q.id);
    const answer = found ? found.answer : null;
    const isCorrect = answer === q.correct;
    return { ...q, answer, isCorrect };
  });

  const correct = checked.filter((x) => x.isCorrect).length;
  const total = checked.length;
  const scorePercent = total ? Math.round((correct / total) * 100) : 0;

  const topicStats = {};
  for (const q of checked) {
    const topic = q.topic || inferTopic(q);
    topicStats[topic] = topicStats[topic] || { total: 0, wrong: 0 };
    topicStats[topic].total += 1;
    if (!q.isCorrect) topicStats[topic].wrong += 1;
  }
  const weakTopics = Object.entries(topicStats)
    .filter(([, v]) => v.wrong > 0)
    .sort((a, b) => b[1].wrong - a[1].wrong)
    .map(([topic, v]) => ({ topic, wrong: v.wrong, total: v.total }));

  if (total > 0) {
    await addXp(correct * 8);
  }

  const result = {
    questions: checked,
    correct,
    total,
    scorePercent,
    verdict: total === 0 ? 'Добавь карточки для ЕГЭ-режима.' : egeVerdict(scorePercent),
    expired,
    weakTopics,
    submittedAt: Date.now()
  };

  session.submittedAt = Date.now();
  session.result = result;
  await saveEgeExamSession(session);
  await saveEgeExamResult(result);
  return result;
}

async function getStateSnapshot() {

  const cards = await getCards();
  const settings = await getSettings();
  const profile = await getProfile();
  const items = Object.values(cards).sort((a,b)=>b.updatedAt-a.updatedAt);
  const dueNow = items.filter((x)=>x.dueAt<=Date.now());
  const favorites = items.filter((x)=>x.favorite);
  const rating = Math.round(profile.xp + profile.totalCorrect * 5);
  const stats = {
    total: items.length,
    due: dueNow.length,
    favorites: favorites.length,
    remembered: items.filter((x)=>x.lastResult==='remember').length,
    forgotten: items.filter((x)=>x.lastResult==='forget').length,
    accuracy: profile.totalReviews ? Math.round((profile.totalCorrect / profile.totalReviews) * 100) : 0,
    currentStreak: profile.currentStreak,
    bestStreak: profile.bestStreak,
    xp: profile.xp,
    level: profile.level,
    rating,
    goalProgress: `${profile.rememberedToday || 0}/${settings.dailyGoal}`
  };
  const league = leagueForLevel(profile.level || 1);
  const nextLeague = nextLeagueLevel(profile.level || 1);
  const weakSpots = weakSpotsForWeek(items);
  const weakCount = weakSpots.length;
  stats.weakCount = weakCount;
  const priorityReviewCards = (weakSpots.length ? weakSpots : dueNow).slice(0, 50);
  const missions = missionsFromState(profile, items, settings);
  const chestAvailable = Number(profile.rememberedToday || 0) >= Number(settings.dailyGoal || 10) && profile.chestClaimedDay !== dayKey();
  return {
    settings,
    cards: items,
    favorites: favorites.sort((a,b)=>(b.score||0)-(a.score||0)).slice(0,50),
    dueCards: dueNow.slice(0,50),
    priorityReviewCards,
    profile,
    stats,
    gamification: {
      league,
      nextLeague,
      chestAvailable,
      weakSpots,
      missions,
      dailyGoal: Number(settings.dailyGoal || 10),
      rememberedToday: Number(profile.rememberedToday || 0),
      chestClaimedDay: profile.chestClaimedDay || ''
    }
  };
}
async function exportCards() {
  const cards = await getCards();
  return {
    exportType: 'dictionary-only',
    version: 1,
    cards,
    exportedAt: new Date().toISOString(),
    note: 'Экспорт содержит только словарь/карточки. Личная статистика, XP, рейтинг, серия дней и достижения не включаются.'
  };
}
async function importCards(payload) {
  if (!payload || typeof payload !== 'object') return;
  if (payload.cards && typeof payload.cards === 'object') {
    await chrome.storage.local.set({ [STORAGE_KEYS.cards]: payload.cards });
  }
}
async function storeLastProcessedText(payload) { await chrome.storage.local.set({ [STORAGE_KEYS.lastProcessedText]: payload }); }
async function getLastProcessedText() { const data = await chrome.storage.local.get(STORAGE_KEYS.lastProcessedText); return data[STORAGE_KEYS.lastProcessedText] || null; }
async function storeLastSearch(payload) { await chrome.storage.local.set({ [STORAGE_KEYS.lastSearch]: payload }); }
async function getLastSearch() { const data = await chrome.storage.local.get(STORAGE_KEYS.lastSearch); return data[STORAGE_KEYS.lastSearch] || null; }
async function storeLastPunctuation(payload) { await chrome.storage.local.set({ [STORAGE_KEYS.lastPunctuation]: payload }); }
async function getLastPunctuation() { const data = await chrome.storage.local.get(STORAGE_KEYS.lastPunctuation); return data[STORAGE_KEYS.lastPunctuation] || null; }
async function openResultsPage(view = 'accent') { const ts = Date.now(); await chrome.tabs.create({ url: chrome.runtime.getURL(`results.html?view=${encodeURIComponent(view)}&ts=${ts}`) }); }
async function openCardsPage() { await chrome.tabs.create({ url: chrome.runtime.getURL('cards.html') }); }
async function lookupSelectionOverlay(text) { const settings = await getSettings(); if (Number(settings.overlayEnabled) === 0) return { ok:false, reason:'overlay_disabled' }; const words = extractUniqueWords(text); if (!words.length) return { ok:false, reason:'no_words' }; if (words.length === 1) { const word = words[0]; const exact = (await searchStress(word, { save: false })).exact; return { ok:true, mode:'word', word, data: exact }; } const payload = await buildAccentedText(text, { saveWords: true, favoriteWords: false }); return { ok:true, mode:'text', accentedText: payload.accentedText, resolvedCount: payload.resolvedWords.length, fallbackCount: payload.resolvedWords.filter((x)=>x.fallback).length }; }
