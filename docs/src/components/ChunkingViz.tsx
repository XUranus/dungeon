import React, {useState} from 'react';

const sampleText = `教授推荐的美股ETF主要是QQQ（纳斯达克100指数ETF）。当用户问"美股不知道买啥"时，教授的回答是"就QQQ"。QQQ的优势在于不分红，不卖就没有利得税，适合长期持有。此外，教授也推荐标普500 ETF作为替代选择，认为标普的溢价相对可以忍受。对于大额资金，可以考虑港股通购买03441.HK等产品。教授还提到，定投是参与美股的好方式，不需要择时。`;

const CHUNK_SIZE = 120;
const OVERLAP = 30;

function generateChunks(text: string) {
  const chunks: {text: string; start: number; end: number; overlapWithPrev: boolean}[] = [];
  let pos = 0;
  while (pos < text.length) {
    let end = Math.min(pos + CHUNK_SIZE, text.length);
    // Try to split at sentence boundary
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('。', end);
      const lastQuestion = text.lastIndexOf('？', end);
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
    // Next chunk starts with overlap
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
      {/* Controls */}
      <div style={{display: 'flex', gap: '16px', marginBottom: '16px', fontSize: '0.85rem'}}>
        <span>块大小: <strong>{CHUNK_SIZE} 字符</strong></span>
        <span>重叠: <strong>{OVERLAP} 字符</strong></span>
        <span>生成: <strong>{chunks.length} 个块</strong></span>
      </div>

      {/* Original text with chunk highlights */}
      <div style={{
        padding: '16px',
        borderRadius: '8px',
        border: '1px solid rgba(128,128,128,0.2)',
        lineHeight: 1.8,
        fontSize: '0.9rem',
        marginBottom: '16px',
      }}>
        <div style={{fontSize: '0.75rem', opacity: 0.5, marginBottom: '8px'}}>原始文本</div>
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

      {/* Chunk cards */}
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
                <span style={{fontWeight: 600, fontSize: '0.85rem'}}>块 {i + 1}</span>
                <span style={{fontSize: '0.7rem', opacity: 0.5}}>
                  字符 {chunk.start}-{chunk.end} ({chunk.end - chunk.start}字)
                </span>
                {chunk.overlapWithPrev && (
                  <span style={{
                    fontSize: '0.65rem',
                    padding: '1px 6px',
                    borderRadius: '3px',
                    background: `${color}20`,
                    color: color,
                  }}>
                    与前块重叠 {OVERLAP} 字符
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
