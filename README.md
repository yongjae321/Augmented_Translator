# Augmented_Translator

Browser-based translator editor prototype with sentence traceability and multi-provider candidate aggregation.

## New workflow highlights

- Explicit **Request translation** button (uses segmented source + metadata/context).
- Per-provider **status bulbs**: idle, in-progress, done, error.
- Collapsable **API providers** panel.
  - Each provider row is collapsable and shows name + selection checkbox in summary.
  - You can edit API key/base URL/model.
  - You can delete providers.
  - You can add providers (e.g., Grok) dynamically.
- Collapsable **Context** panel.
  - Separate invariant fields: book title, author.
  - Additional fields: style notes, chapter summary.
  - **Generate summary** flow with selected provider.
  - After summary generation, app asks whether to auto-populate section (1) Original text.

## Translation request behavior

When you click **Request translation**:

1. The app requires segmented source text.
2. It builds chunked source requests (to preserve context quality).
3. It appends context metadata (book title, author, summary, style notes).
4. It requests selected providers and shows live provider status.
5. It aligns chunk outputs back to source sentence IDs and renders candidates.

## API notes

- Built-in provider adapters exist for ChatGPT, Claude, Gemini, Google Translate, and DeepL.
- If live API is disabled or key is empty, the app falls back to deterministic mock responses.
- This is still a client-side prototype. In production, place API calls behind your backend.

## Run

Open `index.html` in a modern browser.
