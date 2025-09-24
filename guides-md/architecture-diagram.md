# System Architecture Diagrams

## Overall System Architecture

<div>
<h3>cogent-x RAG System Architecture</h3>
<div style="border: 1px solid #ccc; padding: 20px; margin: 10px 0; background: #f9f9f9;">

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                         │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │ Document        │ │ Query Interface │ │ System Status   │   │
│  │ Ingestion Panel │ │                 │ │ Panel           │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                               │ HTTP/REST API
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (FastAPI)                         │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │ Document        │ │ Query Processor │ │ Health Monitor  │   │
│  │ Ingestion API   │ │                 │ │                 │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
           │                       │                       │
           ▼                       ▼                       ▼
┌─────────────────┐ ┌─────────────────────────────┐ ┌─────────────────┐
│   ChromaDB      │ │      AI Provider Layer      │ │    Ollama       │
│  (Vector Store) │ │                             │ │ (Open Source)   │
│                 │ │  ┌─────────┐ ┌─────────┐    │ │                 │
│ • Document      │ │  │ OpenAI  │ │ Gemini  │    │ │ • Local Models  │
│   Embeddings    │ │  │   API   │ │   API   │    │ │ • No API Keys   │
│ • Similarity    │ │  └─────────┘ └─────────┘    │ │ • Free Usage    │
│   Search        │ │                             │ │                 │
└─────────────────┘ └─────────────────────────────┘ └─────────────────┘
```

</div>
</div>

## Mermaid Architecture Diagram

```mermaid
graph TB
    subgraph "Frontend Layer"
        UI[React Frontend]
        DIP[Document Ingestion Panel]
        QI[Query Interface]
        SSP[System Status Panel]
        PS[Provider Selector]
    end

    subgraph "Backend Layer"
        API[FastAPI Backend]
        DIA[Document Ingestion API]
        QPA[Query Processing API]
        HMA[Health Monitor API]
    end

    subgraph "AI Provider Layer"
        OPENAI[OpenAI API]
        GEMINI[Gemini API]
        OLLAMA[Ollama Local]
    end

    subgraph "Data Layer"
        CHROMA[ChromaDB Vector Store]
        EMB[Sentence Transformers]
    end

    UI --> DIP
    UI --> QI
    UI --> SSP
    SSP --> PS

    DIP --> DIA
    QI --> QPA
    SSP --> HMA

    DIA --> CHROMA
    QPA --> OPENAI
    QPA --> GEMINI
    QPA --> OLLAMA

    DIA --> EMB
    EMB --> CHROMA

    QPA --> CHROMA
```

## Component Interaction Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant AI_Provider
    participant VectorDB

    Note over User,VectorDB: Document Ingestion Flow
    User->>Frontend: Upload document URL
    Frontend->>Backend: POST /api/v1/ingest
    Backend->>Backend: Fetch & process document
    Backend->>VectorDB: Store embeddings
    VectorDB-->>Backend: Confirmation
    Backend-->>Frontend: Success response
    Frontend-->>User: Ingestion complete

    Note over User,VectorDB: Query Flow
    User->>Frontend: Ask question
    Frontend->>Backend: POST /api/v1/ask
    Backend->>VectorDB: Similarity search
    VectorDB-->>Backend: Relevant documents
    Backend->>AI_Provider: Generate response with context
    AI_Provider-->>Backend: AI response
    Backend-->>Frontend: Response with sources
    Frontend-->>User: Display answer + sources
```

## Deployment Architecture

```mermaid
graph TB
    subgraph "Docker Environment"
        subgraph "Frontend Container"
            NGINX[Nginx Server]
            REACT[React Build]
        end

        subgraph "Backend Container"
            FASTAPI[FastAPI Server]
            PYTHON[Python Runtime]
        end

        subgraph "AI Container"
            OLLAMA_CONTAINER[Ollama Server]
            MODELS[Local AI Models]
        end

        subgraph "Data Volume"
            CHROMADB[ChromaDB Data]
            OLLAMA_DATA[Ollama Models]
        end
    end

    subgraph "External Services"
        OPENAI_EXT[OpenAI API]
        GEMINI_EXT[Gemini API]
    end

    NGINX --> FASTAPI
    FASTAPI --> OLLAMA_CONTAINER
    FASTAPI --> OPENAI_EXT
    FASTAPI --> GEMINI_EXT
    FASTAPI --> CHROMADB
    OLLAMA_CONTAINER --> OLLAMA_DATA
```

## Technology Stack Diagram

```mermaid
graph LR
    subgraph "Frontend Technologies"
        A[React 18]
        B[TypeScript]
        C[Tailwind CSS]
        D[Vite]
        E[React Router]
    end

    subgraph "Backend Technologies"
        F[FastAPI]
        G[Python 3.9+]
        H[Pydantic]
        I[Uvicorn]
    end

    subgraph "AI/ML Technologies"
        J[LangChain]
        K[ChromaDB]
        L[Sentence Transformers]
        M[OpenAI SDK]
        N[Google AI SDK]
        O[Ollama]
    end

    subgraph "Deployment Technologies"
        P[Docker]
        Q[Docker Compose]
        R[Nginx]
    end
```
