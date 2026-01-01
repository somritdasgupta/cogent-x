# Cogent-X

Enterprise RAG platform for intelligent, private knowledge bases. Ask questions about your documentation and get AI-powered answers with source references.

## Quick Start

```bash
bash run.sh
```

First run: 3-5 minutes | Subsequent runs: Instant

### Access

- App: http://localhost:8080
- API: http://localhost:8000
- Docs: http://localhost:8000/api/docs

## Prerequisites

- Python 3.9+
- Node.js 18+
- FFmpeg (for audio)

## Configuration

### AI Providers

Settings → Providers:

**Ollama (Local)** - Privacy, no costs
- URL: http://localhost:11434
- Model: llama3:8b

**OpenAI** - Best quality
- API Key: [platform.openai.com](https://platform.openai.com/api-keys)
- Model: gpt-4 or gpt-3.5-turbo

**Gemini** - Balanced
- API Key: [makersuite.google.com](https://makersuite.google.com/app/apikey)
- Model: gemini-pro

### Environment

Copy `.env.example` to `.env` and configure:

```env
API_HOST=0.0.0.0
API_PORT=8000
VECTOR_DB_DIRECTORY=./vector_db
EMBEDDING_MODEL_NAME=BAAI/bge-large-en-v1.5

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3:8b

# Optional
# OPENAI_API_KEY=sk-proj-...
# GEMINI_API_KEY=AIzaSy...
```

## Usage

### Ingest Documentation

**UI:** Documents → Enter URL → Ingest

**API:**
```bash
curl -X POST "http://localhost:8000/api/v1/ingest" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://docs.python.org/3/"}'
```

### Ask Questions

Type your question or use Quick Prompts:
- "How do I get started?"
- "Show me a code example"
- "Show me the database schema"
- "Troubleshooting common errors"

## Deployment

### Docker

```bash
docker-compose up --build
```

Services: Frontend (3000), Backend (8000), Ollama (11434)

### Render

**Backend:**
- Build: `bash run.sh backend`
- Start: `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT`
- Add env vars from `.env.example`

**Frontend:**
- Build: `npm install && npm run build`
- Publish: `dist`
- Set: `VITE_API_BASE_URL=<backend-url>`

### Vercel

```bash
vercel
```

Set: `VITE_API_BASE_URL=<backend-url>`

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/ingest` | Ingest documentation |
| POST | `/api/v1/ask` | Ask question |
| GET | `/api/v1/health` | Health check |
| GET/POST | `/api/v1/config` | Configuration |

**Example:**
```bash
curl -X POST "http://localhost:8000/api/v1/ask" \
  -H "Content-Type: application/json" \
  -d '{"query": "How do I install packages?", "provider": "openai"}'
```

Docs: http://localhost:8000/docs

## Stack

**Frontend:** React 18, TypeScript, Vite, shadcn/ui, Tailwind

**Backend:** FastAPI, FAISS, Sentence Transformers, WhisperX

**AI:** Ollama, OpenAI GPT, Google Gemini

## Troubleshooting

**LLM Disconnected:**
```bash
ollama list
ollama pull llama3:8b
```

**Ingestion Failed:**
- Check URL accessibility
- Verify `vector_db` write permissions
- Check logs: `docker logs cogent-x-backend-1`

**Port In Use:**
```bash
# Linux/Mac
lsof -ti:8000 | xargs kill -9

# Windows
netstat -ano | findstr :8000
taskkill /F /PID <PID>
```

## Performance

- Ollama: 7B models (speed) vs 13B+ (quality)
- OpenAI: gpt-3.5-turbo (fast) vs gpt-4 (quality)
- Storage: SSD recommended

## Contributing

1. Fork repository
2. Create branch: `git checkout -b feature-name`
3. Commit: `git commit -am 'Add feature'`
4. Push: `git push origin feature-name`
5. Submit PR

Standards: Self-documenting code, TypeScript, test with all providers

## License

MIT License

## Author

Somrit Dasgupta - [GitHub](https://github.com/somritdasgupta) | [LinkedIn](https://linkedin.com/in/somritdasgupta)
