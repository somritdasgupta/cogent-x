# API Configuration Guide

## Overview

The cogent-x application uses a centralized API configuration system that automatically adapts to different environments (development, production, custom deployments).

## Configuration Files

### 1. `src/config/api.ts`
This is the central configuration file that manages all API endpoints and base URLs.

### 2. `.env` (Optional)
You can create a `.env` file in the root directory to customize the API base URL:

```bash
# Frontend API Configuration
# Leave empty for default behavior (recommended for most cases)
VITE_API_BASE_URL=

# Examples for different deployment scenarios:
# VITE_API_BASE_URL=https://api.yourdomain.com
# VITE_API_BASE_URL=http://192.168.1.100:8000
```

## How It Works

### Development Mode
- The Vite dev server runs on port 8080
- API requests are proxied from `/api` to `http://localhost:8000`
- You don't need to set any environment variables

### Production Mode
- If `VITE_API_BASE_URL` is set, it uses that URL
- If not set, it uses the same origin as the frontend
- This allows flexible deployment options

## API Endpoints

All API endpoints are defined as constants in `src/config/api.ts`:

```typescript
API_ENDPOINTS = {
  HEALTH: "/api/v1/health",
  CONFIG: "/api/v1/config",
  KNOWLEDGE_BASES: "/api/v1/knowledge-bases",
  INGEST: "/api/v1/ingest",
  DATABASE_STATS: "/api/v1/database/stats",
  DATABASE_SOURCES: "/api/v1/database/sources",
  DATABASE_CLEAR: "/api/v1/database/clear",
  DATABASE_SOURCE: "/api/v1/database/source",
  DATABASE_SOURCE_CHUNKS: "/api/v1/database/source/chunks",
  ASK: "/api/v1/ask",
  TRANSCRIBE: "/api/v1/transcribe",
}
```

## Usage in Components

### Basic Usage
```typescript
import { API_ENDPOINTS, buildApiUrl } from "@/config/api";

// Simple GET request
const response = await fetch(buildApiUrl(API_ENDPOINTS.HEALTH));

// POST request
const response = await fetch(buildApiUrl(API_ENDPOINTS.CONFIG), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});
```

### With Query Parameters
```typescript
import { API_ENDPOINTS, buildApiUrlWithParams } from "@/config/api";

// URL with query parameters
const response = await fetch(
  buildApiUrlWithParams(API_ENDPOINTS.DATABASE_SOURCE, { url: sourceUrl })
);
// Generates: /api/v1/database/source?url=<encoded-url>
```

### API Documentation Link
```typescript
import { getApiDocsUrl } from "@/config/api";

// Opens the Swagger UI in a new tab
window.open(getApiDocsUrl(), '_blank');
```

## Deployment Scenarios

### Scenario 1: Development (Default)
```bash
# No .env file needed
# Frontend: http://localhost:8080
# Backend: http://localhost:8000
# API Docs: http://localhost:8000/api/docs
```

### Scenario 2: Production (Same Origin)
```bash
# No VITE_API_BASE_URL needed
# Frontend and backend served from same domain
# Example: https://yourdomain.com
# API Docs: https://yourdomain.com/api/docs
```

### Scenario 3: Production (Separate API Server)
```bash
# .env file:
VITE_API_BASE_URL=https://api.yourdomain.com

# Frontend: https://yourdomain.com
# Backend: https://api.yourdomain.com
# API Docs: https://api.yourdomain.com/docs
```

### Scenario 4: Custom Port or IP
```bash
# .env file:
VITE_API_BASE_URL=http://192.168.1.100:9000

# Useful for:
# - Different port than 8000
# - Network testing
# - Container deployments
```

## Benefits

1. **Flexibility**: Works automatically in dev, easily configurable for production
2. **Maintainability**: All endpoints defined in one place
3. **Type Safety**: TypeScript constants prevent typos
4. **Portability**: No hardcoded URLs in components
5. **Easy Debugging**: Change one variable to point to different environments

## Migration from Old Code

Old code:
```typescript
const response = await fetch("/api/v1/health");
```

New code:
```typescript
import { API_ENDPOINTS, buildApiUrl } from "@/config/api";
const response = await fetch(buildApiUrl(API_ENDPOINTS.HEALTH));
```

## Troubleshooting

### Issue: API calls failing in production
**Solution**: Set `VITE_API_BASE_URL` to your backend URL

### Issue: Wrong API docs URL
**Solution**: The system automatically detects the correct URL based on environment

### Issue: Using different port for backend
**Solution**: Set `VITE_API_BASE_URL=http://localhost:YOUR_PORT` in `.env`

## Notes

- All environment variables for Vite must start with `VITE_`
- Changes to `.env` require restarting the dev server
- The `.env` file is gitignored for security
- Use `.env.example` as a template
