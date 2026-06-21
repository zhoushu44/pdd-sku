import React from 'react';

interface MiniLineChartProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

const MiniLineChart: React.FC<MiniLineChartProps> = ({
  data,
  width = 100,
  height = 32,
  color = '#3b82f6',
}) => {
  if (!data || data.length === 0) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center bg-slate-800/50 rounded"
      >
        <span className="text-xs text-slate-500">暂无数据</span>
      </div>
    );
  }

  const maxValue = Math.max(...data);
  const minValue = Math.min(...data);
  const range = maxValue - minValue || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - minValue) / range) * height * 0.8 - height * 0.1;
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(' L ')}`;

  // 创建区域填充路径
  const areaPathD = `${pathD} L ${width},${height} L 0,${height} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`gradient-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* 区域填充 */}
      <path d={areaPathD} fill={`url(#gradient-${color.replace('#', '')})`} />
      {/* 折线 */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 数据点 */}
      {data.map((value, index) => {
        const x = (index / (data.length - 1)) * width;
        const y = height - ((value - minValue) / range) * height * 0.8 - height * 0.1;
        return (
          <circle
            key={index}
            cx={x}
            cy={y}
            r="2"
            fill={color}
            className="opacity-60 hover:opacity-100 transition-opacity"
          />
        );
      })}
    </svg>
  );
};

export default MiniLineChart;
