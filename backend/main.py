import re
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
import os
import json
import requests
from pathlib import Path
from typing import Optional, List, Dict, Any
from cryptography.fernet import Fernet
import pickle
import numpy as np
import logging
import traceback
from uuid import uuid4
from datetime import datetime, timedelta

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    import faiss
except ImportError:
    faiss = None

SentenceTransformer = None

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

try:
    import html2text
except ImportError:
    html2text = None

app = FastAPI(
    title="cogent-x",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Session-Id"],
)


@app.get("/")
@app.head("/")
async def root():
    return {
        "status": "online",
        "service": "cogent-x API",
        "version": "2.0.0",
        "documentation": {
            "swagger": "/api/docs",
            "redoc": "/api/redoc"
        }
    }


CONFIG_DIR = Path(__file__).parent / "config"
CONFIG_FILE = CONFIG_DIR / "settings.json"
KEY_FILE = CONFIG_DIR / "secret.key"
VECTOR_DB_DIR = Path(__file__).parent.parent / "vector_db"

CONFIG_DIR.mkdir(exist_ok=True)
VECTOR_DB_DIR.mkdir(exist_ok=True)

def get_encryption_key() -> bytes:
    if KEY_FILE.exists():
        with open(KEY_FILE, "rb") as f:
            return f.read()
    key = Fernet.generate_key()
    with open(KEY_FILE, "wb") as f:
        f.write(key)
    return key


ENCRYPTION_KEY = get_encryption_key()
cipher_suite = Fernet(ENCRYPTION_KEY)

def encrypt_value(value: str) -> str:
    return cipher_suite.encrypt(value.encode()).decode() if value else ""

def decrypt_value(encrypted_value: str) -> str:
    if not encrypted_value:
        return ""
    try:
        return cipher_suite.decrypt(encrypted_value.encode()).decode()
    except:
        return ""


DEFAULT_CONFIG = {
    "ollama_base_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
    "ollama_model": os.getenv("OLLAMA_MODEL", "llama3:8b"),
    "embedding_model_name": os.getenv("EMBEDDING_MODEL_NAME", "BAAI/bge-large-en-v1.5"),
    "openai_api_key": os.getenv("OPENAI_API_KEY", ""),
    "openai_model": os.getenv("OPENAI_MODEL", "gpt-4"),
    "openai_embedding_model": os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
    "gemini_api_key": os.getenv("GEMINI_API_KEY", ""),
    "gemini_model": os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
    "gemini_embedding_model": os.getenv("GEMINI_EMBEDDING_MODEL", "models/text-embedding-004"),
    "chunk_size": int(os.getenv("CHUNK_SIZE", "1000")),
    "chunk_overlap": int(os.getenv("CHUNK_OVERLAP", "200")),
    "top_k_results": int(os.getenv("TOP_K_RESULTS", "5")),
}

def load_config() -> Dict[str, Any]:
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r") as f:
                config = json.load(f)
                if config.get("openai_api_key"):
                    config["openai_api_key"] = decrypt_value(config["openai_api_key"])
                if config.get("gemini_api_key"):
                    config["gemini_api_key"] = decrypt_value(config["gemini_api_key"])
                return config
        except:
            return DEFAULT_CONFIG.copy()
    return DEFAULT_CONFIG.copy()

def save_config(config: dict) -> None:
    config_to_save = config.copy()
    if config_to_save.get("openai_api_key"):
        config_to_save["openai_api_key"] = encrypt_value(config_to_save["openai_api_key"])
    if config_to_save.get("gemini_api_key"):
        config_to_save["gemini_api_key"] = encrypt_value(config_to_save["gemini_api_key"])
    with open(CONFIG_FILE, "w") as f:
        json.dump(config_to_save, f, indent=2)


CURRENT_CONFIG = load_config()


class VectorDatabase:
    def __init__(self, dimension: int = 1024):
        self.dimension = dimension
        self.index = None
        self.documents: List[str] = []
        self.metadatas: List[Dict[str, Any]] = []
        self.index_path = VECTOR_DB_DIR / "faiss_index.bin"
        self.metadata_path = VECTOR_DB_DIR / "metadata.pkl"
        self.load_database()

    def load_database(self) -> None:
        if self.index_path.exists() and self.metadata_path.exists():
            try:
                if faiss:
                    self.index = faiss.read_index(str(self.index_path))
                with open(self.metadata_path, "rb") as f:
                    data = pickle.load(f)
                    self.documents = data.get("documents", [])
                    self.metadatas = data.get("metadatas", [])
            except:
                self._init_new_index()
        else:
            self._init_new_index()

    def _init_new_index(self) -> None:
        if not faiss:
            return
        self.index = faiss.IndexFlatL2(self.dimension)  # type: ignore
        self.documents = []
        self.metadatas = []

    def save_database(self) -> None:
        if not self.index or not faiss:
            return
        try:
            faiss.write_index(self.index, str(self.index_path))
            with open(self.metadata_path, "wb") as f:
                pickle.dump({"documents": self.documents, "metadatas": self.metadatas}, f)
        except:
            pass

    def add(self, embeddings: List[List[float]], documents: List[str], metadatas: List[Dict[str, Any]]) -> None:
        if not self.index:
            self._init_new_index()
        if not self.index:
            raise RuntimeError("FAISS not installed")
        
        embeddings_array = np.array(embeddings, dtype=np.float32)
        if self.index.ntotal == 0 and embeddings_array.shape[1] != self.dimension:  # type: ignore
            self.dimension = embeddings_array.shape[1]
            self._init_new_index()
        
        self.index.add(embeddings_array)  # type: ignore
        self.documents.extend(documents)
        self.metadatas.extend(metadatas)
        self.save_database()

    def search(self, query_embedding: List[float], k: int = 5) -> Dict[str, Any]:
        if not self.index or self.index.ntotal == 0:
            return {"documents": [], "metadatas": [], "distances": []}
        
        query_array = np.array([query_embedding], dtype=np.float32)
        k = min(k, self.index.ntotal)  # type: ignore
        distances, indices = self.index.search(query_array, k)  # type: ignore
        
        results_docs = [self.documents[i] for i in indices[0] if i < len(self.documents)]
        results_meta = [self.metadatas[i] for i in indices[0] if i < len(self.metadatas)]
        
        return {"documents": [results_docs], "metadatas": [results_meta], "distances": distances.tolist()}

    def count(self) -> int:
        return self.index.ntotal if self.index else 0  # type: ignore

    def clear(self) -> None:
        self._init_new_index()
        if self.index_path and self.index_path.exists():
            self.index_path.unlink()
        if self.metadata_path and self.metadata_path.exists():
            self.metadata_path.unlink()


class SessionManager:
    def __init__(self, session_timeout_hours: int = 24):
        self.sessions: Dict[str, Dict[str, Any]] = {}
        self.session_timeout = timedelta(hours=session_timeout_hours)

    def get_or_create_session(self, session_id: Optional[str] = None) -> tuple[str, 'VectorDatabase']:
        self._cleanup_expired()
        if not session_id or session_id not in self.sessions:
            session_id = str(uuid4())
            self.sessions[session_id] = {
                'db': VectorDatabase.__new__(VectorDatabase),
                'created_at': datetime.now(),
                'last_accessed': datetime.now(),
                'config': DEFAULT_CONFIG.copy()
            }
            db = self.sessions[session_id]['db']
            db.dimension = 1024
            db.documents = []
            db.metadatas = []
            db.index_path = None
            db.metadata_path = None
            db._init_new_index()
        self.sessions[session_id]['last_accessed'] = datetime.now()
        return session_id, self.sessions[session_id]['db']

    def get_session(self, session_id: str) -> Optional['VectorDatabase']:
        if session_id in self.sessions:
            session = self.sessions[session_id]
            if not self._is_expired(session):
                session['last_accessed'] = datetime.now()
                return session['db']
            del self.sessions[session_id]
        return None

    def delete_session(self, session_id: str) -> bool:
        if session_id in self.sessions:
            del self.sessions[session_id]
            return True
        return False

    def get_session_config(self, session_id: str) -> Optional[Dict[str, Any]]:
        if session_id in self.sessions:
            session = self.sessions[session_id]
            if not self._is_expired(session):
                session['last_accessed'] = datetime.now()
                return session.get('config', DEFAULT_CONFIG.copy())
        return None

    def set_session_config(self, session_id: str, config: Dict[str, Any]) -> bool:
        if session_id in self.sessions:
            session = self.sessions[session_id]
            if not self._is_expired(session):
                session['config'] = config
                session['last_accessed'] = datetime.now()
                return True
        return False

    def _is_expired(self, session: Dict[str, Any]) -> bool:
        return datetime.now() - session['last_accessed'] > self.session_timeout

    def _cleanup_expired(self):
        expired = [sid for sid, sess in self.sessions.items() if self._is_expired(sess)]
        for sid in expired:
            del self.sessions[sid]

    def get_session_stats(self, session_id: str) -> Optional[Dict[str, Any]]:
        if session_id in self.sessions:
            session = self.sessions[session_id]
            return {
                'session_id': session_id,
                'created_at': session['created_at'].isoformat(),
                'last_accessed': session['last_accessed'].isoformat(),
                'document_count': session['db'].count(),
                'is_expired': self._is_expired(session)
            }
        return None


session_manager = SessionManager(session_timeout_hours=24)
vector_db = VectorDatabase()
embedding_model = None

def get_embedding_model():
    global embedding_model, SentenceTransformer
    if not embedding_model:
        if not SentenceTransformer:
            try:
                from sentence_transformers import SentenceTransformer as ST
                SentenceTransformer = ST
            except ImportError:
                raise HTTPException(status_code=500, detail="sentence-transformers not installed")
        try:
            model_name = CURRENT_CONFIG.get("embedding_model_name", "BAAI/bge-large-en-v1.5")
            embedding_model = SentenceTransformer(model_name)
        except Exception:
            embedding_model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    return embedding_model


def get_embeddings(texts: List[str], provider: str = "opensource", task_type: str = "retrieval_document", config: Optional[Dict[str, Any]] = None) -> List[List[float]]:
    active_config = config if config else CURRENT_CONFIG

    if provider == "openai":
        try:
            import openai
        except ImportError:
            raise HTTPException(status_code=500, detail="openai not installed")
        
        api_key = active_config.get("openai_api_key")
        if not api_key:
            raise HTTPException(status_code=400, detail="OpenAI API key not configured")
        
        client = openai.OpenAI(api_key=api_key)
        model = active_config.get("openai_embedding_model", "text-embedding-3-small")
        embeddings = []
        batch_size = 100
        
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            response = client.embeddings.create(input=batch, model=model)
            embeddings.extend([item.embedding for item in response.data])
        return embeddings

    elif provider == "gemini":
        try:
            import google.generativeai as genai
        except ImportError:
            raise HTTPException(status_code=500, detail="google-generativeai not installed")
        
        api_key = active_config.get("gemini_api_key")
        if not api_key:
            raise HTTPException(status_code=400, detail="Gemini API key not configured")
        
        genai.configure(api_key=api_key)
        embedding_model = active_config.get("gemini_embedding_model", "models/text-embedding-004")
        embeddings = []
        batch_size = 50
        
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            for text in batch:
                result = genai.embed_content(model=embedding_model, content=text, task_type=task_type)
                embeddings.append(result['embedding'])
        return embeddings
    
    else:
        model = get_embedding_model()
        embeddings_array = model.encode(texts, convert_to_numpy=True, batch_size=32, show_progress_bar=False)
        return embeddings_array.tolist()


def scrape_url(url: str) -> Dict[str, str]:
    if not BeautifulSoup:
        raise HTTPException(status_code=500, detail="beautifulsoup4 not installed")
    if not html2text:
        raise HTTPException(status_code=500, detail="html2text not installed")
    
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        for script in soup(["script", "style", "nav", "footer", "aside", "header"]):
            script.decompose()
        
        title = soup.find('title')
        title_text = title.get_text().strip() if title else url
        
        h = html2text.HTML2Text()
        h.ignore_links = False
        h.ignore_images = True
        h.ignore_emphasis = False
        h.body_width = 0
        h.unicode_snob = True
        
        content = h.handle(str(soup))
        content = re.sub(r'\n{3,}', '\n\n', content).strip()
        
        return {"title": title_text, "content": content, "url": url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to scrape: {str(e)}")


def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
    if len(text) <= chunk_size:
        return [text]
    
    chunks = []
    start = 0
    text_len = len(text)
    sentence_end = re.compile(r'[.!?]\s+')
    
    while start < text_len:
        end = min(start + chunk_size, text_len)
        if end < text_len:
            search_start = max(start, end - 200)
            remaining = text[search_start:end]
            matches = list(sentence_end.finditer(remaining))
            if matches:
                end = search_start + matches[-1].end()
        
        chunk = text[start:end].strip()
        if chunk and len(chunk) > 10:
            chunks.append(chunk)
        
        if end >= text_len:
            break
        start = end - overlap
    
    return chunks


def query_llm(prompt: str, context: str, provider: str, config: Optional[Dict[str, Any]] = None) -> str:
    active_config = config if config else CURRENT_CONFIG
    full_prompt = f"""Based on the following context, answer the question accurately and concisely.

Context:
{context}

Question: {prompt}

Answer:"""

    if provider == "opensource":
        ollama_url = active_config.get("ollama_base_url", "http://localhost:11434")
        model = active_config.get("ollama_model", "llama3:8b")
        try:
            response = requests.post(f"{ollama_url}/api/generate", json={"model": model, "prompt": full_prompt, "stream": False}, timeout=120)
            response.raise_for_status()
            result = response.json().get("response", "")
            return result if result else "No response generated"
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Ollama error: {str(e)}")

    elif provider == "openai":
        try:
            import openai
        except ImportError:
            raise HTTPException(status_code=500, detail="openai not installed")
        
        api_key = active_config.get("openai_api_key")
        if not api_key:
            raise HTTPException(status_code=400, detail="OpenAI API key not configured")
        
        client = openai.OpenAI(api_key=api_key)
        model = active_config.get("openai_model", "gpt-4")
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that answers questions based on provided context."},
                    {"role": "user", "content": full_prompt}
                ],
                temperature=0.7,
                max_tokens=1000
            )
            content = response.choices[0].message.content
            return content if content else "No response generated"
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"OpenAI error: {str(e)}")

    elif provider == "gemini":
        try:
            import google.generativeai as genai
        except ImportError:
            raise HTTPException(status_code=500, detail="google-generativeai not installed")
        
        api_key = active_config.get("gemini_api_key")
        if not api_key:
            raise HTTPException(status_code=400, detail="Gemini API key not configured")
        
        genai.configure(api_key=api_key)
        model_name = active_config.get("gemini_model", "gemini-pro")
        model = genai.GenerativeModel(model_name)
        try:
            response = model.generate_content(full_prompt)
            return response.text
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Gemini error: {str(e)}")
    
    raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")


def check_ollama_health(session_config: Optional[Dict] = None) -> bool:
    config = session_config if session_config else CURRENT_CONFIG
    openai_key = config.get("openai_api_key", "").strip()
    if openai_key and len(openai_key) > 10 and "•" not in openai_key:
        return True
    gemini_key = config.get("gemini_api_key", "").strip()
    if gemini_key and len(gemini_key) > 10 and "•" not in gemini_key:
        return True
    try:
        ollama_url = config.get("ollama_base_url", "http://localhost:11434")
        response = requests.get(f"{ollama_url}/api/tags", timeout=2)
        return response.status_code == 200
    except:
        return False

def check_vectordb_health() -> bool:
    try:
        return vector_db.index is not None
    except:
        return False


# ============= Pydantic Models =============
class Configuration(BaseModel):
    ollama_base_url: str
    ollama_model: str
    embedding_model_name: str
    openai_api_key: Optional[str] = ""
    openai_model: str
    openai_embedding_model: str
    gemini_api_key: Optional[str] = ""
    gemini_model: str
    gemini_embedding_model: str
    chunk_size: int
    chunk_overlap: int
    top_k_results: int


class IngestRequest(BaseModel):
    url: str
    provider: Optional[str] = "opensource"
    conversation_id: Optional[str] = None


class QueryRequest(BaseModel):
    query: str
    provider: str = "opensource"
    conversation_id: Optional[str] = None


# ============= API Endpoints =============

@app.get("/api/v1/health")
@app.head("/api/v1/health")
async def health_check(x_session_id: Optional[str] = Header(None)):
    session_config = session_manager.get_session_config(x_session_id) if x_session_id else None
    return {
        "backend": True,
        "llm": check_ollama_health(session_config),
        "vectorDB": check_vectordb_health(),
        "config_loaded": CURRENT_CONFIG is not None,
        "session_active": x_session_id is not None
    }


@app.get("/api/v1/config")
async def get_configuration(response: Response, x_session_id: Optional[str] = Header(None)):
    session_id, _ = session_manager.get_or_create_session(x_session_id)
    response.headers["X-Session-Id"] = session_id
    config = session_manager.get_session_config(session_id) or DEFAULT_CONFIG.copy()
    
    if config.get("openai_api_key"):
        key = config["openai_api_key"]
        if len(key) > 8:
            config["openai_api_key"] = key[:4] + "•" * (len(key) - 8) + key[-4:]
    if config.get("gemini_api_key"):
        key = config["gemini_api_key"]
        if len(key) > 8:
            config["gemini_api_key"] = key[:4] + "•" * (len(key) - 8) + key[-4:]
    
    return config


@app.put("/api/v1/config")
async def update_configuration(config: Configuration, response: Response, x_session_id: Optional[str] = Header(None)):
    try:
        session_id, _ = session_manager.get_or_create_session(x_session_id)
        response.headers["X-Session-Id"] = session_id
        new_config = config.dict()
        current_session_config = session_manager.get_session_config(session_id) or DEFAULT_CONFIG.copy()
        
        if new_config.get("openai_api_key") and "•" in new_config["openai_api_key"]:
            new_config["openai_api_key"] = current_session_config.get("openai_api_key", "")
        if new_config.get("gemini_api_key") and "•" in new_config["gemini_api_key"]:
            new_config["gemini_api_key"] = current_session_config.get("gemini_api_key", "")
        
        session_manager.set_session_config(session_id, new_config)
        return {"message": "Configuration updated for your session", "note": "Config is private to your session only"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save: {str(e)}")


@app.post("/api/v1/ingest")
async def ingest_document(request: IngestRequest, response: Response, x_session_id: Optional[str] = Header(None)):
    try:
        session_id, session_db = session_manager.get_or_create_session(x_session_id)
        response.headers["X-Session-Id"] = session_id
        session_config = session_manager.get_session_config(session_id) or DEFAULT_CONFIG.copy()
        
        scraped_data = scrape_url(request.url)
        chunk_size = session_config.get("chunk_size", 1000)
        chunk_overlap = session_config.get("chunk_overlap", 200)
        chunks = chunk_text(scraped_data["content"], chunk_size, chunk_overlap)
        
        if not chunks:
            raise HTTPException(status_code=400, detail="No content extracted")
        
        provider = request.provider if request.provider else "opensource"
        embeddings = get_embeddings(chunks, provider, task_type="retrieval_document", config=session_config)
        
        metadatas = [
            {"source": request.url, "title": scraped_data["title"], "chunk_index": i, "total_chunks": len(chunks), "session_id": session_id, "conversation_id": request.conversation_id or "default"}
            for i in range(len(chunks))
        ]
        
        session_db.add(embeddings=embeddings, documents=chunks, metadatas=metadatas)
        
        return {
            "message": "Document ingested successfully",
            "title": scraped_data["title"],
            "chunks_created": len(chunks),
            "url": request.url,
            "session_id": session_id
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")


@app.get("/api/v1/knowledge-bases")
async def get_knowledge_bases(x_session_id: Optional[str] = Header(None)):
    try:
        if not x_session_id:
            return {"knowledge_bases": []}
        session_db = session_manager.get_session(x_session_id)
        if not session_db:
            return {"knowledge_bases": []}
        sources = {metadata.get("title") for metadata in session_db.metadatas if metadata and metadata.get("title")}
        return {"knowledge_bases": sorted([s for s in sources if s])}
    except:
        return {"knowledge_bases": []}


@app.post("/api/v1/ask")
async def query_documents(request: QueryRequest, x_session_id: Optional[str] = Header(None)):
    try:
        if not x_session_id:
            return {"answer": "No session found. Please ingest documents first.", "sources": [], "session_required": True}
        
        session_db = session_manager.get_session(x_session_id)
        if not session_db:
            return {"answer": "Session expired. Please ingest documents again.", "sources": [], "session_expired": True}
        
        session_config = session_manager.get_session_config(x_session_id) or DEFAULT_CONFIG.copy()
        query_embedding = get_embeddings([request.query], request.provider, task_type="retrieval_query", config=session_config)[0]
        top_k = session_config.get("top_k_results", 5)
        results = session_db.search(query_embedding, k=top_k)
        
        if not results or not results.get("documents") or not results["documents"][0]:
            return {"answer": "I don't have enough information to answer. Please ingest relevant documentation first.", "sources": []}
        
        documents = results["documents"][0]
        metadatas_list = results.get("metadatas", [[]])[0]
        
        # Filter by conversation_id if provided
        if request.conversation_id:
            filtered_docs = []
            filtered_metas = []
            for doc, meta in zip(documents, metadatas_list):
                if meta and meta.get("conversation_id") == request.conversation_id:
                    filtered_docs.append(doc)
                    filtered_metas.append(meta)
            if not filtered_docs:
                return {"answer": "No documents found for this conversation. Please ingest documents first.", "sources": []}
            documents = filtered_docs
            metadatas_list = filtered_metas
        context = "\n\n".join(documents)
        answer = query_llm(request.query, context, request.provider, config=session_config)
        
        source_chunks = {}
        for i, metadata in enumerate(metadatas_list):
            if metadata and metadata.get("source"):
                source_url = metadata.get("source")
                chunk_index = metadata.get("chunk_index", i)
                if source_url not in source_chunks:
                    source_chunks[source_url] = []
                source_chunks[source_url].append({"index": chunk_index, "content": documents[i][:200] + "..." if len(documents[i]) > 200 else documents[i]})
        
        sources = [{"url": url, "used_chunks": chunks} for url, chunks in source_chunks.items()]
        return {"answer": answer, "sources": sources, "chunks_used": len(documents), "session_id": x_session_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


@app.get("/api/v1/database/stats")
async def get_database_stats(x_session_id: Optional[str] = Header(None)):
    try:
        if not x_session_id:
            return {"total_documents": 0, "total_chunks": 0, "collections": [], "message": "No session found"}
        session_db = session_manager.get_session(x_session_id)
        if not session_db:
            return {"total_documents": 0, "total_chunks": 0, "collections": [], "message": "Session expired"}
        unique_sources = {metadata.get("source") for metadata in session_db.metadatas if metadata and metadata.get("source")}
        return {"total_documents": len(unique_sources), "total_chunks": session_db.count(), "collections": ["knowledge_base"], "session_id": x_session_id}
    except:
        return {"total_documents": 0, "total_chunks": 0, "collections": []}

@app.get("/api/v1/database/sources")
async def list_sources(x_session_id: Optional[str] = Header(None)):
    try:
        if not x_session_id:
            return {"sources": [], "message": "No session found"}
        session_db = session_manager.get_session(x_session_id)
        if not session_db:
            return {"sources": [], "message": "Session expired"}
        source_counts = {}
        for metadata in session_db.metadatas:
            if metadata and metadata.get("source"):
                source = metadata["source"]
                source_counts[source] = source_counts.get(source, 0) + 1
        sources = [{"url": source, "chunks": count} for source, count in source_counts.items()]
        return {"sources": sources, "session_id": x_session_id}
    except:
        return {"sources": []}


@app.get("/api/v1/database/source/chunks")
async def get_source_chunks(url: str, x_session_id: Optional[str] = Header(None)):
    try:
        if not url:
            raise HTTPException(status_code=400, detail="URL parameter required")
        if not x_session_id:
            raise HTTPException(status_code=400, detail="Session ID required")
        session_db = session_manager.get_session(x_session_id)
        if not session_db:
            raise HTTPException(status_code=404, detail="Session expired")
        chunks = [{"content": session_db.documents[i], "metadata": metadata, "index": i} for i, metadata in enumerate(session_db.metadatas) if metadata and metadata.get("source") == url]
        if not chunks:
            raise HTTPException(status_code=404, detail=f"Source not found: {url}")
        return {"url": url, "total_chunks": len(chunks), "chunks": chunks, "session_id": x_session_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve chunks: {str(e)}")


@app.delete("/api/v1/database/source")
async def delete_source(url: str, x_session_id: Optional[str] = Header(None)):
    try:
        if not url:
            raise HTTPException(status_code=400, detail="URL parameter required")
        if not x_session_id:
            raise HTTPException(status_code=400, detail="Session ID required")
        session_db = session_manager.get_session(x_session_id)
        if not session_db:
            raise HTTPException(status_code=404, detail="Session expired")
        
        indices_to_keep = []
        deleted_count = 0
        for i, metadata in enumerate(session_db.metadatas):
            if metadata and metadata.get("source") == url:
                deleted_count += 1
            else:
                indices_to_keep.append(i)
        
        if deleted_count == 0:
            raise HTTPException(status_code=404, detail=f"Source not found: {url}")
        
        new_documents = [session_db.documents[i] for i in indices_to_keep]
        new_metadatas = [session_db.metadatas[i] for i in indices_to_keep]
        
        if indices_to_keep:
            if not faiss:
                raise HTTPException(status_code=500, detail="FAISS not available")
            if not session_db.index:
                raise HTTPException(status_code=500, detail="Index not initialized")
            
            kept_embeddings = []
            for i in indices_to_keep:
                vec = np.zeros(session_db.index.d, dtype=np.float32)  # type: ignore
                session_db.index.reconstruct(i, vec)  # type: ignore
                kept_embeddings.append(vec)
            
            embeddings_array = np.array(kept_embeddings, dtype=np.float32)
            actual_dimension = embeddings_array.shape[1]
            session_db.index = faiss.IndexFlatL2(actual_dimension)  # type: ignore
            session_db.dimension = actual_dimension
            session_db.index.add(embeddings_array)  # type: ignore
        else:
            if not faiss:
                raise HTTPException(status_code=500, detail="FAISS not available")
            session_db.index = faiss.IndexFlatL2(session_db.dimension)  # type: ignore
        
        session_db.documents = new_documents
        session_db.metadatas = new_metadatas
        
        return {"message": f"Deleted {deleted_count} chunks", "deleted_chunks": deleted_count, "remaining_chunks": len(new_documents), "source": url, "session_id": x_session_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete: {str(e)}")


@app.post("/api/v1/database/clear")
async def clear_database(x_session_id: Optional[str] = Header(None)):
    try:
        if not x_session_id:
            raise HTTPException(status_code=400, detail="Session ID required")
        session_db = session_manager.get_session(x_session_id)
        if not session_db:
            raise HTTPException(status_code=404, detail="Session expired")
        session_db.clear()
        return {"message": "Session database cleared", "session_id": x_session_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear: {str(e)}")

@app.get("/api/v1/session/info")
async def get_session_info(x_session_id: Optional[str] = Header(None)):
    try:
        if not x_session_id:
            return {"session_id": None, "exists": False, "message": "No session ID provided"}
        stats = session_manager.get_session_stats(x_session_id)
        if not stats:
            return {"session_id": x_session_id, "exists": False, "message": "Session expired"}
        return {"session_id": x_session_id, "exists": True, **stats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get session info: {str(e)}")

@app.delete("/api/v1/session")
async def delete_session(x_session_id: Optional[str] = Header(None)):
    try:
        if not x_session_id:
            raise HTTPException(status_code=400, detail="Session ID required")
        success = session_manager.delete_session(x_session_id)
        if not success:
            raise HTTPException(status_code=404, detail="Session not found")
        return {"message": "Session deleted", "session_id": x_session_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete session: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run(app, host=host, port=port)
