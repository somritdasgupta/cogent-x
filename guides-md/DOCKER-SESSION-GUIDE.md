# Docker Deployment with Session Isolation

## Overview

The Cogent-X RAG system uses **session-based isolation** to ensure each user's data remains private. This guide explains how sessions work in Docker deployments.

## Docker Configuration Status ✅

### Updated Files

#### 1. `nginx.conf` ✅
**Added X-Session-Id header forwarding:**
```nginx
location /api/ {
    proxy_pass http://backend:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Forward custom session header for session isolation
    proxy_set_header X-Session-Id $http_x_session_id;
    
    # Enable passing of all request headers
    proxy_pass_request_headers on;
}
```

**Why:** Ensures nginx forwards the X-Session-Id header from frontend to backend.

#### 2. `docker-compose.yml` ✅
**Added session documentation comment:**
```yaml
volumes:
  - ./vector_db:/app/vector_db
  - ./backend/config:/app/config
  # Note: Session data is stored in-memory for privacy
  # Sessions are isolated per user and expire after 24h
  # To persist sessions across restarts, implement disk-backed SessionManager
```

**Why:** Documents that sessions are ephemeral by design.

#### 3. `Dockerfile` (Frontend) ✅
**No changes needed** - Frontend session code is compiled into JavaScript bundle.

#### 4. `backend/Dockerfile` ✅
**No changes needed** - Backend session code is in main.py, ffmpeg already installed.

## How Sessions Work in Docker

### Architecture

```
Browser (localStorage)
    ↓ X-Session-Id: abc123
nginx (port 80)
    ↓ Forwards X-Session-Id
Backend (port 8000)
    ↓ SessionManager
In-Memory Session Store
    ├─ Session abc123: VectorDB
    ├─ Session def456: VectorDB
    └─ Session ghi789: VectorDB
```

### Session Lifecycle in Docker

1. **User Opens App**
   - Frontend checks localStorage for session ID
   - Creates new UUID if none exists
   - Stores in browser localStorage

2. **User Makes Request**
   - Frontend adds `X-Session-Id` header
   - nginx forwards header to backend
   - Backend SessionManager gets/creates isolated database

3. **Container Restart**
   - All in-memory sessions are lost
   - Frontend keeps session ID in localStorage
   - Backend creates fresh empty session for that ID
   - **Result:** User's data appears "cleared"

### Session Persistence Behavior

| Scenario | Session Data | Session ID |
|----------|--------------|------------|
| Page reload | ✅ Persists | ✅ Persists (localStorage) |
| Browser close/reopen | ✅ Persists | ✅ Persists (localStorage) |
| Container restart | ❌ Lost | ✅ Persists (localStorage) |
| `docker-compose down/up` | ❌ Lost | ✅ Persists (localStorage) |
| New deployment | ❌ Lost | ✅ Persists (localStorage) |
| 24h timeout | ❌ Expires | ✅ Persists (localStorage) |

## Running with Docker

### Development Mode (with docker-compose)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Check session activity
docker-compose exec backend cat /app/backend/logs/sessions.log

# Restart (sessions will be lost)
docker-compose restart backend

# Stop all
docker-compose down
```

**Access:**
- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- API Docs: http://localhost:8000/api/docs

### Production Mode (separate containers)

```bash
# Build frontend
docker build -t cogent-x-frontend .

# Build backend
docker build -t cogent-x-backend ./backend

# Run backend
docker run -d \
  --name cogent-x-backend \
  -p 8000:8000 \
  -v $(pwd)/vector_db:/app/vector_db \
  -v $(pwd)/backend/config:/app/config \
  cogent-x-backend

# Run frontend
docker run -d \
  --name cogent-x-frontend \
  -p 3000:80 \
  --link cogent-x-backend:backend \
  cogent-x-frontend
```

## Adding Session Persistence (Optional)

If you want sessions to survive container restarts, you need to implement disk-backed session storage.

### Option 1: File-Based Session Storage

**Modify `backend/main.py` SessionManager:**

```python
class SessionManager:
    def __init__(self):
        self.sessions_dir = Path("./session_data")
        self.sessions_dir.mkdir(exist_ok=True)
        self.sessions: Dict[str, SessionData] = {}
        self.load_sessions_from_disk()
    
    def save_session_to_disk(self, session_id: str):
        """Save session's VectorDB to disk"""
        session_data = self.sessions[session_id]
        session_path = self.sessions_dir / session_id
        session_path.mkdir(exist_ok=True)
        
        # Save FAISS index
        faiss.write_index(
            session_data.db.index,
            str(session_path / "faiss_index.bin")
        )
        
        # Save metadata
        with open(session_path / "metadata.pkl", "wb") as f:
            pickle.dump({
                "documents": session_data.db.documents,
                "metadatas": session_data.db.metadatas,
                "last_access": session_data.last_access
            }, f)
    
    def load_sessions_from_disk(self):
        """Load all sessions from disk on startup"""
        for session_dir in self.sessions_dir.iterdir():
            if session_dir.is_dir():
                session_id = session_dir.name
                # Load VectorDB from disk...
```

**Update docker-compose.yml:**

```yaml
volumes:
  - ./vector_db:/app/vector_db
  - ./backend/config:/app/config
  - ./session_data:/app/session_data  # NEW: Persist sessions
```

### Option 2: Redis-Based Session Storage

**Add Redis to docker-compose.yml:**

```yaml
services:
  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

**Update backend to use Redis for session metadata (vector data still in-memory).**

### Option 3: Database-Backed Sessions

Use PostgreSQL or MongoDB to store session metadata and serialized vector databases.

## Environment Variables

Create `.env` file:

```bash
# Backend Configuration
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=llama2
EMBEDDING_MODEL_NAME=all-MiniLM-L6-v2

# API Configuration
API_HOST=0.0.0.0
API_PORT=8000

# Vector Database
VECTOR_DB_DIRECTORY=./vector_db

# Session Configuration (optional)
SESSION_TIMEOUT_HOURS=24
SESSION_CLEANUP_INTERVAL_MINUTES=60
```

## Monitoring Sessions

### Check Active Sessions

```bash
# Via API
curl http://localhost:8000/api/v1/admin/sessions

# Via logs
docker-compose logs backend | grep "Session"
```

### Session Statistics

```bash
# Get session info
curl -H "X-Session-Id: your-session-id" \
  http://localhost:8000/api/v1/session/info

# Response:
{
  "session_id": "abc123...",
  "total_documents": 5,
  "total_chunks": 127,
  "last_access": "2025-10-02T15:30:00Z"
}
```

## Troubleshooting

### Issue: Sessions not isolated

**Check nginx is forwarding headers:**
```bash
docker-compose exec frontend cat /etc/nginx/nginx.conf | grep X-Session-Id
```

**Should see:**
```nginx
proxy_set_header X-Session-Id $http_x_session_id;
```

### Issue: Sessions lost immediately

**Check backend logs:**
```bash
docker-compose logs backend | grep SessionManager
```

**Should see:**
```
INFO:main:SessionManager initialized with 24h timeout
INFO:main:Session abc123 created
```

### Issue: CORS errors with X-Session-Id

**Check backend CORS config in `main.py`:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],  # This allows X-Session-Id
    expose_headers=["X-Session-Id"],  # This returns it in response
)
```

## Security Considerations

### Session ID Format
- Uses UUID v4 (cryptographically random)
- 128-bit entropy
- Not guessable

### Session Isolation
- Each session has separate VectorDatabase instance
- No cross-session data leakage
- Memory isolation between sessions

### Session Expiry
- Auto-expires after 24h of inactivity
- Cleanup runs periodically
- Expired sessions are garbage collected

## Performance Considerations

### Memory Usage
- Each session creates separate VectorDatabase in RAM
- Average session: ~50-200 MB depending on ingested documents
- Monitor with: `docker stats cogent-x-backend`

### Recommended Limits
- Small deployment: 10-20 concurrent sessions
- Medium deployment: 50-100 concurrent sessions
- Large deployment: Consider Redis + disk persistence

### Scaling Strategy
1. **Vertical:** Increase container memory
2. **Horizontal:** Multiple backend instances with sticky sessions
3. **Persistence:** Add Redis/DB for session sharing across instances

## Deployment Checklist

- [ ] nginx.conf forwards X-Session-Id header
- [ ] CORS allows X-Session-Id in requests and responses
- [ ] SessionManager timeout configured (default 24h)
- [ ] Volume mounts configured for config persistence
- [ ] Frontend VITE_API_BASE_URL points to correct backend
- [ ] Backend ffmpeg installed for WhisperX
- [ ] Health check endpoint responding
- [ ] Test session isolation with multiple browsers
- [ ] Monitor memory usage under load
- [ ] Plan for session persistence if needed

## Summary

✅ **Docker files are updated and ready** for session-based deployment!

- nginx forwards X-Session-Id headers correctly
- Backend handles sessions in memory (fast, private)
- Frontend session IDs persist in localStorage
- Sessions are isolated and secure
- Restart = session data cleared (by design for privacy)

**Optional:** Add disk/Redis persistence if you need session survival across restarts.
