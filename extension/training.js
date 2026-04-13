var chrome = globalThis.chrome || globalThis.browser;
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

let session = null;
let index = 0;
let earnedXp = 0;
let remembered = 0;
let forgotten = 0;
let answerShown = false;

const trainingCounter = document.getElementById('trainingCounter');
const trainingModeLabel = document.getElementById('trainingModeLabel');
const trainingXp = document.getElementById('trainingXp');
const trainingQuestionLabel = document.getElementById('trainingQuestionLabel');
const trainingQuestion = document.getElementById('trainingQuestion');
const trainingAnswer = document.getElementById('trainingAnswer');
const trainingRule = document.getElementById('trainingRule');
const showAnswerBtn = document.getElementById('showAnswerBtn');
const gradeActions = document.getElementById('gradeActions');
const forgetBtn = document.getElementById('forgetBtn');
const rememberBtn = document.getElementById('rememberBtn');
const trainingSummary = document.getElementById('trainingSummary');
const trainingSummaryText = document.getElementById('trainingSummaryText');
const restartTrainingBtn = document.getElementById('restartTrainingBtn');
const front = document.querySelector('.training-front');
const back = document.querySelector('.training-back');
const progressBar = document.getElementById('trainingProgressBar');

function setProgress() {
  if (!session?.cards?.length) {
    trainingCounter.textContent = '0 / 0';
    progressBar.style.width = '0%';
    return;
  }
  trainingCounter.textContent = `${Math.min(index + 1, session.cards.length)} / ${session.cards.length}`;
  const percent = (index / session.cards.length) * 100;
  progressBar.style.width = `${percent}%`;
}

function modeText(mode) {
  if (mode === 'stress') return 'только ударения';
  if (mode === 'punctuation') return 'только запятые';
  if (mode === 'weak') return 'слабые места';
  if (mode === 'single') return 'одна карточка';
  return 'все карточки';
}

function questionForCard(card) {
  if (card.kind === 'punctuation') {
    return {
      label: 'Поставь запятые в предложении',
      question: card.prompt || card.word || '',
      answer: card.answer || '',
      rule: card.rule || card.note || ''
    };
  }
  return {
    label: 'Поставь ударение в данном слове',
    question: card.word || card.prompt || '',
    answer: card.stressed || card.answer || '',
    rule: card.note || 'Это карточка на ударение.'
  };
}

function renderCard() {
  if (!session?.cards?.length || index >= session.cards.length) {
    return showSummary();
  }
  const card = session.cards[index];
  const data = questionForCard(card);
  trainingQuestionLabel.textContent = data.label;
  trainingQuestion.textContent = data.question;
  trainingAnswer.textContent = data.answer;
  trainingRule.textContent = data.rule || '';
  answerShown = false;
  front.classList.remove('hidden');
  back.classList.add('hidden');
  gradeActions.classList.add('hidden');
  showAnswerBtn.disabled = false;
  setProgress();
}

function showAnswer() {
  answerShown = true;
  front.classList.add('hidden');
  back.classList.remove('hidden');
  gradeActions.classList.remove('hidden');
  showAnswerBtn.disabled = true;
}

async function grade(result) {
  if (!session?.cards?.length) return;
  const card = session.cards[index];
  await chrome.runtime.sendMessage({ type: 'GRADE_CARD', word: card.id, result });
  if (result === 'remember') {
    remembered += 1;
    earnedXp += card.kind === 'punctuation' ? 8 : 6;
  } else {
    forgotten += 1;
    earnedXp += 1;
  }
  trainingXp.textContent = `XP: ${earnedXp}`;
  index += 1;
  renderCard();
}

function showSummary() {
  progressBar.style.width = '100%';
  trainingCounter.textContent = `${session?.cards?.length || 0} / ${session?.cards?.length || 0}`;
  trainingSummary.classList.remove('hidden');
  document.querySelector('.training-card-wrap').classList.add('hidden');
  trainingSummaryText.innerHTML = `
    <p><strong>Карточек пройдено:</strong> ${session?.cards?.length || 0}</p>
    <p><strong>Помню:</strong> ${remembered}</p>
    <p><strong>Не помню:</strong> ${forgotten}</p>
    <p><strong>Получено XP:</strong> ${earnedXp}</p>
    <p><strong>Режим:</strong> ${modeText(session?.mode || 'all')}</p>
  `;
}

async function loadSession() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_TRAINING_SESSION' });
  session = response?.session || { cards: [], mode: 'all', count: 0 };
  index = 0;
  earnedXp = 0;
  remembered = 0;
  forgotten = 0;
  trainingModeLabel.textContent = modeText(session.mode || 'all');
  document.body.classList.toggle('single-reminder', (session.mode || 'all') === 'single');
  trainingXp.textContent = 'XP: 0';
  if (!session.cards.length) {
    trainingQuestionLabel.textContent = 'Нет карточек';
    trainingQuestion.textContent = 'Добавь карточки и попробуй снова.';
    trainingAnswer.textContent = '';
    trainingRule.textContent = '';
    showAnswerBtn.disabled = true;
    gradeActions.classList.add('hidden');
    setProgress();
    return;
  }
  renderCard();
}

showAnswerBtn.addEventListener('click', showAnswer);
forgetBtn.addEventListener('click', async () => { if (answerShown) await grade('forget'); });
rememberBtn.addEventListener('click', async () => { if (answerShown) await grade('remember'); });
restartTrainingBtn.addEventListener('click', async () => {
  if (!session?.cards?.length) return;
  await chrome.runtime.sendMessage({ type: 'OPEN_TRAINING_SESSION', mode: session.mode || 'all', count: session.cards.length, restart: true });
  window.location.reload();
});

loadSession();
