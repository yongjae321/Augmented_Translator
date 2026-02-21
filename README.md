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

## Local run

### Option A: open directly

Open `index.html` in a modern browser.

### Option B: run bundled local server

```bash
npm start
```

The app will be served at `http://localhost:8080` (or `PORT` env override).

## Deployment

Because this project is static files plus an optional tiny Node server, deploy in one of the following ways.

### 1) Static hosting (GitHub Pages / Netlify / Cloudflare Pages / Vercel static)

- Build command: **none**
- Publish directory: repository root (`.`)
- Entry file: `index.html`

### 2) Container deployment (Render / Railway / Fly.io / ECS / Cloud Run)

Build and run:

```bash
docker build -t augmented-translator .
docker run --rm -p 8080:8080 augmented-translator
```

Then open `http://localhost:8080`.

### 3) Node process deployment

```bash
npm start
```

Set environment variable `PORT` if your host requires it.

## Resolving GitHub PR conflicts (README.md, app.js, index.html, styles.css)

If GitHub reports conflicts on this branch, resolve them from the command line:

```bash
# from this repo

git fetch origin

git checkout work

git merge origin/main

# resolve conflicts in:
# - README.md
# - app.js
# - index.html
# - styles.css

# after editing conflict markers:

git add README.md app.js index.html styles.css

git commit -m "Resolve merge conflicts with main"

git push origin work
```

Quick checks before pushing:

```bash
node --check app.js
git diff --check
```

Tip: search for conflict markers to ensure none remain:

```bash
rg "^(<<<<<<<|=======|>>>>>>>)" README.md app.js index.html styles.css
```
