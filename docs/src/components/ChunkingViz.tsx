import React, {useState} from 'react';

const sampleText = `The professor's recommended US stock ETF is mainly QQQ (Nasdaq 100 Index ETF). When users ask "I don't know what to buy in US stocks", the professor's answer is "just QQQ". QQQ's advantage is that it doesn't distribute dividends - no dividends means no gains tax until you sell, making it suitable for long-term holding. Additionally, the professor also recommends S&P 500 ETF as an alternative, believing that the S&P's premium is relatively acceptable. For large amounts of capital, one can consider purchasing products like 03441.HK through Hong Kong Stock Connect. The professor also mentioned that dollar-cost averaging is a good way to participate in US stocks without needing to time the market.`;

const CHUNK_SIZE = 200;
const OVERLAP = 50;

function generateChunks(text: string) {
  const chunks: {text: string; start: number; end: number; overlapWithPrev: boolean}[] = [];
  let pos = 0;
  while (pos < text.length) {
    let end = Math.min(pos + CHUNK_SIZE, text.length);
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('.', end);
      const lastQuestion = text.lastIndexOf('?', end);
      const splitAt = Math.max(lastPeriod, lastQuestion);
      if (splitAt > pos + CHUNK_SIZE * 0.5) {
        end = splitAt + 1;
      }
    }
    chunks.push({
      text: text.slice(pos, end),
      start: pos,
      end,
      overlapWithPrev: pos > 0,
    });
    pos = end - OVERLAP;
    if (pos <= chunks[chunks.length - 1].start) pos = end;
  }
  return chunks;
}

const chunks = generateChunks(sampleText);
const chunkColors = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];

export default function ChunkingViz() {
  const [activeChunk, setActiveChunk] = useState<number | null>(null);

  return (
    <div style={{margin: '1.5rem 0'}}>
      <div style={{display: 'flex', gap: '16px', marginBottom: '16px', fontSize: '0.85rem', flexWrap: 'wrap'}}>
        <span>Chunk Size: <strong>{CHUNK_SIZE} chars</strong></span>
        <span>Overlap: <strong>{OVERLAP} chars</strong></span>
        <span>Generated: <strong>{chunks.length} chunks</strong></span>
      </div>

      <div style={{
        padding: '16px',
        borderRadius: '8px',
        border: '1px solid rgba(128,128,128,0.2)',
        lineHeight: 1.8,
        fontSize: '0.9rem',
        marginBottom: '16px',
      }}>
        <div style={{fontSize: '0.75rem', opacity: 0.5, marginBottom: '8px'}}>Original Text</div>
        {sampleText.split('').map((char, i) => {
          const chunkIdx = chunks.findIndex(c => i >= c.start && i < c.end);
          const isActive = activeChunk !== null && i >= chunks[activeChunk].start && i < chunks[activeChunk].end;
          const isOverlap = activeChunk !== null && i >= chunks[activeChunk].start && i < chunks[activeChunk].start + OVERLAP && chunks[activeChunk].overlapWithPrev;

          return (
            <span
              key={i}
              style={{
                background: isActive
                  ? isOverlap ? `${chunkColors[activeChunk % chunkColors.length]}30` : `${chunkColors[activeChunk % chunkColors.length]}18`
                  : chunkIdx >= 0 ? `${chunkColors[chunkIdx % chunkColors.length]}08` : 'transparent',
                borderBottom: isActive ? `2px solid ${chunkColors[activeChunk % chunkColors.length]}` : 'none',
                transition: 'all 0.2s',
              }}
            >
              {char}
            </span>
          );
        })}
      </div>

      <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
        {chunks.map((chunk, i) => {
          const color = chunkColors[i % chunkColors.length];
          const isActive = activeChunk === i;

          return (
            <div
              key={i}
              onClick={() => setActiveChunk(isActive ? null : i)}
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                border: isActive ? `2px solid ${color}` : '1px solid rgba(128,128,128,0.15)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: isActive ? `${color}08` : 'transparent',
              }}
            >
              <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px'}}>
                <span style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: color,
                }} />
                <span style={{fontWeight: 600, fontSize: '0.85rem'}}>Chunk {i + 1}</span>
                <span style={{fontSize: '0.7rem', opacity: 0.5}}>
                  chars {chunk.start}-{chunk.end} ({chunk.end - chunk.start})
                </span>
                {chunk.overlapWithPrev && (
                  <span style={{
                    fontSize: '0.65rem',
                    padding: '1px 6px',
                    borderRadius: '3px',
                    background: `${color}20`,
                    color: color,
                  }}>
                    overlaps prev by {OVERLAP}
                  </span>
                )}
              </div>
              <div style={{
                fontSize: '0.8rem',
                opacity: 0.7,
                lineHeight: 1.5,
                maxHeight: isActive ? '200px' : '40px',
                overflow: 'hidden',
                transition: 'max-height 0.3s',
              }}>
                {chunk.text}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
