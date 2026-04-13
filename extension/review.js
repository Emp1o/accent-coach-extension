var chrome = globalThis.chrome || globalThis.browser;
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const params = new URLSearchParams(location.search);
let currentCardId = params.get('card');
let reviewMode = params.get('mode') || 'all';
let sessionCards = [];
let currentIndex = 0;
let flipped = false;
let sessionRemembered = 0;
let sessionForgotten = 0;

const reviewCard = document.getElementById('reviewCard');
const reviewFront = document.getElementById('reviewFront');
const reviewBack = document.getElementById('reviewBack');
const reviewMeta = document.getElementById('reviewMeta');
const rememberBtn = document.getElementById('rememberBtn');
const forgetBtn = document.getElementById('forgetBtn');
const nextBtn = document.getElementById('nextBtn');
const reviewEmpty = document.getElementById('reviewEmpty');
const sessionSummary = document.getElementById('sessionSummary');
const sessionSummaryBody = document.getElementById('sessionSummaryBody');

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function setFlipped(value) {
  flipped = value;
  reviewCard.classList.toggle('is-flipped', value);
  rememberBtn.disabled = !value;
  forgetBtn.disabled = !value;
}

function frontText(card) {
  if (card.kind === 'punctuation') {
    return `<div class="review-label">Расставь запятые в предложении</div><div class="review-big">${escapeHtml(card.prompt || card.word)}</div>`;
  }
  return `<div class="review-label">Поставь ударение в данном слове</div><div class="review-big">${escapeHtml(card.word)}</div>`;
}

function backText(card) {
  if (card.kind === 'punctuation') {
    return `<div class="review-label">Правильный ответ</div><div class="review-big">${escapeHtml(card.answer)}</div><div class="muted">${escapeHtml(card.rule || '')}</div>`;
  }
  return `<div class="review-label">Правильный ответ</div><div class="review-big">${escapeHtml(card.stressed || card.answer)}</div><div class="muted">${escapeHtml(card.note || 'Ударение может стоять неправильно, обязательно перепроверяйте.')}</div>`;
}

function achievementBadges(state) {
  const stats = state?.stats || {};
  const g = state?.gamification || {};
  const badges = [];
  if ((stats.total || 0) >= 1) badges.push('Первый шаг');
  if ((stats.currentStreak || 0) >= 3) badges.push('Стрик 3 дня');
  if ((stats.level || 1) >= 5) badges.push('Уровень 5');
  if ((g.rememberedToday || 0) >= (g.dailyGoal || 10)) badges.push('Дневная цель');
  if ((g.weakSpots || []).length) badges.push('Охотник за слабыми местами');
  return badges;
}

async function buildSession() {
  const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  const batchSize = Number(state?.settings?.reviewBatchSize || 10);
  let cards = [...(state.cards || [])];
  if (reviewMode === 'stress') cards = cards.filter(x => x.kind === 'stress');
  if (reviewMode === 'punctuation') cards = cards.filter(x => x.kind === 'punctuation');
  if (reviewMode === 'weak') {
    const weakIds = new Set((state?.gamification?.weakSpots || []).map(x => x.id));
    cards = cards.filter(x => weakIds.has(x.id));
  }
  const due = cards.filter(x => (x.dueAt || 0) <= Date.now());
  const pool = due.length ? due : cards;
  if (!pool.length) return [];
  const shuffled = reviewMode === 'weak'
    ? [...pool].sort((a, b) => {
        const wa = (state?.gamification?.weakSpots || []).find(x => x.id === a.id)?.forgets || 0;
        const wb = (state?.gamification?.weakSpots || []).find(x => x.id === b.id)?.forgets || 0;
        return wb - wa;
      })
    : shuffle(pool);
  if (currentCardId) {
    const first = cards.find(x => x.id === currentCardId);
    const rest = shuffled.filter(x => x.id !== currentCardId);
    return first ? [first, ...rest].slice(0, batchSize) : shuffled.slice(0, batchSize);
  }
  return shuffled.slice(0, batchSize);
}

async function loadCard() {
  if (!sessionCards.length) {
    sessionCards = await buildSession();
    currentIndex = 0;
  }
  const card = sessionCards[currentIndex];
  if (!card) {
    reviewEmpty.hidden = false;
    reviewCard.hidden = true;
    reviewMeta.textContent = 'Карточки закончились. Можно открыть новую сессию из popup.';
    rememberBtn.disabled = true;
    forgetBtn.disabled = true;
    nextBtn.disabled = true;
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    const badges = achievementBadges(state);
    const progressNow = state?.gamification?.rememberedToday || 0;
    const dailyGoal = state?.gamification?.dailyGoal || 10;
    const progressPct = Math.min(100, Math.round((progressNow / dailyGoal) * 100));
    sessionSummary.hidden = false;
    sessionSummaryBody.innerHTML = `
      <p><strong>За сессию:</strong> помню — ${sessionRemembered}, не помню — ${sessionForgotten}</p>
      <p><strong>XP:</strong> ${state?.stats?.xp ?? 0} · <strong>уровень:</strong> ${state?.stats?.level ?? 1}</p>
      <p><strong>Серия дней:</strong> ${state?.stats?.currentStreak ?? 0}</p>
      <p><strong>Прогресс цели:</strong> ${state?.stats?.goalProgress ?? '0/0'}</p>
      <div class="progress progress--animated"><span style="width:${progressPct}%"></span></div>
      <div class="achievements-inline">${badges.map(b => `<span class="achievement-badge achievement-badge--small">${escapeHtml(b)}</span>`).join('') || '<span class="muted">Бейджей пока нет</span>'}</div>
    `;
    return;
  }
  reviewEmpty.hidden = true;
  reviewCard.hidden = false;
  nextBtn.disabled = false;
  sessionSummary.hidden = true;
  reviewFront.innerHTML = frontText(card);
  reviewBack.innerHTML = backText(card);
  reviewMeta.textContent = `Сессия: ${currentIndex + 1}/${sessionCards.length} · режим: ${
    reviewMode === 'all' ? 'всё' : reviewMode === 'stress' ? 'ударения' : reviewMode === 'punctuation' ? 'запятые' : 'слабые места'
  }`;
  currentCardId = card.id;
  setFlipped(false);
}

async function gradeAndAdvance(result) {
  const card = sessionCards[currentIndex];
  if (!card) return;
  if (result === 'remember') sessionRemembered += 1;
  else sessionForgotten += 1;
  await chrome.runtime.sendMessage({ type: 'GRADE_CARD', word: card.id, result });
  currentIndex += 1;
  await loadCard();
}

reviewFront.addEventListener('click', () => setFlipped(true));
reviewBack.addEventListener('click', () => setFlipped(false));
rememberBtn.addEventListener('click', async () => gradeAndAdvance('remember'));
forgetBtn.addEventListener('click', async () => gradeAndAdvance('forget'));
nextBtn.addEventListener('click', async () => { currentIndex += 1; await loadCard(); });
loadCard();
