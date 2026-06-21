import { useState, useMemo } from 'react'

export interface DonutSegment {
  label: string
  value: number
  color: string
  code?: string | null
  market?: string
}

interface DonutChartProps {
  segments: DonutSegment[]
  size?: number
  strokeWidth?: number
  centerLabel?: string
  centerValue?: string
}

export default function DonutChart({
  segments,
  size = 200,
  strokeWidth = 28,
  centerLabel,
  centerValue,
}: DonutChartProps) {
  const [hovered, setHovered] = useState<number | null>(null)

  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const total = useMemo(() => segments.reduce((s, d) => s + d.value, 0), [segments])

  // Compute cumulative offsets for each segment
  const arcs = useMemo(() => {
    let cumulative = 0
    return segments.map((seg, i) => {
      const fraction = seg.value / total
      const dashLength = fraction * circumference
      const gap = circumference - dashLength
      const offset = -cumulative * circumference + circumference * 0.25 // start at top
      cumulative += fraction
      return {
        ...seg,
        index: i,
        dashArray: `${dashLength} ${gap}`,
        offset,
        percent: (fraction * 100).toFixed(1),
      }
    })
  }, [segments, total, circumference])

  const cx = size / 2
  const cy = size / 2

  return (
    <div className="flex items-center gap-6">
      {/* Chart */}
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background ring */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={strokeWidth}
          />
          {/* Segments */}
          {arcs.map((arc) => (
            <circle
              key={arc.index}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth={hovered === arc.index ? strokeWidth + 4 : strokeWidth}
              strokeDasharray={arc.dashArray}
              strokeDashoffset={arc.offset}
              strokeLinecap="butt"
              className="transition-all duration-300 ease-out"
              style={{
                opacity: hovered === null ? 0.85 : hovered === arc.index ? 1 : 0.3,
                filter: hovered === arc.index ? `drop-shadow(0 0 6px ${arc.color}60)` : 'none',
              }}
              onMouseEnter={() => setHovered(arc.index)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {hovered !== null ? (
            <>
              <span className="text-sm font-semibold text-neutral-200">
                {arcs[hovered].label}
              </span>
              <span className="text-lg font-bold" style={{ color: arcs[hovered].color }}>
                {arcs[hovered].percent}%
              </span>
            </>
          ) : (
            <>
              {centerValue && (
                <span className="text-lg font-bold text-neutral-100">{centerValue}</span>
              )}
              {centerLabel && (
                <span className="text-xs text-neutral-500">{centerLabel}</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-col gap-1.5 min-w-0">
        {arcs.map((arc) => (
          <div
            key={arc.index}
            className="flex items-center gap-2 cursor-default group"
            onMouseEnter={() => setHovered(arc.index)}
            onMouseLeave={() => setHovered(null)}
          >
            <div
              className="w-2 h-2 rounded-full flex-shrink-0 transition-transform duration-200"
              style={{
                background: arc.color,
                transform: hovered === arc.index ? 'scale(1.4)' : 'scale(1)',
                boxShadow: hovered === arc.index ? `0 0 6px ${arc.color}80` : 'none',
              }}
            />
            <span className={`text-xs truncate transition-colors duration-200 ${
              hovered === arc.index ? 'text-neutral-200' : 'text-neutral-500'
            }`}>
              {arc.label}
            </span>
            <span className={`text-xs tabular-nums ml-auto flex-shrink-0 transition-colors duration-200 ${
              hovered === arc.index ? 'text-neutral-300' : 'text-neutral-600'
            }`}>
              {arc.percent}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
