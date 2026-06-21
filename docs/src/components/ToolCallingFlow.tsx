import React, {useState, useEffect} from 'react';

const steps = [
  { id: 'question', label: 'User asks a real-time question', detail: '"What\'s the current price of QQQ?"', color: '#10b981' },
  { id: 'llm_decide', label: 'LLM decides to call a tool', detail: 'Model recognizes this needs live data → calls get_stock_quote(symbol="QQQ")', color: '#6366f1' },
  { id: 'execute', label: 'System executes the tool', detail: 'yfinance fetches QQQ data in a thread pool (asyncio.to_thread)', color: '#f59e0b' },
  { id: 'result', label: 'Tool result returned to LLM', detail: 'QQQ: $485.32, +1.23% ↑, Volume: 42,123,456', color: '#8b5cf6' },
  { id: 'answer', label: 'LLM generates final answer', detail: '"Based on the latest data, QQQ is trading at $485.32, up 1.23% today..."', color: '#ef4444' },
];

const tools = [
  {
    name: 'web_search',
    desc: 'Search the internet via Tavily API',
    params: [{ name: 'query', type: 'string', desc: 'Search keywords (Chinese recommended)' }],
    requires: 'tavily_api_key',
    color: '#10b981',
  },
  {
    name: 'get_stock_quote',
    desc: 'Get real-time stock/ETF/index prices',
    params: [{ name: 'symbol', type: 'string', desc: 'Stock code (e.g., 601398.SS, 0700.HK, AAPL)' }],
    requires: 'yfinance (auto-installed)',
    color: '#f59e0b',
  },
  {
    name: 'get_market_overview',
    desc: 'Get major market index summary',
    params: [],
    requires: 'yfinance (auto-installed)',
    color: '#6366f1',
  },
];

export default function ToolCallingFlow() {
  const [activeStep, setActiveStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTool, setActiveTool] = useState<number | null>(null);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setActiveStep(prev => {
        if (prev >= steps.length - 1) { setIsPlaying(false); return prev; }
        return prev + 1;
      });
    }, 2500);
    return () => clearInterval(timer);
  }, [isPlaying]);

  return (
    <div style={{margin: '1.5rem 0'}}>
      {/* Tool calling flow */}
      <h4 style={{marginBottom: '12px', fontSize: '0.95rem'}}>Tool Calling Flow</h4>
      <div style={{display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap'}}>
        <button
          onClick={() => { setActiveStep(0); setIsPlaying(true); }}
          style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', background: '#6366f1', color: 'white', cursor: 'pointer', fontSize: '0.85rem' }}
        >▶ Play</button>
        <button
          onClick={() => { setIsPlaying(false); setActiveStep(0); }}
          style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid rgba(128,128,128,0.3)', background: 'transparent', cursor: 'pointer', fontSize: '0.85rem' }}
        >Reset</button>
      </div>

      {/* Step progress bar */}
      <div style={{display: 'flex', gap: '4px', marginBottom: '16px'}}>
        {steps.map((s, i) => (
          <div key={s.id} onClick={() => { setIsPlaying(false); setActiveStep(i); }}
            style={{ flex: 1, height: '4px', borderRadius: '2px', background: i <= activeStep ? s.color : 'rgba(128,128,128,0.2)', cursor: 'pointer', transition: 'background 0.3s' }}
          />
        ))}
      </div>

      {/* Active step */}
      <div style={{
        padding: '16px', borderRadius: '10px',
        border: `2px solid ${steps[activeStep].color}`,
        background: `${steps[activeStep].color}08`,
        transition: 'all 0.3s', marginBottom: '20px',
      }}>
        <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px'}}>
          <span style={{
            width: '26px', height: '26px', borderRadius: '50%',
            background: steps[activeStep].color, color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.8rem', fontWeight: 700,
          }}>{activeStep + 1}</span>
          <span style={{fontWeight: 700, fontSize: '1rem'}}>{steps[activeStep].label}</span>
        </div>
        <div style={{
          padding: '8px 12px', borderRadius: '6px',
          background: 'rgba(128,128,128,0.06)',
          fontFamily: 'monospace', fontSize: '0.82rem',
          lineHeight: 1.5,
        }}>{steps[activeStep].detail}</div>
      </div>

      {/* Step buttons */}
      <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '24px'}}>
        {steps.map((s, i) => (
          <button key={s.id} onClick={() => { setIsPlaying(false); setActiveStep(i); }}
            style={{
              padding: '4px 10px', borderRadius: '6px',
              border: i === activeStep ? `2px solid ${s.color}` : '1px solid rgba(128,128,128,0.2)',
              background: i === activeStep ? `${s.color}15` : 'transparent',
              cursor: 'pointer', fontSize: '0.75rem',
              fontWeight: i === activeStep ? 600 : 400, transition: 'all 0.2s',
            }}
          >{s.label.split(' ').slice(0, 3).join(' ')}</button>
        ))}
      </div>

      {/* Available tools */}
      <h4 style={{marginBottom: '12px', fontSize: '0.95rem'}}>Available Tools</h4>
      <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
        {tools.map((tool, i) => (
          <div key={tool.name} onClick={() => setActiveTool(activeTool === i ? null : i)}
            style={{
              padding: '12px 16px', borderRadius: '8px', cursor: 'pointer',
              border: activeTool === i ? `2px solid ${tool.color}` : '1px solid rgba(128,128,128,0.15)',
              background: activeTool === i ? `${tool.color}08` : 'transparent',
              transition: 'all 0.2s',
            }}
          >
            <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
              <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', background: tool.color, color: 'white', fontFamily: 'monospace' }}>
                {tool.name}
              </span>
              <span style={{fontSize: '0.85rem', opacity: 0.8}}>{tool.desc}</span>
            </div>
            {activeTool === i && (
              <div style={{marginTop: '10px', fontSize: '0.8rem', lineHeight: 1.6}}>
                {tool.params.length > 0 && (
                  <div style={{marginBottom: '6px'}}>
                    <strong>Parameters:</strong>
                    {tool.params.map(p => (
                      <div key={p.name} style={{marginLeft: '12px', fontFamily: 'monospace', fontSize: '0.78rem'}}>
                        <span style={{color: '#6366f1'}}>{p.name}</span>: {p.type} — {p.desc}
                      </div>
                    ))}
                  </div>
                )}
                {tool.params.length === 0 && <div style={{marginBottom: '6px', opacity: 0.6}}>No parameters required</div>}
                <div style={{fontSize: '0.75rem', opacity: 0.5}}>Requires: {tool.requires}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
