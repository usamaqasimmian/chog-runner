# Chog Runner (no-build edition)

A Chrome Dino–style endless runner where a **Chog** chases a **Monad** coin.  
This version is **pure HTML + JS** — no Node, no build. Just download and double‑click `index.html`.

## Play locally
1. **Download ZIP** (from GitHub) and extract.
2. Double‑click **`index.html`** (or `Open With → your browser`).
3. Controls: **Space/↑** jump, **↓** duck, **R** restart. Tap to jump on mobile.

> Scores are saved to your browser via `localStorage`.

## Repo layout
```
chog-runner-standalone/
├─ index.html
├─ chog-runner.js
├─ README.md
└─ LICENSE
```

## Hosting (optional)
Any static host works (GitHub Pages, Netlify, Vercel, etc.).  
For GitHub Pages:
1. Push this folder to a repo (e.g. `sabhee/chog-runner`).
2. In repo **Settings → Pages**, choose **Deploy from branch**, branch: `main`, folder: `/root`.
3. Your game will be live at `https://<your-username>.github.io/<repo>/`.

## Credits & License
- Game code by you + ChatGPT 🤝
- License: MIT (see `LICENSE`).
