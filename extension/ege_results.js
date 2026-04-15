var chrome = globalThis.chrome || globalThis.browser;
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

function renderWeakTopics(items) {
  if (!items?.length) {
    egeWeakTopics.innerHTML = '<div class="panel-header"><h2>Слабые темы</h2><span class="badge">анализ</span></div><p class="muted">Слабых тем не найдено — отличный результат.</p>';
    return;
  }
  egeWeakTopics.innerHTML = `
    <div class="panel-header"><h2>Слабые темы</h2><span class="badge danger">анализ</span></div>
    ${items.map((item) => `
      <article class="card-item">
        <div class="card-main">
          <strong>${escapeHtml(item.topic)}</strong>
          <span>Ошибок: ${item.wrong} из ${item.total}</span>
        </div>
      </article>`).join('')}
  `;
}

async function loadResult() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_EGE_EXAM_RESULT' });
  const result = response?.result;
  if (!result) {
    egeSummary.innerHTML = '<p>Результаты пока не найдены. Сначала пройди экзамен.</p>';
    return;
  }
  egeSummary.innerHTML = `
    <p><strong>Правильно:</strong> ${result.correct} из ${result.total}</p>
    <p><strong>Процент:</strong> ${result.scorePercent}%</p>
    <p><strong>Оценка:</strong> ${escapeHtml(result.verdict)}</p>
    <p><strong>Статус:</strong> ${result.expired ? 'Время вышло — экзамен завершён автоматически.' : 'Экзамен завершён вручную.'}</p>`;
  renderWeakTopics(result.weakTopics || []);
  egeDetails.innerHTML = (result.questions || []).map((q, i) => `
    <article class="card-item ${q.isCorrect ? 'correct-answer' : 'wrong-answer'}">
      <div class="card-main">
        <strong>${i + 1}. ${escapeHtml(q.question)}</strong>
        <span>${q.isCorrect ? '✅ Верно' : '❌ Ошибка'}</span>
      </div>
      <div class="muted exam-prompt">${escapeHtml(q.prompt)}</div>
      <div class="card-meta"><span><strong>Твой ответ:</strong> ${escapeHtml(q.answer || 'нет ответа')}</span></div>
      <div class="card-meta"><span><strong>Правильный ответ:</strong> ${escapeHtml(q.correct)}</span></div>
      <div class="muted"><strong>Пояснение:</strong> ${escapeHtml(q.explanation || '')}</div>
    </article>`).join('');
}
loadResult();
