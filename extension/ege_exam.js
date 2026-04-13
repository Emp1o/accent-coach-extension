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
const egeResultPanel = document.getElementById('egeResultPanel');
const egeSummary = document.getElementById('egeSummary');
const egeWeakTopics = document.getElementById('egeWeakTopics');
const egeDetails = document.getElementById('egeDetails');
const submitBtn = document.getElementById('submitEgeExamBtn');

let session = null;
let intervalId = null;
let submitted = false;

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
    <article class="panel ege-question">
      <div class="panel-header">
        <h3>${i + 1}. ${escapeHtml(q.question)}</h3>
        <span class="badge">${q.kind === 'stress' ? 'ударение' : 'запятые'}</span>
      </div>
      <div class="muted">${escapeHtml(q.prompt)}</div>
      <div class="quiz-options">
        ${(q.options || []).map((option) => `
          <label class="option">
            <input type="radio" name="${escapeHtml(q.id)}" value="${escapeHtml(option)}" ${submitted ? 'disabled' : ''}/>
            <span>${escapeHtml(option)}</span>
          </label>
        `).join('')}
      </div>
    </article>
  `).join('');
}

function collectAnswers() {
  const questions = session?.questions || [];
  return questions.map((q) => {
    const checked = document.querySelector(`input[name="${CSS.escape(q.id)}"]:checked`);
    return { id: q.id, answer: checked ? checked.value : null };
  });
}

function formatLeft(seconds) {
  const safe = Math.max(0, seconds);
  const mm = String(Math.floor(safe / 60)).padStart(2, '0');
  const ss = String(safe % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function disableForm() {
  submitted = true;
  submitBtn.disabled = true;
  document.querySelectorAll('#egeForm input').forEach((x) => x.disabled = true);
}

function renderWeakTopics(items) {
  if (!items?.length) {
    egeWeakTopics.innerHTML = '<p class="muted">Слабых тем не найдено — отличный результат.</p>';
    return;
  }
  egeWeakTopics.innerHTML = `
    <div class="panel-header"><h3>Слабые темы</h3><span class="badge danger">анализ</span></div>
    ${items.map((item) => `
      <article class="card-item">
        <div class="card-main">
          <strong>${escapeHtml(item.topic)}</strong>
          <span>Ошибок: ${item.wrong} из ${item.total}</span>
        </div>
      </article>
    `).join('')}
  `;
}

function renderResult(result) {
  disableForm();
  egeResultPanel.classList.remove('hidden');
  egeSummary.innerHTML = `
    <p><strong>Правильно:</strong> ${result.correct} из ${result.total}</p>
    <p><strong>Процент:</strong> ${result.scorePercent}%</p>
    <p><strong>Оценка:</strong> ${escapeHtml(result.verdict)}</p>
    <p><strong>Статус:</strong> ${result.expired ? 'Время вышло — экзамен завершён автоматически.' : 'Экзамен завершён.'}</p>
  `;
  renderWeakTopics(result.weakTopics || []);
  egeDetails.innerHTML = (result.questions || []).map((q, i) => `
    <article class="card-item">
      <div class="card-main">
        <strong>${i + 1}. ${escapeHtml(q.prompt)}</strong>
        <span>${q.isCorrect ? '✅ Верно' : '❌ Ошибка'}</span>
      </div>
      <div class="card-meta">
        <span>Твой ответ: ${escapeHtml(q.answer || 'нет ответа')} · Правильно: ${escapeHtml(q.correct)}</span>
      </div>
      <div class="muted">${escapeHtml(q.explanation || '')}</div>
    </article>
  `).join('');
}

async function finishExam(force = false) {
  if (submitted) return;
  const answers = collectAnswers();
  const response = await chrome.runtime.sendMessage({ type: 'SUBMIT_EGE_EXAM', answers });
  renderResult(response.result || { questions: [], correct: 0, total: 0, scorePercent: 0, verdict: 'Нет данных', expired: force, weakTopics: [] });
}

function startTimer() {
  if (intervalId) clearInterval(intervalId);
  const startedAt = Number(session?.startedAt || Date.now());
  const duration = Number(session?.durationSeconds || 600);
  const tick = () => {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    const left = duration - elapsed;
    egeTimer.textContent = formatLeft(left);
    if (left <= 0) {
      clearInterval(intervalId);
      finishExam(true);
    }
  };
  tick();
  intervalId = setInterval(tick, 1000);
}

async function loadExam() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_EGE_EXAM_SESSION' });
  session = response?.session || { questions: [] };
  if (session?.submittedAt && session?.result) submitted = true;
  renderQuestions();
  if (submitted) {
    renderResult(session.result);
  } else {
    startTimer();
  }
}

submitBtn.addEventListener('click', () => finishExam(false));
loadExam();
