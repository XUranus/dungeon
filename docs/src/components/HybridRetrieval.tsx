import React, {useState} from 'react';

const denseResults = [
  {id: 1, title: 'Recommend QQQ as the universal choice', score: 0.92},
  {id: 2, title: 'S&P 500 ETF premium analysis', score: 0.87},
  {id: 3, title: 'Nasdaq dollar-cost averaging strategy', score: 0.81},
  {id: 4, title: 'US stock ETF fee comparison', score: 0.76},
  {id: 5, title: 'HK stocks vs US stocks allocation', score: 0.71},
];

const bm25Results = [
  {id: 3, title: 'Nasdaq dollar-cost averaging strategy', score: 8.5},
  {id: 1, title: 'Recommend QQQ as the universal choice', score: 7.2},
  {id: 6, title: 'QDII quota limitation issues', score: 6.8},
  {id: 2, title: 'S&P 500 ETF premium analysis', score: 5.1},
  {id: 7, title: 'On-market vs off-market ETFs', score: 4.3},
];

const fusedResults = [
  {id: 1, title: 'Recommend QQQ as the universal choice', denseRank: 1, bm25Rank: 2, fusedScore: 0.0645},
  {id: 3, title: 'Nasdaq dollar-cost averaging strategy', denseRank: 3, bm25Rank: 1, fusedScore: 0.0625},
  {id: 2, title: 'S&P 500 ETF premium analysis', denseRank: 2, bm25Rank: 4, fusedScore: 0.0556},
  {id: 6, title: 'QDII quota limitation issues', denseRank: null, bm25Rank: 3, fusedScore: 0.0323},
  {id: 4, title: 'US stock ETF fee comparison', denseRank: 4, bm25Rank: null, fusedScore: 0.0323},
];

export default function HybridRetrieval() {
  const [view, setView] = useState<'dense' | 'bm25' | 'fused'>('fused');

  const viewConfig = {
    dense: {label: 'Dense Vector Search', color: '#6366f1', data: denseResults},
    bm25: {label: 'BM25 Keyword Search', color: '#f59e0b', data: bm25Results},
    fused: {label: 'RRF Fused Result', color: '#10b981', data: fusedResults},
  };

  return (
    <div style={{margin: '1.5rem 0'}}>
      <div style={{display: 'inline-flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(128,128,128,0.3)', marginBottom: '16px'}}>
        {(['dense', 'bm25', 'fused'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              padding: '8px 16px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: view === v ? 600 : 400,
              background: view === v ? viewConfig[v].color : 'transparent',
              color: view === v ? 'white' : 'inherit',
              transition: 'all 0.2s',
            }}
          >
            {viewConfig[v].label}
          </button>
        ))}
      </div>

      <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
        {viewConfig[view].data.map((item, i) => {
          const maxScore = view === 'dense' ? 1 : view === 'bm25' ? 10 : 0.07;
          const rawScore = view === 'dense' ? item.score : view === 'bm25' ? (item as any).score : (item as any).fusedScore;
          const barWidth = Math.min((rawScore / maxScore) * 100, 100);

          return (
            <div key={item.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(128,128,128,0.1)',
              transition: 'all 0.3s',
            }}>
              <span style={{
                width: '20px',
                textAlign: 'center',
                fontWeight: 700,
                fontSize: '0.8rem',
                opacity: 0.5,
              }}>{i + 1}</span>
              <div style={{flex: 1}}>
                <div style={{fontSize: '0.85rem', marginBottom: '4px'}}>{item.title}</div>
                <div style={{
                  height: '4px',
                  borderRadius: '2px',
                  background: 'rgba(128,128,128,0.1)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${barWidth}%`,
                    borderRadius: '2px',
                    background: viewConfig[view].color,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
              <span style={{
                fontSize: '0.75rem',
                opacity: 0.6,
                fontFamily: 'monospace',
                minWidth: '60px',
                textAlign: 'right',
              }}>
                {view === 'dense' ? item.score.toFixed(2) :
                 view === 'bm25' ? (item as any).score.toFixed(1) :
                 (item as any).fusedScore.toFixed(4)}
              </span>
              {view === 'fused' && (
                <div style={{display: 'flex', gap: '4px'}}>
                  {(item as any).denseRank && (
                    <span style={{fontSize: '0.65rem', padding: '1px 5px', borderRadius: '3px', background: '#6366f120', color: '#6366f1'}}>
                      D#{(item as any).denseRank}
                    </span>
                  )}
                  {(item as any).bm25Rank && (
                    <span style={{fontSize: '0.65rem', padding: '1px 5px', borderRadius: '3px', background: '#f59e0b20', color: '#f59e0b'}}>
                      B#{(item as any).bm25Rank}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {view === 'fused' && (
        <div style={{marginTop: '12px', fontSize: '0.75rem', opacity: 0.6}}>
          <strong>RRF Formula:</strong> score = Σ(weight / (k + rank)) — Dense weight 1.5, BM25 weight 1.0, k=60
          <br />
          <span style={{color: '#6366f1'}}>D#</span> = Dense rank · <span style={{color: '#f59e0b'}}>B#</span> = BM25 rank
        </div>
      )}
    </div>
  );
}
