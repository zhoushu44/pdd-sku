import React, { useMemo } from 'react';
import {
  ShoppingCart,
  TrendingUp,
  Package,
  DollarSign,
  Trophy,
  AlertTriangle,
  FlaskConical,
  LineChart as LineChartIcon,
  Flame,
  ShieldAlert,
  TrendingDown,
  Wallet,
  PieChart as PieChartIcon,
  Bell,
  ArrowDown,
  ArrowUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Area,
  AreaChart,
} from 'recharts';
import type { OrderData, ProductSummary, DetailedCostConfig, PeriodComparison } from '../types';
import { formatAmount, formatNumber } from '../lib/utils';
import MiniLineChart from './MiniLineChart';

interface OrderOverviewProps {
  orders: OrderData[];
  summaries: ProductSummary[];
  costConfig: DetailedCostConfig;
  periodComparison?: PeriodComparison | null;
}

/**
 * 获取利润率颜色
 */
const getProfitRateColor = (rate: number): string => {
  if (rate >= 10) return 'text-emerald-400';
  if (rate >= 0) return 'text-cyan-400';
  return 'text-red-400';
};

/**
 * 根据利润率返回涨价建议
 */
const getPriceSuggestion = (
  profitRate: number,
  netProfit: number
): { text: string; color: string } => {
  if (netProfit < 0) {
    return {
      text: '先止亏：核成本或涨价',
      color: 'text-red-400 bg-red-500/10 border-red-500/30',
    };
  }
  if (profitRate < 5) {
    return {
      text: '优先测涨价/降快递成本',
      color: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
    };
  }
  if (profitRate < 15) {
    return {
      text: '可测试涨价3%',
      color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    };
  }
  return {
    text: '利润健康，保持当前定价',
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  };
};

/**
 * 计算涨价后的利润
 * 涨价X%后：销售额提升X%，平台费(0.6%)和退款损失随销售额同步变化，其他成本不变
 */
const calculateProfitAfterPriceIncrease = (
  summary: ProductSummary,
  increaseRate: number // 0.01, 0.03, 0.05
): number => {
  const newSales = summary.销售额 * (1 + increaseRate);
  // 随销售额变化的成本：平台技术服务费(0.6%) + 预估退款损失
  const scalableCost =
    summary.平台技术服务费 * (1 + increaseRate) +
    summary.预估退款损失 * (1 + increaseRate);
  // 不随销售额变化的成本
  const fixedCost =
    summary.总商品成本 +
    summary.商家承担优惠 +
    summary.快递费 +
    summary.包装耗材 +
    summary.运费险 +
    summary.营销花费;
  return Math.round((newSales - scalableCost - fixedCost) * 100) / 100;
};

const OrderOverview: React.FC<OrderOverviewProps> = ({
  orders,
  summaries,
  periodComparison,
}) => {
  // 计算关键指标
  const totalSales = orders.reduce((sum, order) => sum + order.商家实收金额, 0);
  const totalOrders = orders.length;
  const totalQuantity = orders.reduce((sum, order) => sum + order.商品数量, 0);
  const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

  // 计算每个SKU的日销量趋势数据（用于折线图）
  const skuTrendMap = useMemo(() => {
    // 外层 Map: spec -> 内层 Map: date -> volume
    const nestedMap = new Map<string, Map<string, number>>();
    const validStatuses = ['已收货', '已发货', '待收货'];
    orders.forEach(order => {
      if (
        order.售后状态.includes('退款成功') ||
        !validStatuses.some(s => order.订单状态.includes(s))
      ) {
        return;
      }
      const spec = order.商品规格 || '未知规格';
      const dateStr = order.订单成交时间.split(' ')[0];
      if (!dateStr) return;

      let dateMap = nestedMap.get(spec);
      if (!dateMap) {
        dateMap = new Map();
        nestedMap.set(spec, dateMap);
      }
      dateMap.set(dateStr, (dateMap.get(dateStr) || 0) + order.商品数量);
    });

    // 转换为外层 Map: spec -> [{date, volume}]（按日期排序）
    const result = new Map<string, { date: string; volume: number }[]>();
    nestedMap.forEach((dateMap, spec) => {
      const arr = Array.from(dateMap.entries()).map(([date, volume]) => ({ date, volume }));
      arr.sort((a, b) => a.date.localeCompare(b.date));
      result.set(spec, arr);
    });
    return result;
  }, [orders]);

  // 表1: SKU销量趋势（按销售额降序）
  const skuTrendData = useMemo(() => {
    return summaries
      .map(s => ({
        summary: s,
        trend: (skuTrendMap.get(s.规格) || []).map(item => item.volume),
      }))
      .sort((a, b) => b.summary.销售额 - a.summary.销售额);
  }, [summaries, skuTrendMap]);

  // 表2: SKU销售TOP（按销售额降序，取前10）
  const salesTopData = useMemo(() => {
    return [...summaries].sort((a, b) => b.销售额 - a.销售额).slice(0, 10);
  }, [summaries]);

  // 表3: SKU利润TOP（按净利润降序，取前10）
  const profitTopData = useMemo(() => {
    return [...summaries]
      .sort((a, b) => b.净利润 - a.净利润)
      .slice(0, 10);
  }, [summaries]);

  // 表4: 低利润SKU关注（按利润率升序，取前10）
  const lowProfitData = useMemo(() => {
    return [...summaries]
      .sort((a, b) => a.利润率 - b.利润率)
      .slice(0, 10);
  }, [summaries]);

  // 表5: SKU涨价模拟（按销售额降序）
  const priceSimulationData = useMemo(() => {
    return summaries
      .filter(s => s.销售额 > 0)
      .map(s => ({
        summary: s,
        profit1: calculateProfitAfterPriceIncrease(s, 0.01),
        profit3: calculateProfitAfterPriceIncrease(s, 0.03),
        profit5: calculateProfitAfterPriceIncrease(s, 0.05),
      }))
      .sort((a, b) => b.summary.销售额 - a.summary.销售额)
      .slice(0, 15);
  }, [summaries]);

  // SKU分类：平均销售额作为分界线
  const avgSales = useMemo(() => {
    const validSummaries = summaries.filter(s => s.销售额 > 0);
    if (validSummaries.length === 0) return 0;
    return validSummaries.reduce((sum, s) => sum + s.销售额, 0) / validSummaries.length;
  }, [summaries]);

  // 爆品：销售额 >= 平均值 且 利润率 > 0（按销售额降序）
  const hotProducts = useMemo(() => {
    return summaries
      .filter(s => s.销售额 >= avgSales && s.利润率 > 0)
      .sort((a, b) => b.销售额 - a.销售额);
  }, [summaries, avgSales]);

  // 风险品：非爆品（销售额>0但未达爆品标准），按销售额降序
  const riskProducts = useMemo(() => {
    return summaries
      .filter(s => s.销售额 > 0 && !(s.销售额 >= avgSales && s.利润率 > 0))
      .sort((a, b) => b.销售额 - a.销售额);
  }, [summaries, avgSales]);

  // 衰退品：销量趋势持续下降（线性回归斜率<0，且至少3个数据点）
  const decliningProducts = useMemo(() => {
    return summaries
      .filter(s => {
        const trend = (skuTrendMap.get(s.规格) || []).map(item => item.volume);
        if (trend.length < 3) return false;
        // 计算线性回归斜率
        const n = trend.length;
        const meanX = (n - 1) / 2;
        const meanY = trend.reduce((sum, v) => sum + v, 0) / n;
        let numerator = 0;
        let denominator = 0;
        for (let i = 0; i < n; i++) {
          numerator += (i - meanX) * (trend[i] - meanY);
          denominator += (i - meanX) ** 2;
        }
        const slope = denominator === 0 ? 0 : numerator / denominator;
        return slope < 0;
      })
      .sort((a, b) => b.销售额 - a.销售额);
  }, [summaries, skuTrendMap]);

  // 经营健康度：总利润、总成本、整体利润率
  const healthMetrics = useMemo(() => {
    const totalCost = summaries.reduce((sum, s) => sum + s.总成本, 0);
    const totalProfit = summaries.reduce((sum, s) => sum + s.净利润, 0);
    const totalSalesAmount = summaries.reduce((sum, s) => sum + s.销售额, 0);
    const overallProfitRate = totalSalesAmount > 0 ? (totalProfit / totalSalesAmount) * 100 : 0;
    return { totalCost, totalProfit, overallProfitRate, totalSalesAmount };
  }, [summaries]);

  // 日销售趋势数据（用于recharts图表）
  const dailyTrendData = useMemo(() => {
    const dateMap = new Map<string, { 销售额: number; 销量: number; 订单数: number }>();
    const validStatuses = ['已收货', '已发货', '待收货'];
    orders.forEach(order => {
      if (
        order.售后状态.includes('退款成功') ||
        !validStatuses.some(s => order.订单状态.includes(s))
      ) {
        return;
      }
      const dateStr = order.订单成交时间.split(' ')[0];
      if (!dateStr) return;
      const existing = dateMap.get(dateStr);
      if (existing) {
        existing.销售额 += order.商家实收金额;
        existing.销量 += order.商品数量;
        existing.订单数 += 1;
      } else {
        dateMap.set(dateStr, {
          销售额: order.商家实收金额,
          销量: order.商品数量,
          订单数: 1,
        });
      }
    });
    return Array.from(dateMap.entries())
      .map(([date, data]) => ({ 日期: date, ...data }))
      .sort((a, b) => a.日期.localeCompare(b.日期));
  }, [orders]);

  // 关键预警数据
  const alerts = useMemo(() => {
    const lossSkus = summaries.filter(s => s.销售额 > 0 && s.净利润 < 0);
    const decliningSkus = decliningProducts;
    // 低利润高销量SKU：销量>=平均销量 且 利润率<5%
    const avgVolume = summaries.length > 0
      ? summaries.reduce((sum, s) => sum + s.销量, 0) / summaries.length
      : 0;
    const lowProfitHighVolume = summaries.filter(
      s => s.销量 >= avgVolume && s.利润率 < 5 && s.销售额 > 0
    );
    return { lossSkus, decliningSkus, lowProfitHighVolume };
  }, [summaries, decliningProducts]);

  // 环比变化率获取辅助函数
  const getComparison = (key: keyof PeriodComparison | null): number | null => {
    if (!periodComparison || !key) return null;
    return periodComparison[key].changeRate;
  };

  // 指标卡片配置
  const metrics = [
    {
      title: '总销售额',
      value: formatAmount(totalSales),
      icon: DollarSign,
      gradient: 'from-emerald-500 to-teal-600',
      bgColor: 'bg-emerald-500/10',
      changeRate: getComparison('销售额'),
    },
    {
      title: '总成本',
      value: formatAmount(healthMetrics.totalCost),
      icon: Wallet,
      gradient: 'from-orange-500 to-amber-600',
      bgColor: 'bg-orange-500/10',
      changeRate: null,
    },
    {
      title: '总净利润',
      value: `${healthMetrics.totalProfit >= 0 ? '+' : ''}${formatAmount(healthMetrics.totalProfit)}`,
      icon: healthMetrics.totalProfit >= 0 ? TrendingUp : TrendingDown,
      gradient: healthMetrics.totalProfit >= 0 ? 'from-green-500 to-emerald-600' : 'from-red-500 to-rose-600',
      bgColor: healthMetrics.totalProfit >= 0 ? 'bg-green-500/10' : 'bg-red-500/10',
      changeRate: null,
    },
    {
      title: '整体利润率',
      value: `${healthMetrics.overallProfitRate >= 0 ? '+' : ''}${healthMetrics.overallProfitRate.toFixed(2)}%`,
      icon: PieChartIcon,
      gradient: 'from-cyan-500 to-blue-600',
      bgColor: 'bg-cyan-500/10',
      changeRate: null,
    },
    {
      title: '总订单数',
      value: totalOrders.toLocaleString(),
      icon: ShoppingCart,
      gradient: 'from-blue-500 to-indigo-600',
      bgColor: 'bg-blue-500/10',
      changeRate: getComparison('订单数'),
    },
    {
      title: '总销量',
      value: totalQuantity.toLocaleString(),
      icon: Package,
      gradient: 'from-purple-500 to-pink-600',
      bgColor: 'bg-purple-500/10',
      changeRate: getComparison('销量'),
    },
    {
      title: '平均客单价',
      value: formatAmount(averageOrderValue),
      icon: TrendingUp,
      gradient: 'from-orange-500 to-red-600',
      bgColor: 'bg-orange-500/10',
      changeRate: getComparison('平均客单价'),
    },
  ];

  // SKU分类占比数据
  const categoryStats = useMemo(() => {
    const total = summaries.filter(s => s.销售额 > 0).length;
    return {
      hot: { count: hotProducts.length, percent: total > 0 ? (hotProducts.length / total) * 100 : 0 },
      risk: { count: riskProducts.length, percent: total > 0 ? (riskProducts.length / total) * 100 : 0 },
      declining: { count: decliningProducts.length, percent: total > 0 ? (decliningProducts.length / total) * 100 : 0 },
      total,
    };
  }, [summaries, hotProducts, riskProducts, decliningProducts]);

  return (
    <div className="space-y-6">
      {/* 关键预警区 */}
      {(alerts.lossSkus.length > 0 || alerts.decliningSkus.length > 0 || alerts.lowProfitHighVolume.length > 0) && (
        <div className="bg-slate-900 rounded-xl p-5 border border-slate-700/50">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-5 h-5 text-yellow-400" />
            <h3 className="text-base font-semibold text-white">关键预警</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {alerts.lossSkus.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <div className="p-2 bg-red-500/20 rounded-lg">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-red-400">{alerts.lossSkus.length} 个亏损SKU</p>
                  <p className="text-xs text-slate-400">需立即止亏：核成本或涨价</p>
                </div>
              </div>
            )}
            {alerts.decliningSkus.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <div className="p-2 bg-yellow-500/20 rounded-lg">
                  <ArrowDown className="w-4 h-4 text-yellow-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-yellow-400">{alerts.decliningSkus.length} 个衰退SKU</p>
                  <p className="text-xs text-slate-400">销量持续下降，关注库存与推广</p>
                </div>
              </div>
            )}
            {alerts.lowProfitHighVolume.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                <div className="p-2 bg-orange-500/20 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-orange-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-orange-400">{alerts.lowProfitHighVolume.length} 个低利润高销量SKU</p>
                  <p className="text-xs text-slate-400">利润率&lt;5%但销量高，建议优化成本</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 经营健康度卡片 */}
      <div className="bg-slate-900 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <ShoppingCart className="w-6 h-6 text-blue-400" />
          <h2 className="text-xl font-bold text-white">经营健康度</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            const changeRate = metric.changeRate;
            const hasComparison = changeRate !== null && changeRate !== undefined;
            const isUp = (changeRate || 0) > 0;
            const isDown = (changeRate || 0) < 0;
            return (
              <div
                key={metric.title}
                className={`relative overflow-hidden rounded-lg ${metric.bgColor} p-4 border border-slate-700/50`}
              >
                <div
                  className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${metric.gradient} opacity-20 rounded-full blur-2xl -translate-y-6 translate-x-6`}
                />
                <div className="relative z-10 flex items-start justify-between">
                  <div className="space-y-1.5">
                    <p className="text-xs text-slate-400 font-medium">
                      {metric.title}
                    </p>
                    <p className="text-xl font-bold text-white">
                      {metric.value}
                    </p>
                    {hasComparison && (
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-slate-500">环比</span>
                        <span
                          className={`flex items-center gap-0.5 font-medium ${
                            isUp ? 'text-emerald-400' : isDown ? 'text-red-400' : 'text-slate-400'
                          }`}
                        >
                          {isUp && <ArrowUp className="w-3 h-3" />}
                          {isDown && <ArrowDown className="w-3 h-3" />}
                          {changeRate > 0 ? '+' : ''}{changeRate}%
                        </span>
                      </div>
                    )}
                  </div>
                  <div
                    className={`p-2 rounded-lg bg-gradient-to-br ${metric.gradient} shadow-lg`}
                  >
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 日销售趋势图 */}
      {dailyTrendData.length > 0 && (
        <div className="bg-slate-900 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <LineChartIcon className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-semibold text-white">日销售趋势</h3>
            <span className="text-xs text-slate-400">（{dailyTrendData.length}天数据）</span>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={dailyTrendData}>
              <defs>
                <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="日期"
                stroke="#94a3b8"
                fontSize={11}
                tickFormatter={(v: string) => v.slice(5)}
              />
              <YAxis yAxisId="left" stroke="#10b981" fontSize={11} />
              <YAxis yAxisId="right" orientation="right" stroke="#3b82f6" fontSize={11} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelStyle={{ color: '#e2e8f0' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="销售额"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#salesGradient)"
                name="销售额 (¥)"
              />
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="销量"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#volumeGradient)"
                name="销量 (件)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* SKU分类占比图 */}
      <div className="bg-slate-900 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <PieChartIcon className="w-5 h-5 text-purple-400" />
          <h3 className="text-lg font-semibold text-white">SKU分类占比</h3>
          <span className="text-xs text-slate-400">（共{categoryStats.total}个有效SKU）</span>
        </div>
        <div className="space-y-4">
          {/* 爆品进度条 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-400" />
                <span className="text-sm text-slate-200">爆品</span>
                <span className="text-xs text-slate-400">{categoryStats.hot.count}个</span>
              </div>
              <span className="text-sm font-semibold text-orange-400">{categoryStats.hot.percent.toFixed(1)}%</span>
            </div>
            <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-all duration-500"
                style={{ width: `${categoryStats.hot.percent}%` }}
              />
            </div>
          </div>
          {/* 风险品进度条 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <span className="text-sm text-slate-200">风险品</span>
                <span className="text-xs text-slate-400">{categoryStats.risk.count}个</span>
              </div>
              <span className="text-sm font-semibold text-red-400">{categoryStats.risk.percent.toFixed(1)}%</span>
            </div>
            <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-500 to-rose-400 rounded-full transition-all duration-500"
                style={{ width: `${categoryStats.risk.percent}%` }}
              />
            </div>
          </div>
          {/* 衰退品进度条 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-yellow-400" />
                <span className="text-sm text-slate-200">衰退品</span>
                <span className="text-xs text-slate-400">{categoryStats.declining.count}个</span>
              </div>
              <span className="text-sm font-semibold text-yellow-400">{categoryStats.declining.percent.toFixed(1)}%</span>
            </div>
            <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-yellow-500 to-amber-400 rounded-full transition-all duration-500"
                style={{ width: `${categoryStats.declining.percent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* SKU分类：爆品 / 风险品 / 衰退品 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* 爆品 */}
        <div className="bg-slate-900 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Flame className="w-5 h-5 text-orange-400" />
            <h3 className="text-lg font-semibold text-white">爆品</h3>
            <span className="text-xs text-slate-400">
              （{hotProducts.length}个 · 销售额≥均值且盈利）
            </span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-700/50">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-800/50">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-300">SKU名称</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-300">销售额</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-300">利润率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {hotProducts.length > 0 ? (
                  hotProducts.map((item) => (
                    <tr key={item.规格} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-3 py-2.5 text-sm text-slate-200 max-w-[160px] truncate" title={item.规格}>
                        {item.规格}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-emerald-400 text-right font-mono">
                        {formatAmount(item.销售额)}
                      </td>
                      <td className={`px-3 py-2.5 text-sm text-right font-mono font-semibold ${getProfitRateColor(item.利润率)}`}>
                        +{item.利润率.toFixed(2)}%
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-slate-500 text-sm">
                      暂无爆品
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 风险品 */}
        <div className="bg-slate-900 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <ShieldAlert className="w-5 h-5 text-red-400" />
            <h3 className="text-lg font-semibold text-white">风险品</h3>
            <span className="text-xs text-slate-400">
              （{riskProducts.length}个 · 非爆品，按销售额降序）
            </span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-700/50">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-800/50">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-300">SKU名称</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-300">销售额</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-300">利润率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {riskProducts.length > 0 ? (
                  riskProducts.map((item) => (
                    <tr key={item.规格} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-3 py-2.5 text-sm text-slate-200 max-w-[160px] truncate" title={item.规格}>
                        {item.规格}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-emerald-400 text-right font-mono">
                        {formatAmount(item.销售额)}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono font-semibold text-red-400">
                        {item.利润率.toFixed(2)}%
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-slate-500 text-sm">
                      暂无风险品
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 衰退品 */}
        <div className="bg-slate-900 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <TrendingDown className="w-5 h-5 text-yellow-400" />
            <h3 className="text-lg font-semibold text-white">衰退品</h3>
            <span className="text-xs text-slate-400">
              （{decliningProducts.length}个 · 销量趋势持续下降）
            </span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-700/50">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-800/50">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-300">SKU名称</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-300">销售额</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-300">利润率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {decliningProducts.length > 0 ? (
                  decliningProducts.map((item) => (
                    <tr key={item.规格} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-3 py-2.5 text-sm text-slate-200 max-w-[160px] truncate" title={item.规格}>
                        {item.规格}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-emerald-400 text-right font-mono">
                        {formatAmount(item.销售额)}
                      </td>
                      <td className={`px-3 py-2.5 text-sm text-right font-mono font-semibold ${getProfitRateColor(item.利润率)}`}>
                        +{item.利润率.toFixed(2)}%
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-slate-500 text-sm">
                      暂无衰退品
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 表1: SKU销量趋势 */}
      <div className="bg-slate-900 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <LineChartIcon className="w-5 h-5 text-cyan-400" />
          <h3 className="text-lg font-semibold text-white">SKU销量趋势</h3>
          <span className="text-xs text-slate-400">
            （按销售额降序，折线图为日销量趋势）
          </span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-700/50">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/50">
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">
                  SKU名称
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300">
                  销售额
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300">
                  销量
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300">
                  订单数
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300">
                  利润率
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-300">
                  销量趋势
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {skuTrendData.length > 0 ? (
                skuTrendData.map((item) => (
                  <tr
                    key={item.summary.规格}
                    className="hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-slate-200 max-w-[240px] truncate" title={item.summary.规格}>
                      {item.summary.规格}
                    </td>
                    <td className="px-4 py-3 text-sm text-emerald-400 text-right font-mono">
                      {formatAmount(item.summary.销售额)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-200 text-right font-mono">
                      {formatNumber(item.summary.销量)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-200 text-right font-mono">
                      {formatNumber(item.summary.订单数)}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right font-mono font-semibold ${getProfitRateColor(item.summary.利润率)}`}>
                      {item.summary.利润率 >= 0 ? '+' : ''}
                      {item.summary.利润率.toFixed(2)}%
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <MiniLineChart
                          data={item.trend}
                          width={140}
                          height={36}
                          color={item.summary.利润率 >= 0 ? '#10b981' : '#ef4444'}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 表2 & 表3: 并排显示 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* 表2: SKU销售TOP */}
        <div className="bg-slate-900 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <Trophy className="w-5 h-5 text-yellow-400" />
            <h3 className="text-lg font-semibold text-white">SKU销售TOP10</h3>
            <span className="text-xs text-slate-400">（按销售额排序）</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-700/50">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-800/50">
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-300">排名</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-300">SKU</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-slate-300">销售额</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-slate-300">销量</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-slate-300">订单数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {salesTopData.length > 0 ? (
                  salesTopData.map((item, index) => (
                    <tr key={item.规格} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                          index === 0
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : index === 1
                            ? 'bg-slate-400/20 text-slate-300'
                            : index === 2
                            ? 'bg-orange-700/20 text-orange-500'
                            : 'bg-slate-700/30 text-slate-400'
                        }`}>
                          {index + 1}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-200 max-w-[180px] truncate" title={item.规格}>
                        {item.规格}
                      </td>
                      <td className="px-3 py-3 text-sm text-emerald-400 text-right font-mono">
                        {formatAmount(item.销售额)}
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-200 text-right font-mono">
                        {formatNumber(item.销量)}
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-200 text-right font-mono">
                        {formatNumber(item.订单数)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                      暂无数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 表3: SKU利润TOP */}
        <div className="bg-slate-900 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-semibold text-white">SKU利润TOP10</h3>
            <span className="text-xs text-slate-400">（按净利润排序）</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-700/50">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-800/50">
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-300">排名</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-300">SKU</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-slate-300">销售额</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-slate-300">净利润</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-slate-300">利润率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {profitTopData.length > 0 ? (
                  profitTopData.map((item, index) => (
                    <tr key={item.规格} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                          index === 0
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : index === 1
                            ? 'bg-slate-400/20 text-slate-300'
                            : index === 2
                            ? 'bg-orange-700/20 text-orange-500'
                            : 'bg-slate-700/30 text-slate-400'
                        }`}>
                          {index + 1}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-200 max-w-[180px] truncate" title={item.规格}>
                        {item.规格}
                      </td>
                      <td className="px-3 py-3 text-sm text-emerald-400 text-right font-mono">
                        {formatAmount(item.销售额)}
                      </td>
                      <td className={`px-3 py-3 text-sm text-right font-mono font-semibold ${getProfitRateColor(item.净利润)}`}>
                        {item.净利润 >= 0 ? '+' : ''}
                        {formatAmount(item.净利润)}
                      </td>
                      <td className={`px-3 py-3 text-sm text-right font-mono ${getProfitRateColor(item.利润率)}`}>
                        {item.利润率 >= 0 ? '+' : ''}
                        {item.利润率.toFixed(2)}%
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                      暂无数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 表4: 低利润SKU关注 */}
      <div className="bg-slate-900 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <AlertTriangle className="w-5 h-5 text-orange-400" />
          <h3 className="text-lg font-semibold text-white">低利润SKU关注</h3>
          <span className="text-xs text-slate-400">（按利润率升序，前10）</span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-700/50">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/50">
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">SKU</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300">销售额</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300">销量</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300">成本</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300">利润率</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300">净利润</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {lowProfitData.length > 0 ? (
                lowProfitData.map((item) => (
                  <tr key={item.规格} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-200 max-w-[240px] truncate" title={item.规格}>
                      {item.规格}
                    </td>
                    <td className="px-4 py-3 text-sm text-emerald-400 text-right font-mono">
                      {formatAmount(item.销售额)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-200 text-right font-mono">
                      {formatNumber(item.销量)}
                    </td>
                    <td className="px-4 py-3 text-sm text-orange-400 text-right font-mono">
                      {formatAmount(item.总成本)}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right font-mono font-semibold ${getProfitRateColor(item.利润率)}`}>
                      {item.利润率 >= 0 ? '+' : ''}
                      {item.利润率.toFixed(2)}%
                    </td>
                    <td className={`px-4 py-3 text-sm text-right font-mono ${getProfitRateColor(item.净利润)}`}>
                      {item.净利润 >= 0 ? '+' : ''}
                      {formatAmount(item.净利润)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 表5: SKU涨价模拟 */}
      <div className="bg-slate-900 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <FlaskConical className="w-5 h-5 text-purple-400" />
          <h3 className="text-lg font-semibold text-white">SKU涨价模拟</h3>
          <span className="text-xs text-slate-400">
            （假设销量不变，涨价后利润变化；按销售额降序，前15）
          </span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-700/50">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/50">
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">SKU</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300">销售额</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300">当前利润</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300">涨1%后利润</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300">涨3%后利润</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300">涨5%后利润</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-300">建议</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {priceSimulationData.length > 0 ? (
                priceSimulationData.map((item) => {
                  const suggestion = getPriceSuggestion(
                    item.summary.利润率,
                    item.summary.净利润
                  );
                  return (
                    <tr key={item.summary.规格} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-sm text-slate-200 max-w-[200px] truncate" title={item.summary.规格}>
                        {item.summary.规格}
                      </td>
                      <td className="px-4 py-3 text-sm text-emerald-400 text-right font-mono">
                        {formatAmount(item.summary.销售额)}
                      </td>
                      <td className={`px-4 py-3 text-sm text-right font-mono font-semibold ${getProfitRateColor(item.summary.净利润)}`}>
                        {item.summary.净利润 >= 0 ? '+' : ''}
                        {formatAmount(item.summary.净利润)}
                      </td>
                      <td className={`px-4 py-3 text-sm text-right font-mono ${getProfitRateColor(item.profit1)}`}>
                        {item.profit1 >= 0 ? '+' : ''}
                        {formatAmount(item.profit1)}
                      </td>
                      <td className={`px-4 py-3 text-sm text-right font-mono ${getProfitRateColor(item.profit3)}`}>
                        {item.profit3 >= 0 ? '+' : ''}
                        {formatAmount(item.profit3)}
                      </td>
                      <td className={`px-4 py-3 text-sm text-right font-mono ${getProfitRateColor(item.profit5)}`}>
                        {item.profit5 >= 0 ? '+' : ''}
                        {formatAmount(item.profit5)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium border ${suggestion.color}`}>
                          {suggestion.text}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-700/50 text-xs text-slate-500 leading-relaxed">
          <p className="mb-1">
            <span className="text-slate-400 font-medium">计算说明：</span>
            涨价后销售额 = 原销售额 × (1 + 涨幅)；平台技术服务费(0.6%)与预估退款损失随销售额同步变化，其他成本（商品成本、快递费、包装耗材、运费险、营销花费）保持不变。
          </p>
          <p>
            <span className="text-slate-400 font-medium">建议逻辑：</span>
            亏损SKU → 先止亏：核成本或涨价；利润率&lt;5% → 优先测涨价/降快递成本；利润率5-15% → 可测试涨价3%；利润率≥15% → 利润健康，保持当前定价。
          </p>
        </div>
      </div>
    </div>
  );
};

export default OrderOverview;
