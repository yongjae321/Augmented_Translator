# Augmented_Translator

A lightweight browser-based prototype for a translator-focused editor that combines multiple AI and MT engines and keeps sentence-level traceability.

## What this prototype includes

- A configurable provider list for:
  - AI systems: ChatGPT, Claude, Gemini
  - Translation engines: Google Translate, DeepL
- A three-pane editor layout:
  1. **Original text** pane with sentence segmentation and sentence selection
  2. **Candidate translations** pane showing provider-specific options for the selected source sentence
  3. **Editable translation** pane for composing the final text
- Optional fourth pane: **markup preview** rendered from editor text
- Candidate-to-source mapping display (`Sx -> Ty`) and hover highlighting
- Workspace save/load (source text, provider selection, candidates, selected sentence, editor text) via `localStorage`
- Separate editor export to plaintext file

> Note: API calls are currently stubbed with deterministic fake translations so the UI and data model can be validated locally. The provider abstraction is intentionally structured so real APIs can be plugged in.

## Context-aware translation strategy (recommended)

To preserve context while keeping sentence traceability:

1. Segment source text into sentence IDs (`S1`, `S2`, ...).
2. Submit **chunked requests** (e.g., 8-15 sentences or token-budgeted chunks), not single-sentence requests.
3. Include context metadata in every request (book title, author, chapter summary, glossary, style brief).
4. Ask providers to return machine-readable alignments:
   - `source_sentence_ids` (one or many)
   - `target_text`
   - `target_sentence_ids` (one or many)
5. Post-process to normalize/provider-align and render mappings in UI.

This balances context quality with sentence-level mapping visibility.

## Running

Open `index.html` in a modern browser.

No build step is required.

## Next implementation step for real APIs

Replace `fakeTranslate(...)` in `app.js` with provider adapters, for example:

- `translateWithOpenAI(chunk, context)`
- `translateWithClaude(chunk, context)`
- `translateWithGemini(chunk, context)`
- `translateWithGoogleMT(chunk, context)`
- `translateWithDeepL(chunk, context)`

Each should return a normalized list of candidate mappings so the UI remains provider-agnostic.
