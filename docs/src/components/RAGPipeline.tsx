import React, {useState, useEffect} from 'react';

const steps = [
  {
    id: 'question',
    label: 'User Question',
    desc: 'User inputs a natural language question in the chat interface',
    example: 'What US stock ETFs does the professor recommend?',
    color: '#10b981',
  },
  {
    id: 'embed',
    label: 'Question Embedding',
    desc: 'Encode the question into a 512-dimensional vector using bge-small-zh-v1.5',
    example: '[0.023, -0.156, 0.089, ..., 0.234] (512 dimensions)',
    color: '#6366f1',
  },
  {
    id: 'retrieve',
    label: 'Hybrid Retrieval',
    desc: 'Dense (cosine similarity) + BM25 (sparse) + RRF fusion ranking',
    example: 'Dense: 15 results → BM25: 15 results → RRF fusion → Top 12',
    color: '#f59e0b',
  },
  {
    id: 'context',
    label: 'Context Assembly',
    desc: 'Format retrieved document fragments as reference materials with source metadata',
    example: '--- Fragment 1 [Zsxq | q&a] ---\nSource URL: https://...\nContent...',
    color: '#8b5cf6',
  },
  {
    id: 'generate',
    label: 'LLM Generation',
    desc: 'Send system prompt + reference materials + user question to LLM for streaming generation',
    example: 'Based on the professor\'s opinions, the recommended US stock ETF is QQQ...',
    color: '#ef4444',
  },
  {
    id: 'stream',
    label: 'Streaming Response',
    desc: 'Push tokens to frontend via SSE in real-time, rendering Markdown progressively',
    example: 'data: Based on\ndata: the professor\'s\ndata: opinions\ndata: [DONE]',
    color: '#10b981',
  },
];

export default function RAGPipeline() {
  const [activeStep, setActiveStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setActiveStep((prev) => {
        if (prev >= steps.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 2000);
    return () => clearInterval(timer);
  }, [isPlaying]);

  return (
    <div style={{margin: '1.5rem 0'}}>
      <div style={{display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap'}}>
        <button
          onClick={() => { setActiveStep(0); setIsPlaying(true); }}
          style={{
            padding: '6px 16px',
            borderRadius: '6px',
            border: 'none',
            background: '#6366f1',
            color: 'white',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          ▶ Play Animation
        </button>
        <button
          onClick={() => { setIsPlaying(false); setActiveStep(0); }}
          style={{
            padding: '6px 16px',
            borderRadius: '6px',
            border: '1px solid rgba(128,128,128,0.3)',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          Reset
        </button>
        <span style={{fontSize: '0.8rem', opacity: 0.5}}>
          Step {activeStep + 1} / {steps.length}
        </span>
      </div>

      <div style={{display: 'flex', gap: '4px', marginBottom: '16px'}}>
        {steps.map((step, i) => (
          <div
            key={step.id}
            onClick={() => { setIsPlaying(false); setActiveStep(i); }}
            style={{
              flex: 1,
              height: '4px',
              borderRadius: '2px',
              background: i <= activeStep ? step.color : 'rgba(128,128,128,0.2)',
              cursor: 'pointer',
              transition: 'background 0.3s',
            }}
          />
        ))}
      </div>

      <div style={{
        padding: '20px',
        borderRadius: '12px',
        border: `2px solid ${steps[activeStep].color}`,
        background: `${steps[activeStep].color}08`,
        transition: 'all 0.3s',
      }}>
        <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px'}}>
          <span style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: steps[activeStep].color,
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.8rem',
            fontWeight: 700,
          }}>{activeStep + 1}</span>
          <span style={{fontWeight: 700, fontSize: '1.1rem'}}>{steps[activeStep].label}</span>
        </div>
        <p style={{margin: '0 0 12px', opacity: 0.8, fontSize: '0.9rem'}}>{steps[activeStep].desc}</p>
        <div style={{
          padding: '10px 14px',
          borderRadius: '8px',
          background: 'rgba(128,128,128,0.06)',
          fontFamily: 'monospace',
          fontSize: '0.8rem',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}>
          {steps[activeStep].example}
        </div>
      </div>

      <div style={{display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap'}}>
        {steps.map((step, i) => (
          <button
            key={step.id}
            onClick={() => { setIsPlaying(false); setActiveStep(i); }}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: i === activeStep ? `2px solid ${step.color}` : '1px solid rgba(128,128,128,0.2)',
              background: i === activeStep ? `${step.color}15` : 'transparent',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: i === activeStep ? 600 : 400,
              transition: 'all 0.2s',
            }}
          >
            {step.label}
          </button>
        ))}
      </div>
    </div>
  );
}
