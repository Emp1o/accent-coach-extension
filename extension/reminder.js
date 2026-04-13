var chrome = globalThis.chrome || globalThis.browser;
let session = null;
let answerShown = false;

const reminderType = document.getElementById('reminderType');
const reminderQuestionLabel = document.getElementById('reminderQuestionLabel');
const reminderQuestion = document.getElementById('reminderQuestion');
const reminderAnswer = document.getElementById('reminderAnswer');
const reminderRule = document.getElementById('reminderRule');
const showReminderAnswerBtn = document.getElementById('showReminderAnswerBtn');
const reminderGradeActions = document.getElementById('reminderGradeActions');
const reminderForgetBtn = document.getElementById('reminderForgetBtn');
const reminderRememberBtn = document.getElementById('reminderRememberBtn');
const front = document.querySelector('.training-front');
const back = document.querySelector('.training-back');

function questionForCard(card) {
  if (card.kind === 'punctuation') {
    return {
      type: 'запятые',
      label: 'Поставь запятые в предложении',
      question: card.prompt || card.word || '',
      answer: card.answer || '',
      rule: card.rule || card.note || ''
    };
  }
  return {
    type: 'ударение',
    label: 'Поставь ударение в слове',
    question: card.word || card.prompt || '',
    answer: card.stressed || card.answer || '',
    rule: card.note || 'Это карточка на ударение.'
  };
}

function renderCard(card) {
  const data = questionForCard(card);
  reminderType.textContent = data.type;
  reminderQuestionLabel.textContent = data.label;
  reminderQuestion.textContent = data.question;
  reminderAnswer.textContent = data.answer;
  reminderRule.textContent = data.rule || '';
  answerShown = false;
  front.classList.remove('hidden');
  back.classList.add('hidden');
  reminderGradeActions.classList.add('hidden');
  showReminderAnswerBtn.disabled = false;
}

function showAnswer() {
  answerShown = true;
  front.classList.add('hidden');
  back.classList.remove('hidden');
  reminderGradeActions.classList.remove('hidden');
  showReminderAnswerBtn.disabled = true;
}

async function grade(result) {
  if (!session?.card?.id) return;
  await chrome.runtime.sendMessage({ type: 'GRADE_CARD', word: session.card.id, result });
  window.location.href = chrome.runtime.getURL('cards.html');
}

async function loadReminder() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_REMINDER_SESSION' });
  session = response?.session || { card: null };
  const card = session.card || (Array.isArray(session.cards) ? session.cards[0] : null);
  if (!card) {
    reminderQuestionLabel.textContent = 'Нет карточки';
    reminderQuestion.textContent = 'Открой напоминание ещё раз или перейди в карточки.';
    showReminderAnswerBtn.disabled = true;
    return;
  }
  session.card = card;
  renderCard(card);
}

showReminderAnswerBtn.addEventListener('click', showAnswer);
reminderForgetBtn.addEventListener('click', async () => { if (answerShown) await grade('forget'); });
reminderRememberBtn.addEventListener('click', async () => { if (answerShown) await grade('remember'); });
loadReminder();
