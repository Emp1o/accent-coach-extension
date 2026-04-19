function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const egeSummary = document.getElementById('egeSummary');
const egeWeakTopics = document.getElementById('egeWeakTopics');
const egeDetails = document.getElementById('egeDetails');
const egeResultStatus = document.getElementById('egeResultStatus');

const BOSS_SKIN_CLASSES = ['skin-boss', 'skin-forest', 'skin-storm', 'skin-crystal', 'skin-shadow', 'skin-ege'];
const BOSS_SKIN_ASSETS = {
  dragon_boss: 'assets/dragon-boss.svg',
  dragon_forest: 'assets/dragon-forest.svg',
  dragon_storm: 'assets/dragon-storm.svg',
  dragon_crystal: 'assets/dragon-crystal.svg',
  dragon_shadow: 'assets/dragon-shadow.svg',
  dragon_ege: 'assets/dragon-ege.svg'
};
const BOSS_SKIN_CLASS_BY_ID = {
  dragon_boss: 'skin-boss',
  dragon_forest: 'skin-forest',
  dragon_storm: 'skin-storm',
  dragon_crystal: 'skin-crystal',
  dragon_shadow: 'skin-shadow',
  dragon_ege: 'skin-ege'
};

function applyBossSkin(node, skin = 'dragon_boss') {
  if (!node) return;
  const safeSkin = BOSS_SKIN_ASSETS[skin] ? skin : 'dragon_boss';
  node.classList.remove(...BOSS_SKIN_CLASSES);
  node.classList.add(BOSS_SKIN_CLASS_BY_ID[safeSkin]);
  node.dataset.bossSkin = safeSkin;
  node.style.setProperty('background-image', `url("${BOSS_SKIN_ASSETS[safeSkin]}")`, 'important');
}

function bossTitle(variant) {
  if (variant === 'stress') return 'Босс ударений';
  if (variant === 'punctuation') return 'Босс запятых';
  return 'Смешанный босс ошибок';
}

async function renderEgeBoss(result) {
  let boss = result?.boss || {};
  if (!boss.bossHp) {
    try {
      const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
      boss = state?.gamification || boss;
    } catch (error) {}
  }
  const variant = boss.bossVariant || 'mixed';
  const hp = Math.max(0, Number(boss.bossHp ?? 1200));
  const maxHp = Math.max(1, Number(boss.bossMaxHp ?? 1200));
  const damage = Number(result?.bossDamage || boss.bossLastDamage || 0);
  const arena = document.getElementById('egeBossResultArena');
  const visual = document.getElementById('egeBossResultVisual');
  const title = document.getElementById('egeBossResultTitle');
  const pop = document.getElementById('egeBossResultDamage');
  const bar = document.getElementById('egeBossResultHpBar');
  const text = document.getElementById('egeBossResultHpText');

  if (arena) {
    arena.classList.remove('boss-stress', 'boss-punctuation', 'boss-mixed');
    arena.classList.add(`boss-${variant}`);
  }
  if (visual) {
    visual.classList.remove('boss-stress', 'boss-punctuation', 'boss-mixed', 'damage');
    visual.classList.add(`boss-${variant}`, 'damage');
    applyBossSkin(visual, boss.bossSkin || 'dragon_boss');
  }
  if (title) title.textContent = `${bossTitle(variant)} · урон за ЕГЭ`;
  if (pop) {
    pop.hidden = false;
    pop.textContent = `-${damage} HP`;
    pop.classList.add('show');
  }
  if (bar) bar.style.width = `${Math.max(2, Math.min(100, Math.round((hp / maxHp) * 100)))}%`;
  if (text) text.textContent = `Босс ${boss.bossStage || 1} уровня · HP: ${hp} / ${maxHp}`;
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
  if (String(kind).includes('punctuation') || String(kind).includes('пунктуа')) {
    return commaSignature(userAnswer) === commaSignature(right);
  }
  return normalizeEgeAnswer(userAnswer) === normalizeEgeAnswer(right);
}

function markByPercent(percent) {
  if (percent >= 90) return '5';
  if (percent >= 70) return '4';
  if (percent >= 50) return '3';
  return '2';
}

async function renderResult(result) {
  if (!result) {
    egeSummary.innerHTML = '<p class="muted">Результат пока не найден. Пройди ЕГЭ-режим ещё раз.</p>';
    egeWeakTopics.innerHTML = '<p class="muted">Данные пока не накоплены.</p>';
    egeDetails.innerHTML = '';
    return;
  }

  await renderEgeBoss(result);
  const total = Number(result.total || result.questions?.length || 0);
  const correct = Number(result.correct || 0);
  const percent = total ? Math.round((correct / total) * 100) : 0;
  const mark = result.mark || markByPercent(percent);
  const expired = Boolean(result.expired);

  if (egeResultStatus) {
    egeResultStatus.textContent = expired ? 'время вышло' : 'завершено вручную';
  }

  egeSummary.innerHTML = `
    <article class="stat-card"><strong>${correct}/${total}</strong><span>правильных ответов</span></article>
    <article class="stat-card"><strong>${percent}%</strong><span>результат</span></article>
    <article class="stat-card"><strong>${mark}</strong><span>оценка</span></article>
    <article class="stat-card"><strong>${expired ? 'Таймер' : 'Кнопка'}</strong><span>${expired ? 'время закончилось' : 'тест завершён'}</span></article>
  `;

  const weakTopics = result.weakTopics || [];
  egeWeakTopics.innerHTML = weakTopics.length
    ? weakTopics.map((topic) => `<div class="weak-item">• ${escapeHtml(topic)}</div>`).join('')
    : '<p class="muted">Слабые темы не выявлены. Отличная работа!</p>';

  const questions = result.questions || [];
  const answers = result.answers || [];
  egeDetails.innerHTML = questions.map((q, i) => {
    const userAnswer = answers[i] || '';
    const right = q.correct || q.answer || '';
    const ok = isEgeAnswerCorrect(q, userAnswer);
    return `
      <article class="card-item ${ok ? 'answer-correct' : 'answer-wrong'}">
        <div class="card-main">
          <strong>${i + 1}. ${escapeHtml(q.question || q.prompt || 'Вопрос')}</strong>
          <span>${escapeHtml(q.prompt || '')}</span>
        </div>
        <div class="result-answer-row">
          <div><b>Твой ответ:</b> ${escapeHtml(userAnswer || 'нет ответа')}</div>
          <div><b>Правильный ответ:</b> ${escapeHtml(right)}</div>
        </div>
        <div class="muted">${escapeHtml(q.explanation || q.note || 'Пояснение отсутствует: ориентируйтесь на правильный вариант и добавленное правило.')}</div>
      </article>
    `;
  }).join('');
}

async function init() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_EGE_EXAM_RESULT' });
  renderResult(response?.result || response || null);
}

document.getElementById('openTrainingFromResultsBtn')?.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'OPEN_TRAINING_SESSION', mode: 'all', count: 10 });
});

document.getElementById('openТренажёрFromResultsBtn')?.addEventListener('click', () => {
  window.open('popup.html', '_blank', 'noopener,noreferrer');
});

init();
