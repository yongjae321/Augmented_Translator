const providers = [
  { id: 'chatgpt', label: 'ChatGPT', kind: 'ai' },
  { id: 'claude', label: 'Claude', kind: 'ai' },
  { id: 'gemini', label: 'Gemini', kind: 'ai' },
  { id: 'google', label: 'Google Translate', kind: 'engine' },
  { id: 'deepl', label: 'DeepL', kind: 'engine' }
];

const state = {
  sourceText: '',
  context: '',
  sourceSentences: [],
  selectedSourceIndex: null,
  selectedProviderIds: new Set(providers.map((provider) => provider.id)),
  candidatesByProvider: {},
  editorText: ''
};

const el = {
  providerToggles: document.querySelector('#provider-toggles'),
  refreshCandidates: document.querySelector('#refresh-candidates'),
  contextInput: document.querySelector('#context-input'),
  saveState: document.querySelector('#save-state'),
  loadState: document.querySelector('#load-state'),
  exportEditor: document.querySelector('#export-editor'),
  togglePreview: document.querySelector('#toggle-preview'),
  sourceInput: document.querySelector('#source-input'),
  segmentSource: document.querySelector('#segment-source'),
  sourceSentences: document.querySelector('#source-sentences'),
  candidateList: document.querySelector('#candidate-list'),
  editorOutput: document.querySelector('#editor-output'),
  previewPane: document.querySelector('#preview-pane'),
  previewOutput: document.querySelector('#preview-output'),
  sentenceTemplate: document.querySelector('#sentence-item-template'),
  candidateTemplate: document.querySelector('#candidate-template')
};

function segmentText(text) {
  return text
    .split(/(?<=[.!?。！？])\s+/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((content, index) => ({ id: index + 1, content }));
}

function buildChunkedPromptMetadata(sentences) {
  const targetChunkSize = 12;
  const chunks = [];
  for (let index = 0; index < sentences.length; index += targetChunkSize) {
    const chunkSentences = sentences.slice(index, index + targetChunkSize);
    chunks.push({
      chunkId: chunks.length + 1,
      sourceSentenceIds: chunkSentences.map((sentence) => sentence.id),
      text: chunkSentences.map((sentence) => `[S${sentence.id}] ${sentence.content}`).join('\n')
    });
  }
  return chunks;
}

function fakeTranslate(sentence, providerLabel) {
  const prefix = `${providerLabel}:`;
  const mirrored = sentence
    .split(' ')
    .map((word) => word.split('').reverse().join(''))
    .join(' ');
  return `${prefix} ${mirrored}`;
}

function generateCandidates() {
  const chunks = buildChunkedPromptMetadata(state.sourceSentences);
  const context = state.context.trim();
  state.candidatesByProvider = {};

  providers.forEach((provider) => {
    if (!state.selectedProviderIds.has(provider.id)) {
      return;
    }

    const candidates = [];
    chunks.forEach((chunk) => {
      chunk.sourceSentenceIds.forEach((sentenceId) => {
        const sentence = state.sourceSentences.find((item) => item.id === sentenceId);
        if (!sentence) {
          return;
        }

        const translated = fakeTranslate(sentence.content, provider.label);
        candidates.push({
          providerId: provider.id,
          providerLabel: provider.label,
          sourceIds: [sentence.id],
          translatedText: context ? `${translated} (${context.slice(0, 32)}...)` : translated
        });
      });
    });

    state.candidatesByProvider[provider.id] = candidates;
  });
}

function renderProviderToggles() {
  el.providerToggles.innerHTML = '';
  providers.forEach((provider) => {
    const wrapper = document.createElement('label');
    wrapper.className = 'toggle-item';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state.selectedProviderIds.has(provider.id);
    input.addEventListener('change', () => {
      if (input.checked) {
        state.selectedProviderIds.add(provider.id);
      } else {
        state.selectedProviderIds.delete(provider.id);
      }
    });

    wrapper.append(input, document.createTextNode(provider.label));
    el.providerToggles.append(wrapper);
  });
}

function renderSentences() {
  el.sourceSentences.innerHTML = '';
  state.sourceSentences.forEach((sentence, index) => {
    const node = el.sentenceTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.sentenceId = String(sentence.id);
    node.textContent = `[S${sentence.id}] ${sentence.content}`;

    if (state.selectedSourceIndex === index) {
      node.classList.add('selected');
    }

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
  const items = el.candidateList.querySelectorAll('.candidate');
  items.forEach((item) => {
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
  const matchingCandidates = Object.values(state.candidatesByProvider)
    .flat()
    .filter((candidate) => candidate.sourceIds.includes(selected.id));

  if (matchingCandidates.length === 0) {
    el.candidateList.textContent = 'No candidates yet. Click "Refresh candidates".';
    return;
  }

  matchingCandidates.forEach((candidate) => {
    const node = el.candidateTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.sourceIds = candidate.sourceIds.join(',');
    node.querySelector('.provider-name').textContent = candidate.providerLabel;
    node.querySelector('.mapping').textContent = `S${candidate.sourceIds.join(',S')} → T1`;
    node.querySelector('.candidate-text').textContent = candidate.translatedText;
    node.title = `Source: ${candidate.providerLabel}`;

    node.addEventListener('click', () => {
      const snippet = candidate.translatedText;
      el.editorOutput.setRangeText(`${snippet}\n`, el.editorOutput.selectionStart, el.editorOutput.selectionEnd, 'end');
      state.editorText = el.editorOutput.value;
      renderPreview();
    });

    el.candidateList.append(node);
  });
}

function renderPreview() {
  const source = el.editorOutput.value;
  const html = source
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br />');
  el.previewOutput.innerHTML = html;
}

function saveWorkspace() {
  const snapshot = {
    sourceText: el.sourceInput.value,
    context: el.contextInput.value,
    sourceSentences: state.sourceSentences,
    selectedSourceIndex: state.selectedSourceIndex,
    selectedProviderIds: [...state.selectedProviderIds],
    candidatesByProvider: state.candidatesByProvider,
    editorText: el.editorOutput.value
  };

  localStorage.setItem('augmented-translator-state', JSON.stringify(snapshot));
}

function loadWorkspace() {
  const raw = localStorage.getItem('augmented-translator-state');
  if (!raw) {
    return;
  }

  const snapshot = JSON.parse(raw);
  state.sourceSentences = snapshot.sourceSentences || [];
  state.selectedSourceIndex = snapshot.selectedSourceIndex;
  state.selectedProviderIds = new Set(snapshot.selectedProviderIds || providers.map((provider) => provider.id));
  state.candidatesByProvider = snapshot.candidatesByProvider || {};

  el.sourceInput.value = snapshot.sourceText || '';
  el.contextInput.value = snapshot.context || '';
  el.editorOutput.value = snapshot.editorText || '';

  renderProviderToggles();
  renderSentences();
  renderCandidates();
  renderPreview();
}

function exportEditorText() {
  const blob = new Blob([el.editorOutput.value], { type: 'text/plain;charset=utf-8' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = 'translation-editor-output.txt';
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

el.segmentSource.addEventListener('click', () => {
  state.sourceSentences = segmentText(el.sourceInput.value);
  state.selectedSourceIndex = state.sourceSentences.length ? 0 : null;
  renderSentences();
  renderCandidates();
});

el.refreshCandidates.addEventListener('click', () => {
  generateCandidates();
  renderCandidates();
});

el.contextInput.addEventListener('change', () => {
  state.context = el.contextInput.value;
});

el.editorOutput.addEventListener('input', () => {
  state.editorText = el.editorOutput.value;
  renderPreview();
});

el.saveState.addEventListener('click', saveWorkspace);
el.loadState.addEventListener('click', loadWorkspace);
el.exportEditor.addEventListener('click', exportEditorText);

el.togglePreview.addEventListener('click', () => {
  el.previewPane.classList.toggle('hidden');
});

renderProviderToggles();
renderPreview();
