# CodeAtlas

**Navigate any codebase like a map.**

CodeAtlas turns a GitHub repository into an interactive architecture diagram. Paste `owner/repo` or a GitHub URL and it reads the repository's structure, asks an LLM to work out the main components and how they connect, draws them as a clickable diagram, writes a short walkthrough, and lets you ask questions about the codebase.

---

## What it does

- **Architecture diagram.** Entry points, services, data, auth, tests, docs and more, grouped and connected with edges, rendered with Mermaid.
- **Click through to source.** Every node opens the real file or folder on GitHub in a new tab.
- **Streamed walkthrough.** A written overview of how the pieces fit together, streamed live while the diagram is built.
- **File explorer.** The full file tree next to the diagram.
- **Ask about the repo.** A chat panel that answers questions using the finished diagram, the repository stats and a keyword search over the real file tree.
- **Pan, zoom and export.** Fit to view, fullscreen, copy the Mermaid source, export PNG (2x) or SVG, light and dark theme.
- **Accounts and history.** Sign in with Google or GitHub. Your diagrams are saved to your account and listed on the home page, and you can clear them.
- **Private repositories.** Paste your own GitHub personal access token to diagram repos you can access (see [Private repositories](#private-repositories)).

### Guests vs. signed-in users

| | Guest | Signed in |
|---|---|---|
| Diagram the example repos (`fastapi/fastapi`, `streamlit/streamlit`, `pallets/flask`, `axios/axios`) | Yes | Yes |
| Diagram any other public repo | No (asks you to sign in) | Yes |
| Saved history | No | Yes |
| Repo chat | No | Yes |

---

## How it works

1. **Read the repo.** The backend fetches the file tree, manifests (such as `package.json`) and the README through the GitHub API. Nothing is cloned. Large repositories use a representative subset.
2. **Analyze.** It measures real facts: file and folder counts, language mix, detected frameworks, test and doc files, likely entry points, and a list of candidate paths worth showing.
3. **Build the graph.** The LLM (Groq, model `openai/gpt-oss-120b`) picks components from the candidate paths only, assigns roles, groups them and draws edges. Output is constrained by a JSON schema and then validated. Paths, file counts and directory flags always come from the real data, never from the model. If the model returns bad JSON, the backend retries once.
4. **Explain.** A walkthrough is streamed to the browser over Server-Sent Events while the diagram renders.
5. **Chat.** Questions are answered from the final graph, the stats and a keyword search over the real tree. The chat does not read file contents.

Progress is real, not simulated. The generate endpoint streams events: `stage`, `context`, `graph`, `explanation`, `done` and `fail`.

---

## Tech stack

| Area | Tools |
|---|---|
| Frontend | React, Vite, TypeScript, Tailwind CSS, Mermaid, lucide-react |
| Backend | Node.js, Express 4, TypeScript, Zod |
| LLM | Groq (`openai/gpt-oss-120b`) |
| Auth | Auth0 (Google and GitHub social login), JWT verification with `express-oauth2-jwt-bearer` |
| Database | Neon (serverless Postgres) via `pg` |
| Data source | GitHub REST API |

---

## Project structure

```
codeatlas/
├── package.json              # runs frontend and backend together
├── LICENSE
├── frontend/
│   ├── .env.example
│   └── src/
│       ├── App.tsx, main.tsx, index.css
│       ├── components/       # Landing, DiagramPage, MermaidCanvas, RepoChat,
│       │                     # FileExplorer, Header, AuthDialog, icons
│       ├── hooks/            # useGenerate (drives the SSE stream)
│       ├── lib/              # api, store, mermaid, github, authToken,
│       │                     # githubToken, types
│       └── utils/            # small helpers
└── backend/
    ├── .env.example
    ├── scripts/              # dev scripts for testing the pipeline
    └── src/
        ├── index.ts          # Express app and route mounting
        ├── config/env.ts     # validated environment variables
        ├── middleware/       # auth (JWT), errorHandler
        ├── routes/           # generate, chat, diagrams, me, repo, health
        ├── services/         # GitHub fetching, repo analysis, graph +
        │                     # walkthrough + chat (Groq), tree search
        ├── lib/              # db pool, repo cache, request schemas,
        │                     # language and stack detection
        ├── schemas/ types/   # graph schema and shared types
        └── db/               # schema.sql and migrate.ts
```

---

## Getting started

### Prerequisites

- Node.js 20.19+ (or 22.12+) and npm
- A [Groq](https://console.groq.com) API key
- An [Auth0](https://auth0.com) tenant
- A [Neon](https://neon.tech) Postgres database
- Optional: a GitHub token, to raise the GitHub API rate limit above 60 requests/hour

### 1. Install

From the repository root:

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```

### 2. Configure the backend

```bash
cp backend/.env.example backend/.env
```

On Windows PowerShell, use `Copy-Item backend/.env.example backend/.env`.

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes | Groq API key |
| `GROQ_MODEL` | No | Defaults to `openai/gpt-oss-120b` |
| `AUTH0_DOMAIN` | Yes | Your Auth0 tenant domain |
| `AUTH0_AUDIENCE` | Yes | The Auth0 API identifier |
| `DATABASE_URL` | Yes | Neon connection string |
| `GITHUB_TOKEN` | No | Server-side token for public-repo rate limits (read-only public access is enough) |
| `FRONTEND_ORIGIN` | No | Allowed CORS origin, defaults to `http://localhost:5173` |
| `PORT` | No | Defaults to `4000` |

### 3. Configure the frontend

Copy `frontend/.env.example` to `frontend/.env` and fill it in:

```
VITE_API_BASE_URL=http://localhost:4000
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=your_auth0_client_id
VITE_AUTH0_AUDIENCE=your_api_identifier
```

### 4. Set up Auth0

1. Create a **Single Page Application**. Add `http://localhost:5173` to Allowed Callback URLs, Allowed Logout URLs and Allowed Web Origins.
2. Create an **API** whose identifier matches `AUTH0_AUDIENCE`.
3. Under **Authentication → Social**, enable **Google** and **GitHub** and turn them on for your application. For production, use your own GitHub OAuth app, with its callback set to `https://YOUR_TENANT/login/callback`.

### 5. Create the database tables

```bash
npm run db:migrate --prefix backend
```

This applies `backend/src/db/schema.sql`. It is safe to run more than once.

### 6. Run

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:4000 (health check at `/api/health`)

Diagrams have shareable addresses like `http://localhost:5173/#/owner/repo`.

---

## Private repositories

CodeAtlas can diagram private repos you have access to:

1. Create a GitHub personal access token with the `repo` scope.
2. Click **Access token** in the header and paste it.
3. Generate the diagram for your private repo while signed in.

The token is kept in your browser's local storage and sent as an `X-Github-Token` header only on generate requests. The server uses it for that request and never stores it. It is removed when you sign out. Note that the `repo` scope also allows write access, so use a token you are comfortable with and revoke it when you are done.

---

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | none | Health check |
| GET | `/api/generate/:owner/:repo` | guests on the 4 example repos, otherwise required | Streams the diagram and walkthrough (SSE) |
| POST | `/api/chat/:owner/:repo` | required | Streams a chat answer (SSE) |
| GET | `/api/diagrams` | required | Your saved diagram history |
| DELETE | `/api/diagrams` | required | Delete all your saved diagrams |
| DELETE | `/api/diagrams/:owner/:repo` | required | Delete one saved diagram |
| POST | `/api/me` | required | Create or update your user record |

Authenticated requests send `Authorization: Bearer <Auth0 access token>`.

---

## Scripts

From the repository root:

| Command | What it does |
|---|---|
| `npm run dev` | Runs frontend and backend together |
| `npm run db:migrate --prefix backend` | Applies the database schema |
| `npm run build --prefix backend` | Compiles the backend to `backend/dist` |
| `npm start --prefix backend` | Runs the compiled backend |
| `npx tsc --noEmit` | Type-check (run inside `frontend/` or `backend/`) |

---

## Deployment

CodeAtlas is designed to run with the frontend on a static host such as **Vercel** and the backend on a Node host such as **Render**, with the database on **Neon**.

- Backend environment variables: the ones in the table above, with `FRONTEND_ORIGIN` set to your exact frontend URL.
- Frontend environment variables: `VITE_API_BASE_URL` pointing at the backend, plus the Auth0 values.
- In Auth0, add your production URL to the allowed callback, logout and web origin lists.
- In your GitHub OAuth app, update the homepage URL to the production site.

---

## Limitations

- The LLM can make mistakes in descriptions, so treat the diagram and chat answers as a starting point and verify anything important.
- Very large repositories are analyzed from a representative subset of files.
- The chat reasons from the diagram, stats and file paths. It does not read file contents.
- Groq's free tier has token-per-minute limits, so you may occasionally be asked to retry after a short wait.
- Google and GitHub logins are separate accounts. Accounts are not linked, so history is not shared between them.

---

## Security notes

- Never commit `backend/.env` or any API keys or tokens.
- Your GitHub access token is only used for the request it is sent with and is never stored on the server.
- API keys and the database connection string live only in the backend's environment variables.