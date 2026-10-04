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
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: AlertCircle,
  },
  warning: {
    label: '警告',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    icon: AlertTriangle,
  },
  info: {
    label: '提示',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    icon: Info,
  },
  success: {
    label: '良好',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
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
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <Lightbulb className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-base">暂无数据</p>
        <p className="text-[13px] mt-2">请先上传销售订单CSV文件</p>
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
                  <div className={`text-[13px] ${config.color} mb-1`}>{config.label}</div>
                  <div className="text-base font-bold text-slate-900">{count}</div>
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-full text-[13px]"
            >
              <Icon className="w-3 h-3 text-slate-500" />
              <span className="text-slate-600">{config.label}</span>
              <span className="text-slate-400">({count})</span>
            </div>
          );
        })}
      </div>

      {/* 建议列表 */}
      {adviceList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <CheckCircle2 className="w-12 h-12 mb-4 text-emerald-500/50" />
          <p className="text-base">暂无建议</p>
          <p className="text-[13px] mt-2">当前数据未发现需要关注的问题</p>
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
                      <h4 className="text-[13px] font-medium text-slate-900">{advice.title}</h4>
                      <span className={`text-[13px] px-2 py-0.5 rounded-full ${config.bgColor} ${config.color} border ${config.borderColor}`}>
                        {config.label}
                      </span>
                      <span className="flex items-center gap-1 text-[13px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                        <CatIcon className="w-3 h-3" />
                        {catConfig.label}
                      </span>
                      {advice.metric && (
                        <span className="text-[13px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-mono">
                          {advice.metric}
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] text-slate-500 mb-2">{advice.description}</p>
                    <div className="flex items-start gap-1.5 text-[13px] text-slate-600 bg-slate-50 rounded-md px-2 py-1.5">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
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
