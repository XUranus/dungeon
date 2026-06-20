import React, {useState, useEffect} from 'react';

const steps = [
  {
    id: 'question',
    label: '用户提问',
    desc: '用户在聊天界面输入自然语言问题',
    example: '教授推荐什么美股ETF？',
    color: '#10b981',
  },
  {
    id: 'embed',
    label: '问题向量化',
    desc: '使用 bge-small-zh-v1.5 将问题编码为 512 维向量',
    example: '[0.023, -0.156, 0.089, ..., 0.234] (512维)',
    color: '#6366f1',
  },
  {
    id: 'retrieve',
    label: '混合检索',
    desc: 'Dense (余弦相似度) + BM25 (稀疏) + RRF 融合排序',
    example: 'Dense: 15条 → BM25: 15条 → RRF融合 → Top 12',
    color: '#f59e0b',
  },
  {
    id: 'context',
    label: '构建上下文',
    desc: '将检索到的文档片段格式化为带来源链接的参考资料',
    example: '--- 片段1 [知识星球 | q&a] ---\\n原文链接: https://...\\n内容...',
    color: '#8b5cf6',
  },
  {
    id: 'generate',
    label: 'LLM 生成',
    desc: '将系统提示 + 参考资料 + 用户问题发送给 LLM，流式生成回答',
    example: '根据星主的观点，推荐的美股ETF是QQQ...',
    color: '#ef4444',
  },
  {
    id: 'stream',
    label: '流式返回',
    desc: '通过 SSE 逐 token 推送到前端，实时渲染 Markdown',
    example: 'data: 根据\\ndata: 星主\\ndata: 的观点\\ndata: [DONE]',
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
      {/* Controls */}
      <div style={{display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center'}}>
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
          ▶ 播放动画
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
          重置
        </button>
        <span style={{fontSize: '0.8rem', opacity: 0.5}}>
          步骤 {activeStep + 1} / {steps.length}
        </span>
      </div>

      {/* Step indicators */}
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

      {/* Active step detail */}
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

      {/* Step buttons */}
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
