# Anthropic Models Manager

> Centralized model management and A/B testing dashboard for Claude AI integrations

A comprehensive dashboard for managing multiple Anthropic Claude models, running A/B tests, and monitoring AI performance across BrassHelm applications.

## 🎯 Live Demo

**[Try it now: anthropic.cameronobrien.dev](https://anthropic.cameronobrien.dev)**

Fully automated, hands-off Claude model management. A daily cron checks Anthropic's API for new models and automatically updates the database. All 10+ production apps make live API calls to fetch the current model—no manual updates, no redeployments needed. When Anthropic releases a new model, it's detected and deployed automatically.

## Tech Stack

- **TypeScript** - Type-safe development
- **Vercel Edge Functions** - Serverless API endpoints
- **Neon PostgreSQL** - Model configuration storage
- **Anthropic Claude AI** - AI model integration
- **Vanilla JavaScript** - Frontend UI

## Features

- **Fully Automated Model Detection** - Daily cron syncs with Anthropic API to detect new models
- **Zero-Touch Updates** - New models are automatically marked as current, all apps instantly use them
- **Live API Calls** - Production apps fetch current model on each request (no redeployment needed)
- **A/B Testing** - Compare model performance across variants
- **Usage Analytics** - Track API calls and costs per project
- **Performance Monitoring** - Response times and quality metrics
- **Cost Optimization** - Monitor and optimize API usage across all apps

## Setup

### Prerequisites
- Node.js 18+
- Anthropic API key
- Neon database
- Vercel account

### Installation

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Add your Anthropic API key and database URL

# Seed initial models (optional)
npm run seed

# Start development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to access the dashboard.

## Available Scripts

- `npm run dev` - Start Vercel dev server
- `npm run build` - Build TypeScript
- `npm run deploy` - Deploy to Vercel production
- `npm run seed` - Seed database with initial models
- `npm test` - Run tests (coming soon)

## Environment Variables

See `.env.example` for required configuration:
- `ANTHROPIC_API_KEY` - Claude AI API key
- `DATABASE_URL` - Neon PostgreSQL connection string
- `VERCEL_URL` - Deployment URL (auto-set by Vercel)

## API Endpoints

### Model Management
- `GET /api/models` - List all configured models
- `POST /api/models` - Add new model configuration
- `PUT /api/models/:id` - Update model settings
- `DELETE /api/models/:id` - Remove model

### A/B Testing
- `POST /api/test/create` - Create new A/B test
- `GET /api/test/results` - View test results
- `POST /api/test/compare` - Compare model variants

### Analytics
- `GET /api/analytics/usage` - API usage statistics
- `GET /api/analytics/costs` - Cost breakdown

## Project Structure

```
├── api/                  # Vercel Edge Functions
│   ├── models/          # Model management endpoints
│   ├── test/            # A/B testing endpoints
│   └── analytics/       # Analytics endpoints
├── dist/                # TypeScript build output
├── scripts/             # Utility scripts
│   └── seed-models.js   # Database seeding
└── index.html           # Dashboard UI
```

## Usage

### Managing Models

Configure Claude models with different parameters:
- Model version (claude-3-opus, claude-3-sonnet, etc.)
- Temperature settings
- Max tokens
- System prompts

### A/B Testing

Compare model performance:
1. Create test with multiple model variants
2. Route traffic between variants
3. Collect metrics (response time, quality, cost)
4. Analyze results and optimize

## Deployment

Deploy to Vercel:

```bash
npm run deploy
```

Configure environment variables in Vercel dashboard.

## License

ISC - Private
