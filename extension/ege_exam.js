function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const egeForm = document.getElementById('egeForm');
const egeMeta = document.getElementById('egeMeta');
const egeTimer = document.getElementById('egeTimer');
const submitBtn = document.getElementById('submitEgeExamBtn');

let session = null;
let intervalId = null;
let submitted = false;

function bossTitle(variant) {
  if (variant === 'stress') return 'Босс ударений';
  if (variant === 'punctuation') return 'Босс запятых';
  return 'Смешанный босс ошибок';
}

function renderEgeExamBoss(g = {}) {
  const arena = document.getElementById('egeExamBossArena');
  const visual = document.getElementById('egeExamBossVisual');
  const title = document.getElementById('egeExamBossTitle');
  const bar = document.getElementById('egeExamBossHpBar');
  const text = document.getElementById('egeExamBossHpText');
  const variant = g.bossVariant || 'mixed';
  const maxHp = Number(g.bossMaxHp || 1200);
  const hp = Math.max(0, Number(g.bossHp ?? maxHp));
  const stage = Number(g.bossStage || 1);
  const skin = g.bossSkin || 'dragon_boss';
  if (arena) {
    arena.classList.remove('boss-stress','boss-punctuation','boss-mixed');
    arena.classList.add(`boss-${variant}`);
  }
  if (visual) {
    visual.classList.remove('boss-stress','boss-punctuation','boss-mixed','skin-boss','skin-forest','skin-storm','skin-crystal','skin-shadow','skin-ege');
    visual.classList.add(`boss-${variant}`);
    const skinClass = {dragon_boss:'skin-boss', dragon_forest:'skin-forest', dragon_storm:'skin-storm', dragon_crystal:'skin-crystal', dragon_shadow:'skin-shadow', dragon_ege:'skin-ege'}[skin] || 'skin-boss';
    visual.classList.add(skinClass);
  }
  if (title) title.textContent = `${bossTitle(variant)} · уровень ${stage}`;
  if (bar) bar.style.width = `${Math.max(0, Math.round((hp / maxHp) * 100))}%`;
  if (text) text.textContent = `HP: ${hp} / ${maxHp}`;
}


function showEmptyExamState() {
  stopTimer();
  submitted = true;
  if (egeTimer) egeTimer.textContent = '00:00';
  if (egeQuestions) {
    egeQuestions.innerHTML = `
      <article class="card-item">
        <div class="card-main">
          <strong>ЕГЭ-режим пока недоступен</strong>
          <span>В словаре нет карточек для формирования теста. Добавьте хотя бы одну карточку с ударением или пунктуацией, затем запустите ЕГЭ-режим снова.</span>
        </div>
      </article>
    `;
  }
  if (submitBtn) submitBtn.disabled = true;
}

function renderQuestions() {
  const questions = session?.questions || [];
  if (!questions.length) {
    egeMeta.textContent = '0';
    egeForm.innerHTML = '<p class="muted">Для ЕГЭ-режима сначала добавь карточки с ударениями и запятыми.</p>';
    submitBtn.disabled = true;
    return;
  }

  egeMeta.textContent = String(questions.length);
  egeForm.innerHTML = questions.map((q, i) => `
    <article class="panel ege-question dragon-glow-card">
      <div class="panel-header">
        <h3>${i + 1}. ${escapeHtml(q.question || 'Выберите правильный ответ')}</h3>
        <span class="badge">${escapeHtml(q.topic || q.kind || 'ЕГЭ')}</span>
      </div>
      <p class="ege-prompt">${escapeHtml(q.prompt || '')}</p>
      <div class="ege-options">
        ${(q.options || []).map((option, optionIndex) => `
          <label class="ege-option">
            <input type="radio" name="q-${i}" value="${escapeHtml(option)}" data-question-index="${i}" data-option-index="${optionIndex}" />
            <span>${escapeHtml(option)}</span>
          </label>
        `).join('')}
      </div>
    </article>
  `).join('');
}

function collectAnswers() {
  return (session?.questions || []).map((q, i) => {
    const selected = egeForm.querySelector(`input[name="q-${i}"]:checked`);
    return selected ? selected.value : '';
  });
}

function lockExam() {
  egeForm.querySelectorAll('input, button, textarea, select').forEach((el) => {
    el.disabled = true;
  });
  if (submitBtn) submitBtn.disabled = true;
}

function stopTimer() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function finishExam(expired = false) {
  if (submitted) return;
  if (!session || !(session.questions || []).length) {
    showEmptyExamState();
    return;
  }
  submitted = true;
  stopTimer();
  lockExam();

  const answers = collectAnswers();
  await chrome.runtime.sendMessage({
    type: 'SUBMIT_EGE_EXAM',
    answers,
    expired: Boolean(expired)
  });
}

function updateTimer() {
  if (!session) return;
  const startedAt = Number(session.startedAt || session.createdAt || Date.now());
  const duration = Number(session.durationSeconds || 600);
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  const left = Math.max(0, duration - elapsed);
  egeTimer.textContent = formatTime(left);

  if (left <= 0) {
    finishExam(true);
  }
}

function startTimer() {
  stopTimer();
  updateTimer();
  intervalId = setInterval(updateTimer, 1000);
}

async function init() {
  try {
  const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  renderEgeExamBoss(state?.gamification || {});
  const response = await chrome.runtime.sendMessage({ type: 'GET_EGE_EXAM_SESSION' });
  session = response?.session || response || null;

  if (!session) {
    const created = await chrome.runtime.sendMessage({ type: 'CREATE_EGE_EXAM_SESSION' });
    session = created?.session || null;
  }

  if (!session || !(session.questions || []).length) {
    showEmptyExamState();
    return;
  }

  renderQuestions();
  startTimer();
  } catch (error) {
    console.error('EGE init failed', error);
    showEmptyExamState();
  }
}

submitBtn?.addEventListener('click', () => finishExam(false));

window.addEventListener('beforeunload', () => stopTimer());

init();
