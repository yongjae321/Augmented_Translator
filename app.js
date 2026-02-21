const languages = [
  { code: 'auto', label: 'Auto detect' },
  { code: 'en', label: 'English' },
  { code: 'ko', label: 'Korean' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' }
];

const initialProviders = [
  { id: 'chatgpt', label: 'ChatGPT', kind: 'ai', defaults: { baseUrl: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' } },
  { id: 'claude', label: 'Claude', kind: 'ai', defaults: { baseUrl: 'https://api.anthropic.com/v1/messages', model: 'claude-3-5-sonnet-latest' } },
  { id: 'gemini', label: 'Gemini', kind: 'ai', defaults: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent', model: 'gemini-1.5-flash-latest' } },
  { id: 'google', label: 'Google Translate', kind: 'engine', defaults: { baseUrl: 'https://translation.googleapis.com/language/translate/v2', model: '' } },
  { id: 'deepl', label: 'DeepL', kind: 'engine', defaults: { baseUrl: 'https://api-free.deepl.com/v2/translate', model: '' } }
];

const storageKey = 'augmented-translator-state';

const state = {
  providers: structuredClone(initialProviders),
  sourceLanguage: 'auto',
  targetLanguage: 'en',
  sourceSentences: [],
  selectedSourceIndex: null,
  selectedProviderIds: new Set(initialProviders.map((p) => p.id)),
  candidatesByProvider: {},
  providerStatus: {},
  apiConfigByProvider: Object.fromEntries(initialProviders.map((p) => [p.id, { enabled: false, apiKey: '', baseUrl: p.defaults.baseUrl, model: p.defaults.model, collapsed: true }])),
  context: { title: '', author: '', styleNotes: '', summary: '' }
};

const el = {
  sourceLanguage: document.querySelector('#source-language'),
  targetLanguage: document.querySelector('#target-language'),
  requestTranslation: document.querySelector('#request-translation'),
  statusList: document.querySelector('#status-list'),
  apiProviderList: document.querySelector('#api-provider-list'),
  addProviderForm: document.querySelector('#add-provider-form'),
  newProviderName: document.querySelector('#new-provider-name'),
  newProviderKind: document.querySelector('#new-provider-kind'),
  newProviderBaseUrl: document.querySelector('#new-provider-base-url'),
  newProviderModel: document.querySelector('#new-provider-model'),
  bookTitle: document.querySelector('#book-title'),
  bookAuthor: document.querySelector('#book-author'),
  styleNotes: document.querySelector('#style-notes'),
  chapterSummary: document.querySelector('#chapter-summary'),
  summaryProvider: document.querySelector('#summary-provider'),
  summarySource: document.querySelector('#summary-source'),
  generateSummary: document.querySelector('#generate-summary'),
  sourceInput: document.querySelector('#source-input'),
  segmentSource: document.querySelector('#segment-source'),
  sourceSentences: document.querySelector('#source-sentences'),
  candidateList: document.querySelector('#candidate-list'),
  editorOutput: document.querySelector('#editor-output'),
  previewPane: document.querySelector('#preview-pane'),
  previewOutput: document.querySelector('#preview-output'),
  saveState: document.querySelector('#save-state'),
  loadState: document.querySelector('#load-state'),
  exportEditor: document.querySelector('#export-editor'),
  togglePreview: document.querySelector('#toggle-preview'),
  sentenceTemplate: document.querySelector('#sentence-item-template'),
  candidateTemplate: document.querySelector('#candidate-template')
};

function segmentText(text) {
  return text.split(/(?<=[.!?。！？])\s+/u).map((line) => line.trim()).filter(Boolean).map((content, index) => ({ id: index + 1, content }));
}

function chunkSentences(sentences, chunkSize = 10) {
  const chunks = [];
  for (let i = 0; i < sentences.length; i += chunkSize) {
    const piece = sentences.slice(i, i + chunkSize);
    chunks.push({ chunkId: chunks.length + 1, sourceSentenceIds: piece.map((s) => s.id), text: piece.map((s) => `[S${s.id}] ${s.content}`).join('\n') });
  }
  return chunks;
}

function buildContextBlock() {
  const { title, author, styleNotes, summary } = state.context;
  return [title ? `Book title: ${title}` : '', author ? `Author: ${author}` : '', summary ? `Chapter summary: ${summary}` : '', styleNotes ? `Style notes: ${styleNotes}` : '']
    .filter(Boolean)
    .join('\n');
}

function buildPrompt(chunk, mode = 'translate') {
  if (mode === 'summary') {
    return [`Summarize the following chapter text for translation context in ${state.targetLanguage}.`, buildContextBlock(), chunk].filter(Boolean).join('\n\n');
  }
  return [
    `Translate from ${state.sourceLanguage} to ${state.targetLanguage}.`,
    'Keep context and style consistent. Preserve sentence order.',
    'Input includes sentence IDs. Return translated plain text in order.',
    buildContextBlock(),
    chunk.text
  ]
    .filter(Boolean)
    .join('\n\n');
}

function parseTargetSentences(text) {
  return (text || '').replace(/\r/g, '').split(/(?<=[.!?。！？])\s+/u).map((p) => p.trim()).filter(Boolean);
}

function alignChunkOutput(chunk, translatedText) {
  const targets = parseTargetSentences(translatedText);
  if (targets.length === 0) {
    return chunk.sourceSentenceIds.map((id) => ({ sourceIds: [id], translatedText: translatedText || '(empty response)' }));
  }
  return chunk.sourceSentenceIds.map((id, idx) => ({ sourceIds: [id], translatedText: targets[idx] || targets[targets.length - 1] }));
}

function setProviderStatus(providerId, status, message = '') {
  state.providerStatus[providerId] = { status, message };
  renderStatus();
}

function fakeTranslate(chunkText, providerLabel) {
  return chunkText.split('\n').map((line) => `${providerLabel}: ${line.replace(/^\[S\d+\]\s*/, '')}`).join(' ');
}

async function requestProvider(provider, promptOrChunk, mode = 'translate') {
  const config = state.apiConfigByProvider[provider.id] || { enabled: false };

  if (!config.enabled || !config.apiKey) {
    if (mode === 'summary') {
      return `Mock summary by ${provider.label}: ${promptOrChunk.slice(0, 240)}...`;
    }
    return fakeTranslate(promptOrChunk.text, provider.label);
  }

  try {
    const prompt = mode === 'summary' ? buildPrompt(promptOrChunk, 'summary') : buildPrompt(promptOrChunk, 'translate');

    if (provider.id === 'chatgpt') {
      const response = await fetch(config.baseUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model: config.model || 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.2 })
      });
      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    }

    if (provider.id === 'claude') {
      const response = await fetch(config.baseUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: config.model || 'claude-3-5-sonnet-latest', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] })
      });
      const data = await response.json();
      return data.content?.[0]?.text || '';
    }

    if (provider.id === 'gemini') {
      const connector = config.baseUrl.includes('?') ? '&' : '?';
      const response = await fetch(`${config.baseUrl}${connector}key=${encodeURIComponent(config.apiKey)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    if (provider.id === 'google') {
      const response = await fetch(config.baseUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: mode === 'summary' ? promptOrChunk : promptOrChunk.text, source: state.sourceLanguage === 'auto' ? undefined : state.sourceLanguage, target: state.targetLanguage, format: 'text', key: config.apiKey })
      });
      const data = await response.json();
      return data.data?.translations?.[0]?.translatedText || '';
    }

    if (provider.id === 'deepl') {
      const form = new URLSearchParams();
      form.set('text', mode === 'summary' ? promptOrChunk : promptOrChunk.text);
      form.set('target_lang', state.targetLanguage.toUpperCase());
      if (state.sourceLanguage !== 'auto') form.set('source_lang', state.sourceLanguage.toUpperCase());
      const response = await fetch(config.baseUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `DeepL-Auth-Key ${config.apiKey}` }, body: form
      });
      const data = await response.json();
      return data.translations?.[0]?.text || '';
    }

    return `Generic provider response placeholder for ${provider.label}: ${prompt.slice(0, 180)}...`;
  } catch (error) {
    throw new Error(error.message || 'Request failed');
  }
}

function renderLanguageSelects() {
  [el.sourceLanguage, el.targetLanguage].forEach((selectElement) => {
    selectElement.innerHTML = '';
    languages.forEach((language) => {
      const option = document.createElement('option');
      option.value = language.code;
      option.textContent = `${language.label} (${language.code})`;
      selectElement.append(option);
    });
  });
  el.sourceLanguage.value = state.sourceLanguage;
  el.targetLanguage.value = state.targetLanguage;
}

function renderStatus() {
  el.statusList.innerHTML = '';
  state.providers.forEach((provider) => {
    const info = state.providerStatus[provider.id] || { status: 'idle', message: '' };
    const row = document.createElement('div');
    row.className = 'status-item';
    row.innerHTML = `<span class="bulb bulb-${info.status}"></span><strong>${provider.label}</strong><span>${info.message || info.status}</span>`;
    el.statusList.append(row);
  });
}

function renderProviderSettings() {
  el.apiProviderList.innerHTML = '';
  state.providers.forEach((provider) => {
    const config = state.apiConfigByProvider[provider.id] || { enabled: false, apiKey: '', baseUrl: '', model: '', collapsed: true };
    const card = document.createElement('details');
    card.className = 'api-card';
    card.open = !config.collapsed;
    card.innerHTML = `
      <summary class="api-summary">
        <label><input type="checkbox" data-role="selected" ${state.selectedProviderIds.has(provider.id) ? 'checked' : ''}/> ${provider.label}</label>
        <button type="button" data-role="delete" class="danger">Delete</button>
      </summary>
      <div class="api-body">
        <label><input type="checkbox" data-role="enabled" ${config.enabled ? 'checked' : ''}/> Enable live API</label>
        <label>API key <input type="password" data-role="apiKey" value="${config.apiKey}" placeholder="Paste API key"/></label>
        <label>Base URL <input type="text" data-role="baseUrl" value="${config.baseUrl}"/></label>
        <label>Model <input type="text" data-role="model" value="${config.model || ''}"/></label>
      </div>
    `;

    const detailsEl = card;
    detailsEl.addEventListener('toggle', () => {
      state.apiConfigByProvider[provider.id].collapsed = !detailsEl.open;
    });

    card.querySelector('[data-role="selected"]').addEventListener('change', (event) => {
      if (event.target.checked) state.selectedProviderIds.add(provider.id);
      else state.selectedProviderIds.delete(provider.id);
      renderSummaryProviders();
    });

    ['enabled', 'apiKey', 'baseUrl', 'model'].forEach((field) => {
      const node = card.querySelector(`[data-role="${field}"]`);
      const handler = field === 'enabled' ? 'change' : 'input';
      node.addEventListener(handler, () => {
        state.apiConfigByProvider[provider.id][field] = field === 'enabled' ? node.checked : node.value;
      });
    });

    card.querySelector('[data-role="delete"]').addEventListener('click', () => {
      if (!confirm(`Delete provider ${provider.label}?`)) return;
      state.providers = state.providers.filter((p) => p.id !== provider.id);
      delete state.apiConfigByProvider[provider.id];
      delete state.candidatesByProvider[provider.id];
      delete state.providerStatus[provider.id];
      state.selectedProviderIds.delete(provider.id);
      renderProviderSettings();
      renderStatus();
      renderSummaryProviders();
      renderCandidates();
    });

    el.apiProviderList.append(card);
  });
}

function renderSummaryProviders() {
  el.summaryProvider.innerHTML = '';
  const active = state.providers.filter((provider) => state.selectedProviderIds.has(provider.id));
  active.forEach((provider) => {
    const option = document.createElement('option');
    option.value = provider.id;
    option.textContent = provider.label;
    el.summaryProvider.append(option);
  });
}

function renderSentences() {
  el.sourceSentences.innerHTML = '';
  state.sourceSentences.forEach((sentence, index) => {
    const node = el.sentenceTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.sentenceId = String(sentence.id);
    node.textContent = `[S${sentence.id}] ${sentence.content}`;
    if (state.selectedSourceIndex === index) node.classList.add('selected');
    node.addEventListener('mouseenter', () => highlightCandidates(sentence.id));
    node.addEventListener('mouseleave', () => highlightCandidates(null));
    node.addEventListener('click', () => {
      state.selectedSourceIndex = index;
      renderSentences();
      renderCandidates();
    });
    el.sourceSentences.append(node);
  });
}

function highlightCandidates(sourceId) {
  el.candidateList.querySelectorAll('.candidate').forEach((item) => {
    const ids = item.dataset.sourceIds.split(',').map(Number);
    item.classList.toggle('highlighted', sourceId !== null && ids.includes(sourceId));
  });
}

function renderCandidates() {
  el.candidateList.innerHTML = '';
  if (state.selectedSourceIndex === null) {
    el.candidateList.textContent = 'Select a source sentence to view mapped candidates.';
    return;
  }
  const selected = state.sourceSentences[state.selectedSourceIndex];
  const matching = Object.values(state.candidatesByProvider).flat().filter((candidate) => candidate.sourceIds.includes(selected.id));
  if (matching.length === 0) {
    el.candidateList.textContent = 'No candidates yet. Click "Request translation".';
    return;
  }
  matching.forEach((candidate) => {
    const node = el.candidateTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.sourceIds = candidate.sourceIds.join(',');
    node.querySelector('.provider-name').textContent = candidate.providerLabel;
    node.querySelector('.mapping').textContent = `S${candidate.sourceIds.join(',S')} → T?`;
    node.querySelector('.candidate-text').textContent = candidate.translatedText;
    node.addEventListener('click', () => {
      el.editorOutput.setRangeText(`${candidate.translatedText}\n`, el.editorOutput.selectionStart, el.editorOutput.selectionEnd, 'end');
      renderPreview();
    });
    el.candidateList.append(node);
  });
}

function renderPreview() {
  const html = el.editorOutput.value
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br />');
  el.previewOutput.innerHTML = html;
}

async function requestTranslations() {
  if (state.sourceSentences.length === 0) {
    alert('Please segment source text first.');
    return;
  }
  const chunks = chunkSentences(state.sourceSentences);
  state.candidatesByProvider = {};
  for (const provider of state.providers) {
    if (!state.selectedProviderIds.has(provider.id)) continue;
    setProviderStatus(provider.id, 'in-progress', 'Translating...');
    try {
      const candidates = [];
      for (const chunk of chunks) {
        const translated = await requestProvider(provider, chunk, 'translate');
        alignChunkOutput(chunk, translated).forEach((mapping) => candidates.push({ providerId: provider.id, providerLabel: provider.label, sourceIds: mapping.sourceIds, translatedText: mapping.translatedText }));
      }
      state.candidatesByProvider[provider.id] = candidates;
      setProviderStatus(provider.id, 'done', 'Completed');
    } catch (error) {
      setProviderStatus(provider.id, 'error', error.message);
    }
  }
  renderCandidates();
}

async function generateSummary() {
  const providerId = el.summaryProvider.value;
  const provider = state.providers.find((p) => p.id === providerId);
  const chapterText = el.summarySource.value.trim();
  if (!provider || !chapterText) return;
  setProviderStatus(provider.id, 'in-progress', 'Generating summary...');
  try {
    const summary = await requestProvider(provider, chapterText, 'summary');
    el.chapterSummary.value = summary;
    state.context.summary = summary;
    setProviderStatus(provider.id, 'done', 'Summary completed');
    const shouldPopulate = confirm('Auto-populate "1) Original text" with the chapter text used for summary?');
    if (shouldPopulate) {
      el.sourceInput.value = chapterText;
      state.sourceSentences = segmentText(chapterText);
      state.selectedSourceIndex = state.sourceSentences.length ? 0 : null;
      renderSentences();
      renderCandidates();
    }
  } catch (error) {
    setProviderStatus(provider.id, 'error', error.message);
  }
}

function saveWorkspace() {
  const payload = {
    providers: state.providers,
    sourceLanguage: state.sourceLanguage,
    targetLanguage: state.targetLanguage,
    sourceSentences: state.sourceSentences,
    selectedSourceIndex: state.selectedSourceIndex,
    selectedProviderIds: [...state.selectedProviderIds],
    candidatesByProvider: state.candidatesByProvider,
    providerStatus: state.providerStatus,
    apiConfigByProvider: state.apiConfigByProvider,
    context: state.context,
    sourceText: el.sourceInput.value,
    editorText: el.editorOutput.value,
    summarySource: el.summarySource.value
  };
  localStorage.setItem(storageKey, JSON.stringify(payload));
}

function loadWorkspace() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return;
  const snapshot = JSON.parse(raw);
  state.providers = snapshot.providers || state.providers;
  state.sourceLanguage = snapshot.sourceLanguage || 'auto';
  state.targetLanguage = snapshot.targetLanguage || 'en';
  state.sourceSentences = snapshot.sourceSentences || [];
  state.selectedSourceIndex = snapshot.selectedSourceIndex;
  state.selectedProviderIds = new Set(snapshot.selectedProviderIds || state.providers.map((p) => p.id));
  state.candidatesByProvider = snapshot.candidatesByProvider || {};
  state.providerStatus = snapshot.providerStatus || {};
  state.apiConfigByProvider = snapshot.apiConfigByProvider || state.apiConfigByProvider;
  state.context = snapshot.context || state.context;

  el.sourceInput.value = snapshot.sourceText || '';
  el.editorOutput.value = snapshot.editorText || '';
  el.summarySource.value = snapshot.summarySource || '';
  el.bookTitle.value = state.context.title || '';
  el.bookAuthor.value = state.context.author || '';
  el.styleNotes.value = state.context.styleNotes || '';
  el.chapterSummary.value = state.context.summary || '';

  renderLanguageSelects();
  renderProviderSettings();
  renderSummaryProviders();
  renderStatus();
  renderSentences();
  renderCandidates();
  renderPreview();
}

function exportEditorText() {
  const blob = new Blob([el.editorOutput.value], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'translation-editor-output.txt';
  a.click();
  URL.revokeObjectURL(a.href);
}

el.segmentSource.addEventListener('click', () => {
  state.sourceSentences = segmentText(el.sourceInput.value);
  state.selectedSourceIndex = state.sourceSentences.length ? 0 : null;
  renderSentences();
  renderCandidates();
});

el.requestTranslation.addEventListener('click', async () => {
  el.requestTranslation.disabled = true;
  el.requestTranslation.textContent = 'Requesting...';
  await requestTranslations();
  el.requestTranslation.disabled = false;
  el.requestTranslation.textContent = 'Request translation';
});

el.sourceLanguage.addEventListener('change', () => (state.sourceLanguage = el.sourceLanguage.value));
el.targetLanguage.addEventListener('change', () => (state.targetLanguage = el.targetLanguage.value));
el.bookTitle.addEventListener('input', () => (state.context.title = el.bookTitle.value));
el.bookAuthor.addEventListener('input', () => (state.context.author = el.bookAuthor.value));
el.styleNotes.addEventListener('input', () => (state.context.styleNotes = el.styleNotes.value));
el.chapterSummary.addEventListener('input', () => (state.context.summary = el.chapterSummary.value));
el.generateSummary.addEventListener('click', generateSummary);

el.addProviderForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = el.newProviderName.value.trim();
  if (!name) return;
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `provider-${Date.now()}`;
  if (state.providers.some((p) => p.id === id)) {
    alert('Provider with same ID exists. Use a different name.');
    return;
  }

  const provider = { id, label: name, kind: el.newProviderKind.value, defaults: { baseUrl: el.newProviderBaseUrl.value.trim(), model: el.newProviderModel.value.trim() } };
  state.providers.push(provider);
  state.selectedProviderIds.add(id);
  state.apiConfigByProvider[id] = { enabled: false, apiKey: '', baseUrl: provider.defaults.baseUrl, model: provider.defaults.model, collapsed: true };
  state.providerStatus[id] = { status: 'idle', message: 'idle' };

  el.addProviderForm.reset();
  renderProviderSettings();
  renderSummaryProviders();
  renderStatus();
});

el.editorOutput.addEventListener('input', renderPreview);
el.saveState.addEventListener('click', saveWorkspace);
el.loadState.addEventListener('click', loadWorkspace);
el.exportEditor.addEventListener('click', exportEditorText);
el.togglePreview.addEventListener('click', () => el.previewPane.classList.toggle('hidden'));

renderLanguageSelects();
renderProviderSettings();
renderSummaryProviders();
renderStatus();
renderPreview();
