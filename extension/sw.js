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
  egeExamResult: "egeExamResult",
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
  reviewBatchSize: 10,
  textScale: 1
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
  dailyProgressDay: '',
  dailyMissionDay: '',
  dailyGoalHits: 0,
  chestClaimedDay: '',
  missionsCompleted: 0,
  unlockedMascotSkins: ['dragon_king', 'dragon_boss', 'dragon_sage'],
  selectedMascotSkin: 'dragon_king',
  bossStage: 1,
  bossHp: 1200,
  bossMaxHp: 1200,
  bossSkin: 'dragon_boss',
  bossVariant: 'mixed',
  bossLastDamage: 0
};


const DRAGON_SKINS = ['dragon_academy','dragon_ege','dragon_gold','dragon_forest','dragon_storm','dragon_crystal','dragon_shadow'];
function pickLockedDragonSkin(profile) {
  const unlocked = new Set([...(profile.unlockedMascotSkins || []), 'dragon_king', 'dragon_boss', 'dragon_sage']);
  const locked = DRAGON_SKINS.filter((skin) => !unlocked.has(skin));
  if (!locked.length) return null;
  return locked[Math.floor(Math.random() * locked.length)];
}


function randomBossSkin() {
  const skins = ['dragon_boss', 'dragon_forest', 'dragon_storm', 'dragon_crystal', 'dragon_shadow', 'dragon_ege'];
  return skins[Math.floor(Math.random() * skins.length)];
}

function bossMaxHpForStage(stage) {
  const safeStage = Math.max(1, Number(stage || 1));
  if (safeStage === 1) return 1200;
  return 3500 + (safeStage - 2) * 1800;
}

function normalizeBossProfile(profile, variant = 'mixed') {
  profile.bossStage = Math.max(1, Number(profile.bossStage || 1));
  const targetMax = bossMaxHpForStage(profile.bossStage);
  profile.bossMaxHp = Number(profile.bossMaxHp || targetMax);
  if (profile.bossMaxHp !== targetMax) profile.bossMaxHp = targetMax;
  profile.bossHp = Number(profile.bossHp || profile.bossMaxHp);
  profile.bossHp = Math.min(profile.bossMaxHp, Math.max(0, profile.bossHp));
  profile.bossSkin = profile.bossSkin || 'dragon_boss';
  profile.bossVariant = variant || profile.bossVariant || 'mixed';
  profile.bossLastDamage = Number(profile.bossLastDamage || 0);
  return profile;
}

async function damageBoss(amount = 25, variant = 'mixed') {
  const profile = await getProfile();
  normalizeBossProfile(profile, variant);
  const beforeStage = profile.bossStage;
  const beforeHp = profile.bossHp;
  let damage = Math.max(0, Math.round(Number(amount || 0)));
  profile.bossHp = Math.max(0, profile.bossHp - damage);
  profile.bossLastDamage = damage;
  profile.bossVariant = variant || profile.bossVariant || 'mixed';
  let defeated = false;
  if (profile.bossHp <= 0) {
    defeated = true;
    profile.bossStage = beforeStage + 1;
    profile.bossMaxHp = bossMaxHpForStage(profile.bossStage);
    profile.bossHp = profile.bossMaxHp;
    profile.bossSkin = randomBossSkin();
    profile.bossLastDamage = damage;
  }
  await saveProfile(profile);
  return {
    damage,
    defeated,
    beforeHp,
    beforeStage,
    bossStage: profile.bossStage,
    bossHp: profile.bossHp,
    bossMaxHp: profile.bossMaxHp,
    bossSkin: profile.bossSkin,
    bossVariant: profile.bossVariant,
    bossLastDamage: profile.bossLastDamage
  };
}

function bossDamageForCard(card, result) {
  if (result !== 'remember') return 0;
  const history = Array.isArray(card?.reviewHistory) ? card.reviewHistory : [];
  const forgets = history.filter((x) => x.result === 'forget').length;
  const base = card?.kind === 'punctuation' ? 55 : 45;
  return base + Math.min(160, forgets * 18);
}

function bossVariantFromWeakSpots(weakSpots = []) {
  const stressWeak = weakSpots.filter((x) => x.kind === 'stress').length;
  const punctuationWeak = weakSpots.filter((x) => x.kind === 'punctuation').length;
  return stressWeak > punctuationWeak ? 'stress' : punctuationWeak > stressWeak ? 'punctuation' : 'mixed';
}


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
    if (!words.length) return showBasicNotification("ОрфоДракон", "Выделите одно русское слово.");
    const word = words[0];
    const exact = (await searchStress(word, { save: false })).exact;
    if (exact) {
      await storeLastSearch(exact);
      await openResultsPage('word');
      await showBasicNotification("Результат проверки ударения", `${exact.word} → ${exact.stressed}`);
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
    ? '🐉 Пора повторить пунктуацию'
    : '🐉 Пора повторить ударение';

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
    await chrome.notifications.clear('study_card');
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
  await chrome.notifications.clear('study_card');
});


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const asyncHandle = (promise) => { promise.then(sendResponse); return true; };
  if (msg?.type === 'GET_STATE') return asyncHandle(getStateSnapshot());
  if (msg?.type === 'SAVE_SETTINGS') return asyncHandle(saveSettings(msg.payload).then(async()=>{await ensureReviewAlarm(true); return {ok:true};}));
  if (msg?.type === 'IMPORT_CARDS') return asyncHandle(importCards(msg.payload));
  if (msg?.type === 'EXPORT_CARDS') return asyncHandle(exportCards());
  if (msg?.type === 'TRIGGER_REVIEW') { chrome.alarms.create(REVIEW_ALARM_ID, { when: Date.now() + 1000 }); sendResponse({ok:true}); return; }
  if (msg?.type === 'SEARCH_STRESS') return asyncHandle(searchStress(msg.query || '', { save: Boolean(msg.save) }));
  if (msg?.type === 'ACCENT_TEXT') return asyncHandle(buildAccentedText(msg.text || '', { saveWords: Boolean(msg.saveWords), favoriteWords: Boolean(msg.favoriteWords) }).then(async(payload)=>{ await storeLastProcessedText({ originalText: msg.text || '', accentedText: payload.accentedText, resolvedWords: payload.resolvedWords, unresolvedWords: payload.unresolvedWords, processedAt: Date.now(), sourceAction: 'тренажёр-accent-text' }); return payload; }));
  if (msg?.type === 'GET_LAST_PROCESSED_TEXT') return asyncHandle(getLastProcessedText());
  if (msg?.type === 'GET_LAST_PUNCTUATION') return asyncHandle(getLastPunctuation());
  if (msg?.type === 'GET_LAST_SEARCH') return asyncHandle(getLastSearch());
  if (msg?.type === 'LOOKUP_SELECTION_OVERLAY') return asyncHandle(Promise.resolve({ ok:false }));
  if (msg?.type === 'TOGGLE_FAVORITE') return asyncHandle(toggleFavorite(msg.word, msg.value));
  if (msg?.type === 'GRADE_CARD') return asyncHandle(gradeCard(msg.id || msg.word, msg.result));
  if (msg?.type === 'GET_REVIEW_CARD') return asyncHandle(getReviewCard(msg.cardId || null));
  if (msg?.type === 'OPEN_REVIEW_CARD') return asyncHandle(openTrainingSession(msg.mode || 'all', Number(msg.count || 10)).then(()=>({ok:true})));
  if (msg?.type === 'OPEN_TRAINING_SESSION') return asyncHandle(openTrainingSession(msg.mode || 'all', Number(msg.count || 10)).then(()=>({ok:true})));
  if (msg?.type === 'GET_TRAINING_SESSION') return asyncHandle(getTrainingSession().then((session)=>({session})));
  if (msg?.type === 'OPEN_EGE_EXAM') return asyncHandle(openEgeExam().then((payload)=>({ok:true, ...payload})));
  if (msg?.type === 'CREATE_EGE_EXAM_SESSION') return asyncHandle(createEgeExamSession().then((session)=>({session})));
  if (msg?.type === 'GET_EGE_EXAM_SESSION') return asyncHandle(getEgeExamSession().then((session)=>({session})));
  if (msg?.type === 'GET_EGE_EXAM_RESULT') return asyncHandle(getEgeExamResult().then((result)=>({result})));
  if (msg?.type === 'OPEN_EGE_RESULTS') return asyncHandle(openEgeExamResultsPage().then((payload)=>({ok:true, ...payload})));
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
  if (msg?.type === 'SET_MASCOT_SKIN') return asyncHandle(setMascotSkin(msg.skin));
});

async function createContextMenus() {
  try { await chrome.contextMenus.removeAll(); } catch (e) {}
  chrome.contextMenus.create({ id: MENU_SAVE_WORD_ID, title: 'Проверить ударение в слове', contexts: ['selection'] });
  chrome.contextMenus.create({ id: MENU_ACCENT_TEXT_ID, title: 'Проверить ударения в выделенном тексте', contexts: ['selection'] });
  chrome.contextMenus.create({ id: MENU_PUNCTUATE_TEXT_ID, title: 'Проверить пунктуацию', contexts: ['selection'] });
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
function dayKey(time = Date.now()) {
  const date = new Date(time);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function previousDayKey(time = Date.now()) {
  return dayKey(time - 24 * 60 * 60 * 1000);
}

function numericDaySeed(key = dayKey()) {
  let seed = 0;
  for (const ch of String(key)) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  return seed;
}

function rollDailyProgress(profile) {
  const today = dayKey();
  if (!profile.dailyProgressDay) {
    profile.dailyProgressDay = today;
    profile.dailyMissionDay = today;
  }
  if (profile.dailyProgressDay !== today) {
    profile.dailyProgressDay = today;
    profile.dailyMissionDay = today;
    profile.rememberedToday = 0;
    profile.dailyGoalRewardedDay = '';
  }
  return profile;
}

async function ensureDailyProgress() {
  const profile = await getProfile();
  const before = JSON.stringify({
    dailyProgressDay: profile.dailyProgressDay,
    dailyMissionDay: profile.dailyMissionDay,
    rememberedToday: profile.rememberedToday,
    dailyGoalRewardedDay: profile.dailyGoalRewardedDay
  });
  rollDailyProgress(profile);
  const after = JSON.stringify({
    dailyProgressDay: profile.dailyProgressDay,
    dailyMissionDay: profile.dailyMissionDay,
    rememberedToday: profile.rememberedToday,
    dailyGoalRewardedDay: profile.dailyGoalRewardedDay
  });
  if (before !== after) await saveProfile(profile);
  return profile;
}

async function touchDailyActivity() {
  const profile = await getProfile();
  rollDailyProgress(profile);
  const today = dayKey();
  if (!profile.lastActiveDay) {
    profile.lastActiveDay = today;
    profile.currentStreak = 1;
  } else if (profile.lastActiveDay !== today) {
    profile.currentStreak = profile.lastActiveDay === previousDayKey() ? Number(profile.currentStreak || 0) + 1 : 1;
    profile.lastActiveDay = today;
  }
  profile.bestStreak = Math.max(Number(profile.bestStreak || 0), Number(profile.currentStreak || 0));
  await saveProfile(profile);
}

const LEAGUE_STEP_LEVELS = 7;
const LEAGUE_TIERS = [
  'Бронзовый Орфомастер',
  'Серебряный Орфомастер',
  'Золотой Орфомастер',
  'Платиновый Орфомастер',
  'Изумрудный Орфомастер'
];
const ROMAN_NUMERALS = [
  '', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'
];

function romanNumber(value) {
  const n = Math.max(1, Math.floor(Number(value || 1)));
  if (n < ROMAN_NUMERALS.length) return ROMAN_NUMERALS[n];
  const pairs = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
  ];
  let left = n;
  let out = '';
  for (const [num, mark] of pairs) {
    while (left >= num) {
      out += mark;
      left -= num;
    }
  }
  return out;
}

function leagueForLevel(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level || 1)));
  const leagueIndex = Math.floor((safeLevel - 1) / LEAGUE_STEP_LEVELS);
  const baseName = LEAGUE_TIERS[Math.min(leagueIndex, LEAGUE_TIERS.length - 1)];
  if (leagueIndex < LEAGUE_TIERS.length - 1) return baseName;
  const diamondType = leagueIndex - LEAGUE_TIERS.length + 2;
  return `Алмазный Орфомастер ${romanNumber(diamondType)}`;
}
function nextLeagueLevel(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level || 1)));
  return (Math.floor((safeLevel - 1) / LEAGUE_STEP_LEVELS) + 1) * LEAGUE_STEP_LEVELS + 1;
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
async function setMascotSkin(skin) {
  const profile = await getProfile();
  const unlocked = new Set([...(profile.unlockedMascotSkins || []), 'dragon_king', 'dragon_boss', 'dragon_sage']);
  if (!unlocked.has(skin)) return { ok: false, reason: 'skin_locked' };
  profile.selectedMascotSkin = skin;
  await saveProfile(profile);
  return { ok: true, selectedMascotSkin: skin };
}

async function claimDailyChest() {
  const profile = await getProfile();
  rollDailyProgress(profile);
  const settings = await getSettings();
  const today = dayKey();
  const goalTarget = missionTarget(Number(settings.dailyGoal || 10), profile);
  const goalReached = Number(profile.rememberedToday || 0) >= goalTarget;
  if (!goalReached) return { ok: false, reason: 'goal_not_reached' };
  if (isSameDay(profile.chestClaimedDay, today)) return { ok: false, reason: 'already_claimed' };
  profile.chestClaimedDay = today;
  profile.missionsCompleted = Number(profile.missionsCompleted || 0) + 1;
  profile.unlockedMascotSkins = Array.isArray(profile.unlockedMascotSkins)
    ? profile.unlockedMascotSkins
    : ['dragon_king', 'dragon_boss', 'dragon_sage'];

  let skinUnlocked = null;
  const candidate = pickLockedDragonSkin(profile);
  // Скин не гарантирован каждый день, чтобы сундук оставался интересным.
  if (candidate && Math.random() < 0.35) {
    profile.unlockedMascotSkins.push(candidate);
    skinUnlocked = candidate;
  }

  await saveProfile(profile);
  await addXp(30);
  const fresh = await getProfile();
  return { ok: true, xp: fresh.xp, level: fresh.level, skinUnlocked, unlockedMascotSkins: fresh.unlockedMascotSkins };
}
function weakSpotsForWeek(cards) {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return cards
    .map((card) => {
      const history = Array.isArray(card.reviewHistory) ? card.reviewHistory : [];
      const recent = history.filter((x) => (x.at || 0) >= weekAgo);
      const forgets = recent.filter((x) => x.result === 'forget').length;
      const label = card.kind === 'punctuation' ? (card.prompt || card.word || card.answer || 'Предложение') : (card.word || card.prompt || 'Слово');
      return { ...card, label, forgets };
    })
    .filter((card) => card.forgets > 0)
    .sort((a, b) => {
      if (b.forgets !== a.forgets) return b.forgets - a.forgets;
      return Number(a.dueAt || 0) - Number(b.dueAt || 0);
    })
    .slice(0, 10);
}
function todayHistoryCount(cards, options = {}) {
  const today = dayKey();
  return cards.reduce((sum, card) => {
    if (options.kind && card.kind !== options.kind) return sum;
    const history = Array.isArray(card.reviewHistory) ? card.reviewHistory : [];
    return sum + history.filter((entry) => {
      if (dayKey(Number(entry.at || 0)) !== today) return false;
      if (options.result && entry.result !== options.result) return false;
      return true;
    }).length;
  }, 0);
}

function missionDifficultyBonus(profile) {
  const completed = Math.max(0, Math.floor(Number(profile.missionsCompleted || 0)));
  return Math.min(12, Math.floor(completed / 2));
}

function missionTarget(baseTarget, profile) {
  const safeBase = Math.max(1, Math.floor(Number(baseTarget || 1)));
  return safeBase + missionDifficultyBonus(profile);
}

function missionsFromState(profile, cards, settings) {
  rollDailyProgress(profile);
  const rememberedToday = Number(profile.rememberedToday || 0);
  const baseDailyGoal = Number(settings.dailyGoal || 10);
  const dailyGoal = missionTarget(baseDailyGoal, profile);
  const seed = numericDaySeed(profile.dailyMissionDay || dayKey());
  const variants = [
    {
      id: 'stress_today',
      title: 'Тренировка дня: ударения',
      progress: todayHistoryCount(cards, { kind: 'stress', result: 'remember' }),
      target: missionTarget(Math.min(5, Math.max(3, baseDailyGoal)), profile),
      type: 'stress'
    },
    {
      id: 'punctuation_today',
      title: 'Тренировка дня: запятые',
      progress: todayHistoryCount(cards, { kind: 'punctuation', result: 'remember' }),
      target: missionTarget(Math.min(5, Math.max(3, baseDailyGoal)), profile),
      type: 'punctuation'
    },
    {
      id: 'accuracy_today',
      title: 'Тренировка дня: без ошибок',
      progress: Math.max(0, todayHistoryCount(cards, { result: 'remember' }) - todayHistoryCount(cards, { result: 'forget' })),
      target: missionTarget(Math.min(7, Math.max(4, baseDailyGoal)), profile),
      type: 'accuracy'
    }
  ];

  const focusMission = variants[seed % variants.length];
  const reviewMission = {
    id: 'review_today',
    title: 'Разогрев: повтори карточки',
    progress: todayHistoryCount(cards, {}),
    target: missionTarget(Math.min(8, Math.max(4, baseDailyGoal)), profile),
    type: 'review'
  };

  return [
    {
      id: 'daily_goal',
      title: 'Дневная цель',
      progress: Math.min(rememberedToday, dailyGoal),
      target: dailyGoal,
      type: 'daily'
    },
    focusMission,
    reviewMission,
    {
      id: 'daily_chest',
      title: profile.chestClaimedDay === dayKey() ? 'Сундук дня открыт' : 'Открой сундук дня',
      progress: profile.chestClaimedDay === dayKey() ? dailyGoal : Math.min(rememberedToday, dailyGoal),
      target: dailyGoal,
      type: 'chest'
    }
  ].map((mission) => ({
    ...mission,
    progress: Math.min(Number(mission.progress || 0), Number(mission.target || 1))
  }));
}

async function gradeCard(id, result) {
  const cards = await getCards();
  const settings = await getSettings();
  const card = cards[id];
  if (!card) return { ok: false, reason: 'card_not_found' };
  const now = Date.now();
  const damage = bossDamageForCard(card, result);
  const bossVariant = card.kind === 'punctuation' ? 'punctuation' : 'stress';

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

  await touchDailyActivity();
  const profile = await getProfile();
  rollDailyProgress(profile);
  profile.totalReviews += 1;
  if (result === 'remember') {
    profile.totalCorrect += 1;
    profile.rememberedToday = Number(profile.rememberedToday || 0) + 1;
    const settingsNow = await getSettings();
    if (profile.rememberedToday >= Number(settingsNow.dailyGoal || 10) && profile.dailyGoalRewardedDay !== dayKey()) {
      profile.dailyGoalHits += 1;
      profile.dailyGoalRewardedDay = dayKey();
      await addXp(20);
    }
  }
  await saveProfile(profile);
  const boss = await damageBoss(damage, bossVariant);
  return { ok: true, boss, damage };
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
    iconUrl: 'icons/dragon_notify.png',
    title,
    message,
    buttons: [
      { title: 'Открыть тренировку' },
      { title: 'Позже' }
    ],
    priority: 2,
    requireInteraction: true
  });
  return { ok: true, cardId: card.id };
}

async function openSingleCardTraining(card) {
  await chrome.notifications.clear('study_card');
  const session = { cards: [card], mode: 'single', count: 1, createdAt: Date.now() };
  await chrome.storage.local.set({
    [STORAGE_KEYS.notificationSession]: session,
    [STORAGE_KEYS.trainingSession]: session
  });
  await focusOrCreateExtensionTab('training.html');
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
  await focusOrCreateExtensionTab(`review.html?${params.toString()}`);
}

async function showBasicNotification(title, message) { await chrome.notifications.create({ type:'basic', iconUrl:'icons/dragon_notify.png', title, message, priority:1 }); }

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
  await focusOrCreateExtensionTab('training.html');
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


async function focusOrCreateExtensionTab(page, createProperties = {}) {
  const targetUrl = chrome.runtime.getURL(page);
  try {
    const tabs = await chrome.tabs.query({});
    const existing = tabs.find((tab) => typeof tab.url === 'string' && tab.url.startsWith(targetUrl));
    if (existing?.id) {
      await chrome.tabs.update(existing.id, { active: true, url: targetUrl });
      if (existing.windowId) await chrome.windows.update(existing.windowId, { focused: true });
      return { tabId: existing.id, reused: true };
    }
  } catch (error) {
    console.warn('Cannot query/focus existing tab', error);
  }
  const tab = await chrome.tabs.create({ url: targetUrl, ...createProperties });
  return { tabId: tab?.id || null, reused: false };
}

async function createEgeExamSession() {
  const questions = await buildEgeQuestions();
  const session = {
    questions,
    createdAt: Date.now(),
    startedAt: Date.now(),
    durationSeconds: 10 * 60,
    submittedAt: null,
    strictMode: true,
    emptyReason: questions.length ? '' : 'no_cards'
  };
  await saveEgeExamSession(session);
  return session;
}

async function openEgeExamResultsPage() {
  return focusOrCreateExtensionTab('ege_results.html');
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
  for (let i = 0; i < clean.length; i++) if (vowels.includes(clean[i].toLowerCase())) positions.push(i);
  const variants = new Set([stressed]);
  for (const pos of positions) variants.add(addAccent(clean, pos));
  const arr = shuffle([...variants].filter(Boolean));
  return arr.slice(0, Math.min(4, Math.max(2, arr.length)));
}

function buildPunctuationOptions(correct, prompt) {
  const base = String(prompt || '').trim();
  const right = String(correct || '').trim();
  const normalize = (value) => String(value || '').replace(/\s+,/g, ',').replace(/,\s*/g, ', ').replace(/\s{2,}/g, ' ').trim();
  const noComma = (text) => normalize(String(text || '').replace(/,/g, ''));
  const injectCommaAt = (text, pos) => {
    const words = noComma(text).split(/\s+/).filter(Boolean);
    if (words.length < 4 || pos <= 0 || pos >= words.length) return '';
    const copy = [...words]; copy[pos - 1] = copy[pos - 1] + ','; return normalize(copy.join(' '));
  };
  const commaBeforeWords = (text, words) => {
    const value = noComma(text);
    return words.map((word) => { const re = new RegExp(`\\s+(${word})\\b`, 'i'); return re.test(value) ? normalize(value.replace(re, ', $1')) : ''; }).filter(Boolean);
  };
  const commaAfterWords = (text, words) => {
    const value = noComma(text);
    return words.map((word) => { const re = new RegExp(`\\b(${word})\\s+`, 'i'); return re.test(value) ? normalize(value.replace(re, '$1, ')) : ''; }).filter(Boolean);
  };
  const commaVariants = (text) => {
    const words = noComma(text).split(/\s+/).filter(Boolean);
    const out = []; for (let i = 1; i < words.length; i++) out.push(injectCommaAt(text, i)); return out.filter(Boolean);
  };
  const variants = [right, noComma(right), noComma(base), ...commaBeforeWords(base, ['что','чтобы','если','когда','хотя','пока','поскольку','будто','словно','который','которая','которые','где','куда','откуда','почему','зачем','как']), ...commaBeforeWords(base, ['потому что','так как','несмотря на то что','в то время как']), ...commaBeforeWords(base, ['но','а','однако','зато','да']), ...commaAfterWords(base, ['однако','значит','например','конечно','кажется','возможно']), ...commaVariants(base), ...commaVariants(right)].map(normalize).filter(Boolean);
  const correctNorm = normalize(right);
  const uniqueWrong = shuffle([...new Set(variants)].filter((v) => v && v !== correctNorm));
  const optionCount = Math.min(4, Math.max(2, 1 + uniqueWrong.length));
  return shuffle([correctNorm, ...uniqueWrong.slice(0, optionCount - 1)]).slice(0, optionCount);
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
  const session = await createEgeExamSession();
  await focusOrCreateExtensionTab('ege_exam.html');
  return { session, empty: !(session.questions || []).length };
}

function egeVerdict(scorePercent) {
  if (scorePercent >= 85) return '5 — отлично';
  if (scorePercent >= 70) return '4 — хорошо';
  if (scorePercent >= 50) return '3 — удовлетворительно';
  return '2 — нужно ещё тренироваться';
}


function normalizeEgeAnswer(value) {
  return String(value || '')
    .replace(/ё/g, 'е')
    .replace(/Ё/g, 'Е')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:!?])(?=\S)/g, '$1 ')
    .trim()
    .replace(/[.。]+$/g, '')
    .trim();
}

function commaSignature(value) {
  const normalized = normalizeEgeAnswer(value);
  const positions = [];
  for (let i = 0; i < normalized.length; i += 1) {
    if (normalized[i] === ',') positions.push(i);
  }
  return positions.join('|');
}

function isEgeAnswerCorrect(question, userAnswer) {
  const right = question.correct || question.answer || '';
  const kind = question.kind || question.topic || '';
  const normalizedUser = normalizeEgeAnswer(userAnswer);
  const normalizedRight = normalizeEgeAnswer(right);

  if (String(kind).includes('punctuation') || String(kind).includes('пунктуа')) {
    return commaSignature(normalizedUser) === commaSignature(normalizedRight);
  }

  return normalizedUser === normalizedRight;
}

async function submitEgeExam(answers = [], expired = false) {
  const session = await getEgeExamSession();
  if (session?.submittedAt) {
    const existing = await getEgeExamResult();
    if (existing) return existing;
  }
  const questions = session.questions || [];
  let correct = 0;
  const weakTopics = [];

  if (!questions.length) {
    const result = {
      questions: [],
      answers: [],
      total: 0,
      correct: 0,
      percent: 0,
      mark: 'нет заданий',
      xpGained: 0,
      bossDamage: 0,
      boss: null,
      weakTopics: [],
      expired: Boolean(expired),
      emptyReason: 'no_cards',
      submittedAt: Date.now(),
      startedAt: session.startedAt || session.createdAt || Date.now(),
      durationSeconds: session.durationSeconds || 600
    };
    await saveEgeExamResult(result);
    await saveEgeExamSession({ ...session, submittedAt: result.submittedAt });
    await openEgeExamResultsPage();
    return result;
  }

  questions.forEach((q, i) => {
    const userAnswer = answers[i] || '';
    if (isEgeAnswerCorrect(q, userAnswer)) {
      correct += 1;
    } else {
      weakTopics.push(q.topic || q.kind || 'ЕГЭ');
    }
  });

  const total = questions.length;
  const percent = total ? Math.round((correct / total) * 100) : 0;
  const mark = percent >= 90 ? '5' : percent >= 70 ? '4' : percent >= 50 ? '3' : '2';
  const xpGained = correct * 12 + (percent >= 80 ? 30 : percent >= 60 ? 15 : 0);
  await addXp(xpGained);
  const stressWrong = questions.filter((q, i) => !isEgeAnswerCorrect(q, answers[i] || '') && q.kind === 'stress').length;
  const punctuationWrong = questions.filter((q, i) => !isEgeAnswerCorrect(q, answers[i] || '') && q.kind === 'punctuation').length;
  const bossVariant = stressWrong > punctuationWrong ? 'stress' : punctuationWrong > stressWrong ? 'punctuation' : 'mixed';
  const bossDamage = Math.max(20, xpGained * 2);
  const boss = await damageBoss(bossDamage, bossVariant);

  const result = {
    questions,
    answers,
    total,
    correct,
    percent,
    mark,
    xpGained,
    bossDamage,
    boss,
    weakTopics: [...new Set(weakTopics)],
    expired: Boolean(expired),
    submittedAt: Date.now(),
    startedAt: session.startedAt || session.createdAt || Date.now(),
    durationSeconds: session.durationSeconds || 600
  };

  await saveEgeExamResult(result);
  await saveEgeExamSession({ ...session, submittedAt: result.submittedAt });
  await openEgeExamResultsPage();
  return result;
}


async function getStateSnapshot() {

  const cards = await getCards();
  const settings = await getSettings();
  const profile = await ensureDailyProgress();
  const items = Object.values(cards).sort((a,b)=>b.updatedAt-a.updatedAt);
  const dailyGoal = missionTarget(Number(settings.dailyGoal || 10), profile);
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
    totalCorrect: profile.totalCorrect,
    level: profile.level,
    rating,
    goalProgress: `${profile.rememberedToday || 0}/${dailyGoal}`
  };
  const league = leagueForLevel(profile.level || 1);
  const nextLeague = nextLeagueLevel(profile.level || 1);
  const weakSpots = weakSpotsForWeek(items);
  const weakCount = weakSpots.length;
  stats.weakCount = weakCount;
  const priorityReviewCards = (weakSpots.length ? weakSpots : dueNow).slice(0, 50);
  const bossVariant = bossVariantFromWeakSpots(weakSpots);
  normalizeBossProfile(profile, bossVariant);
  await saveProfile(profile);
  const bossMaxHp = profile.bossMaxHp;
  const bossHp = profile.bossHp;
  const bossSkin = profile.bossSkin;
  const bossStage = profile.bossStage;
  const bossLastDamage = profile.bossLastDamage;
  const missions = missionsFromState(profile, items, settings);
  const chestProgress = {
    progress: profile.chestClaimedDay === dayKey() ? dailyGoal : Math.min(Number(profile.rememberedToday || 0), dailyGoal),
    target: dailyGoal,
    claimed: profile.chestClaimedDay === dayKey(),
    day: dayKey()
  };
  const chestAvailable = chestProgress.progress >= chestProgress.target && !chestProgress.claimed;
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
      bossVariant,
      bossHp,
      bossMaxHp,
      bossSkin,
      bossStage,
      bossLastDamage,
      missions,
      dailyGoal,
      rememberedToday: Number(profile.rememberedToday || 0),
      dailyProgressDay: profile.dailyProgressDay || dayKey(),
      dailyMissionDay: profile.dailyMissionDay || dayKey(),
      chestProgress,
      chestClaimedDay: profile.chestClaimedDay || ''
    }
  };
}
async function exportCards() {
  const cards = await getCards();
  return {
    version: 3,
    type: 'accent-coach-dictionary-only',
    cards,
    dictionaryCreatedAt: new Date().toISOString()
  };
}

async function importCards(payload) {
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'bad_payload' };

  let incoming = payload.cards || payload.dictionary || payload.items || payload;
  if (Array.isArray(incoming)) {
    incoming = Object.fromEntries(incoming.filter(Boolean).map((card) => [card.id || card.word || `${card.kind || 'card'}-${Date.now()}-${Math.random()}`, card]));
  }
  if (!incoming || typeof incoming !== 'object') return { ok: false, reason: 'no_cards' };

  const current = await getCards();
  const settings = await getSettings();
  const now = Date.now();
  const normalized = {};

  for (const [rawId, rawCard] of Object.entries(incoming)) {
    if (!rawCard || typeof rawCard !== 'object') continue;
    const kind = rawCard.kind === 'punctuation' ? 'punctuation' : 'stress';
    const id = String(rawCard.id || rawId || rawCard.word || `${kind}-${now}-${Math.random()}`);

    normalized[id] = {
      id,
      kind,
      word: rawCard.word || '',
      stressed: rawCard.stressed || rawCard.answer || '',
      prompt: rawCard.prompt || rawCard.originalText || '',
      answer: rawCard.answer || rawCard.correctedText || rawCard.stressed || '',
      originalText: rawCard.originalText || rawCard.prompt || '',
      correctedText: rawCard.correctedText || rawCard.answer || '',
      explanations: Array.isArray(rawCard.explanations) ? rawCard.explanations : [],
      note: rawCard.note || '',
      source: rawCard.source || 'import',
      createdAt: Number(rawCard.createdAt || now),
      updatedAt: now,
      dueAt: now,
      reps: 0,
      intervalMinutes: Number(settings.firstIntervalMinutes || 15),
      ease: Number(settings.defaultEase || 2.2),
      lastResult: '',
      reviewHistory: [],
      score: 0,
      favorite: Boolean(rawCard.favorite),
      archived: false,
      archivedAt: null
    };
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.cards]: { ...current, ...normalized } });
  return { ok: true, imported: Object.keys(normalized).length };
}

async function storeLastProcessedText(payload) { await chrome.storage.local.set({ [STORAGE_KEYS.lastProcessedText]: payload }); }
async function getLastProcessedText() { const data = await chrome.storage.local.get(STORAGE_KEYS.lastProcessedText); return data[STORAGE_KEYS.lastProcessedText] || null; }
async function storeLastSearch(payload) { await chrome.storage.local.set({ [STORAGE_KEYS.lastSearch]: payload }); }
async function getLastSearch() { const data = await chrome.storage.local.get(STORAGE_KEYS.lastSearch); return data[STORAGE_KEYS.lastSearch] || null; }
async function storeLastPunctuation(payload) { await chrome.storage.local.set({ [STORAGE_KEYS.lastPunctuation]: payload }); }
async function getLastPunctuation() { const data = await chrome.storage.local.get(STORAGE_KEYS.lastPunctuation); return data[STORAGE_KEYS.lastPunctuation] || null; }
async function openResultsPage(view = 'accent') { return focusOrCreateExtensionTab(`results.html?view=${encodeURIComponent(view)}`); }
async function openCardsPage() { return focusOrCreateExtensionTab('cards.html'); }
async function lookupSelectionOverlay(text) { const settings = await getSettings(); if (Number(settings.overlayEnabled) === 0) return { ok:false, reason:'overlay_disabled' }; const words = extractUniqueWords(text); if (!words.length) return { ok:false, reason:'no_words' }; if (words.length === 1) { const word = words[0]; const exact = (await searchStress(word, { save: false })).exact; return { ok:true, mode:'word', word, data: exact }; } const payload = await buildAccentedText(text, { saveWords: true, favoriteWords: false }); return { ok:true, mode:'text', accentedText: payload.accentedText, resolvedCount: payload.resolvedWords.length, fallbackCount: payload.resolvedWords.filter((x)=>x.fallback).length }; }
