from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import os

app = FastAPI(title="cogent-x", version="1.0.0")


class IngestRequest(BaseModel):
    url: str


class QueryRequest(BaseModel):
    query: str
    provider: str = "opensource"


@app.get("/api/v1/health")
async def health_check():
    return {
        "backend": True,
        "llm": False,  # Implement Ollama health check
        "vectorDB": False  # Implement ChromaDB health check
    }


@app.post("/api/v1/ingest")
async def ingest_document(request: IngestRequest):
    # Implement document ingestion logic
    raise HTTPException(status_code=501, detail="Not implemented")


@app.post("/api/v1/ask")
async def query_documents(request: QueryRequest):
    if request.provider == "openai":
        if not os.getenv("OPENAI_API_KEY"):
            raise HTTPException(
                status_code=400, detail="OpenAI API key not configured")
    elif request.provider == "gemini":
        if not os.getenv("GEMINI_API_KEY"):
            raise HTTPException(
                status_code=400, detail="Gemini API key not configured")

    # Implement query processing logic based on provider
    raise HTTPException(status_code=501, detail="Not implemented")
