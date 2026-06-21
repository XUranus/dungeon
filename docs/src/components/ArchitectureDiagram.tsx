import React, {useState} from 'react';

const layers = [
  {
    id: 'users',
    label: 'User Layer',
    items: [
      {name: 'Public Visitor', desc: 'Dashboard view + limited Q&A (daily cap)', color: '#10b981'},
      {name: 'Admin', desc: 'Unlimited Q&A + data crawl + settings', color: '#6366f1'},
    ],
  },
  {
    id: 'frontend',
    label: 'Frontend (React + Tailwind CSS)',
    items: [
      {name: 'DashboardPage', desc: 'Public landing page with latest opinions'},
      {name: 'ChatPanel', desc: 'AI-powered Q&A with streaming responses'},
      {name: 'TopicsPage', desc: 'Browse and search crawled content'},
      {name: 'SourcesPage', desc: 'Trigger and monitor crawl tasks'},
    ],
  },
  {
    id: 'backend',
    label: 'Backend (FastAPI)',
    items: [
      {name: 'Auth', desc: 'JWT-based admin authentication'},
      {name: 'RAG Engine', desc: 'Hybrid retrieval + LLM generation'},
      {name: 'Ingestion', desc: 'Text preprocessing + vectorization + storage'},
      {name: 'Scheduler', desc: 'APScheduler periodic crawl jobs'},
    ],
  },
  {
    id: 'storage',
    label: 'Storage Layer',
    items: [
      {name: 'SQLite', desc: 'Topics, comments, tasks, snapshots'},
      {name: 'ChromaDB', desc: 'Vector store (HNSW cosine)'},
      {name: 'BM25 Index', desc: 'In-memory inverted index for keyword search'},
    ],
  },
  {
    id: 'external',
    label: 'External Services',
    items: [
      {name: 'Zsxq API', desc: 'Knowledge Planet content source'},
      {name: 'Zhihu API', desc: 'Zhihu content source'},
      {name: 'OpenAI LLM', desc: 'Text generation (compatible API)'},
      {name: 'bge-small-zh', desc: 'Local embedding model (512-dim)'},
    ],
  },
];

export default function ArchitectureDiagram() {
  const [activeLayer, setActiveLayer] = useState<string | null>(null);

  return (
    <div style={{margin: '1.5rem 0'}}>
      <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
        {layers.map((layer, idx) => (
          <div key={layer.id}>
            <div
              onClick={() => setActiveLayer(activeLayer === layer.id ? null : layer.id)}
              style={{
                cursor: 'pointer',
                padding: '12px 16px',
                borderRadius: '8px',
                border: activeLayer === layer.id ? '2px solid #6366f1' : '1px solid rgba(128,128,128,0.2)',
                background: activeLayer === layer.id ? 'rgba(99,102,241,0.05)' : 'transparent',
                transition: 'all 0.2s',
              }}
            >
              <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px'}}>
                <span style={{
                  fontSize: '0.7rem',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: '#6366f1',
                  color: 'white',
                  fontWeight: 600,
                }}>{idx + 1}</span>
                <span style={{fontWeight: 600, fontSize: '0.9rem'}}>{layer.label}</span>
                <span style={{marginLeft: 'auto', fontSize: '0.75rem', opacity: 0.5}}>
                  {activeLayer === layer.id ? '▼' : '▶'}
                </span>
              </div>
              <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px'}}>
                {layer.items.map((item) => (
                  <div
                    key={item.name}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      background: (item as any).color || 'rgba(128,128,128,0.1)',
                      color: (item as any).color ? 'white' : 'inherit',
                      border: '1px solid rgba(128,128,128,0.15)',
                    }}
                    title={item.desc}
                  >
                    {item.name}
                  </div>
                ))}
              </div>
              {activeLayer === layer.id && (
                <div style={{
                  marginTop: '10px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'rgba(128,128,128,0.05)',
                  fontSize: '0.8rem',
                  lineHeight: 1.6,
                }}>
                  {layer.items.map((item, i) => (
                    <span key={item.name}>
                      <strong>{item.name}</strong>: {item.desc}
                      {i < layer.items.length - 1 && ' · '}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {idx < layers.length - 1 && (
              <div style={{textAlign: 'center', padding: '4px 0', opacity: 0.3, fontSize: '1.2rem'}}>
                ↕
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
