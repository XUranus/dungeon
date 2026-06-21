import React, {useState, useEffect} from 'react';

const pipelineSteps = [
  { id: 'find', label: 'Find Topics', desc: 'Search for articles containing "教授指数" or "叫兽指数" keywords, plus column articles from the dedicated Zsxq column.', detail: 'Keyword search + Column article priority\n→ 8 latest articles + Q&A context', color: '#10b981' },
  { id: 'images', label: 'Vision Recognition', desc: 'Use multimodal LLM (GPT-4o) to recognize portfolio tables from screenshots embedded in articles.', detail: 'Max 3 images per topic\nSemaphore-limited (2 concurrent)\nExtract: stock names, codes, weights', color: '#6366f1' },
  { id: 'parse', label: 'LLM Parsing', desc: 'Send all article text + image descriptions to LLM with structured JSON output to extract holdings.', detail: 'response_format: json_object\nTemperature: 0.1 (deterministic)\nOutput: China version + Global version', color: '#f59e0b' },
  { id: 'save', label: 'Save Snapshot', desc: 'Persist parsed holdings as a new snapshot in the database, with individual holding records.', detail: 'ProfessorIndexSnapshot + ProfessorIndexHolding\nversion: 内地版 | 全球版', color: '#ef4444' },
];

const markets = [
  { name: 'A-Share', code: '601398', example: '601398 (ICBC)', color: '#ef4444' },
  { name: 'HK Stock', code: '03441.HK', example: '03441.HK', color: '#f59e0b' },
  { name: 'US Stock', code: 'QQQ', example: 'QQQ / AAPL / SPY', color: '#6366f1' },
  { name: 'Japan Stock', code: '', example: 'Tokyo exchange tickers', color: '#8b5cf6' },
  { name: 'Fund', code: '', example: 'Mutual funds / ETFs', color: '#10b981' },
];

export default function ProfessorIndexFlow() {
  const [activeStep, setActiveStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setActiveStep(prev => {
        if (prev >= pipelineSteps.length - 1) { setIsPlaying(false); return prev; }
        return prev + 1;
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [isPlaying]);

  return (
    <div style={{margin: '1.5rem 0'}}>
      <h4 style={{marginBottom: '12px', fontSize: '0.95rem'}}>Parsing Pipeline</h4>
      <div style={{display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap'}}>
        <button onClick={() => { setActiveStep(0); setIsPlaying(true); }}
          style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', background: '#6366f1', color: 'white', cursor: 'pointer', fontSize: '0.85rem' }}
        >▶ Play</button>
        <button onClick={() => { setIsPlaying(false); setActiveStep(0); }}
          style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid rgba(128,128,128,0.3)', background: 'transparent', cursor: 'pointer', fontSize: '0.85rem' }}
        >Reset</button>
      </div>

      {/* Step indicators */}
      <div style={{display: 'flex', gap: '4px', marginBottom: '16px'}}>
        {pipelineSteps.map((s, i) => (
          <div key={s.id} onClick={() => { setIsPlaying(false); setActiveStep(i); }}
            style={{ flex: 1, height: '4px', borderRadius: '2px', background: i <= activeStep ? s.color : 'rgba(128,128,128,0.2)', cursor: 'pointer', transition: 'background 0.3s' }}
          />
        ))}
      </div>

      {/* Active step detail */}
      <div style={{
        padding: '16px', borderRadius: '10px',
        border: `2px solid ${pipelineSteps[activeStep].color}`,
        background: `${pipelineSteps[activeStep].color}08`,
        transition: 'all 0.3s', marginBottom: '16px',
      }}>
        <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px'}}>
          <span style={{
            width: '26px', height: '26px', borderRadius: '50%',
            background: pipelineSteps[activeStep].color, color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.8rem', fontWeight: 700,
          }}>{activeStep + 1}</span>
          <span style={{fontWeight: 700, fontSize: '1rem'}}>{pipelineSteps[activeStep].label}</span>
        </div>
        <p style={{margin: '0 0 10px', opacity: 0.8, fontSize: '0.9rem'}}>{pipelineSteps[activeStep].desc}</p>
        <div style={{
          padding: '8px 12px', borderRadius: '6px',
          background: 'rgba(128,128,128,0.06)',
          fontFamily: 'monospace', fontSize: '0.78rem',
          whiteSpace: 'pre-wrap', lineHeight: 1.5,
        }}>{pipelineSteps[activeStep].detail}</div>
      </div>

      <div style={{display: 'flex', gap: '6px', marginBottom: '24px', flexWrap: 'wrap'}}>
        {pipelineSteps.map((s, i) => (
          <button key={s.id} onClick={() => { setIsPlaying(false); setActiveStep(i); }}
            style={{
              padding: '4px 10px', borderRadius: '6px',
              border: i === activeStep ? `2px solid ${s.color}` : '1px solid rgba(128,128,128,0.2)',
              background: i === activeStep ? `${s.color}15` : 'transparent',
              cursor: 'pointer', fontSize: '0.75rem',
              fontWeight: i === activeStep ? 600 : 400, transition: 'all 0.2s',
            }}
          >{s.label}</button>
        ))}
      </div>

      {/* Supported markets */}
      <h4 style={{marginBottom: '12px', fontSize: '0.95rem'}}>Supported Markets</h4>
      <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px'}}>
        {markets.map(m => (
          <div key={m.name} style={{
            padding: '8px 14px', borderRadius: '8px',
            border: `1px solid ${m.color}40`,
            background: `${m.color}08`,
            fontSize: '0.82rem',
          }}>
            <div style={{fontWeight: 600, color: m.color, marginBottom: '2px'}}>{m.name}</div>
            <div style={{fontFamily: 'monospace', fontSize: '0.75rem', opacity: 0.7}}>{m.example}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
