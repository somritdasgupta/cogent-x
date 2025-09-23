# Technical Documentation

## System Specifications

### Frontend Architecture

- **Framework**: React 18.3.1 with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **Styling**: Tailwind CSS with custom design system
- **UI Components**: Radix UI primitives with shadcn/ui
- **State Management**: React hooks (useState, useEffect)
- **HTTP Client**: Fetch API for backend communication
- **Routing**: React Router DOM for navigation

### Backend Architecture

- **Framework**: FastAPI 0.104.1 (Python)
- **ASGI Server**: Uvicorn 0.24.0
- **Data Validation**: Pydantic 2.5.0
- **Vector Database**: ChromaDB 0.4.15
- **ML Framework**: LangChain 0.0.350
- **Embeddings**: Sentence Transformers 2.2.2
- **AI Providers**: OpenAI 1.6.1, Google Generative AI 0.3.2

## API Endpoints

### Health Check

```http
GET /api/v1/health
```

**Response**:

```json
{
  "backend": true,
  "llm": false,
  "vectorDB": true
}
```

### Document Ingestion

```http
POST /api/v1/ingest
Content-Type: application/json

{
  "url": "https://example.com/document.pdf"
}
```

### Query Documents

```http
POST /api/v1/ask
Content-Type: application/json

{
  "query": "What is the main topic of the document?",
  "provider": "openai" | "gemini" | "opensource"
}
```

## Environment Configuration

### Required Environment Variables

```bash
# AI Provider API Keys
OPENAI_API_KEY=sk-your-openai-key
GEMINI_API_KEY=your-gemini-key

# Ollama Configuration
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=llama2

# Vector Database
EMBEDDING_MODEL_NAME=all-MiniLM-L6-v2
CHROMA_PERSIST_DIRECTORY=/app/chroma_db

# API Configuration
API_HOST=0.0.0.0
API_PORT=8000
```

## Database Schema

### ChromaDB Collections

```python
# Documents Collection
collection_name: "documents"
metadata_fields: {
    "source_url": str,
    "chunk_index": int,
    "document_title": str,
    "ingestion_timestamp": str
}
embedding_function: SentenceTransformers("all-MiniLM-L6-v2")
```

## AI Provider Integration

### OpenAI Integration

```python
from openai import OpenAI

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
response = client.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": query}
    ]
)
```

### Google Gemini Integration

```python
import google.generativeai as genai

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel('gemini-pro')
response = model.generate_content(query)
```

### Ollama Integration

```python
import requests

response = requests.post(
    f"{OLLAMA_BASE_URL}/api/generate",
    json={
        "model": OLLAMA_MODEL,
        "prompt": query,
        "stream": False
    }
)
```

## Vector Search Implementation

### Document Chunking Strategy

- **Chunk Size**: 1000 characters
- **Overlap**: 200 characters
- **Method**: Recursive character splitting
- **Separators**: ["\n\n", "\n", " ", ""]

### Embedding Process

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer('all-MiniLM-L6-v2')
embeddings = model.encode(text_chunks)

# Store in ChromaDB
collection.add(
    documents=text_chunks,
    embeddings=embeddings,
    metadatas=metadata_list,
    ids=chunk_ids
)
```

### Similarity Search

```python
# Query vector database
results = collection.query(
    query_texts=[user_query],
    n_results=5,
    include=["documents", "metadatas", "distances"]
)
```

## Performance Optimizations

### Frontend Optimizations

- Component lazy loading with React.lazy()
- Memoization using React.memo() for expensive renders
- Debounced search inputs to reduce API calls
- Optimistic UI updates for better user experience

### Backend Optimizations

- Async/await pattern for non-blocking I/O
- Connection pooling for database connections
- Caching of embeddings to avoid recomputation
- Batch processing for multiple document ingestion

### Database Optimizations

- Efficient vector indexing in ChromaDB
- Metadata filtering for faster queries
- Persistent storage to avoid reindexing
- Optimized embedding dimensions (384 for all-MiniLM-L6-v2)

## Security Considerations

### API Security

- Input validation using Pydantic models
- Rate limiting to prevent abuse
- CORS configuration for frontend access
- Environment variable protection for API keys

### Data Privacy

- No persistent user data storage
- Temporary document processing only
- Configurable data retention policies
- Local deployment option for sensitive documents

## Monitoring and Logging

### Health Monitoring

- Real-time service status checks
- Provider availability monitoring
- Vector database connection monitoring
- API response time tracking

### Error Handling

```python
try:
    response = await ai_provider.generate(query)
except APIError as e:
    logger.error(f"AI Provider error: {e}")
    raise HTTPException(status_code=502, detail="AI service unavailable")
except ValidationError as e:
    logger.error(f"Validation error: {e}")
    raise HTTPException(status_code=400, detail="Invalid request")
```

## Scalability Architecture

### Horizontal Scaling

- Stateless backend design for multiple instances
- Load balancer configuration for high availability
- Distributed vector database deployment
- CDN integration for frontend assets

### Vertical Scaling

- Configurable worker processes
- Memory optimization for large documents
- GPU acceleration support for embeddings
- Efficient resource utilization patterns
