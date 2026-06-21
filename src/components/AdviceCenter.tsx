import React, { useMemo } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  TrendingDown,
  RefreshCcw,
  Megaphone,
  DollarSign,
  Lightbulb,
} from 'lucide-react';
import type { OrderData, ProductSummary, MarketingDataRow, TimeRange, AdviceLevel, AdviceCategory, PeriodComparison } from '../types';
import {
  calculateRefundOverview,
  calculateRefundStats,
  generateAdvice,
} from '../utils/dataProcessor';

interface AdviceCenterProps {
  orders: OrderData[];
  summaries: ProductSummary[];
  marketingData: MarketingDataRow[];
  timeRange: TimeRange;
  periodComparison: PeriodComparison | null;
}

const levelConfig: Record<AdviceLevel, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  critical: {
    label: '严重',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    icon: AlertCircle,
  },
  warning: {
    label: '警告',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    icon: AlertTriangle,
  },
  info: {
    label: '提示',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    icon: Info,
  },
  success: {
    label: '良好',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    icon: CheckCircle2,
  },
};

const categoryConfig: Record<AdviceCategory, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  profit: { label: '利润', icon: DollarSign },
  refund: { label: '退款', icon: RefreshCcw },
  marketing: { label: '推广', icon: Megaphone },
  trend: { label: '趋势', icon: TrendingDown },
  inventory: { label: '库存', icon: AlertTriangle },
};

const AdviceCenter: React.FC<AdviceCenterProps> = ({ orders, summaries, marketingData, periodComparison }) => {
  const adviceList = useMemo(() => {
    const refundOverview = calculateRefundOverview(orders);
    const refundStats = calculateRefundStats(orders);
    return generateAdvice(summaries, refundOverview, refundStats, marketingData, periodComparison);
  }, [orders, summaries, marketingData, periodComparison]);

  // 按分类统计
  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = {};
    adviceList.forEach(a => {
      stats[a.category] = (stats[a.category] || 0) + 1;
    });
    return stats;
  }, [adviceList]);

  // 按等级统计
  const levelStats = useMemo(() => {
    const stats: Record<string, number> = {};
    adviceList.forEach(a => {
      stats[a.level] = (stats[a.level] || 0) + 1;
    });
    return stats;
  }, [adviceList]);

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <Lightbulb className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-lg">暂无数据</p>
        <p className="text-sm mt-2">请先上传销售订单CSV文件</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 顶部统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(['critical', 'warning', 'info', 'success'] as AdviceLevel[]).map(level => {
          const config = levelConfig[level];
          const Icon = config.icon;
          const count = levelStats[level] || 0;
          return (
            <div
              key={level}
              className={`${config.bgColor} ${config.borderColor} border rounded-lg p-4`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className={`text-xs ${config.color} mb-1`}>{config.label}</div>
                  <div className="text-2xl font-bold text-slate-100">{count}</div>
                </div>
                <Icon className={`w-8 h-8 ${config.color} opacity-50`} />
              </div>
            </div>
          );
        })}
      </div>

      {/* 分类筛选标签 */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(categoryConfig).map(([cat, config]) => {
          const count = categoryStats[cat] || 0;
          if (count === 0) return null;
          const Icon = config.icon;
          return (
            <div
              key={cat}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded-full text-xs"
            >
              <Icon className="w-3 h-3 text-slate-400" />
              <span className="text-slate-300">{config.label}</span>
              <span className="text-slate-500">({count})</span>
            </div>
          );
        })}
      </div>

      {/* 建议列表 */}
      {adviceList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <CheckCircle2 className="w-12 h-12 mb-4 text-emerald-500/50" />
          <p className="text-lg">暂无建议</p>
          <p className="text-sm mt-2">当前数据未发现需要关注的问题</p>
        </div>
      ) : (
        <div className="space-y-3">
          {adviceList.map(advice => {
            const config = levelConfig[advice.level];
            const catConfig = categoryConfig[advice.category];
            const Icon = config.icon;
            const CatIcon = catConfig.icon;

            return (
              <div
                key={advice.id}
                className={`${config.bgColor} ${config.borderColor} border rounded-lg p-4 transition-all hover:scale-[1.005]`}
              >
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-9 h-9 rounded-full ${config.bgColor} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h4 className="text-sm font-medium text-slate-100">{advice.title}</h4>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${config.bgColor} ${config.color}`}>
                        {config.label}
                      </span>
                      <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-slate-800/50 text-slate-400">
                        <CatIcon className="w-3 h-3" />
                        {catConfig.label}
                      </span>
                      {advice.metric && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800/50 text-slate-300 font-mono">
                          {advice.metric}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mb-2">{advice.description}</p>
                    <div className="flex items-start gap-1.5 text-xs text-slate-300 bg-slate-900/30 rounded px-2 py-1.5">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                      <span>{advice.suggestion}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdviceCenter;
