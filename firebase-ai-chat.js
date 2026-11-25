const modal = document.getElementById('geminiChatModal');
const messages = document.getElementById('geminiChatMessages');
const form = document.getElementById('geminiChatForm');
const input = document.getElementById('geminiQuestion');
const sendButton = document.getElementById('sendGeminiQuestion');

function scrollToLatest() {
  messages.scrollTop = messages.scrollHeight;
}

function makeBubble(role, text, className = '') {
  const bubble = document.createElement('article');
  bubble.className = `gemini-chat-message ${role}${className ? ` ${className}` : ''}`;
  if (text) {
    const content = document.createElement('div');
    content.className = 'gemini-chat-text';
    content.textContent = text;
    bubble.append(content);
  }
  messages.append(bubble);
  scrollToLatest();
  return bubble;
}

function safeWebUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

function appendInlineCitations(container, text, metadata, chunks) {
  const supports = Array.isArray(metadata?.groundingSupports) ? metadata.groundingSupports : [];
  const citationsByEnd = new Map();
  for (const support of supports) {
    const end = Number(support?.segment?.endIndex);
    if (!Number.isInteger(end) || end < 0 || end > text.length) continue;
    const indices = citationsByEnd.get(end) || new Set();
    for (const index of support?.groundingChunkIndices || []) {
      if (Number.isInteger(index) && index >= 0 && index < chunks.length) indices.add(index);
    }
    citationsByEnd.set(end, indices);
  }
  const citationPoints = [...citationsByEnd.keys()].sort((a, b) => a - b);
  let cursor = 0;
  for (const end of citationPoints) {
    if (end < cursor) continue;
    container.append(document.createTextNode(text.slice(cursor, end)));
    for (const index of citationsByEnd.get(end)) {
      const uri = safeWebUrl(chunks[index]?.web?.uri);
      if (!uri) continue;
      const link = document.createElement('a');
      link.className = 'gemini-inline-citation';
      link.href = uri;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `[${Number(index) + 1}]`;
      link.setAttribute('aria-label', `來源 ${Number(index) + 1}`);
      container.append(link);
    }
    cursor = end;
  }
  container.append(document.createTextNode(text.slice(cursor)));
}

function renderGroundedAnswer(bubble, result) {
  const metadata = result?.groundingMetadata;
  const chunks = Array.isArray(metadata?.groundingChunks) ? metadata.groundingChunks : [];
  if (result?.searchUnavailable) {
    const note = document.createElement('p');
    note.className = 'gemini-chat-fallback-note';
    note.textContent = '網路搜尋暫時無法使用；以下是 Gemini 一般回答，沒有即時搜尋來源。';
    bubble.append(note);
  }
  const answer = document.createElement('div');
  answer.className = 'gemini-chat-text';
  appendInlineCitations(answer, String(result?.text || ''), metadata, chunks);
  bubble.append(answer);

  const renderedContent = metadata?.searchEntryPoint?.renderedContent;
  if (renderedContent) {
    const widget = document.createElement('iframe');
    widget.className = 'gemini-search-widget';
    widget.title = 'Google 搜尋建議';
    widget.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
    widget.loading = 'lazy';
    widget.srcdoc = String(renderedContent);
    bubble.append(widget);
  }

  const sourceItems = chunks.map((chunk, index) => ({
    index,
    title: String(chunk?.web?.title || '').trim(),
    uri: safeWebUrl(chunk?.web?.uri),
  })).filter(item => item.uri);
  if (sourceItems.length) {
    const sourceSection = document.createElement('section');
    sourceSection.className = 'gemini-chat-source-list';
    const heading = document.createElement('strong');
    heading.textContent = '資料來源';
    const list = document.createElement('ul');
    for (const source of sourceItems.slice(0, 8)) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = source.uri;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = source.title || `來源 ${source.index + 1}`;
      item.append(link);
      list.append(item);
    }
    sourceSection.append(heading, list);
    bubble.append(sourceSection);
  }
  scrollToLatest();
}

function addWelcome() {
  const welcome = makeBubble('assistant', '想查什麼？需要最新資訊時，我會搜尋網路並附上可查閱的來源。這段對話只保留在目前分頁。');
  welcome.classList.add('gemini-chat-welcome');
}

function openChat() {
  modal.classList.add('open');
  if (!messages.children.length) addWelcome();
  input.focus();
}

function closeChat() {
  modal.classList.remove('open');
}

function formatError(error) {
  const message = String(error?.message || '請稍後再試。');
  if (/app.?check|recaptcha|403/i.test(message)) return 'Firebase App Check 驗證失敗，請稍後再試。';
  if (/permission.denied|PERMISSION_DENIED/i.test(message)) return 'Firebase AI Logic 尚未完成啟用。';
  if (/\b(429|500|502|503|504)\b|high demand|繁忙/i.test(message)) return 'Gemini 搜尋服務目前繁忙，請稍後再試。';
  return `Gemini 暫時無法回答：${message}`;
}

async function sendQuestion(event) {
  event.preventDefault();
  const question = input.value.trim();
  if (!question || sendButton.disabled) return;
  const localAnswer = window.dayflowLocalAnswer?.(question);
  if (localAnswer) {
    makeBubble('user', question);
    input.value = '';
    makeBubble('assistant', localAnswer, 'local');
    return;
  }
  const engine = window.dayflowGemini;
  if (!engine?.ready || typeof engine.ask !== 'function') {
    makeBubble('assistant', engine?.error || 'Gemini 尚未完成設定。', 'error');
    return;
  }

  makeBubble('user', question);
  input.value = '';
  input.disabled = true;
  sendButton.disabled = true;
  const pending = makeBubble('assistant', '正在搜尋並整理答案…', 'pending');
  try {
    const result = await engine.ask(question);
    pending.remove();
    renderGroundedAnswer(makeBubble('assistant', ''), result);
  } catch (error) {
    pending.classList.remove('pending');
    pending.classList.add('error');
    pending.querySelector('.gemini-chat-text').textContent = formatError(error);
  } finally {
    input.disabled = false;
    sendButton.disabled = false;
    input.focus();
    scrollToLatest();
  }
}

document.getElementById('askGeminiButton').addEventListener('click', openChat);
document.getElementById('closeGeminiChat').addEventListener('click', closeChat);
document.getElementById('clearGeminiChat').addEventListener('click', () => {
  messages.replaceChildren();
  window.dayflowGemini?.clearAskHistory?.();
  addWelcome();
  input.focus();
});
form.addEventListener('submit', sendQuestion);
input.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});
modal.addEventListener('click', event => {
  if (event.target === modal) closeChat();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && modal.classList.contains('open')) closeChat();
});
