
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

let allCards = [];

function render() {
  const q = (document.getElementById('cardsSearch').value || '').toLowerCase().trim();  let items = [...allCards];  if (q) items = items.filter(x => JSON.stringify(x).toLowerCase().includes(q));
  const root = document.getElementById('cardsList');
  if (!items.length) {
    root.innerHTML = '<p class="muted">Карточек пока нет.</p>';
    return;
  }
  root.innerHTML = items.map(card => `
    <article class="card-item">
      <div class="card-main">
        <strong>${escapeHtml(card.kind === 'punctuation' ? (card.prompt || card.word) : card.word)}</strong>
        <span>${escapeHtml(card.kind === 'punctuation' ? (card.answer || '') : (card.stressed || ''))}</span>
      </div>
      <div class="card-meta"><span>Тип: ${escapeHtml(card.kind)} · Источник: ${escapeHtml(card.source || 'не указан')} · Повтор: ${new Date(card.dueAt || Date.now()).toLocaleString()}</span></div><div class="actions compact"><button class="danger delete-card-btn" data-id="${escapeHtml(card.id)}">Удалить</button></div>
    </article>
  `).join('');
}

async function init() {
  const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  allCards = state.cards || [];
  render();
}

document.getElementById('cardsSearch').addEventListener('input', render);
init();




document.getElementById("reviewWeakBtn").addEventListener("click", async()=>{ await chrome.runtime.sendMessage({type:"OPEN_REVIEW_CARD", mode:"weak"}); });


document.addEventListener('click', async (event) => {
  const btn = event.target.closest('.delete-card-btn');
  if (!btn) return;
  const id = btn.dataset.id;
  const result = await chrome.runtime.sendMessage({ type: 'DELETE_CARD', id });
  if (result?.removed) {
    allCards = allCards.filter(x => x.id !== id);
    render();
  }
});


async function openTraining(mode) {
  const count = Number(document.getElementById('trainingCountSelect')?.value || 10);
  const chosenMode = mode || 'all';
  await chrome.runtime.sendMessage({ type: 'OPEN_TRAINING_SESSION', mode: chosenMode, count });
}

document.getElementById("startTrainingBtn")?.addEventListener("click", async()=>{ await openTraining(); });


document.getElementById("startEgeExamFromCardsBtn")?.addEventListener("click", async()=> {
  await chrome.runtime.sendMessage({ type: "OPEN_EGE_EXAM" });
});
