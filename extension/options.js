const form = document.getElementById("settingsForm");
const statusEl = document.getElementById("status");
const fileInput = document.getElementById("fileInput");
const stressPdfInput = document.getElementById("stressPdfInput");
const punctuationPdfInput = document.getElementById("punctuationPdfInput");
const SETTINGS_NUMERIC_FIELDS = ["firstIntervalMinutes","secondIntervalMinutes","thirdIntervalMinutes","hardResetMinutes","dailyGoal","examMode","reviewBatchSize","textScale","overlayEnabled","autoSaveProcessedWords","autoArchiveMastered","autoArchiveRememberThreshold"];

const SKIN_LABELS = {
  dragon_king: 'Огненный король',
  dragon_boss: 'Обсидиановый босс',
  dragon_sage: 'Ледяной мудрец',
  dragon_academy: 'Академический дракон',
  dragon_ege: 'ЕГЭ-дракон',
  dragon_gold: 'Золотой дракон',
  dragon_forest: 'Лесной дракон',
  dragon_storm: 'Грозовой дракон',
  dragon_crystal: 'Кристальный дракон',
  dragon_shadow: 'Теневой дракон'
};

const SKIN_CLASSES = {
  dragon_king: 'skin-king',
  dragon_boss: 'skin-boss',
  dragon_sage: 'skin-sage',
  dragon_academy: 'skin-academy',
  dragon_ege: 'skin-ege',
  dragon_gold: 'skin-gold',
  dragon_forest: 'skin-forest',
  dragon_storm: 'skin-storm',
  dragon_crystal: 'skin-crystal',
  dragon_shadow: 'skin-shadow'
};


function decodePdfLiteral(value) {
  return String(value || '')
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

function hexToBytes(hex) {
  const clean = String(hex || '').replace(/[^0-9a-fA-F]/g, '');
  const out = [];
  for (let i = 0; i < clean.length; i += 2) {
    const byte = parseInt(clean.slice(i, i + 2), 16);
    if (!Number.isNaN(byte)) out.push(byte);
  }
  return out;
}

function decodeUtf16BE(bytes) {
  let start = 0;
  if (bytes[0] === 0xfe && bytes[1] === 0xff) start = 2;
  let out = '';
  for (let i = start; i + 1 < bytes.length; i += 2) {
    const code = (bytes[i] << 8) | bytes[i + 1];
    if (code === 0) continue;
    out += String.fromCharCode(code);
  }
  return out;
}

function decodeWin1251(bytes) {
  const table = {
    0xA8:'Ё',0xB8:'ё',0xC0:'А',0xC1:'Б',0xC2:'В',0xC3:'Г',0xC4:'Д',0xC5:'Е',0xC6:'Ж',0xC7:'З',
    0xC8:'И',0xC9:'Й',0xCA:'К',0xCB:'Л',0xCC:'М',0xCD:'Н',0xCE:'О',0xCF:'П',0xD0:'Р',0xD1:'С',
    0xD2:'Т',0xD3:'У',0xD4:'Ф',0xD5:'Х',0xD6:'Ц',0xD7:'Ч',0xD8:'Ш',0xD9:'Щ',0xDA:'Ъ',0xDB:'Ы',
    0xDC:'Ь',0xDD:'Э',0xDE:'Ю',0xDF:'Я',0xE0:'а',0xE1:'б',0xE2:'в',0xE3:'г',0xE4:'д',0xE5:'е',
    0xE6:'ж',0xE7:'з',0xE8:'и',0xE9:'й',0xEA:'к',0xEB:'л',0xEC:'м',0xED:'н',0xEE:'о',0xEF:'п',
    0xF0:'р',0xF1:'с',0xF2:'т',0xF3:'у',0xF4:'ф',0xF5:'х',0xF6:'ц',0xF7:'ч',0xF8:'ш',0xF9:'щ',
    0xFA:'ъ',0xFB:'ы',0xFC:'ь',0xFD:'э',0xFE:'ю',0xFF:'я'
  };
  return bytes.map((b) => {
    if (b === 10 || b === 13) return '\n';
    if (b >= 32 && b < 128) return String.fromCharCode(b);
    return table[b] || '';
  }).join('');
}

function decodePdfHex(hex, cmap = {}) {
  const clean = String(hex || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (!clean) return '';

  let mapped = '';
  let mappedAny = false;
  for (let i = 0; i < clean.length;) {
    const code4 = clean.slice(i, i + 4);
    const code2 = clean.slice(i, i + 2);
    if (cmap[code4]) {
      mapped += cmap[code4];
      i += 4;
      mappedAny = true;
    } else if (cmap[code2]) {
      mapped += cmap[code2];
      i += 2;
      mappedAny = true;
    } else {
      i += clean.length >= 4 ? 4 : 2;
    }
  }
  if (mappedAny && /[А-Яа-яЁёA-Za-z0-9,.!? -]/.test(mapped)) return mapped;

  const bytes = hexToBytes(clean);
  if ((bytes[0] === 0xfe && bytes[1] === 0xff) || bytes.some((b, i) => i % 2 === 0 && b === 0x04)) {
    const utf16 = decodeUtf16BE(bytes);
    if (/[А-Яа-яЁё]/.test(utf16) || utf16.length > 1) return utf16;
  }
  if (bytes.length >= 4 && bytes.length % 2 === 0) {
    const utf16 = decodeUtf16BE(bytes);
    if (/[А-Яа-яЁё]/.test(utf16)) return utf16;
  }
  const cp1251 = decodeWin1251(bytes);
  if (/[А-Яа-яЁё]/.test(cp1251)) return cp1251;
  return bytes.map((b) => b >= 32 ? String.fromCharCode(b) : '').join('');
}

function trimPdfStreamBytes(bytes) {
  let start = 0;
  let end = bytes.length;
  while (start < end && (bytes[start] === 10 || bytes[start] === 13 || bytes[start] === 32)) start += 1;
  while (end > start && (bytes[end - 1] === 10 || bytes[end - 1] === 13 || bytes[end - 1] === 32)) end -= 1;
  return bytes.slice(start, end);
}

async function inflatePdfStream(bytes) {
  if (!('DecompressionStream' in window)) return null;
  const cleanBytes = trimPdfStreamBytes(bytes);
  for (const mode of ['deflate', 'deflate-raw']) {
    try {
      const stream = new Blob([cleanBytes]).stream().pipeThrough(new DecompressionStream(mode));
      const buffer = await new Response(stream).arrayBuffer();
      return new Uint8Array(buffer);
    } catch (error) {}
  }
  return null;
}

function bytesToBinaryString(bytes) {
  let out = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.slice(i, i + chunk));
  }
  return out;
}

function parseToUnicodeCMap(text) {
  const cmap = {};
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      cmap[pair[1].toUpperCase()] = decodeUtf16BE(hexToBytes(pair[2]));
    }
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const range of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const start = parseInt(range[1], 16);
      const end = parseInt(range[2], 16);
      const dst = parseInt(range[3], 16);
      const width = range[1].length;
      for (let code = start; code <= end && code - start < 512; code += 1) {
        const srcHex = code.toString(16).toUpperCase().padStart(width, '0');
        const dstHex = (dst + code - start).toString(16).toUpperCase().padStart(4, '0');
        cmap[srcHex] = decodeUtf16BE(hexToBytes(dstHex));
      }
    }
    for (const range of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g)) {
      const startCode = parseInt(range[1], 16);
      const width = range[1].length;
      let offset = 0;
      for (const dst of range[3].matchAll(/<([0-9A-Fa-f]+)>/g)) {
        const srcHex = (startCode + offset).toString(16).toUpperCase().padStart(width, '0');
        cmap[srcHex] = decodeUtf16BE(hexToBytes(dst[1]));
        offset += 1;
      }
    }
  }
  return cmap;
}

function decodePdfTextArray(arrayText, cmap = {}) {
  const parts = [];
  for (const item of String(arrayText || '').matchAll(/\((?:\\.|[^\\)])*\)|<[\dA-Fa-f\s]+>/g)) {
    const raw = item[0];
    if (raw.startsWith('(')) parts.push(decodePdfLiteral(raw.slice(1, -1)));
    else parts.push(decodePdfHex(raw.slice(1, -1), cmap));
  }
  return parts.join('');
}

function extractPositionedTextFromPdfContent(text, cmap = {}) {
  const segments = [];
  const tmRegex = /1\s+0\s+0\s+1\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+Tm([\s\S]*?)ET/g;
  let match;
  while ((match = tmRegex.exec(text))) {
    const x = Number(match[1]);
    const y = Number(match[2]);
    const block = match[3];
    let value = '';

    for (const arr of block.matchAll(/\[((?:[^\[\]]|\((?:\\.|[^\\)])*\)|<[\dA-Fa-f\s]+>)*)\]\s*TJ/g)) {
      value += decodePdfTextArray(arr[1], cmap);
    }
    for (const lit of block.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)) {
      value += decodePdfLiteral(lit[0].replace(/\)\s*Tj$/, '').slice(1));
    }
    for (const hex of block.matchAll(/<([\dA-Fa-f\s]+)>\s*Tj/g)) {
      value += decodePdfHex(hex[1], cmap);
    }

    if (value) segments.push({ x, y, value });
  }

  if (!segments.length) return '';

  const groups = [];
  for (const seg of segments) {
    let group = groups.find((g) => Math.abs(g.y - seg.y) < 3);
    if (!group) {
      group = { y: seg.y, items: [] };
      groups.push(group);
    }
    group.items.push(seg);
  }

  groups.sort((a, b) => b.y - a.y);
  return groups.map((group) => group.items
    .sort((a, b) => a.x - b.x)
    .map((item) => item.value)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  ).filter(Boolean).join('\n');
}

function extractTextFromPdfContent(text, cmap = {}) {
  const positioned = extractPositionedTextFromPdfContent(text, cmap);
  if (positioned.trim()) return positioned;

  const out = [];
  for (const arr of text.matchAll(/\[((?:[^\[\]]|\((?:\\.|[^\\)])*\)|<[\dA-Fa-f\s]+>)*)\]\s*TJ/g)) {
    out.push(decodePdfTextArray(arr[1], cmap));
  }
  for (const lit of text.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)) {
    out.push(decodePdfLiteral(lit[0].replace(/\)\s*Tj$/, '').slice(1)));
  }
  for (const hex of text.matchAll(/<([\dA-Fa-f\s]+)>\s*Tj/g)) {
    out.push(decodePdfHex(hex[1], cmap));
  }
  return out.filter(Boolean).join('\n');
}

async function extractPdfText(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const raw = bytesToBinaryString(bytes);

  const streams = [];
  const cmaps = [parseToUnicodeCMap(raw)];
  const streamRegex = /<<(?:.|\n|\r)*?>>\s*stream\r?\n?/g;
  let match;
  while ((match = streamRegex.exec(raw))) {
    const dataStart = streamRegex.lastIndex;
    const end = raw.indexOf('endstream', dataStart);
    if (end === -1) break;
    const dict = raw.slice(match.index, dataStart);
    const streamBytes = bytes.slice(dataStart, end);
    let streamText = '';

    if (/\/FlateDecode/.test(dict)) {
      const inflated = await inflatePdfStream(streamBytes);
      if (inflated) streamText = bytesToBinaryString(inflated);
    } else {
      streamText = bytesToBinaryString(trimPdfStreamBytes(streamBytes));
    }

    if (streamText) {
      streams.push(streamText);
      const cmap = parseToUnicodeCMap(streamText);
      if (Object.keys(cmap).length) cmaps.push(cmap);
    }
    streamRegex.lastIndex = end + 'endstream'.length;
  }

  const mergedCmap = Object.assign({}, ...cmaps);
  const chunks = streams
    .filter((streamText) => !/begincmap/.test(streamText) && !/glyf|hmtx|loca|head/.test(streamText.slice(0, 300)))
    .map((streamText) => extractTextFromPdfContent(streamText, mergedCmap));

  const text = chunks.join('\n')
    .replace(/\u0000/g, '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');

  return text;
}

function splitImportedLines(text) {
  return String(text || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitStressConcatenatedLine(line) {
  const text = String(line || '').trim();
  if (!text) return [];
  if (/\s/.test(text)) return text.split(/\s+/).filter(Boolean);
  const uppercaseVowels = [...text.matchAll(/[АЕЁИОУЫЭЮЯ]/g)].map((m) => m.index);
  if (uppercaseVowels.length <= 1) return [text];

  const parts = [];
  for (let i = 0; i < uppercaseVowels.length; i += 1) {
    const start = i === 0 ? 0 : uppercaseVowels[i] - 1;
    const end = i + 1 < uppercaseVowels.length ? uppercaseVowels[i + 1] - 1 : text.length;
    const part = text.slice(start, end);
    if (part.length > 1) parts.push(part);
  }
  return parts.length ? parts : [text];
}

function stressLineToCard(line) {
  const vowels = 'АЕЁИОУЫЭЮЯ';
  const cleaned = String(line || '').replace(/^[\d.)\-\s]+/, '').trim();
  if (!/[АЕЁИОУЫЭЮЯ]/.test(cleaned)) return null;
  const wordOnly = cleaned.replace(/[^А-Яа-яЁё-]/g, '');
  const chars = [...wordOnly];
  let word = '';
  let stressed = '';
  let used = false;
  for (const ch of chars) {
    const lower = ch.toLowerCase();
    word += lower;
    if (!used && vowels.includes(ch)) {
      stressed += lower + '́';
      used = true;
    } else {
      stressed += lower;
    }
  }
  if (!used || word.length < 2) return null;
  return {
    id: `stress:${word}`,
    kind: 'stress',
    word,
    stressed,
    answer: stressed,
    source: 'pdf_stress_import',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    dueAt: Date.now(),
    reps: 0,
    intervalMinutes: 15,
    ease: 2.2,
    lastResult: '',
    reviewHistory: [],
    score: 0,
    favorite: false,
    archived: false,
    archivedAt: null
  };
}

function punctuationLineToCard(line) {
  const correctedText = String(line || '').replace(/^[\d.)\-\s]+/, '').replace(/\s+/g, ' ').trim();
  if (!correctedText || !correctedText.includes(',')) return null;
  const originalText = correctedText.replace(/,/g, '').replace(/\s+/g, ' ').trim();
  if (originalText.length < 8) return null;
  return {
    id: `punct:${originalText}`,
    kind: 'punctuation',
    word: originalText.slice(0, 80),
    prompt: originalText,
    originalText,
    correctedText,
    answer: correctedText,
    explanations: ['Импортировано из PDF: восстановите запятые и сравните с правильным ответом.'],
    note: 'PDF-импорт предложений с запятыми',
    source: 'pdf_punctuation_import',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    dueAt: Date.now(),
    reps: 0,
    intervalMinutes: 15,
    ease: 2.2,
    lastResult: '',
    reviewHistory: [],
    score: 0,
    favorite: false,
    archived: false,
    archivedAt: null
  };
}

async function importPdfDictionary(file, mode) {
  const text = await extractPdfText(file);
  const lines = splitImportedLines(text);
  const cards = {};
  for (const line of lines) {
    const candidates = mode === 'stress' ? splitStressConcatenatedLine(line) : [line];
    for (const candidate of candidates) {
      const card = mode === 'stress' ? stressLineToCard(candidate) : punctuationLineToCard(candidate);
      if (card) cards[card.id] = card;
    }
  }
  if (!Object.keys(cards).length) {
    return { ok: false, imported: 0, reason: 'no_cards', extractedPreview: text.slice(0, 300) };
  }
  return chrome.runtime.sendMessage({
    type: 'IMPORT_CARDS',
    payload: {
      version: 3,
      type: mode === 'stress' ? 'pdf-stress-dictionary' : 'pdf-punctuation-dictionary',
      cards
    }
  });
}


function showOptionsStatus(message, variant = 'success') {
  if (!statusEl) return;
  statusEl.hidden = false;
  statusEl.className = `inline-status dragon-status options-status dragon-status--${variant}`;
  statusEl.textContent = message;
  statusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderMascotSkins(state) {
  const root = document.getElementById('mascotSkinsPanel');
  if (!root) return;
  const profile = state.profile || {};
  const unlocked = new Set([...(profile.unlockedMascotSkins || []), 'dragon_king', 'dragon_boss', 'dragon_sage']);
  const selected = profile.selectedMascotSkin || 'dragon_king';
  const skins = ['dragon_king','dragon_boss','dragon_sage','dragon_academy','dragon_ege','dragon_gold','dragon_forest','dragon_storm','dragon_crystal','dragon_shadow'];

  root.innerHTML = skins.map((skin) => {
    const isUnlocked = unlocked.has(skin);
    const isSelected = selected === skin;
    const cls = SKIN_CLASSES[skin] || 'skin-king';
    return `
      <article class="skin-card ${isSelected ? 'skin-card--selected' : ''} ${!isUnlocked ? 'skin-card--locked' : ''}">
        <div class="skin-dragon ${cls}" aria-hidden="true"></div>
        <h3>${SKIN_LABELS[skin] || skin}</h3>
        <p class="muted">${isUnlocked ? (isSelected ? 'Выбран сейчас' : 'Доступен') : 'Закрыт — может выпасть из сундука'}</p>
        <button type="button" class="secondary skin-select-btn" data-skin="${skin}" ${isUnlocked ? '' : 'disabled'}>
          ${isSelected ? 'Выбран' : isUnlocked ? 'Выбрать' : 'Закрыт'}
        </button>
      </article>
    `;
  }).join('');

  root.querySelectorAll('.skin-select-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const response = await chrome.runtime.sendMessage({ type: 'SET_MASCOT_SKIN', skin: button.dataset.skin });
      if (response?.ok) {
        showOptionsStatus('Скин дракона выбран.', 'success');
        await init();
      } else {
        showOptionsStatus('Этот скин пока закрыт.', 'warning');
      }
    });
  });
}

async function init() {
  const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  Object.entries(state.settings || {}).forEach(([key, value]) => {
    const input = form.elements.namedItem(key);
    if (input) input.value = value;
  });
  renderMascotSkins(state);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(form).entries());
  for (const key of Object.keys(payload)) {
    const value = payload[key];
    if (value !== "" && !Number.isNaN(Number(value)) && key !== "apiBaseUrl") {
      payload[key] = Number(value);
    }
  }
  await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", payload });
  if (payload.textScale !== undefined) applyLocalTextScale(payload.textScale);
  showOptionsStatus("Настройки сохранены. Размер текста применён к текущей странице.", "success");
});

document.getElementById("importBtn")?.addEventListener("click", () => fileInput.click());
document.getElementById("importStressPdfBtn")?.addEventListener("click", () => stressPdfInput?.click());
document.getElementById("importPunctuationPdfBtn")?.addEventListener("click", () => punctuationPdfInput?.click());

async function handlePdfInput(input, mode) {
  const file = input?.files?.[0];
  if (!file) return;
  try {
    showOptionsStatus('PDF обрабатывается. Подождите несколько секунд...', 'success');
    const response = await importPdfDictionary(file, mode);
    showOptionsStatus(response?.ok
      ? `PDF импортирован. Карточек добавлено: ${response.imported || 0}.`
      : `Не удалось найти карточки в PDF. Проверьте, что PDF содержит выделяемый текст, а не скан. Фрагмент распознанного текста: ${(response?.extractedPreview || 'пусто').slice(0, 120)}`, response?.ok ? 'success' : 'warning');
  } catch (error) {
    console.error(error);
    showOptionsStatus('Ошибка PDF-импорта: проверьте файл или сохраните PDF как текстовый, а не скан-картинку.', 'warning');
  } finally {
    if (input) input.value = '';
  }
}

stressPdfInput?.addEventListener('change', () => handlePdfInput(stressPdfInput, 'stress'));
punctuationPdfInput?.addEventListener('change', () => handlePdfInput(punctuationPdfInput, 'punctuation'));

fileInput?.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const response = await chrome.runtime.sendMessage({ type: "IMPORT_CARDS", payload });
    showOptionsStatus(response?.ok
      ? `Словарь импортирован. Карточек добавлено: ${response.imported || 0}. Личная статистика и достижения не импортировались.`
      : "Не удалось импортировать словарь: файл не похож на экспорт ОрфоДракон.", response?.ok ? 'success' : 'warning');
  } catch (error) {
    console.error(error);
    showOptionsStatus("Ошибка импорта: проверь JSON-файл словаря.", "warning");
  } finally {
    fileInput.value = "";
  }
});

init();

document.getElementById('openTrainerFromOptionsBtn')?.addEventListener('click',()=>window.open('popup.html','_blank','noopener,noreferrer'));
