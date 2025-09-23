# Deployment Guide

## Quick Start Deployment

### Prerequisites

- Docker & Docker Compose installed
- Git for cloning repository
- 8GB+ RAM recommended (for Ollama models)
- Internet connection for AI provider APIs

### One-Command Deployment

```bash
# Clone repository
git clone <repository-url>
cd cogent-rag-system

# Start all services
docker-compose up -d

# Verify deployment
curl http://localhost:3000/api/v1/health
```

**Access Points**:

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- Ollama: http://localhost:11434

## Environment Configuration

### 1. Copy Environment Template

```bash
cp .env.example .env
```

### 2. Configure API Keys (Optional)

```bash
# For OpenAI (optional)
OPENAI_API_KEY=sk-your-openai-key-here

# For Google Gemini (optional)
GEMINI_API_KEY=your-gemini-key-here

# Ollama Configuration (pre-configured)
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=llama2
```

### 3. Advanced Configuration

```bash
# Embedding Model
EMBEDDING_MODEL_NAME=all-MiniLM-L6-v2

# Database Persistence
CHROMA_PERSIST_DIRECTORY=/app/chroma_db

# API Configuration
API_HOST=0.0.0.0
API_PORT=8000
```

## Service Architecture

### Container Overview

```yaml
services:
  frontend:
    - Nginx server serving React build
    - Port: 3000
    - Depends on: backend

  backend:
    - FastAPI Python server
    - Port: 8000
    - Depends on: ollama

  ollama:
    - Local AI model server
    - Port: 11434
    - Volume: ollama_data
```

### Data Persistence

```bash
# Volumes created automatically
docker volume ls | grep cogent
cogent_ollama_data     # AI models storage
./chroma_db           # Vector database storage
```

## Production Deployment Options

### 1. Cloud Deployment (AWS/GCP/Azure)

**AWS EC2 Deployment**:

```bash
# Launch EC2 instance (t3.large or larger)
# Install Docker & Docker Compose
sudo yum update -y
sudo yum install -y docker
sudo systemctl start docker
sudo usermod -a -G docker ec2-user

# Deploy application
git clone <repo>
cd cogent-rag-system
docker-compose up -d

# Configure security group
# Open ports: 3000 (frontend), 8000 (API)
```

**Security Configuration**:

```bash
# Use AWS Secrets Manager for API keys
aws secretsmanager create-secret \
  --name cogent-openai-key \
  --secret-string "sk-your-key"

# Update docker-compose for production
environment:
  - OPENAI_API_KEY_FILE=/run/secrets/openai_key
secrets:
  openai_key:
    external: true
```

### 2. Kubernetes Deployment

**Kubernetes Manifests**:

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cogent-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: cogent-backend
  template:
    metadata:
      labels:
        app: cogent-backend
    spec:
      containers:
        - name: backend
          image: cogent/backend:latest
          ports:
            - containerPort: 8000
          env:
            - name: OPENAI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: api-keys
                  key: openai-key
---
apiVersion: v1
kind: Service
metadata:
  name: cogent-backend-service
spec:
  selector:
    app: cogent-backend
  ports:
    - port: 8000
      targetPort: 8000
  type: ClusterIP
```

### 3. Docker Swarm Deployment

**Stack Configuration**:

```yaml
# docker-stack.yml
version: "3.8"

services:
  frontend:
    image: cogent/frontend:latest
    ports:
      - "80:80"
    deploy:
      replicas: 2
      update_config:
        parallelism: 1
        delay: 10s

  backend:
    image: cogent/backend:latest
    ports:
      - "8000:8000"
    deploy:
      replicas: 3
    secrets:
      - openai_key
      - gemini_key

secrets:
  openai_key:
    external: true
  gemini_key:
    external: true
```

## Monitoring & Maintenance

### Health Checks

```bash
# Backend health
curl http://localhost:8000/api/v1/health

# Expected response:
{
  "backend": true,
  "llm": true,
  "vectorDB": true
}
```

### Log Monitoring

```bash
# View all service logs
docker-compose logs -f

# Individual service logs
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f ollama
```

### Resource Monitoring

```bash
# Container resource usage
docker stats

# Disk usage
du -sh ./chroma_db
docker system df
```

### Backup Procedures

```bash
# Backup vector database
tar -czf chroma_backup_$(date +%Y%m%d).tar.gz ./chroma_db

# Backup Ollama models
docker run --rm -v cogent_ollama_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/ollama_backup_$(date +%Y%m%d).tar.gz /data
```

## Scaling Considerations

### Horizontal Scaling

```yaml
# Scale backend instances
docker-compose up -d --scale backend=3

# Load balancer configuration (nginx.conf)
upstream backend {
    server backend_1:8000;
    server backend_2:8000;
    server backend_3:8000;
}
```

### Performance Optimization

```bash
# Increase worker processes
export UVICORN_WORKERS=4

# Optimize ChromaDB
export CHROMA_SERVER_THREADS=8

# GPU acceleration (if available)
export CUDA_VISIBLE_DEVICES=0
```

## Security Hardening

### Network Security

```yaml
# Internal network isolation
networks:
  cogent_internal:
    driver: bridge
    internal: true

  cogent_external:
    driver: bridge
```

### Secret Management

```bash
# Use Docker secrets
echo "sk-your-openai-key" | docker secret create openai_key -
echo "your-gemini-key" | docker secret create gemini_key -

# Reference in compose file
secrets:
  - source: openai_key
    target: /run/secrets/openai_key
```

### SSL/TLS Configuration

```nginx
# nginx.conf for HTTPS
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;

    location / {
        proxy_pass http://frontend;
    }

    location /api/ {
        proxy_pass http://backend;
    }
}
```

## Troubleshooting Guide

### Common Issues

**1. Ollama Service Not Starting**

```bash
# Check Ollama logs
docker-compose logs ollama

# Pull required model manually
docker exec -it cogent_ollama ollama pull llama2
```

**2. ChromaDB Connection Issues**

```bash
# Reset database
sudo rm -rf ./chroma_db
docker-compose restart backend
```

**3. API Key Configuration**

```bash
# Verify environment variables
docker exec cogent_backend env | grep API_KEY

# Check API key format
# OpenAI: starts with 'sk-'
# Gemini: alphanumeric string
```

**4. Memory Issues**

```bash
# Check available memory
free -h

# Reduce Ollama model size
export OLLAMA_MODEL=llama2:7b  # Smaller model
```

### Performance Tuning

```bash
# Backend optimization
export UVICORN_WORKERS=4
export UVICORN_WORKER_CLASS=uvicorn.workers.UvicornWorker

# Database optimization
export CHROMA_SERVER_BATCH_SIZE=1000
export CHROMA_SERVER_MAX_CONNECTIONS=10

# Frontend optimization
export NODE_ENV=production
export VITE_BUILD_TARGET=es2020
```
