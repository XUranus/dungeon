import React, {useState} from 'react';

function tokenize(text: string): {token: string; type: string; color: string}[] {
  const tokens: {token: string; type: string; color: string}[] = [];
  // Chinese character processing
  const chineseChars: string[] = [];
  let buffer = '';

  for (const char of text) {
    if (/[一-鿿]/.test(char)) {
      if (buffer) {
        tokens.push({token: buffer, type: 'en', color: '#6366f1'});
        buffer = '';
      }
      chineseChars.push(char);
    } else if (/[a-zA-Z0-9]/.test(char)) {
      if (chineseChars.length > 0) {
        flushChinese(chineseChars, tokens);
      }
      buffer += char;
    } else {
      if (chineseChars.length > 0) flushChinese(chineseChars, tokens);
      if (buffer) {
        tokens.push({token: buffer, type: 'en', color: '#6366f1'});
        buffer = '';
      }
      if (char.trim()) {
        tokens.push({token: char, type: 'punct', color: '#737373'});
      }
    }
  }
  if (chineseChars.length > 0) flushChinese(chineseChars, tokens);
  if (buffer) tokens.push({token: buffer, type: 'en', color: '#6366f1'});

  return tokens;
}

function flushChinese(chars: string[], tokens: {token: string; type: string; color: string}[]) {
  // Unigrams
  for (const c of chars) {
    tokens.push({token: c, type: 'unigram', color: '#10b981'});
  }
  // Bigrams
  for (let i = 0; i < chars.length - 1; i++) {
    tokens.push({token: chars[i] + chars[i + 1], type: 'bigram', color: '#f59e0b'});
  }
  // Trigrams
  for (let i = 0; i < chars.length - 2; i++) {
    tokens.push({token: chars[i] + chars[i + 1] + chars[i + 2], type: 'trigram', color: '#ef4444'});
  }
  chars.length = 0;
}

const examples = [
  {text: '推荐标普ETF', label: '中文短句'},
  {text: '教授看好纳指标普', label: '中文长句'},
  {text: 'QQQ定投策略', label: '中英混合'},
  {text: 'A股股东回报差', label: '金融术语'},
];

export default function TokenizationViz() {
  const [activeExample, setActiveExample] = useState(0);
  const [showTypes, setShowTypes] = useState<Set<string>>(new Set(['unigram', 'bigram', 'trigram', 'en']));

  const tokens = tokenize(examples[activeExample].text);

  const toggleType = (type: string) => {
    setShowTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const typeConfig = [
    {type: 'unigram', label: 'Unigram (单字)', color: '#10b981', desc: '每个汉字作为独立 token'},
    {type: 'bigram', label: 'Bigram (双字)', color: '#f59e0b', desc: '相邻两个汉字组合'},
    {type: 'trigram', label: 'Trigram (三字)', color: '#ef4444', desc: '相邻三个汉字组合'},
    {type: 'en', label: '英文/数字', color: '#6366f1', desc: '英文单词和数字整体保留'},
  ];

  return (
    <div style={{margin: '1.5rem 0'}}>
      {/* Example selector */}
      <div style={{display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap'}}>
        {examples.map((ex, i) => (
          <button
            key={i}
            onClick={() => setActiveExample(i)}
            style={{
              padding: '4px 12px',
              borderRadius: '6px',
              border: i === activeExample ? '2px solid #6366f1' : '1px solid rgba(128,128,128,0.2)',
              background: i === activeExample ? '#6366f115' : 'transparent',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            {ex.label}: {ex.text}
          </button>
        ))}
      </div>

      {/* Type filters */}
      <div style={{display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap'}}>
        {typeConfig.map(tc => (
          <button
            key={tc.type}
            onClick={() => toggleType(tc.type)}
            style={{
              padding: '3px 10px',
              borderRadius: '12px',
              border: 'none',
              fontSize: '0.75rem',
              cursor: 'pointer',
              background: showTypes.has(tc.type) ? tc.color : 'rgba(128,128,128,0.1)',
              color: showTypes.has(tc.type) ? 'white' : 'inherit',
              transition: 'all 0.2s',
            }}
            title={tc.desc}
          >
            {tc.label}
          </button>
        ))}
      </div>

      {/* Token display */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        padding: '16px',
        borderRadius: '8px',
        border: '1px solid rgba(128,128,128,0.15)',
        minHeight: '60px',
      }}>
        {tokens.filter(t => showTypes.has(t.type)).map((t, i) => (
          <span
            key={i}
            style={{
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '0.85rem',
              background: `${t.color}18`,
              border: `1px solid ${t.color}40`,
              color: t.color,
              fontFamily: 'monospace',
            }}
          >
            {t.token}
          </span>
        ))}
      </div>

      {/* Stats */}
      <div style={{marginTop: '8px', fontSize: '0.75rem', opacity: 0.5}}>
        共 {tokens.length} 个 token
        {typeConfig.map(tc => {
          const count = tokens.filter(t => t.type === tc.type).length;
          return count > 0 ? ` · ${tc.label}: ${count}` : '';
        }).join('')}
      </div>
    </div>
  );
}
