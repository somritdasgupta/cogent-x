import re
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
import os
import sys
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
import warnings

# Suppress deprecation warnings from pyannote/torchaudio
warnings.filterwarnings("ignore", category=UserWarning,
                        module="pyannote.audio.core.io")
warnings.filterwarnings("ignore", message=".*torchaudio._backend.*")

# Configure logging first
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Add common ffmpeg locations to PATH if ffmpeg not found


def ensure_ffmpeg_in_path():
    """Ensure ffmpeg is accessible by adding common install locations to PATH"""
    import shutil
    import platform

    # Check if ffmpeg is already accessible
    if shutil.which("ffmpeg") is not None:
        return True

    system = platform.system()

    # Common ffmpeg installation paths on Windows
    if system == "Windows":
        possible_paths = [
            Path(os.environ.get("LOCALAPPDATA", "")) /
            "Microsoft" / "WinGet" / "Links",
            Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Packages" /
            "Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe" /
            "ffmpeg-8.0-full_build" / "bin",
            Path("C:/ffmpeg/bin"),
            Path("C:/Program Files/ffmpeg/bin"),
            Path(os.environ.get("ProgramFiles", "")) / "ffmpeg" / "bin",
        ]

        # Add each path that exists to system PATH
        for path in possible_paths:
            if path.exists():
                path_str = str(path.resolve())
                if path_str not in os.environ["PATH"]:
                    os.environ["PATH"] = path_str + \
                        os.pathsep + os.environ["PATH"]
                    logger.info(f"Added ffmpeg path: {path_str}")
                    # Check again
                    if shutil.which("ffmpeg") is not None:
                        return True

    # On Linux (Render/Docker), ffmpeg should be installed via apt-get
    # Check common Linux locations
    elif system == "Linux":
        linux_paths = [
            Path("/usr/bin"),
            Path("/usr/local/bin"),
        ]
        for path in linux_paths:
            ffmpeg_bin = path / "ffmpeg"
            if ffmpeg_bin.exists():
                return True

    return shutil.which("ffmpeg") is not None


# Try to ensure ffmpeg is available
ffmpeg_available = ensure_ffmpeg_in_path()
if not ffmpeg_available:
    import platform
    system = platform.system()
    if system == "Windows":
        logger.warning(
            "⚠️ ffmpeg not found! Voice transcription will fail. Install with: winget install ffmpeg")
        logger.warning(
            "After installation, restart the terminal for PATH changes to take effect.")
    elif system == "Linux":
        logger.warning(
            "⚠️ ffmpeg not found! Voice transcription will fail.")
        logger.warning(
            "On Render: Ensure build.sh runs 'apt-get install -y ffmpeg'")
        logger.warning(
            "On Docker: Ensure Dockerfile has 'RUN apt-get update && apt-get install -y ffmpeg'")
else:
    logger.info("✓ ffmpeg found and ready for WhisperX transcription")

try:
    import faiss
except ImportError:
    faiss = None

# Don't import SentenceTransformer at module level - import when needed to avoid startup hang
SentenceTransformer = None

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

try:
    import html2text
except ImportError:
    html2text = None
# Global model cache for WhisperX (loads once, reused for all requests)
whisperx_model = None
whisperx_device = None


# Initialize FastAPI with custom docs URLs
# Initialize FastAPI with custom docs URLs
app = FastAPI(
    title="cogent-x",
    version="2.0.0",
    docs_url="/api/docs",  # Swagger UI
    redoc_url="/api/redoc",  # ReDoc
    openapi_url="/api/openapi.json"  # OpenAPI schema
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Session-Id"],  # Allow frontend to read this header
)


# ============= Root Endpoint =============
@app.get("/")
@app.head("/")
async def root():
    """Root endpoint showing service status"""
    return {
        "status": "online",
        "service": "cogent-x API",
        "version": "2.0.0",
        "description": "AI-powered knowledge base with RAG capabilities",
        "documentation": {
            "swagger": "/api/docs",
            "redoc": "/api/redoc",
            "openapi": "/api/openapi.json"
        },
        "endpoints": {
            "health": "/api/v1/health",
            "config": "/api/v1/config",
            "transcribe": "/api/v1/transcribe",
            "tts": "/api/v1/tts",
            "ingest": "/api/v1/ingest",
            "query": "/api/v1/query"
        }
    }


# Configuration file paths
CONFIG_DIR = Path(__file__).parent / "config"
CONFIG_FILE = CONFIG_DIR / "settings.json"
KEY_FILE = CONFIG_DIR / "secret.key"
VECTOR_DB_DIR = Path(__file__).parent.parent / "vector_db"

# Ensure directories exist
CONFIG_DIR.mkdir(exist_ok=True)
VECTOR_DB_DIR.mkdir(exist_ok=True)


# ============= Encryption Setup =============
def get_encryption_key() -> bytes:
    """Get or generate encryption key"""
    if KEY_FILE.exists():
        with open(KEY_FILE, "rb") as f:
            return f.read()
    else:
        key = Fernet.generate_key()
        with open(KEY_FILE, "wb") as f:
            f.write(key)
        return key


ENCRYPTION_KEY = get_encryption_key()
cipher_suite = Fernet(ENCRYPTION_KEY)


def encrypt_value(value: str) -> str:
    """Encrypt a string value"""
    if not value:
        return ""
    return cipher_suite.encrypt(value.encode()).decode()


def decrypt_value(encrypted_value: str) -> str:
    """Decrypt an encrypted string value"""
    if not encrypted_value:
        return ""
    try:
        return cipher_suite.decrypt(encrypted_value.encode()).decode()
    except Exception:
        return ""


# ============= Configuration Management =============
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
    """Load configuration from file"""
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r") as f:
                config = json.load(f)
                if config.get("openai_api_key"):
                    config["openai_api_key"] = decrypt_value(
                        config["openai_api_key"])
                if config.get("gemini_api_key"):
                    config["gemini_api_key"] = decrypt_value(
                        config["gemini_api_key"])
                return config
        except Exception as e:
            print(f"Error loading config: {e}")
            return DEFAULT_CONFIG.copy()
    return DEFAULT_CONFIG.copy()


def save_config(config: dict) -> None:
    """Save configuration to file with encryption"""
    config_to_save = config.copy()
    if config_to_save.get("openai_api_key"):
        config_to_save["openai_api_key"] = encrypt_value(
            config_to_save["openai_api_key"])
    if config_to_save.get("gemini_api_key"):
        config_to_save["gemini_api_key"] = encrypt_value(
            config_to_save["gemini_api_key"])

    with open(CONFIG_FILE, "w") as f:
        json.dump(config_to_save, f, indent=2)


CURRENT_CONFIG = load_config()


# ============= FAISS Vector Database Setup =============
class VectorDatabase:
    """Vector database using FAISS for similarity search"""

    def __init__(self, dimension: int = 1024):
        self.dimension = dimension
        self.index = None
        self.documents: List[str] = []
        self.metadatas: List[Dict[str, Any]] = []
        self.index_path = VECTOR_DB_DIR / "faiss_index.bin"
        self.metadata_path = VECTOR_DB_DIR / "metadata.pkl"
        self.load_database()

    def load_database(self) -> None:
        """Load existing database from disk"""
        if self.index_path.exists() and self.metadata_path.exists():
            try:
                if faiss is not None:
                    self.index = faiss.read_index(str(self.index_path))
                with open(self.metadata_path, "rb") as f:
                    data = pickle.load(f)
                    self.documents = data.get("documents", [])
                    self.metadatas = data.get("metadatas", [])
                print(f"Loaded database with {len(self.documents)} documents")
            except Exception as e:
                print(f"Error loading database: {e}")
                self._init_new_index()
        else:
            self._init_new_index()

    def _init_new_index(self) -> None:
        """Initialize a new FAISS index"""
        if faiss is None:
            print("WARNING: FAISS not available, using in-memory only mode")
            return
        self.index = faiss.IndexFlatL2(self.dimension)
        self.documents = []
        self.metadatas = []

    def save_database(self) -> None:
        """Save database to disk"""
        if self.index is None or faiss is None:
            return
        try:
            faiss.write_index(self.index, str(self.index_path))
            with open(self.metadata_path, "wb") as f:
                pickle.dump({
                    "documents": self.documents,
                    "metadatas": self.metadatas
                }, f)
            print(f"Saved database with {len(self.documents)} documents")
        except Exception as e:
            print(f"Error saving database: {e}")

    def add(self, embeddings: List[List[float]], documents: List[str], metadatas: List[Dict[str, Any]]) -> None:
        """Add documents to the database"""
        if self.index is None:
            self._init_new_index()

        if self.index is None:
            raise RuntimeError(
                "Vector database not initialized - FAISS may not be installed")

        # Convert to numpy array
        embeddings_array = np.array(embeddings, dtype=np.float32)

        # Update dimension if this is the first insert
        if self.index.ntotal == 0 and embeddings_array.shape[1] != self.dimension:
            self.dimension = embeddings_array.shape[1]
            self._init_new_index()

        # Add to index (type: ignore to suppress FAISS type stub warnings)
        self.index.add(embeddings_array)  # type: ignore
        self.documents.extend(documents)
        self.metadatas.extend(metadatas)

        # Save to disk
        self.save_database()

    def search(self, query_embedding: List[float], k: int = 5) -> Dict[str, Any]:
        """Search for similar documents"""
        if self.index is None or self.index.ntotal == 0:
            return {"documents": [], "metadatas": [], "distances": []}

        # Convert to numpy array
        query_array = np.array([query_embedding], dtype=np.float32)

        # Search (type: ignore to suppress FAISS type stub warnings)
        k = min(k, self.index.ntotal)
        distances, indices = self.index.search(query_array, k)  # type: ignore

        # Get results
        results_docs = [self.documents[i]
                        for i in indices[0] if i < len(self.documents)]
        results_meta = [self.metadatas[i]
                        for i in indices[0] if i < len(self.metadatas)]

        return {
            "documents": [results_docs],
            "metadatas": [results_meta],
            "distances": distances.tolist()
        }

    def count(self) -> int:
        """Get number of documents"""
        if self.index is None:
            return 0
        return self.index.ntotal

    def clear(self) -> None:
        """Clear all data"""
        self._init_new_index()
        if self.index_path.exists():
            self.index_path.unlink()
        if self.metadata_path.exists():
            self.metadata_path.unlink()
        print("Database cleared")


# ============= Session Management for Data Isolation =============
# This ensures each user's documents are isolated and private
class SessionManager:
    """Manages isolated vector databases AND configurations per session for privacy"""

    def __init__(self, session_timeout_hours: int = 24):
        self.sessions: Dict[str, Dict[str, Any]] = {}
        self.session_timeout = timedelta(hours=session_timeout_hours)
        logger.info(
            f"SessionManager initialized with {session_timeout_hours}h timeout")

    def get_or_create_session(self, session_id: Optional[str] = None) -> tuple[str, 'VectorDatabase']:
        """Get existing session or create new one"""
        # Clean up expired sessions first
        self._cleanup_expired()

        # Create new session if needed
        if not session_id or session_id not in self.sessions:
            session_id = str(uuid4())
            # Create isolated in-memory database for this session
            self.sessions[session_id] = {
                # Create without loading from disk
                'db': VectorDatabase.__new__(VectorDatabase),
                'created_at': datetime.now(),
                'last_accessed': datetime.now(),
                'config': DEFAULT_CONFIG.copy()  # Each session gets its own config
            }
            # Initialize the database without loading global data
            db = self.sessions[session_id]['db']
            db.dimension = 1024
            db.documents = []
            db.metadatas = []
            db.index_path = None  # No persistence for sessions
            db.metadata_path = None
            db._init_new_index()
            logger.info(f"Created new isolated session: {session_id}")

        # Update last accessed time
        self.sessions[session_id]['last_accessed'] = datetime.now()
        return session_id, self.sessions[session_id]['db']

    def get_session(self, session_id: str) -> Optional['VectorDatabase']:
        """Get session database if exists and not expired"""
        if session_id in self.sessions:
            session = self.sessions[session_id]
            if not self._is_expired(session):
                session['last_accessed'] = datetime.now()
                return session['db']
            else:
                # Remove expired session
                del self.sessions[session_id]
                logger.info(f"Removed expired session: {session_id}")
        return None

    def delete_session(self, session_id: str) -> bool:
        """Manually delete a session"""
        if session_id in self.sessions:
            del self.sessions[session_id]
            logger.info(f"Manually deleted session: {session_id}")
            return True
        return False

    def get_session_config(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session-specific configuration"""
        if session_id in self.sessions:
            session = self.sessions[session_id]
            if not self._is_expired(session):
                session['last_accessed'] = datetime.now()
                return session.get('config', DEFAULT_CONFIG.copy())
        return None

    def set_session_config(self, session_id: str, config: Dict[str, Any]) -> bool:
        """Set session-specific configuration"""
        if session_id in self.sessions:
            session = self.sessions[session_id]
            if not self._is_expired(session):
                session['config'] = config
                session['last_accessed'] = datetime.now()
                logger.info(f"Updated config for session: {session_id}")
                return True
        return False

    def _is_expired(self, session: Dict[str, Any]) -> bool:
        """Check if session has expired"""
        return datetime.now() - session['last_accessed'] > self.session_timeout

    def _cleanup_expired(self):
        """Remove all expired sessions"""
        expired = [sid for sid, sess in self.sessions.items()
                   if self._is_expired(sess)]
        for sid in expired:
            del self.sessions[sid]
        if expired:
            logger.info(f"Cleaned up {len(expired)} expired sessions")

    def get_session_stats(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get statistics about a session"""
        if session_id in self.sessions:
            session = self.sessions[session_id]
            db = session['db']
            return {
                'session_id': session_id,
                'created_at': session['created_at'].isoformat(),
                'last_accessed': session['last_accessed'].isoformat(),
                'document_count': db.count(),
                'is_expired': self._is_expired(session)
            }
        return None


# Initialize session manager
session_manager = SessionManager(session_timeout_hours=24)

# Initialize global vector database (for backward compatibility, but will be deprecated)
vector_db = VectorDatabase()

# ============= Embedding Models =============
embedding_model = None


def get_embedding_model():
    """Get or initialize embedding model"""
    global embedding_model, SentenceTransformer
    if embedding_model is None:
        # Import SentenceTransformer only when needed
        if SentenceTransformer is None:
            try:
                from sentence_transformers import SentenceTransformer as ST
                SentenceTransformer = ST
            except ImportError:
                raise HTTPException(
                    status_code=500, detail="Sentence Transformers not installed. Run: pip install sentence-transformers")
        try:
            model_name = CURRENT_CONFIG.get(
                "embedding_model_name", "BAAI/bge-large-en-v1.5")
            print(f"Loading embedding model: {model_name}")
            embedding_model = SentenceTransformer(model_name)
        except Exception as e:
            print(f"Error loading embedding model: {e}")
            # Fallback to a smaller model
            embedding_model = SentenceTransformer(
                "sentence-transformers/all-MiniLM-L6-v2")
    return embedding_model


def get_embeddings(texts: List[str], provider: str = "opensource", task_type: str = "retrieval_document", config: Optional[Dict[str, Any]] = None) -> List[List[float]]:
    """Generate embeddings based on provider (OPTIMIZED with batch processing)

    Args:
        texts: List of text strings to embed
        provider: AI provider ("opensource", "openai", "gemini")
        task_type: Task type for embeddings ("retrieval_document" for ingestion, "retrieval_query" for queries)
        config: Session-specific config (uses global if not provided)
    """
    # Use session config if provided, otherwise fall back to global
    active_config = config if config is not None else CURRENT_CONFIG

    # Use session config if provided, otherwise fall back to global
    active_config = config if config is not None else CURRENT_CONFIG

    if provider == "openai":
        # Use OpenAI embeddings with batch processing
        try:
            import openai
        except ImportError:
            raise HTTPException(
                status_code=500, detail="OpenAI package not installed. Run: pip install openai")

        api_key = active_config.get("openai_api_key")
        if not api_key:
            raise HTTPException(
                status_code=400, detail="OpenAI API key not configured")

        client = openai.OpenAI(api_key=api_key)
        model = active_config.get(
            "openai_embedding_model", "text-embedding-3-small")

        # Batch processing (OpenAI supports up to 2048 texts at once)
        embeddings = []
        batch_size = 100  # Process 100 at a time for stability

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            response = client.embeddings.create(
                input=batch,
                model=model
            )
            embeddings.extend([item.embedding for item in response.data])
            logger.info(
                f"✓ Processed batch {i//batch_size + 1}/{(len(texts) + batch_size - 1)//batch_size}")

        return embeddings

    elif provider == "gemini":
        # Use Google Gemini embeddings with batch processing
        try:
            import google.generativeai as genai
        except ImportError:
            raise HTTPException(
                status_code=500, detail="Google Generative AI package not installed. Run: pip install google-generativeai")

        api_key = active_config.get("gemini_api_key")
        if not api_key:
            raise HTTPException(
                status_code=400, detail="Gemini API key not configured")

        genai.configure(api_key=api_key)

        # Use text-embedding-004 (newer model) or embedding-001 (legacy)
        embedding_model = active_config.get(
            "gemini_embedding_model", "models/text-embedding-004")

        embeddings = []
        try:
            # Gemini supports batch embedding with embed_content
            batch_size = 50  # Gemini has stricter limits

            for i in range(0, len(texts), batch_size):
                batch = texts[i:i + batch_size]

                # Process batch
                for text in batch:
                    result = genai.embed_content(
                        model=embedding_model,
                        content=text,
                        task_type=task_type
                    )
                    embeddings.append(result['embedding'])

                logger.info(
                    f"✓ Processed batch {i//batch_size + 1}/{(len(texts) + batch_size - 1)//batch_size}")

            return embeddings
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Gemini embedding error: {str(e)}")

    else:
        # Use local Sentence Transformers for Ollama (opensource)
        # This is already optimized with batch processing internally
        model = get_embedding_model()
        logger.info(f"Encoding {len(texts)} texts with local model...")

        # Batch processing for large numbers of texts
        batch_size = 32  # Optimal for most systems
        embeddings_array = model.encode(
            texts,
            convert_to_numpy=True,
            batch_size=batch_size,
            show_progress_bar=False  # We log our own progress
        )

        return embeddings_array.tolist()


# ============= Web Scraping =============
def scrape_url(url: str) -> Dict[str, str]:
    """Scrape content from URL and convert to markdown (OPTIMIZED)"""
    if BeautifulSoup is None:
        raise HTTPException(
            status_code=500, detail="BeautifulSoup4 not installed. Run: pip install beautifulsoup4 lxml")
    if html2text is None:
        raise HTTPException(
            status_code=500, detail="html2text not installed. Run: pip install html2text")

    try:
        logger.info(f"Fetching URL: {url}")
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        logger.info(f"✓ Downloaded {len(response.content)} bytes")

        # Use 'html.parser' - 3x faster than lxml for most pages
        logger.info("Parsing HTML...")
        soup = BeautifulSoup(response.content, 'html.parser')  # type: ignore

        # Remove script and style elements (batch remove)
        for script in soup(["script", "style", "nav", "footer", "aside", "header"]):
            script.decompose()
        logger.info("✓ Cleaned HTML")

        # Get title
        title = soup.find('title')
        title_text = title.get_text().strip() if title else url

        # Convert to markdown (optimized settings)
        logger.info("Converting to markdown...")
        h = html2text.HTML2Text()
        h.ignore_links = False
        h.ignore_images = True
        h.ignore_emphasis = False
        h.body_width = 0
        h.unicode_snob = True  # Faster Unicode handling

        content = h.handle(str(soup))

        # Optimized cleanup - single regex pass
        content = re.sub(r'\n{3,}', '\n\n', content)  # Remove 3+ newlines
        content = content.strip()
        logger.info(f"✓ Generated {len(content)} characters of markdown")

        return {
            "title": title_text,
            "content": content,
            "url": url
        }
    except Exception as e:
        logger.error(f"Scraping failed: {str(e)}")
        raise HTTPException(
            status_code=400, detail=f"Failed to scrape URL: {str(e)}")


def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
    """Split text into overlapping chunks (OPTIMIZED)"""
    if len(text) <= chunk_size:
        return [text]

    chunks = []
    start = 0
    text_len = len(text)

    # Pre-compile regex for sentence boundaries (much faster)
    sentence_end = re.compile(r'[.!?]\s+')

    while start < text_len:
        end = min(start + chunk_size, text_len)

        # Only look for sentence boundary if not at end
        if end < text_len:
            # Look backward from end for sentence boundary
            search_start = max(start, end - 200)  # Only search last 200 chars
            remaining = text[search_start:end]

            # Find last sentence boundary
            matches = list(sentence_end.finditer(remaining))
            if matches:
                last_match = matches[-1]
                end = search_start + last_match.end()

        chunk = text[start:end].strip()
        if chunk and len(chunk) > 10:  # Skip tiny chunks
            chunks.append(chunk)

        # Move start position
        if end >= text_len:
            break
        start = end - overlap

    logger.info(f"✓ Created {len(chunks)} chunks")
    return chunks


# ============= LLM Integration =============
def query_llm(prompt: str, context: str, provider: str, config: Optional[Dict[str, Any]] = None) -> str:
    """Query LLM with context"""
    # Use session config if provided, otherwise fall back to global
    active_config = config if config is not None else CURRENT_CONFIG

    full_prompt = f"""Based on the following context, answer the question accurately and concisely.

Context:
{context}

Question: {prompt}

Answer:"""

    if provider == "opensource":
        # Use Ollama
        ollama_url = active_config.get(
            "ollama_base_url", "http://localhost:11434")
        model = active_config.get("ollama_model", "llama3:8b")

        try:
            response = requests.post(
                f"{ollama_url}/api/generate",
                json={
                    "model": model,
                    "prompt": full_prompt,
                    "stream": False
                },
                timeout=120
            )
            response.raise_for_status()
            result = response.json().get("response", "")
            return result if result else "No response generated"
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Ollama error: {str(e)}")

    elif provider == "openai":
        # Use OpenAI
        try:
            import openai
        except ImportError:
            raise HTTPException(
                status_code=500, detail="OpenAI package not installed. Run: pip install openai")

        api_key = active_config.get("openai_api_key")
        if not api_key:
            raise HTTPException(
                status_code=400, detail="OpenAI API key not configured")

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
            raise HTTPException(
                status_code=500, detail=f"OpenAI error: {str(e)}")

    elif provider == "gemini":
        # Use Google Gemini
        try:
            import google.generativeai as genai
        except ImportError:
            raise HTTPException(
                status_code=500, detail="Google Generative AI package not installed. Run: pip install google-generativeai")

        api_key = active_config.get("gemini_api_key")
        if not api_key:
            raise HTTPException(
                status_code=400, detail="Gemini API key not configured")

        genai.configure(api_key=api_key)
        model_name = active_config.get("gemini_model", "gemini-pro")
        model = genai.GenerativeModel(model_name)

        try:
            response = model.generate_content(full_prompt)
            return response.text
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Gemini error: {str(e)}")

    else:
        raise HTTPException(
            status_code=400, detail=f"Unknown provider: {provider}")


# ============= Health Checks =============
def check_ollama_health() -> bool:
    """Check if any LLM service is available (Ollama, OpenAI, or Gemini)"""
    # Check if OpenAI API key is configured
    openai_key = CURRENT_CONFIG.get("openai_api_key", "").strip()
    if openai_key and len(openai_key) > 10 and "•" not in openai_key:
        return True

    # Check if Gemini API key is configured
    gemini_key = CURRENT_CONFIG.get("gemini_api_key", "").strip()
    if gemini_key and len(gemini_key) > 10 and "•" not in gemini_key:
        return True

    # Check if Ollama is running
    try:
        ollama_url = CURRENT_CONFIG.get(
            "ollama_base_url", "http://localhost:11434")
        response = requests.get(f"{ollama_url}/api/tags", timeout=2)
        return response.status_code == 200
    except:
        return False


def check_vectordb_health() -> bool:
    """Check if vector database is initialized"""
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


class QueryRequest(BaseModel):
    query: str
    provider: str = "opensource"


# ============= API Endpoints =============

@app.get("/api/v1/health")
@app.head("/api/v1/health")
async def health_check():
    """System health check"""
    llm_status = check_ollama_health()
    db_status = check_vectordb_health()

    return {
        "backend": True,
        "llm": llm_status,
        "vectorDB": db_status,
        "config_loaded": CURRENT_CONFIG is not None
    }


@app.get("/api/v1/config")
async def get_configuration(
    response: Response,
    x_session_id: Optional[str] = Header(None)
):
    """Get SESSION-SPECIFIC configuration with masked API keys - Privacy Protected!"""
    # Get or create session
    session_id, _ = session_manager.get_or_create_session(x_session_id)
    response.headers["X-Session-Id"] = session_id

    # Get session-specific config
    config = session_manager.get_session_config(session_id)
    if not config:
        config = DEFAULT_CONFIG.copy()

    # Mask API keys for display
    if config.get("openai_api_key"):
        key = config["openai_api_key"]
        if len(key) > 8:
            config["openai_api_key"] = key[:4] + \
                "•" * (len(key) - 8) + key[-4:]
    if config.get("gemini_api_key"):
        key = config["gemini_api_key"]
        if len(key) > 8:
            config["gemini_api_key"] = key[:4] + \
                "•" * (len(key) - 8) + key[-4:]

    logger.info(
        f"[CONFIG] Returning session-specific config for: {session_id}")
    return config


@app.put("/api/v1/config")
async def update_configuration(
    config: Configuration,
    response: Response,
    x_session_id: Optional[str] = Header(None)
):
    """Update SESSION-SPECIFIC configuration - Each user has their own API keys!"""
    try:
        # Get or create session
        session_id, _ = session_manager.get_or_create_session(x_session_id)
        response.headers["X-Session-Id"] = session_id

        new_config = config.dict()

        # Get current session config to preserve masked keys
        current_session_config = session_manager.get_session_config(session_id)
        if not current_session_config:
            current_session_config = DEFAULT_CONFIG.copy()

        # Keep existing keys if masked
        if new_config.get("openai_api_key") and "•" in new_config["openai_api_key"]:
            new_config["openai_api_key"] = current_session_config.get(
                "openai_api_key", "")
        if new_config.get("gemini_api_key") and "•" in new_config["gemini_api_key"]:
            new_config["gemini_api_key"] = current_session_config.get(
                "gemini_api_key", "")

        # Save to SESSION-SPECIFIC config (not global!)
        session_manager.set_session_config(session_id, new_config)

        logger.info(
            f"[CONFIG] Updated session-specific config for: {session_id}")

        return {
            "message": "Configuration updated for your session",
            "note": "Config is private to your session only"
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to save: {str(e)}")


@app.post("/api/v1/ingest")
async def ingest_document(
    request: IngestRequest,
    response: Response,
    x_session_id: Optional[str] = Header(None)
):
    """Ingest and process document from URL - Session isolated for privacy"""

    try:
        logger.info(
            f"[INGEST] Received session ID from client: {x_session_id}")

        # Get or create isolated session
        session_id, session_db = session_manager.get_or_create_session(
            x_session_id)

        logger.info(
            f"[INGEST] Using session ID: {session_id} (new: {session_id != x_session_id})")

        # Set session ID in response header for client to store
        response.headers["X-Session-Id"] = session_id

        logger.info(
            f"Starting ingestion for: {request.url} (Session: {session_id})")

        # Get session-specific config
        session_config = session_manager.get_session_config(session_id)
        if not session_config:
            session_config = DEFAULT_CONFIG.copy()

        # Scrape URL (with progress logging)
        scraped_data = scrape_url(request.url)
        logger.info(f"✓ Scraped: {scraped_data['title']}")

        # Chunk content (optimized)
        chunk_size = session_config.get("chunk_size", 1000)
        chunk_overlap = session_config.get("chunk_overlap", 200)
        logger.info(f"Chunking text ({len(scraped_data['content'])} chars)...")
        chunks = chunk_text(scraped_data["content"], chunk_size, chunk_overlap)

        if not chunks:
            raise HTTPException(
                status_code=400, detail="No content extracted from URL")

        # Generate embeddings (batch processing is already efficient)
        provider = request.provider if request.provider else "opensource"
        logger.info(
            f"Generating embeddings for {len(chunks)} chunks using {provider}...")
        embeddings = get_embeddings(
            chunks, provider, task_type="retrieval_document", config=session_config)
        logger.info(f"✓ Generated {len(embeddings)} embeddings")

        # Prepare metadata (list comprehension is already fast)
        metadatas = [
            {
                "source": request.url,
                "title": scraped_data["title"],
                "chunk_index": i,
                "total_chunks": len(chunks),
                "session_id": session_id  # Track which session owns this data
            }
            for i in range(len(chunks))
        ]

        # Store in SESSION-ISOLATED vector database (not global!)
        logger.info("Storing in session-isolated vector database...")
        session_db.add(
            embeddings=embeddings,
            documents=chunks,
            metadatas=metadatas
        )
        logger.info(
            f"✓ Successfully ingested {len(chunks)} chunks into isolated session")
        logger.info(
            f"[INGEST] Session {session_id} now has {session_db.count()} total chunks")

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
        raise HTTPException(
            status_code=500, detail=f"Ingestion failed: {str(e)}")


@app.get("/api/v1/knowledge-bases")
async def get_knowledge_bases(x_session_id: Optional[str] = Header(None)):
    """Get list of ingested sources from the user's session"""
    try:
        # Get session database if it exists
        if not x_session_id:
            return {"knowledge_bases": []}

        session_db = session_manager.get_session(x_session_id)
        if not session_db:
            return {"knowledge_bases": []}

        # Get all unique sources from session database
        sources = set()
        for metadata in session_db.metadatas:
            if metadata and metadata.get("title"):
                sources.add(metadata["title"])

        return {"knowledge_bases": sorted(list(sources))}
    except Exception as e:
        logger.error(f"Error fetching knowledge bases: {e}")
        return {"knowledge_bases": []}


@app.post("/api/v1/ask")
async def query_documents(
    request: QueryRequest,
    x_session_id: Optional[str] = Header(None)
):
    """Query documents with RAG - Only searches YOUR session's documents"""

    try:
        # Get session database (must exist to query)
        if not x_session_id:
            return {
                "answer": "No session found. Please ingest documents first to create a session.",
                "sources": [],
                "session_required": True
            }

        session_db = session_manager.get_session(x_session_id)
        if not session_db:
            return {
                "answer": "Session expired or not found. Please ingest documents again to start a new session.",
                "sources": [],
                "session_expired": True
            }

        # Get session-specific config
        session_config = session_manager.get_session_config(x_session_id)
        if not session_config:
            session_config = DEFAULT_CONFIG.copy()

        logger.info(
            f"Querying session-isolated database (Session: {x_session_id})")

        # Generate query embedding
        query_embedding = get_embeddings(
            [request.query], request.provider, task_type="retrieval_query", config=session_config)[0]

        # Retrieve relevant chunks from SESSION database only
        top_k = session_config.get("top_k_results", 5)
        results = session_db.search(query_embedding, k=top_k)

        if not results or not results.get("documents") or not results["documents"][0]:
            return {
                "answer": "I don't have enough information in your session to answer that question. Please ingest relevant documentation first.",
                "sources": []
            }

        # Combine context
        documents = results["documents"][0]
        metadatas_list = results.get("metadatas", [[]])[0]

        context = "\n\n".join(documents)

        # Query LLM with session-specific config
        answer = query_llm(request.query, context,
                           request.provider, config=session_config)

        # Prepare unique sources with their used chunk indices
        source_chunks = {}
        for i, metadata in enumerate(metadatas_list):
            if metadata and metadata.get("source"):
                source_url = metadata.get("source")
                chunk_index = metadata.get("chunk_index", i)

                if source_url not in source_chunks:
                    source_chunks[source_url] = []
                source_chunks[source_url].append({
                    "index": chunk_index,
                    "content": documents[i][:200] + "..." if len(documents[i]) > 200 else documents[i]
                })

        # Format sources for response
        sources = [
            {
                "url": url,
                "used_chunks": chunks
            }
            for url, chunks in source_chunks.items()
        ]

        return {
            "answer": answer,
            "sources": sources,
            "chunks_used": len(documents),
            "session_id": x_session_id
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


@app.post("/api/v1/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """
    Transcribe audio file to text using WhisperX (Local, Free, Fast)

    WhisperX provides:
    - 70x realtime transcription speed
    - No API key required
    - Runs locally on your machine
    - Accurate word-level timestamps
    - Supports 97+ languages

    Supports: mp3, mp4, mpeg, mpga, m4a, wav, webm, flac, ogg
    """
    try:
        # Check if ffmpeg is available - graceful failure
        import shutil
        if not shutil.which("ffmpeg"):
            logger.warning("⚠️ Transcription request failed: ffmpeg not found")
            return {
                "text": "",
                "success": False,
                "error": "Speech-to-text is temporarily unavailable. The server is missing required audio processing tools.",
                "error_code": "FFMPEG_NOT_FOUND"
            }

        # Check if file is provided
        if not file:
            raise HTTPException(
                status_code=400, detail="No audio file provided")

        # Validate file type
        allowed_extensions = [".webm", ".wav", ".mp3",
                              ".mpeg", ".mp4", ".m4a", ".mpga", ".flac", ".ogg"]
        file_ext = os.path.splitext(file.filename or "")[1].lower()

        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported audio format. Supported: {', '.join(allowed_extensions)}"
            )

        # Read file content
        audio_data = await file.read()

        # Check file size (100 MB limit for local processing)
        if len(audio_data) > 100 * 1024 * 1024:
            raise HTTPException(
                status_code=400, detail="Audio file too large. Max size: 100 MB")

        # Import WhisperX
        try:
            import whisperx
            import torch
        except ImportError:
            raise HTTPException(
                status_code=500,
                detail="WhisperX not installed. Run: pip install whisperx"
            )

        # Save audio temporarily
        temp_dir = Path("temp_audio")
        temp_dir.mkdir(exist_ok=True)

        # Use original filename or generate one
        temp_filename = file.filename or "audio.webm"
        temp_file_path = temp_dir / temp_filename

        with open(temp_file_path, "wb") as f:
            f.write(audio_data)

        try:
            # Debug logging - START
            with open("whisperx_debug.log", "a") as f:
                f.write(f"\n\n=== NEW TRANSCRIPTION REQUEST ===\n")
                f.write(f"Temp file path: {temp_file_path}\n")
                f.write(f"File exists: {temp_file_path.exists()}\n")
                f.write(
                    f"File size: {temp_file_path.stat().st_size if temp_file_path.exists() else 'N/A'} bytes\n")

            # Use global model cache for instant transcription after first use
            global whisperx_model, whisperx_device

            if whisperx_model is None:
                # Determine device (GPU if available, otherwise CPU)
                whisperx_device = "cuda" if torch.cuda.is_available() else "cpu"
                compute_type = "float16" if whisperx_device == "cuda" else "int8"

                logger.info(f"Loading WhisperX model on {whisperx_device}...")

                # Load WhisperX model - using TINY for 3x faster speed!
                # Model sizes: tiny (fastest), base, small, medium, large-v2 (slowest but most accurate)
                whisperx_model = whisperx.load_model(
                    "tiny",  # FASTEST model - only ~40MB, 70x realtime on CPU!
                    device=whisperx_device,
                    compute_type=compute_type
                )

            # Reuse cached model for instant transcription
            model = whisperx_model

            # Load and transcribe audio with ffmpeg error handling
            with open("whisperx_debug.log", "a") as f:
                f.write(f"\n[{temp_file_path}] Loading audio...\n")

            try:
                audio = whisperx.load_audio(str(temp_file_path))
            except Exception as audio_load_error:
                logger.error(
                    f"Failed to load audio (ffmpeg issue): {audio_load_error}")
                if temp_file_path.exists():
                    temp_file_path.unlink()
                return {
                    "text": "",
                    "success": False,
                    "error": "Failed to process audio file. Audio format may be unsupported or corrupted.",
                    "error_code": "AUDIO_LOAD_FAILED"
                }

            with open("whisperx_debug.log", "a") as f:
                f.write(
                    f"Audio loaded: shape={audio.shape if hasattr(audio, 'shape') else 'no shape'}, dtype={audio.dtype if hasattr(audio, 'dtype') else 'no dtype'}\n")

            # Transcribe with language detection
            with open("whisperx_debug.log", "a") as f:
                f.write("Starting transcription...\n")

            result = model.transcribe(audio, batch_size=16)

            with open("whisperx_debug.log", "a") as f:
                f.write(f"Transcription complete: {result}\n")

            # Extract transcribed text from segments
            segments = result.get("segments", [])
            transcribed_text = " ".join(
                [segment["text"].strip() for segment in segments]) if segments else ""

            # Clean up
            temp_file_path.unlink()
            # Don't delete the global cached model!
            if whisperx_device == "cuda":
                torch.cuda.empty_cache()

            return {
                "text": transcribed_text.strip(),
                "success": True,
                "language": result.get("language", "unknown"),
                "segments": len(segments)
            }

        except Exception as transcribe_error:
            # Log detailed error for debugging
            error_details = traceback.format_exc()
            logger.error(f"WhisperX transcription error: {error_details}")

            # Write full error to debug file
            with open("whisperx_debug.log", "a") as f:
                f.write(f"\n=== WHISPERX ERROR ===\n{error_details}\n")

            # Clean up temporary file on error
            if temp_file_path.exists():
                temp_file_path.unlink()

            # Return graceful error response instead of raising exception
            return {
                "text": "",
                "success": False,
                "error": "Transcription service encountered an error. Please try again.",
                "error_code": "TRANSCRIPTION_FAILED"
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Transcription endpoint error: {str(e)}")
        return {
            "text": "",
            "success": False,
            "error": "An unexpected error occurred during audio processing.",
            "error_code": "UNEXPECTED_ERROR"
        }


@app.post("/api/v1/text-to-speech")
async def text_to_speech(text: str = Form(...)):
    """
    Convert text to speech with natural, human-like voice using Microsoft Edge TTS.

    Features:
    - Uses Edge TTS (Microsoft neural AI voices)
    - Natural speech patterns with pauses and rhythm
    - Thoughtful delivery with proper pacing

    Returns audio file in MP3 format.
    """
    try:
        from fastapi.responses import FileResponse
        import tempfile

        if not text or len(text.strip()) == 0:
            raise HTTPException(status_code=400, detail="Text is required")

        # Clean markdown formatting before TTS
        # Remove markdown syntax that sounds bad when read aloud
        clean_text = text

        # Remove markdown headers (# ## ###)
        clean_text = re.sub(r'^#+\s+', '', clean_text, flags=re.MULTILINE)

        # Remove bold/italic markers (**text** or *text* or __text__ or _text_)
        clean_text = re.sub(r'\*\*\*(.+?)\*\*\*', r'\1',
                            clean_text)  # ***bold italic***
        clean_text = re.sub(r'\*\*(.+?)\*\*', r'\1', clean_text)  # **bold**
        clean_text = re.sub(r'\*(.+?)\*', r'\1', clean_text)  # *italic*
        clean_text = re.sub(r'___(.+?)___', r'\1',
                            clean_text)  # ___bold italic___
        clean_text = re.sub(r'__(.+?)__', r'\1', clean_text)  # __bold__
        clean_text = re.sub(r'_(.+?)_', r'\1', clean_text)  # _italic_

        # Remove code blocks (```code```)
        clean_text = re.sub(r'```[\s\S]*?```', ' code block ', clean_text)

        # Remove inline code (`code`)
        clean_text = re.sub(r'`([^`]+)`', r'\1', clean_text)

        # Remove links but keep text [text](url) -> text
        clean_text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', clean_text)

        # Remove images ![alt](url)
        clean_text = re.sub(r'!\[[^\]]*\]\([^)]+\)', '', clean_text)

        # Remove bullet points and list markers
        clean_text = re.sub(r'^[\s]*[-*+]\s+', '',
                            clean_text, flags=re.MULTILINE)
        clean_text = re.sub(r'^[\s]*\d+\.\s+', '',
                            clean_text, flags=re.MULTILINE)

        # Remove blockquotes
        clean_text = re.sub(r'^>\s+', '', clean_text, flags=re.MULTILINE)

        # Remove horizontal rules
        clean_text = re.sub(r'^[-*_]{3,}$', '', clean_text, flags=re.MULTILINE)

        # Remove HTML tags
        clean_text = re.sub(r'<[^>]+>', '', clean_text)

        # Clean up multiple spaces and newlines
        clean_text = re.sub(r'\s+', ' ', clean_text)
        clean_text = clean_text.strip()

        text = clean_text

        # Limit text length for performance
        if len(text) > 5000:
            text = text[:5000] + "..."

        logger.info(f"TTS request for cleaned text length: {len(text)}")

        # Add natural pauses and human-like speech patterns
        # Insert thinking pauses, hesitations for more natural feel
        natural_text = text

        # Add brief pauses after sentences for breathing
        natural_text = re.sub(r'([.!?])\s+', r'\1... ', natural_text)

        # Add thinking pauses before complex words/phrases
        complex_indicators = ['however', 'therefore',
                              'additionally', 'furthermore', 'moreover', 'consequently']
        for indicator in complex_indicators:
            natural_text = re.sub(
                rf'\b({indicator})\b',
                r'... \1',
                natural_text,
                flags=re.IGNORECASE
            )

        # Add natural pauses at commas
        natural_text = re.sub(r',\s+', ', ... ', natural_text)

        # Limit pause density (don't overdo it)
        natural_text = re.sub(r'(\.{3,}\s*){3,}', '... ', natural_text)

        text = natural_text

        # Use Edge TTS (Microsoft AI voices - best quality, no fallbacks)
        temp_audio_path = None
        try:
            import edge_tts
            import asyncio

            # Create temp file for audio
            temp_audio = tempfile.NamedTemporaryFile(
                delete=False, suffix=".mp3")
            temp_audio_path = Path(temp_audio.name)
            temp_audio.close()

            # Use Microsoft Edge TTS with conversational style for more natural delivery
            # Available voices: en-US-AriaNeural (female), en-US-GuyNeural (male)
            # en-GB-SoniaNeural (British female), en-GB-RyanNeural (British male)
            voice = "en-US-AriaNeural"

            # Create communication object with rate adjustment for natural pacing
            # Rate: +0% is default, -10% is slightly slower (more thoughtful)
            communicate = edge_tts.Communicate(
                text,
                voice,
                rate="-5%",  # Slightly slower for more natural, thoughtful delivery
                pitch="+0Hz"  # Natural pitch
            )

            # Save audio with timeout for production environments
            try:
                await asyncio.wait_for(communicate.save(str(temp_audio_path)), timeout=30.0)
            except asyncio.TimeoutError:
                raise HTTPException(
                    status_code=504,
                    detail="Text-to-speech timed out. Please try with shorter text."
                )

            logger.info(
                f"✓ TTS generated with Edge TTS (AI voice, natural pauses): {temp_audio_path}")

            return FileResponse(
                path=str(temp_audio_path),
                media_type="audio/mpeg",
                filename="speech.mp3",
                headers={
                    "X-TTS-Method": "edge-tts",
                    "X-TTS-Quality": "ultra-high",
                    "X-TTS-Voice": voice,
                    "X-TTS-Style": "conversational"
                }
            )
        except Exception as e:
            logger.error(f"Edge TTS failed: {str(e)}")
            # Clean up temp file if it exists
            try:
                if temp_audio_path is not None and temp_audio_path.exists():
                    temp_audio_path.unlink()
            except:
                pass
                pass

            raise HTTPException(
                status_code=503,
                detail="Text-to-speech is temporarily unavailable. Please check your internet connection and try again."
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"TTS error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Text-to-speech service encountered an error. Please try again later."
        )


@app.get("/api/v1/database/stats")
async def get_database_stats(x_session_id: Optional[str] = Header(None)):
    """Get vector database statistics for your session"""
    try:
        # Get session database
        if not x_session_id:
            return {
                "total_documents": 0,
                "total_chunks": 0,
                "collections": [],
                "message": "No session found"
            }

        session_db = session_manager.get_session(x_session_id)
        if not session_db:
            return {
                "total_documents": 0,
                "total_chunks": 0,
                "collections": [],
                "message": "Session expired or not found"
            }

        # Count unique documents in THIS session only
        unique_sources = set()
        for metadata in session_db.metadatas:
            if metadata and metadata.get("source"):
                unique_sources.add(metadata["source"])

        return {
            "total_documents": len(unique_sources),
            "total_chunks": session_db.count(),
            "collections": ["knowledge_base"],
            "session_id": x_session_id
        }
    except Exception as e:
        print(f"Error getting database stats: {e}")
        return {
            "total_documents": 0,
            "total_chunks": 0,
            "collections": []
        }


@app.get("/api/v1/database/sources")
async def list_sources(x_session_id: Optional[str] = Header(None)):
    """List all unique sources in YOUR session's database"""
    try:
        # Get session database
        if not x_session_id:
            return {"sources": [], "message": "No session found"}

        session_db = session_manager.get_session(x_session_id)
        if not session_db:
            return {"sources": [], "message": "Session expired or not found"}

        source_counts = {}
        for metadata in session_db.metadatas:
            if metadata and metadata.get("source"):
                source = metadata["source"]
                source_counts[source] = source_counts.get(source, 0) + 1

        sources = [
            {"url": source, "chunks": count}
            for source, count in source_counts.items()
        ]

        return {"sources": sources, "session_id": x_session_id}
    except Exception as e:
        print(f"Error listing sources: {e}")
        return {"sources": []}


@app.get("/api/v1/database/source/chunks")
async def get_source_chunks(url: str, x_session_id: Optional[str] = Header(None)):
    """Get all chunks from a specific source URL in YOUR session"""
    try:
        if not url:
            raise HTTPException(
                status_code=400, detail="URL parameter required")

        # Get session database
        if not x_session_id:
            raise HTTPException(
                status_code=400, detail="Session ID required")

        session_db = session_manager.get_session(x_session_id)
        if not session_db:
            raise HTTPException(
                status_code=404, detail="Session expired or not found")

        # Find all chunks from this source in THIS session
        chunks = []
        for i, metadata in enumerate(session_db.metadatas):
            if metadata and metadata.get("source") == url:
                chunks.append({
                    "content": session_db.documents[i],
                    "metadata": metadata,
                    "index": i
                })

        if not chunks:
            raise HTTPException(
                status_code=404, detail=f"Source not found in your session: {url}")

        return {
            "url": url,
            "total_chunks": len(chunks),
            "chunks": chunks,
            "session_id": x_session_id
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve chunks: {str(e)}")


@app.delete("/api/v1/database/source")
async def delete_source(url: str, x_session_id: Optional[str] = Header(None)):
    """Delete all chunks from a specific source URL in YOUR session"""
    try:
        logger.info(
            f"Delete request for source: {url} (session: {x_session_id})")

        if not url:
            raise HTTPException(
                status_code=400, detail="URL parameter required")

        # Get session database
        if not x_session_id:
            raise HTTPException(
                status_code=400, detail="Session ID required")

        session_db = session_manager.get_session(x_session_id)
        if not session_db:
            raise HTTPException(
                status_code=404, detail="Session expired or not found")

        # Log current database state
        logger.info(
            f"Session database has {len(session_db.documents)} documents")
        logger.info(
            f"Session database has {len(session_db.metadatas)} metadatas")

        # Find indices of chunks to keep (not from this source)
        indices_to_keep = []
        deleted_count = 0

        for i, metadata in enumerate(session_db.metadatas):
            if metadata and metadata.get("source") == url:
                deleted_count += 1
            else:
                indices_to_keep.append(i)

        logger.info(
            f"Found {deleted_count} chunks to delete, {len(indices_to_keep)} to keep")

        if deleted_count == 0:
            raise HTTPException(
                status_code=404, detail=f"Source not found in your session: {url}")

        # Create new lists with only kept items
        new_documents = [session_db.documents[i] for i in indices_to_keep]
        new_metadatas = [session_db.metadatas[i] for i in indices_to_keep]

        logger.info(
            f"Created new lists: {len(new_documents)} documents, {len(new_metadatas)} metadatas")

        # Rebuild FAISS index with kept embeddings
        if indices_to_keep:
            if faiss is None:
                raise HTTPException(
                    status_code=500, detail="FAISS not available - cannot delete source")

            if session_db.index is None:
                raise HTTPException(
                    status_code=500, detail="Vector database index not initialized")

            logger.info(
                f"Reconstructing {len(indices_to_keep)} vectors from FAISS index")

            kept_embeddings = []
            for i in indices_to_keep:
                vec = np.zeros(session_db.index.d,
                               dtype=np.float32)  # type: ignore
                session_db.index.reconstruct(i, vec)  # type: ignore
                kept_embeddings.append(vec)

            logger.info(
                f"Successfully reconstructed {len(kept_embeddings)} vectors")

            # Create new index with the correct dimension
            embeddings_array = np.array(kept_embeddings, dtype=np.float32)
            actual_dimension = embeddings_array.shape[1]

            logger.info(
                f"Creating new index with dimension {actual_dimension}")

            # Initialize new index without resetting documents/metadatas
            if faiss is None:
                raise HTTPException(
                    status_code=500, detail="FAISS not available - cannot delete source")

            session_db.index = faiss.IndexFlatL2(actual_dimension)
            session_db.dimension = actual_dimension

            # Add the kept embeddings to the new index
            session_db.index.add(embeddings_array)  # type: ignore

            # type: ignore
            logger.info(
                f"Created new index with {session_db.index.ntotal} vectors")
        else:
            # Empty database for this session
            logger.info(
                "No chunks to keep - initializing empty database for session")
            if faiss is None:
                raise HTTPException(
                    status_code=500, detail="FAISS not available - cannot delete source")
            session_db.index = faiss.IndexFlatL2(session_db.dimension)

        # Update documents and metadata in SESSION database
        session_db.documents = new_documents
        session_db.metadatas = new_metadatas

        logger.info(f"Successfully deleted source from session: {url}")

        return {
            "message": f"Deleted {deleted_count} chunks from source",
            "deleted_chunks": deleted_count,
            "remaining_chunks": len(new_documents),
            "source": url,
            "session_id": x_session_id
        }
    except HTTPException:
        raise
    except Exception as e:
        # Log the full error for debugging
        error_details = traceback.format_exc()
        logger.error(f"Delete source error: {error_details}")
        raise HTTPException(
            status_code=500, detail=f"Failed to delete source: {str(e)}")


@app.post("/api/v1/database/clear")
async def clear_database(x_session_id: Optional[str] = Header(None)):
    """Clear all data from YOUR session's database"""
    try:
        # Get session database
        if not x_session_id:
            raise HTTPException(
                status_code=400, detail="Session ID required")

        session_db = session_manager.get_session(x_session_id)
        if not session_db:
            raise HTTPException(
                status_code=404, detail="Session expired or not found")

        # Clear the session database
        session_db.clear()

        return {
            "message": "Session database cleared successfully",
            "session_id": x_session_id
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to clear database: {str(e)}")


@app.get("/api/v1/session/info")
async def get_session_info(x_session_id: Optional[str] = Header(None)):
    """Get information about YOUR current session"""
    try:
        if not x_session_id:
            return {
                "session_id": None,
                "exists": False,
                "message": "No session ID provided"
            }

        stats = session_manager.get_session_stats(x_session_id)

        if not stats:
            return {
                "session_id": x_session_id,
                "exists": False,
                "message": "Session expired or not found"
            }

        return {
            "session_id": x_session_id,
            "exists": True,
            **stats
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get session info: {str(e)}")


@app.delete("/api/v1/session")
async def delete_session(x_session_id: Optional[str] = Header(None)):
    """Manually delete YOUR current session"""
    try:
        if not x_session_id:
            raise HTTPException(
                status_code=400, detail="Session ID required")

        success = session_manager.delete_session(x_session_id)

        if not success:
            raise HTTPException(
                status_code=404, detail="Session not found")

        return {
            "message": "Session deleted successfully",
            "session_id": x_session_id
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to delete session: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("Starting cogent-x Backend Server")
    print("=" * 60)
    print(f"FAISS available: {faiss is not None}")
    print(f"BeautifulSoup available: {BeautifulSoup is not None}")
    print(f"SentenceTransformer available: {SentenceTransformer is not None}")
    print(f"Configuration loaded: {CURRENT_CONFIG is not None}")
    print("=" * 60)

    # Get port from environment variable (for Render/Docker)
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")

    print(f"Server will start on: http://{host}:{port}")
    print(f"API docs available at: http://localhost:{port}/api/docs")
    print(f"Health check: http://localhost:{port}/api/v1/health")
    print("=" * 60)

    uvicorn.run(app, host=host, port=port)
