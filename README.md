# Fixbot

AI-powered task management from Slack. Mention @Fixbot in any channel to automatically extract tasks, prioritize them, and add them to your Kanban board.

## Features

- **Slack Integration**: @mention Fixbot to create tasks from any message
- **AI Task Extraction**: Automatically extracts title, priority, type, and code context
- **Kanban Dashboard**: Visual task board with drag-and-drop (coming soon)
- **Multi-Workspace**: Support multiple Slack teams with separate repos
- **Claude Code Ready**: Tasks include code context for automated fixes

## Tech Stack

- **Frontend**: Next.js 16, React 19, shadcn/ui (base-ui)
- **Backend**: Convex (real-time database + serverless functions)
- **AI**: Claude via Convex Agents (@convex-dev/agent)
- **Auth**: GitHub OAuth

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up Convex

```bash
pnpm convex dev
```

This will:
- Create a new Convex project (or connect to existing)
- Generate `convex/_generated/` files
- Give you your deployment URL (e.g., `https://helpful-horse-123.convex.site`)

### 3. Create Slack App (one-click via manifest)

1. Open `slack-app-manifest.yaml`
2. Replace `YOUR_CONVEX_URL` with your Convex deployment name (e.g., `helpful-horse-123`)
3. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From a manifest**
4. Select your workspace, paste the YAML, create the app
5. Click **Install to Workspace**

### 4. Configure environment variables

In the [Convex Dashboard](https://dashboard.convex.dev), add these environment variables:

| Variable | Where to find it |
|----------|-----------------|
| `SLACK_CLIENT_ID` | Slack App → Basic Information → App Credentials |
| `SLACK_CLIENT_SECRET` | Slack App → Basic Information → App Credentials |
| `SLACK_SIGNING_SECRET` | Slack App → Basic Information → App Credentials |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/) |

Also add to `.env.local`:
```env
NEXT_PUBLIC_CONVEX_URL=https://YOUR_DEPLOYMENT.convex.cloud
NEXT_PUBLIC_APP_URL=http://localhost:3000

# GitHub OAuth (create at github.com/settings/developers)
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

### 5. Run the app

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

## Usage

1. **Login** with GitHub
2. **Create a workspace** (connects to your Slack team)
3. **Invite Fixbot** to a channel: `/invite @Fixbot`
4. **Create tasks**: `@Fixbot The login button is broken on mobile`

Fixbot will:
- Extract task details using AI
- Create a task in your Kanban board
- Reply in Slack with the task ID and link

## Project Structure

```
├── src/
│   ├── app/                 # Next.js pages
│   │   ├── w/[slug]/       # Workspace Kanban view
│   │   └── login/          # GitHub OAuth login
│   ├── components/
│   │   ├── kanban/         # Kanban board components
│   │   └── ui/             # shadcn/ui components
│   └── hooks/              # React hooks (useAuth, etc.)
├── convex/
│   ├── schema.ts           # Database schema
│   ├── http.ts             # Slack webhook endpoints
│   ├── slack.ts            # Slack event handlers
│   ├── ai.ts               # AI task extraction
│   ├── agents/             # Convex Agents
│   └── *.ts                # Queries & mutations
└── slack-app-manifest.yaml # One-click Slack app setup
```

## License

MIT
