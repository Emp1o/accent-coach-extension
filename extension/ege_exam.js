var chrome = globalThis.chrome || globalThis.browser;
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
const finishNotice = document.getElementById('egeFinishNotice');
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
        ${(q.options || []).map((option, idx) => `
          <label class="option">
            <input type="radio" name="${escapeHtml(q.id)}" value="${escapeHtml(option)}" ${submitted ? 'disabled' : ''}/>
            <span><strong>${String.fromCharCode(1040 + idx)}.</strong> ${escapeHtml(option)}</span>
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
function stopTimer() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
}
function disableForm() {
  submitted = true;
  submitBtn.disabled = true;
  document.querySelectorAll('#egeForm input').forEach((x) => x.disabled = true);
  finishNotice?.classList.remove('hidden');
}
async function openResults() {
  await chrome.tabs.create({ url: chrome.runtime.getURL('ege_results.html') });
}
async function finishExam(force = false) {
  if (submitted) return;
  stopTimer();
  disableForm();
  const answers = collectAnswers();
  await chrome.runtime.sendMessage({ type: 'SUBMIT_EGE_EXAM', answers, expired: force });
  await openResults();
}
function startTimer() {
  stopTimer();
  const startedAt = Number(session?.startedAt || Date.now());
  const duration = Number(session?.durationSeconds || 600);
  const tick = () => {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    const left = duration - elapsed;
    egeTimer.textContent = formatLeft(left);
    if (left <= 0) {
      stopTimer();
      finishExam(true);
    }
  };
  tick();
  intervalId = setInterval(tick, 1000);
}
async function loadExam() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_EGE_EXAM_SESSION' });
  session = response?.session || { questions: [] };
  submitted = Boolean(session?.submittedAt && session?.result);
  renderQuestions();
  if (submitted) {
    disableForm();
    egeTimer.textContent = '00:00';
  } else {
    startTimer();
  }
}
submitBtn.addEventListener('click', () => finishExam(false));
loadExam();
