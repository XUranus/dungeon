import React, {useState} from 'react';

const layers = [
  {
    id: 'users',
    label: '用户层',
    items: [
      {name: '公共访客', desc: '查看大屏 + 有限问答', color: '#10b981'},
      {name: '管理员', desc: '数据采集 + 设置', color: '#6366f1'},
    ],
  },
  {
    id: 'frontend',
    label: '前端 (React + Tailwind)',
    items: [
      {name: 'DashboardPage', desc: '公共大屏'},
      {name: 'ChatPanel', desc: 'AI 问答'},
      {name: 'TopicsPage', desc: '数据浏览'},
      {name: 'SourcesPage', desc: '爬取管理'},
    ],
  },
  {
    id: 'backend',
    label: '后端 (FastAPI)',
    items: [
      {name: 'Auth', desc: 'JWT 认证'},
      {name: 'RAG Engine', desc: '混合检索 + 生成'},
      {name: 'Ingestion', desc: '文本处理 + 入库'},
      {name: 'Scheduler', desc: '定时爬取'},
    ],
  },
  {
    id: 'storage',
    label: '存储层',
    items: [
      {name: 'SQLite', desc: '主题 + 评论'},
      {name: 'ChromaDB', desc: '向量存储'},
      {name: 'BM25 Index', desc: '内存倒排索引'},
    ],
  },
  {
    id: 'external',
    label: '外部服务',
    items: [
      {name: '知识星球 API', desc: '爬取数据源'},
      {name: '知乎 API', desc: '爬取数据源'},
      {name: 'OpenAI-compatible LLM', desc: '文本生成'},
      {name: 'bge-small-zh', desc: '本地 Embedding'},
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
