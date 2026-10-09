import React, { useCallback, useMemo, useState } from 'react';
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
  Megaphone,
  Trash2,
  Target,
} from 'lucide-react';
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Area,
  Line,
  ReferenceDot,
  ReferenceLine,
  ComposedChart,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';
import type { OrderData, ProductSummary, DetailedCostConfig, PeriodComparison, MarketingDataRow, SkuDetailDimension } from '../types';
import { formatAmount, formatNumber } from '../lib/utils';
import MiniLineChart from './MiniLineChart';
import ProductInsights from './ProductInsights';
import ProfitFunnelDiagnosis from './ProfitFunnelDiagnosis';
import {
  groupByProduct,
  median,
  computeCR,
  computeHHI,
  coefficientOfVariation,
  analyzeTrend,
  detectAnomalies,
  movingAverage,
  forecastLinear,
} from '../utils/dataProcessor';

interface OrderOverviewProps {
  orders: OrderData[];
  summaries: ProductSummary[];
  costConfig: DetailedCostConfig;
  periodComparison?: PeriodComparison | null;
  /** 营销数据（单品维度洞察需要） */
  marketingData?: MarketingDataRow[];
}

/**
 * 获取利润率颜色
 */
const getProfitRateColor = (rate: number): string => {
  if (rate >= 15) return 'text-emerald-600';
  if (rate >= 5) return 'text-emerald-600';
  if (rate >= 0) return 'text-amber-600';
  return 'text-red-600';
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
      color: 'text-red-600 bg-red-50 border-red-200',
    };
  }
  if (profitRate < 5) {
    return {
      text: '优先测涨价/降快递成本',
      color: 'text-amber-600 bg-amber-50 border-amber-200',
    };
  }
  if (profitRate < 15) {
    return {
      text: '可测试涨价3%',
      color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    };
  }
  return {
    text: '利润健康，保持当前定价',
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  };
};

/**
 * 价格弹性档位：弹性为负，绝对值越大代表涨价后销量流失越多
 * - 乐观 -0.2（刚需型，涨价对销量影响小）
 * - 中性 -0.5
 * - 保守 -1.0（单位弹性，销量降幅≈涨价幅度）
 */
const PRICE_ELASTICITY = {
  optimistic: -0.2,
  neutral: -0.5,
  conservative: -1.0,
} as const;

/**
 * 计算涨价后的利润（含价格弹性）
 * 涨价 X% 后：单价 ×(1+X%)，销量按弹性 E 变化 ×(1+X%×E)
 * - 销售额 = 原销售额 ×(1+涨幅)×(1+涨幅×弹性)
 * - 随销量变化的成本（商品成本/优惠/快递/耗材/运费险/营销花费/退款损失）× 销量因子
 * - 平台技术服务费(0.6%) = 新销售额 × 0.6%
 * elasticity = 0 时退化为「销量不变」理论上限
 */
const calculateProfitAfterPriceIncrease = (
  summary: ProductSummary,
  increaseRate: number, // 0.01, 0.03, 0.05
  elasticity = 0
): number => {
  const volumeFactor = 1 + increaseRate * elasticity; // 销量变化因子
  const newSales = summary.销售额 * (1 + increaseRate) * volumeFactor;
  // 随销量变化的成本
  const unitCosts =
    summary.总商品成本 +
    summary.商家承担优惠 +
    summary.快递费 +
    summary.包装耗材 +
    summary.运费险 +
    summary.营销花费;
  const scaledUnitCosts = unitCosts * volumeFactor;
  const scaledRefundLoss = summary.预估退款损失 * volumeFactor;
  // 平台技术服务费随销售额变化
  const platformFee = newSales * 0.006;
  return Math.round((newSales - scaledUnitCosts - scaledRefundLoss - platformFee) * 100) / 100;
};

const OrderOverview: React.FC<OrderOverviewProps> = ({
  orders,
  summaries,
  periodComparison,
  costConfig,
  marketingData = [],
}) => {
  // 分析维度：sku=按规格逐SKU分析，product=按商品ID汇总分析
  const [dimension, setDimension] = useState<SkuDetailDimension>('sku');

  // BCG 四象限：点击卡片展开该象限的完整商品列表
  const [expandedQuadrant, setExpandedQuadrant] = useState<'star' | 'cashCow' | 'question' | 'dog' | null>(null);

  // 当前维度下的汇总数据（单品维度由 SKU 汇总聚合而来）
  const activeSummaries = useMemo(
    () => (dimension === 'sku' ? summaries : groupByProduct(summaries)),
    [dimension, summaries]
  );

  // 维度名称（用于文案）
  const dimLabel = dimension === 'sku' ? 'SKU' : '单品';

  // 计算关键指标
  const totalSales = orders.reduce((sum, order) => sum + order.商家实收金额, 0);
  const totalOrders = orders.length;
  const totalQuantity = orders.reduce((sum, order) => sum + order.商品数量, 0);
  const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

  // 维度键：SKU维度用规格，单品维度用商品ID
  const dimKeyOfSummary = useCallback(
    (s: ProductSummary) =>
      dimension === 'sku' ? s.规格 : (s.商品ID || s.商品名称 || s.规格),
    [dimension]
  );

  // 计算每个SKU/单品的日销量趋势数据（用于折线图）
  const skuTrendMap = useMemo(() => {
    // 外层 Map: key -> 内层 Map: date -> volume
    const nestedMap = new Map<string, Map<string, number>>();
    const validStatuses = ['已收货', '已发货', '待收货'];
    orders.forEach(order => {
      if (
        order.售后状态.includes('退款成功') ||
        !validStatuses.some(s => order.订单状态.includes(s))
      ) {
        return;
      }
      const spec = dimension === 'sku' ? (order.商品规格 || '未知规格') : (order.商品id || order.商品 || '未知商品');
      const dateStr = order.订单成交时间.split(' ')[0];
      if (!dateStr) return;

      let dateMap = nestedMap.get(spec);
      if (!dateMap) {
        dateMap = new Map();
        nestedMap.set(spec, dateMap);
      }
      dateMap.set(dateStr, (dateMap.get(dateStr) || 0) + order.商品数量);
    });

    // 转换为外层 Map: key -> [{date, volume}]（按日期排序）
    const result = new Map<string, { date: string; volume: number }[]>();
    nestedMap.forEach((dateMap, spec) => {
      const arr = Array.from(dateMap.entries()).map(([date, volume]) => ({ date, volume }));
      arr.sort((a, b) => a.date.localeCompare(b.date));
      result.set(spec, arr);
    });
    return result;
  }, [orders, dimension]);

  // 表1: SKU销量趋势（按销售额降序）
  const skuTrendData = useMemo(() => {
    return activeSummaries
      .map(s => ({
        summary: s,
        trend: (skuTrendMap.get(dimKeyOfSummary(s)) || []).map(item => item.volume),
      }))
      .sort((a, b) => b.summary.销售额 - a.summary.销售额);
  }, [activeSummaries, skuTrendMap, dimKeyOfSummary]);

  // 表2: SKU销售TOP（按销售额降序，取前10）
  const salesTopData = useMemo(() => {
    return [...activeSummaries].sort((a, b) => b.销售额 - a.销售额).slice(0, 10);
  }, [activeSummaries]);

  // 表3: SKU利润TOP（按净利润降序，取前10）
  const profitTopData = useMemo(() => {
    return [...activeSummaries]
      .sort((a, b) => b.净利润 - a.净利润)
      .slice(0, 10);
  }, [activeSummaries]);

  // 表4: 低利润SKU关注（按利润率升序，取前10）
  const lowProfitData = useMemo(() => {
    return [...activeSummaries]
      .sort((a, b) => a.利润率 - b.利润率)
      .slice(0, 10);
  }, [activeSummaries]);

  // 表5: SKU涨价模拟（按销售额降序，取前15）
  // 对每个涨幅给出三档弹性下的利润：乐观(-0.2)/中性(-0.5)/保守(-1.0)
  const priceSimulationData = useMemo(() => {
    return activeSummaries
      .filter(s => s.销售额 > 0)
      .map(s => ({
        summary: s,
        profit1: calculateProfitAfterPriceIncrease(s, 0.01, PRICE_ELASTICITY.neutral),
        profit3: calculateProfitAfterPriceIncrease(s, 0.03, PRICE_ELASTICITY.neutral),
        profit5: calculateProfitAfterPriceIncrease(s, 0.05, PRICE_ELASTICITY.neutral),
        // 保守档（弹性-1.0）：涨5%后利润，用于评估涨价风险下界
        profit5Conservative: calculateProfitAfterPriceIncrease(s, 0.05, PRICE_ELASTICITY.conservative),
        // 乐观档（弹性-0.2）：涨5%后利润，用于评估涨价机会上界
        profit5Optimistic: calculateProfitAfterPriceIncrease(s, 0.05, PRICE_ELASTICITY.optimistic),
      }))
      .sort((a, b) => b.summary.销售额 - a.summary.销售额)
      .slice(0, 15);
  }, [activeSummaries]);

  // SKU分类：以销售额中位数作为分界线（抗爆款拉高均值的异常值干扰）
  const medianSales = useMemo(() => {
    const validSales = activeSummaries.filter(s => s.销售额 > 0).map(s => s.销售额);
    return median(validSales);
  }, [activeSummaries]);

  // 爆品：销售额 >= 中位数 且 利润率 > 0（按销售额降序）
  const hotProducts = useMemo(() => {
    return activeSummaries
      .filter(s => s.销售额 >= medianSales && s.销售额 > 0 && s.利润率 > 0)
      .sort((a, b) => b.销售额 - a.销售额);
  }, [activeSummaries, medianSales]);

  // 风险品：非爆品（销售额>0但未达爆品标准），按销售额降序
  const riskProducts = useMemo(() => {
    return activeSummaries
      .filter(s => s.销售额 > 0 && !(s.销售额 >= medianSales && s.利润率 > 0))
      .sort((a, b) => b.销售额 - a.销售额);
  }, [activeSummaries, medianSales]);

  // 衰退品：销量趋势持续下降（归一化斜率≤-2% 且 R²≥0.3 且样本≥5），按销售额降序
  const decliningProducts = useMemo(() => {
    return activeSummaries
      .filter(s => {
        const trend = (skuTrendMap.get(dimKeyOfSummary(s)) || []).map(item => item.volume);
        return analyzeTrend(trend).isDeclining;
      })
      .sort((a, b) => b.销售额 - a.销售额);
  }, [activeSummaries, skuTrendMap, dimKeyOfSummary]);

  // 经营健康度：总利润、总成本、整体利润率
  const healthMetrics = useMemo(() => {
    const totalCost = activeSummaries.reduce((sum, s) => sum + s.总成本, 0);
    const totalProfit = activeSummaries.reduce((sum, s) => sum + s.净利润, 0);
    const totalSalesAmount = activeSummaries.reduce((sum, s) => sum + s.销售额, 0);
    const overallProfitRate = totalSalesAmount > 0 ? (totalProfit / totalSalesAmount) * 100 : 0;
    return { totalCost, totalProfit, overallProfitRate, totalSalesAmount };
  }, [activeSummaries]);

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
    const lossSkus = activeSummaries.filter(s => s.销售额 > 0 && s.净利润 < 0);
    const decliningSkus = decliningProducts;
    // 低利润高销量SKU：销量>=销量中位数 且 利润率<5%（用中位数避免少数爆款拉高阈值）
    const medianVolume = median(activeSummaries.map(s => s.销量));
    const lowProfitHighVolume = activeSummaries.filter(
      s => s.销量 >= medianVolume && medianVolume > 0 && s.利润率 < 5 && s.销售额 > 0
    );
    return { lossSkus, decliningSkus, lowProfitHighVolume };
  }, [activeSummaries, decliningProducts]);

  // 环比变化率获取辅助函数
  const getComparison = (key: keyof PeriodComparison | null): number | null => {
    if (!periodComparison || !key) return null;
    return periodComparison[key].changeRate;
  };

  // 当前视图推广ROI = 交易额 / 总营销花费（基于已筛选的推广数据）
  const currentROI = useMemo(() => {
    const spend = marketingData.reduce((sum, r) => sum + (r.总营销花费 || 0), 0);
    const gmv = marketingData.reduce((sum, r) => sum + (r.交易额 || 0), 0);
    return spend > 0 ? gmv / spend : 0;
  }, [marketingData]);

  // 指标卡片配置
  const metrics = [
    {
      title: '总销售额',
      value: formatAmount(totalSales),
      icon: DollarSign,
      gradient: 'from-emerald-500 to-emerald-600',
      bgColor: 'bg-emerald-50',
      changeRate: getComparison('销售额'),
    },
    {
      title: '总成本',
      value: formatAmount(healthMetrics.totalCost),
      icon: Wallet,
      gradient: 'from-amber-500 to-amber-600',
      bgColor: 'bg-amber-50',
      changeRate: null,
    },
    {
      title: '总净利润',
      value: `${healthMetrics.totalProfit >= 0 ? '+' : ''}${formatAmount(healthMetrics.totalProfit)}`,
      icon: healthMetrics.totalProfit >= 0 ? TrendingUp : TrendingDown,
      gradient: healthMetrics.totalProfit >= 0 ? 'from-emerald-500 to-emerald-600' : 'from-red-500 to-red-600',
      bgColor: healthMetrics.totalProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50',
      changeRate: null,
    },
    {
      title: '整体利润率',
      value: `${healthMetrics.overallProfitRate >= 0 ? '+' : ''}${healthMetrics.overallProfitRate.toFixed(2)}%`,
      icon: PieChartIcon,
      gradient: 'from-emerald-500 to-emerald-600',
      bgColor: 'bg-emerald-50',
      changeRate: getComparison('利润率'),
    },
    {
      title: '总订单数',
      value: totalOrders.toLocaleString(),
      icon: ShoppingCart,
      gradient: 'from-emerald-500 to-emerald-600',
      bgColor: 'bg-emerald-50',
      changeRate: getComparison('订单数'),
    },
    {
      title: '总销量',
      value: totalQuantity.toLocaleString(),
      icon: Package,
      gradient: 'from-emerald-500 to-emerald-600',
      bgColor: 'bg-emerald-50',
      changeRate: getComparison('销量'),
    },
    {
      title: '平均客单价',
      value: formatAmount(averageOrderValue),
      icon: TrendingUp,
      gradient: 'from-emerald-500 to-emerald-600',
      bgColor: 'bg-emerald-50',
      changeRate: getComparison('平均客单价'),
    },
    {
      title: '推广ROI',
      value: currentROI > 0 ? `${currentROI.toFixed(2)}` : '—',
      icon: Megaphone,
      gradient: 'from-emerald-500 to-emerald-600',
      bgColor: 'bg-emerald-50',
      changeRate: getComparison('推广ROI'),
    },
  ];

  // SKU分类占比数据
  const categoryStats = useMemo(() => {
    const total = activeSummaries.filter(s => s.销售额 > 0).length;
    return {
      hot: { count: hotProducts.length, percent: total > 0 ? (hotProducts.length / total) * 100 : 0 },
      risk: { count: riskProducts.length, percent: total > 0 ? (riskProducts.length / total) * 100 : 0 },
      declining: { count: decliningProducts.length, percent: total > 0 ? (decliningProducts.length / total) * 100 : 0 },
      total,
    };
  }, [activeSummaries, hotProducts, riskProducts, decliningProducts]);

  // 科学分析：ABC 分类（帕累托）+ 集中度（CR3/CR5/HHI）+ 波动率（CV）
  const abcAnalysis = useMemo(() => {
    const valid = activeSummaries
      .filter(s => s.销售额 > 0)
      .sort((a, b) => b.销售额 - a.销售额);
    const salesValues = valid.map(s => s.销售额);
    const totalSalesAmount = salesValues.reduce((sum, v) => sum + v, 0);
    if (valid.length === 0 || totalSalesAmount <= 0) {
      return null;
    }

    // 按累计销售额占比划分：A≤70%、B≤90%、C>90%（帕累托经典口径）
    let cum = 0;
    const tiers: { A: ProductSummary[]; B: ProductSummary[]; C: ProductSummary[] } = { A: [], B: [], C: [] };
    valid.forEach(s => {
      const prevShare = cum / totalSalesAmount;
      cum += s.销售额;
      if (prevShare < 0.7) tiers.A.push(s);
      else if (prevShare < 0.9) tiers.B.push(s);
      else tiers.C.push(s);
    });

    const tierStat = (list: ProductSummary[]) => {
      const sales = list.reduce((sum, s) => sum + s.销售额, 0);
      return {
        count: list.length,
        sales,
        salesShare: (sales / totalSalesAmount) * 100,
        countShare: (list.length / valid.length) * 100,
        avgProfitRate: list.length > 0
          ? list.reduce((sum, s) => sum + s.利润率, 0) / list.length
          : 0,
      };
    };

    // C 类汰换候选：长尾中利润率<5%（含亏损）的品，越不盈利越靠前
    const eliminationCandidates = tiers.C
      .filter(s => s.利润率 < 5)
      .sort((a, b) => a.利润率 - b.利润率);

    return {
      totalCount: valid.length,
      totalSales: totalSalesAmount,
      A: tierStat(tiers.A),
      B: tierStat(tiers.B),
      C: tierStat(tiers.C),
      eliminationCandidates,
      cr3: computeCR(salesValues, 3),
      cr5: computeCR(salesValues, 5),
      hhi: computeHHI(salesValues),
      cv: coefficientOfVariation(salesValues),
    };
  }, [activeSummaries]);

  // 集中度解读（HHI 分级参考：<1500 竞争充分，1500-2500 中等，>2500 高度集中）
  const hhiLevel = (hhi: number): { text: string; color: string } => {
    if (hhi >= 2500) return { text: '高度集中', color: 'text-red-600' };
    if (hhi >= 1500) return { text: '中等集中', color: 'text-amber-600' };
    return { text: '竞争充分', color: 'text-emerald-600' };
  };

  // BCG 波士顿矩阵：以销售额份额（相对份额）为 X 轴、销量趋势增长率为 Y 轴
  // 相对份额 = 本项销售额 / 销售额中位数（>1 视为高份额），增长率取趋势归一化斜率
  const bcgAnalysis = useMemo(() => {
    const valid = activeSummaries.filter(s => s.销售额 > 0);
    if (valid.length < 2) return null;
    const totalSalesAmount = valid.reduce((sum, s) => sum + s.销售额, 0);
    const avgSales = totalSalesAmount / valid.length;
    if (avgSales <= 0) return null;

    const points = valid.map(s => {
      const trend = (skuTrendMap.get(dimKeyOfSummary(s)) || []).map(item => item.volume);
      const growth = analyzeTrend(trend, 3).normalizedSlope * 100; // 每期相对变化（%）
      const share = s.销售额 / avgSales; // 相对份额（1 = 平均水平）
      return { summary: s, growth, share, sales: s.销售额, profitRate: s.利润率 };
    });

    // 象限划分：份额以 1（平均水平）为界，增长率以 0 为界
    const quadrants = {
      star: points.filter(p => p.share >= 1 && p.growth >= 0), // 明星：高份额高增长
      cashCow: points.filter(p => p.share >= 1 && p.growth < 0), // 金牛：高份额低增长
      question: points.filter(p => p.share < 1 && p.growth >= 0), // 问题：低份额高增长
      dog: points.filter(p => p.share < 1 && p.growth < 0), // 瘦狗：低份额低增长
    };

    // 散点图数据（限制最多展示 60 个，按销售额取前 60，避免图过密）
    const scatterPoints = [...points]
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 60)
      .map(p => ({
        x: Math.round(p.share * 100) / 100,
        y: Math.round(p.growth * 100) / 100,
        z: Math.max(1, p.sales),
        name: p.summary.规格,
        profitRate: p.profitRate,
      }));

    return {
      points,
      quadrants,
      scatterPoints,
      avgShareLine: 1,
    };
  }, [activeSummaries, skuTrendMap, dimKeyOfSummary]);

  // 日趋势增强：异常日检测 + 7日移动平均 + 未来7天线性外推预测
  const trendEnhanced = useMemo(() => {
    if (dailyTrendData.length < 4) return null;
    const salesSeries = dailyTrendData.map(d => d.销售额);
    const anomalies = detectAnomalies(salesSeries, 1.5);
    const anomalyIndexSet = new Map<number, 'high' | 'low'>();
    anomalies.forEach(a => anomalyIndexSet.set(a.index, a.type));

    const ma7 = movingAverage(salesSeries, 7);
    const forecast = forecastLinear(salesSeries, 7);

    // 拼接图表数据：历史段 + 预测段（预测段日期用 +N 标记）
    const lastDate = dailyTrendData[dailyTrendData.length - 1]?.日期 || '';
    const parseDate = (s: string): Date => {
      const [y, m, d] = s.split('-').map(Number);
      return new Date(y, (m || 1) - 1, d || 1);
    };
    const fmtDate = (dt: Date): string =>
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

    const chartData: {
      日期: string;
      销售额: number | null;
      销量: number | null;
      订单数: number | null;
      MA7: number | null;
      预测: number | null;
      预测下界: number | null;
      预测上界: number | null;
      anomaly: 'high' | 'low' | null;
    }[] = dailyTrendData.map((d, i) => ({
      日期: d.日期,
      销售额: d.销售额,
      销量: d.销量,
      订单数: d.订单数,
      MA7: ma7[i],
      预测: null,
      预测下界: null,
      预测上界: null,
      anomaly: anomalyIndexSet.get(i) || null,
    }));

    if (forecast.length > 0 && lastDate) {
      const base = parseDate(lastDate);
      forecast.forEach(f => {
        const dt = new Date(base);
        dt.setDate(dt.getDate() + f.step);
        chartData.push({
          日期: fmtDate(dt),
          销售额: null,
          销量: null,
          订单数: null,
          MA7: null,
          预测: f.value,
          预测下界: f.lower,
          预测上界: f.upper,
          anomaly: null,
        });
      });
    }

    // 预测汇总：未来7天合计、较历史均值变化
    const forecastTotal = forecast.reduce((sum, f) => sum + f.value, 0);
    const histAvg = salesSeries.reduce((sum, v) => sum + v, 0) / salesSeries.length;
    const forecastAvg = forecast.length > 0 ? forecastTotal / forecast.length : 0;
    const changeVsHist = histAvg > 0 ? ((forecastAvg - histAvg) / histAvg) * 100 : 0;

    return { chartData, anomalies, forecast, forecastTotal, histAvg, forecastAvg, changeVsHist };
  }, [dailyTrendData]);

  return (
    <div className="space-y-3">
      {/* 维度切换 */}
      <div className="bg-white rounded-xl px-3 py-2 border border-slate-200 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-slate-500">分析维度</span>
          <div className="flex gap-0.5 bg-slate-100 rounded-lg p-1 border border-slate-200">
            {([
              { value: 'sku', label: 'SKU（规格）' },
              { value: 'product', label: '单品（商品）' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => setDimension(opt.value)}
                className={`px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                  dimension === opt.value
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="text-[13px] text-slate-400">
          {dimension === 'sku'
            ? '按商品规格逐 SKU 分析：适合调价、调推广等执行动作'
            : '按商品ID汇总分析：适合商品汰换、SKU 结构优化等策略决策'}
        </div>
      </div>

      {/* 单品维度专属洞察：SKU结构健康度 + 商品推广决策（下钻SKU明细） */}
      {dimension === 'product' && (
        <ProductInsights
          skuSummaries={summaries}
          marketingData={marketingData}
          costConfig={costConfig}
          orders={orders}
        />
      )}

      {/* 利润漏斗诊断：展现×CTR×CVR×客单价×(1-退款率)-成本-推广；四象散点（点=SKU/单品），悬停看商品ID，点击展开六维雷达 */}
      <ProfitFunnelDiagnosis summaries={activeSummaries} marketingData={marketingData} dimension={dimension} />

      {/* 关键预警区 */}
      {(alerts.lossSkus.length > 0 || alerts.decliningSkus.length > 0 || alerts.lowProfitHighVolume.length > 0) && (
        <div className="bg-white rounded-xl p-3 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="w-4 h-4 text-amber-600" />
            <h3 className="text-[13px] font-semibold text-slate-900">关键预警</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {alerts.lossSkus.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                <div className="p-1.5 bg-red-100 rounded-md">
                  <TrendingDown className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-red-600">{alerts.lossSkus.length} 个亏损{dimLabel}</p>
                  <p className="text-[12px] text-slate-500">需立即止亏：核成本或涨价</p>
                </div>
              </div>
            )}
            {alerts.decliningSkus.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="p-1.5 bg-amber-100 rounded-md">
                  <ArrowDown className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-amber-600">{alerts.decliningSkus.length} 个衰退{dimLabel}</p>
                  <p className="text-[12px] text-slate-500">销量持续下降，关注库存与推广</p>
                </div>
              </div>
            )}
            {alerts.lowProfitHighVolume.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="p-1.5 bg-amber-100 rounded-md">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-amber-600">{alerts.lowProfitHighVolume.length} 个低利润高销量{dimLabel}</p>
                  <p className="text-[12px] text-slate-500">利润率&lt;5%但销量高，建议优化成本</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 经营健康度卡片 */}
      <div className="bg-white rounded-xl p-3 border border-slate-200">
        <h2 className="text-[13px] font-bold text-slate-900 mb-2">经营健康度</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-2">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            const changeRate = metric.changeRate;
            const hasComparison = changeRate !== null && changeRate !== undefined;
            const isUp = (changeRate || 0) > 0;
            const isDown = (changeRate || 0) < 0;
            return (
              <div
                key={metric.title}
                className={`relative overflow-hidden rounded-lg ${metric.bgColor} px-2.5 py-2 border border-slate-200`}
              >
                <div className="relative z-10 flex items-center justify-between gap-1.5">
                  <div className="min-w-0">
                    <p className="text-[12px] text-slate-500 font-medium truncate">
                      {metric.title}
                    </p>
                    <p className="text-[14px] font-bold text-slate-900 truncate">
                      {metric.value}
                    </p>
                    {hasComparison && (
                      <div className="flex items-center gap-1 text-[12px]">
                        <span className="text-slate-400">环比</span>
                        <span
                          className={`flex items-center gap-0.5 font-medium ${
                            isUp ? 'text-emerald-600' : isDown ? 'text-red-600' : 'text-slate-500'
                          }`}
                        >
                          {isUp && <ArrowUp className="w-2.5 h-2.5" />}
                          {isDown && <ArrowDown className="w-2.5 h-2.5" />}
                          {changeRate > 0 ? '+' : ''}{changeRate}%
                        </span>
                      </div>
                    )}
                  </div>
                  <div
                    className={`p-1.5 rounded-md bg-gradient-to-br ${metric.gradient} shadow-sm flex-shrink-0`}
                  >
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 科学分析：ABC 分类 + 集中度 */}
      {abcAnalysis && (
        <div className="bg-white rounded-xl p-3 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <PieChartIcon className="w-4 h-4 text-emerald-600" />
            <h3 className="text-[13px] font-semibold text-slate-900">{dimLabel}结构科学分析</h3>
            <span className="text-[12px] text-slate-500">
              （帕累托 ABC 分类 + 销售额集中度）
            </span>
          </div>

          {/* ABC 三档卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
            {([
              { key: 'A', label: 'A 类（核心）', desc: '累计销售额前 70%', color: 'text-emerald-600', bar: 'from-emerald-500 to-emerald-400', stat: abcAnalysis.A },
              { key: 'B', label: 'B 类（腰部）', desc: '累计 70%–90%', color: 'text-emerald-500', bar: 'from-emerald-400 to-emerald-300', stat: abcAnalysis.B },
              { key: 'C', label: 'C 类（长尾）', desc: '累计 90% 之后', color: 'text-slate-500', bar: 'from-slate-400 to-slate-300', stat: abcAnalysis.C },
            ] as const).map(tier => (
              <div key={tier.key} className="rounded-lg border border-slate-200 p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[13px] font-semibold ${tier.color}`}>{tier.label}</span>
                  <span className="text-[12px] text-slate-400">{tier.stat.count}个 · {tier.stat.countShare.toFixed(1)}%</span>
                </div>
                <div className="flex items-baseline gap-2 mb-1.5">
                  <span className="text-[14px] font-bold text-slate-900">{tier.stat.salesShare.toFixed(1)}%</span>
                  <span className="text-[12px] text-slate-500">销售额占比</span>
                </div>
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden mb-1.5">
                  <div
                    className={`h-full bg-gradient-to-r ${tier.bar} rounded-full transition-all duration-500`}
                    style={{ width: `${tier.stat.salesShare}%` }}
                  />
                </div>
                <p className="text-[12px] text-slate-400">{tier.desc}</p>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  平均利润率
                  <span className={`ml-1 font-mono font-semibold ${getProfitRateColor(tier.stat.avgProfitRate)}`}>
                    {tier.stat.avgProfitRate >= 0 ? '+' : ''}{tier.stat.avgProfitRate.toFixed(2)}%
                  </span>
                </p>
              </div>
            ))}
          </div>

          {/* 集中度指标 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {([
              { label: 'CR3 前三集中度', value: `${abcAnalysis.cr3.toFixed(1)}%`, hint: '前3名销售额占比' },
              { label: 'CR5 前五集中度', value: `${abcAnalysis.cr5.toFixed(1)}%`, hint: '前5名销售额占比' },
              { label: 'HHI 赫芬达尔指数', value: abcAnalysis.hhi.toFixed(0), hint: hhiLevel(abcAnalysis.hhi).text, hintColor: hhiLevel(abcAnalysis.hhi).color },
              { label: 'CV 销售额波动率', value: abcAnalysis.cv.toFixed(2), hint: '越高说明越依赖少数爆款' },
            ] as const).map(item => (
              <div key={item.label} className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                <p className="text-[12px] text-slate-500 mb-0.5">{item.label}</p>
                <p className="text-[14px] font-bold text-slate-900 font-mono">{item.value}</p>
                <p className={`text-[12px] mt-0.5 ${'hintColor' in item ? item.hintColor : 'text-slate-400'}`}>{item.hint}</p>
              </div>
            ))}
          </div>

          {/* BCG 波士顿矩阵 */}
          {bcgAnalysis && (
            <div className="mt-4 pt-3 border-t border-slate-200">
              <div className="flex items-center gap-2 mb-0.5">
                <Target className="w-4 h-4 text-emerald-600" />
                <span className="text-[13px] font-semibold text-slate-700">BCG 波士顿矩阵</span>
                <span className="text-[12px] text-slate-400">（份额 × 增长率四象限）</span>
              </div>
              <p className="text-[12px] text-slate-400 mb-2">
                横轴为相对份额（本项销售额 ÷ 平均销售额，&gt;1 为高份额），纵轴为销量趋势增长率（每期相对变化 %）。
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* 散点图 */}
                <div className="rounded-lg border border-slate-200 p-2">
                  <ResponsiveContainer width="100%" height={240}>
                    <ScatterChart margin={{ top: 10, right: 16, bottom: 24, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name="相对份额"
                        stroke="#64748b"
                        fontSize={11}
                        tickFormatter={(v: number) => `${v}x`}
                        label={{ value: '相对份额', position: 'insideBottom', offset: -12, fontSize: 11, fill: '#64748b' }}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        name="增长率"
                        stroke="#64748b"
                        fontSize={11}
                        tickFormatter={(v: number) => `${v}%`}
                        label={{ value: '增长率', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#64748b' }}
                      />
                      <ZAxis type="number" dataKey="z" range={[30, 300]} />
                      <ReferenceLine x={bcgAnalysis.avgShareLine} stroke="#94a3b8" strokeDasharray="4 4" />
                      <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                      <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        content={({ payload }) => {
                          if (!payload || payload.length === 0) return null;
                          const p = payload[0].payload as { name: string; x: number; y: number; profitRate: number };
                          return (
                            <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-[12px] shadow-sm">
                              <p className="text-slate-900 font-medium mb-1 max-w-[220px] truncate">{p.name}</p>
                              <p className="text-slate-500">相对份额：<span className="font-mono text-slate-700">{p.x}x</span></p>
                              <p className="text-slate-500">增长率：<span className="font-mono text-slate-700">{p.y}%</span></p>
                              <p className="text-slate-500">利润率：<span className={`font-mono ${getProfitRateColor(p.profitRate)}`}>{p.profitRate.toFixed(2)}%</span></p>
                            </div>
                          );
                        }}
                      />
                      <Scatter data={bcgAnalysis.scatterPoints} fill="#10b981" fillOpacity={0.6} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>

                {/* 四象限说明：点击卡片查看该象限全部商品 */}
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { key: 'star', label: '明星', en: 'Star', desc: '高份额·高增长', tip: '加大投入，巩固领先', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
                    { key: 'cashCow', label: '金牛', en: 'Cash Cow', desc: '高份额·低增长', tip: '稳定收割，控制成本', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
                    { key: 'question', label: '问题', en: 'Question', desc: '低份额·高增长', tip: '择优扶持，谨慎投入', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
                    { key: 'dog', label: '瘦狗', en: 'Dog', desc: '低份额·低增长', tip: '考虑收缩或汰换', color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' },
                  ] as const).map(q => {
                    const list = bcgAnalysis.quadrants[q.key];
                    const top = [...list].sort((a, b) => b.sales - a.sales).slice(0, 3);
                    return (
                      <button
                        key={q.key}
                        type="button"
                        onClick={() => setExpandedQuadrant(q.key)}
                        className={`rounded-lg border ${q.border} ${q.bg} p-2 text-left transition-shadow hover:shadow-md hover:ring-1 hover:ring-slate-300 cursor-pointer`}
                        title="点击查看该象限全部商品"
                      >
                        <div className="flex items-center justify-between mb-0.5">
                          <span className={`text-[13px] font-semibold ${q.color}`}>
                            {q.label} <span className="font-normal text-slate-400">{q.en}</span>
                          </span>
                          <span className="text-[12px] text-slate-500">{list.length}个 ↗</span>
                        </div>
                        <p className="text-[12px] text-slate-400 mb-1">{q.desc} · {q.tip}</p>
                        <div className="space-y-0.5">
                          {top.map(p => (
                            <p key={p.summary.规格} className="text-[12px] text-slate-600 truncate" title={p.summary.规格}>
                              {p.summary.规格}
                            </p>
                          ))}
                          {list.length === 0 && <p className="text-[12px] text-slate-400">—</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* 象限商品明细弹窗 */}
                {expandedQuadrant && (() => {
                  const meta = {
                    star: { label: '明星', en: 'Star', desc: '高份额·高增长', tip: '加大投入，巩固领先', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
                    cashCow: { label: '金牛', en: 'Cash Cow', desc: '高份额·低增长', tip: '稳定收割，控制成本', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
                    question: { label: '问题', en: 'Question', desc: '低份额·高增长', tip: '择优扶持，谨慎投入', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
                    dog: { label: '瘦狗', en: 'Dog', desc: '低份额·低增长', tip: '考虑收缩或汰换', color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' },
                  }[expandedQuadrant];
                  const list = [...bcgAnalysis.quadrants[expandedQuadrant]].sort((a, b) => b.sales - a.sales);
                  return (
                    <div
                      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
                      onClick={() => setExpandedQuadrant(null)}
                    >
                      <div
                        className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col"
                        onClick={e => e.stopPropagation()}
                      >
                        <div className={`flex items-center justify-between px-3 py-2 border-b ${meta.border} ${meta.bg} rounded-t-xl`}>
                          <div>
                            <span className={`text-[13px] font-semibold ${meta.color}`}>
                              {meta.label} <span className="font-normal text-slate-400">{meta.en}</span>
                            </span>
                            <span className="ml-2 text-[13px] text-slate-500">{meta.desc} · {meta.tip}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setExpandedQuadrant(null)}
                            className="text-slate-400 hover:text-slate-600 text-[20px] leading-none px-1"
                            aria-label="关闭"
                          >
                            ×
                          </button>
                        </div>
                        <div className="overflow-auto">
                          <table className="w-full min-w-[640px]">
                            <thead className="sticky top-0 bg-slate-100">
                              <tr className="border-b border-slate-200">
                                <th className="px-3 py-2 text-left text-[12px] font-medium text-slate-500">{dimLabel}</th>
                                <th className="px-3 py-2 text-right text-[12px] font-medium text-slate-500">销售额</th>
                                <th className="px-3 py-2 text-right text-[12px] font-medium text-slate-500">相对份额</th>
                                <th className="px-3 py-2 text-right text-[12px] font-medium text-slate-500">增长率</th>
                                <th className="px-3 py-2 text-right text-[12px] font-medium text-slate-500">利润率</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {list.map(p => (
                                <tr key={p.summary.规格} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-3 py-1.5 text-[13px] text-slate-700 max-w-[280px] truncate" title={p.summary.规格}>
                                    {p.summary.规格}
                                  </td>
                                  <td className="px-3 py-1.5 text-[13px] text-right font-mono text-slate-700">
                                    {formatAmount(p.sales)}
                                  </td>
                                  <td className="px-3 py-1.5 text-[13px] text-right font-mono text-slate-700">
                                    {p.share.toFixed(2)}x
                                  </td>
                                  <td className={`px-3 py-1.5 text-[13px] text-right font-mono ${p.growth >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {p.growth >= 0 ? '+' : ''}{p.growth.toFixed(1)}%
                                  </td>
                                  <td className={`px-3 py-1.5 text-[13px] text-right font-mono ${getProfitRateColor(p.profitRate)}`}>
                                    {p.profitRate.toFixed(2)}%
                                  </td>
                                </tr>
                              ))}
                              {list.length === 0 && (
                                <tr>
                                  <td colSpan={5} className="px-3 py-6 text-center text-[13px] text-slate-400">该象限暂无商品</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                        <div className="px-3 py-2 border-t border-slate-200 text-[12px] text-slate-400">
                          共 {list.length} 个{dimLabel} · 相对份额 = 该项销售额 / 平均销售额（≥1 为高份额）
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* C 类汰换候选 */}
          {abcAnalysis.eliminationCandidates.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
              <div className="flex items-center gap-2 mb-2">
                <Trash2 className="w-4 h-4 text-amber-600" />
                <span className="text-[13px] font-semibold text-amber-700">
                  C 类汰换候选（{abcAnalysis.eliminationCandidates.length}个）
                </span>
                <span className="text-[12px] text-amber-600/80">
                  · 长尾且利润率&lt;5%，建议评估下架或清仓
                </span>
              </div>
              <div className="overflow-auto rounded-lg border border-amber-200 bg-white max-h-[300px]">
                <table className="w-full min-w-[640px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-amber-200 bg-amber-50">
                      <th className="px-3 py-2 text-left text-[13px] font-medium text-slate-500">{dimLabel}</th>
                      <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">销售额</th>
                      <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">成本</th>
                      <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">销量</th>
                      <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">净利润</th>
                      <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">利润率</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {abcAnalysis.eliminationCandidates.slice(0, 10).map(item => (
                      <tr key={item.规格} className="hover:bg-amber-50/50 transition-colors">
                        <td className="px-3 py-1.5 text-[13px] text-slate-700 max-w-[240px] truncate" title={item.规格}>
                          {item.规格}
                        </td>
                        <td className="px-3 py-1.5 text-[13px] text-right font-mono text-slate-700">
                          {formatAmount(item.销售额)}
                        </td>
                        <td className="px-3 py-1.5 text-[13px] text-right font-mono text-amber-600">
                          {formatAmount(item.总成本)}
                        </td>
                        <td className="px-3 py-1.5 text-[13px] text-right font-mono text-slate-700">
                          {formatNumber(item.销量)}
                        </td>
                        <td className={`px-3 py-1.5 text-[13px] text-right font-mono ${getProfitRateColor(item.净利润)}`}>
                          {item.净利润 >= 0 ? '+' : ''}
                          {formatAmount(item.净利润)}
                        </td>
                        <td className={`px-3 py-1.5 text-[13px] text-right font-mono ${getProfitRateColor(item.利润率)}`}>
                          {item.利润率 >= 0 ? '+' : ''}
                          {item.利润率.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {abcAnalysis.eliminationCandidates.length > 10 && (
                <p className="mt-1.5 text-[12px] text-amber-600/80">
                  仅显示利润率最低的 10 个，共 {abcAnalysis.eliminationCandidates.length} 个候选。
                </p>
              )}
            </div>
          )}

          <div className="mt-3 pt-2 border-t border-slate-200 text-[12px] text-slate-400 leading-relaxed">
            <p>
              <span className="text-slate-500 font-medium">口径说明：</span>
              ABC 按销售额从高到低累计占比划分（A≤70%、B≤90%、C&gt;90%）；CR3/CR5 为前 3/5 名销售额集中度；
              HHI = Σ(市场份额%)²（&lt;1500 竞争充分、1500–2500 中等、&gt;2500 高度集中）；CV = 销售额标准差/均值。
              集中度越高，越需警惕头部{dimLabel}波动带来的整体风险。
            </p>
            <p className="mt-1">
              <span className="text-slate-500 font-medium">汰换口径：</span>
              C 类中利润率&lt;5% 的{dimLabel}列为汰换候选（亏损品优先）。淘汰前建议先尝试清仓回笼资金，
              并确认是否为引流款/关联购买款，避免误伤整体流量。
            </p>
          </div>
        </div>
      )}

      {/* 日销售趋势图 */}
      {dailyTrendData.length > 0 && (
        <div className="bg-white rounded-xl p-3 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <LineChartIcon className="w-4 h-4 text-emerald-600" />
            <h3 className="text-[13px] font-semibold text-slate-900">日销售趋势</h3>
            <span className="text-[12px] text-slate-500">（{dailyTrendData.length}天数据）</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={trendEnhanced ? trendEnhanced.chartData : dailyTrendData}>
              <defs>
                <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#64748b" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#64748b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="日期"
                stroke="#64748b"
                fontSize={11}
                tickFormatter={(v: string) => v.slice(5)}
              />
              <YAxis yAxisId="left" stroke="#10b981" fontSize={11} />
              <YAxis yAxisId="right" orientation="right" stroke="#64748b" fontSize={11} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelStyle={{ color: '#0f172a' }}
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
                connectNulls={false}
              />
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="销量"
                stroke="#64748b"
                strokeWidth={2}
                fill="url(#volumeGradient)"
                name="销量 (件)"
                connectNulls={false}
              />
              {trendEnhanced && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="MA7"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={false}
                  connectNulls
                  name="7日移动平均"
                />
              )}
              {trendEnhanced && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="预测"
                  stroke="#059669"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 3, fill: '#059669' }}
                  connectNulls
                  name="预测 (¥)"
                />
              )}
              {trendEnhanced && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="预测上界"
                  stroke="#a7f3d0"
                  strokeWidth={1}
                  strokeDasharray="2 3"
                  dot={false}
                  connectNulls
                  name="预测区间上界"
                  legendType="none"
                />
              )}
              {trendEnhanced && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="预测下界"
                  stroke="#a7f3d0"
                  strokeWidth={1}
                  strokeDasharray="2 3"
                  dot={false}
                  connectNulls
                  name="预测区间下界"
                  legendType="none"
                />
              )}
              {trendEnhanced?.anomalies.map(a => {
                const point = trendEnhanced.chartData[a.index];
                if (!point) return null;
                return (
                  <ReferenceDot
                    key={`anomaly-${a.index}`}
                    yAxisId="left"
                    x={point.日期}
                    y={a.value}
                    r={5}
                    fill={a.type === 'high' ? '#ef4444' : '#f59e0b'}
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                );
              })}
            </ComposedChart>
          </ResponsiveContainer>

          {/* 异常检测 + 预测摘要 */}
          {trendEnhanced && (
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
              {/* 异常日 */}
              <div className="rounded-lg border border-slate-200 p-2.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Bell className="w-4 h-4 text-red-500" />
                  <span className="text-[13px] font-semibold text-slate-700">异常销售日</span>
                  <span className="text-[12px] text-slate-400">（IQR 四分位距法，1.5×IQR）</span>
                </div>
                {trendEnhanced.anomalies.length === 0 ? (
                  <p className="text-[12px] text-slate-400">未检测到显著异常日，销售波动处于正常区间。</p>
                ) : (
                  <div className="space-y-1 max-h-[96px] overflow-y-auto">
                    {trendEnhanced.anomalies.map(a => {
                      const date = trendEnhanced.chartData[a.index]?.日期 || '';
                      return (
                        <div key={`anomaly-row-${a.index}`} className="flex items-center justify-between text-[12px]">
                          <span className="flex items-center gap-2">
                            <span
                              className={`inline-block w-2 h-2 rounded-full ${a.type === 'high' ? 'bg-red-500' : 'bg-amber-500'}`}
                            />
                            <span className="text-slate-600 font-mono">{date}</span>
                            <span className={a.type === 'high' ? 'text-red-600' : 'text-amber-600'}>
                              {a.type === 'high' ? '暴涨' : '暴跌'}
                            </span>
                          </span>
                          <span className="font-mono text-slate-700">
                            {formatAmount(a.value)}
                            <span className="ml-1 text-slate-400">Z={a.zScore.toFixed(1)}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 未来7天预测 */}
              <div className="rounded-lg border border-slate-200 p-2.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <span className="text-[13px] font-semibold text-slate-700">未来 7 天预测</span>
                  <span className="text-[12px] text-slate-400">（最小二乘线性外推，95% 区间）</span>
                </div>
                {trendEnhanced.forecast.length === 0 ? (
                  <p className="text-[12px] text-slate-400">样本不足，暂无法预测。</p>
                ) : (
                  <>
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <span className="text-[14px] font-bold text-slate-900 font-mono">
                        {formatAmount(trendEnhanced.forecastTotal)}
                      </span>
                      <span className="text-[12px] text-slate-500">预计合计销售额</span>
                      <span
                        className={`text-[12px] font-mono ${
                          trendEnhanced.changeVsHist >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {trendEnhanced.changeVsHist >= 0 ? '↑' : '↓'}
                        {Math.abs(trendEnhanced.changeVsHist).toFixed(1)}%
                        <span className="text-slate-400 ml-1">vs 历史日均</span>
                      </span>
                    </div>
                    <div className="space-y-1 max-h-[80px] overflow-y-auto">
                      {trendEnhanced.forecast.map((f, i) => (
                        <div key={`forecast-${f.step}`} className="flex items-center justify-between text-[12px]">
                          <span className="text-slate-500 font-mono">
                            D+{f.step} · {trendEnhanced.chartData[trendEnhanced.chartData.length - trendEnhanced.forecast.length + i]?.日期.slice(5) || ''}
                          </span>
                          <span className="font-mono text-slate-700">
                            {formatAmount(f.value)}
                            <span className="ml-1 text-slate-400">
                              [{formatAmount(f.lower)}~{formatAmount(f.upper)}]
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SKU分类占比图 */}
      <div className="bg-white rounded-xl p-3 border border-slate-200">
        <div className="flex items-center gap-2 mb-2">
          <PieChartIcon className="w-4 h-4 text-emerald-600" />
          <h3 className="text-[13px] font-semibold text-slate-900">{dimLabel}分类占比</h3>
          <span className="text-[12px] text-slate-500">（共{categoryStats.total}个有效{dimLabel}）</span>
        </div>
        <div className="space-y-2">
          {/* 爆品进度条 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-600" />
                <span className="text-[13px] text-slate-700">爆品</span>
                <span className="text-[12px] text-slate-500">{categoryStats.hot.count}个</span>
              </div>
              <span className="text-[13px] font-semibold text-amber-600">{categoryStats.hot.percent.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-500"
                style={{ width: `${categoryStats.hot.percent}%` }}
              />
            </div>
          </div>
          {/* 风险品进度条 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-600" />
                <span className="text-[13px] text-slate-700">风险品</span>
                <span className="text-[12px] text-slate-500">{categoryStats.risk.count}个</span>
              </div>
              <span className="text-[13px] font-semibold text-red-600">{categoryStats.risk.percent.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full transition-all duration-500"
                style={{ width: `${categoryStats.risk.percent}%` }}
              />
            </div>
          </div>
          {/* 衰退品进度条 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-amber-600" />
                <span className="text-[13px] text-slate-700">衰退品</span>
                <span className="text-[12px] text-slate-500">{categoryStats.declining.count}个</span>
              </div>
              <span className="text-[13px] font-semibold text-amber-600">{categoryStats.declining.percent.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-500"
                style={{ width: `${categoryStats.declining.percent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* SKU分类：爆品 / 风险品 / 衰退品 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        {/* 爆品 */}
        <div className="bg-white rounded-xl p-3 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <Flame className="w-4 h-4 text-amber-600" />
            <h3 className="text-[13px] font-semibold text-slate-900">爆品</h3>
            <span className="text-[12px] text-slate-500">
              （{hotProducts.length}个 · 销售额≥中位数且盈利）
            </span>
          </div>
          <div className="overflow-auto rounded-lg border border-slate-200 max-h-[320px]">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-200 bg-slate-100">
                  <th className="px-3 py-2 text-left text-[13px] font-medium text-slate-500">{dimLabel}名称</th>
                  <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">销售额</th>
                  <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">成本</th>
                  <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">利润率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hotProducts.length > 0 ? (
                  hotProducts.map((item) => (
                    <tr key={item.规格} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-1.5 text-[13px] text-slate-700 max-w-[160px] truncate" title={item.规格}>
                        {item.规格}
                      </td>
                      <td className="px-3 py-1.5 text-[13px] text-emerald-600 text-right font-mono">
                        {formatAmount(item.销售额)}
                      </td>
                      <td className="px-3 py-1.5 text-[13px] text-amber-600 text-right font-mono">
                        {formatAmount(item.总成本)}
                      </td>
                      <td className={`px-3 py-1.5 text-[13px] text-right font-mono font-semibold ${getProfitRateColor(item.利润率)}`}>
                        +{item.利润率.toFixed(2)}%
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400 text-[13px]">
                      暂无爆品
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 风险品 */}
        <div className="bg-white rounded-xl p-3 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="w-4 h-4 text-red-600" />
            <h3 className="text-[13px] font-semibold text-slate-900">风险品</h3>
            <span className="text-[12px] text-slate-500">
              （{riskProducts.length}个 · 非爆品，按销售额降序）
            </span>
          </div>
          <div className="overflow-auto rounded-lg border border-slate-200 max-h-[320px]">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-200 bg-slate-100">
                  <th className="px-3 py-2 text-left text-[13px] font-medium text-slate-500">{dimLabel}名称</th>
                  <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">销售额</th>
                  <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">成本</th>
                  <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">利润率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {riskProducts.length > 0 ? (
                  riskProducts.map((item) => (
                    <tr key={item.规格} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-1.5 text-[13px] text-slate-700 max-w-[160px] truncate" title={item.规格}>
                        {item.规格}
                      </td>
                      <td className="px-3 py-1.5 text-[13px] text-emerald-600 text-right font-mono">
                        {formatAmount(item.销售额)}
                      </td>
                      <td className="px-3 py-1.5 text-[13px] text-amber-600 text-right font-mono">
                        {formatAmount(item.总成本)}
                      </td>
                      <td className={`px-3 py-1.5 text-[13px] text-right font-mono font-semibold ${getProfitRateColor(item.利润率)}`}>
                        {item.利润率.toFixed(2)}%
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400 text-[13px]">
                      暂无风险品
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 衰退品 */}
        <div className="bg-white rounded-xl p-3 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-amber-600" />
            <h3 className="text-[13px] font-semibold text-slate-900">衰退品</h3>
            <span className="text-[12px] text-slate-500">
              （{decliningProducts.length}个 · 趋势显著下降：归一化斜率≤-2% 且 R²≥0.3）
            </span>
          </div>
          <div className="overflow-auto rounded-lg border border-slate-200 max-h-[320px]">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-200 bg-slate-100">
                  <th className="px-3 py-2 text-left text-[13px] font-medium text-slate-500">{dimLabel}名称</th>
                  <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">销售额</th>
                  <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">成本</th>
                  <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">利润率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {decliningProducts.length > 0 ? (
                  decliningProducts.map((item) => (
                    <tr key={item.规格} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-1.5 text-[13px] text-slate-700 max-w-[160px] truncate" title={item.规格}>
                        {item.规格}
                      </td>
                      <td className="px-3 py-1.5 text-[13px] text-emerald-600 text-right font-mono">
                        {formatAmount(item.销售额)}
                      </td>
                      <td className="px-3 py-1.5 text-[13px] text-amber-600 text-right font-mono">
                        {formatAmount(item.总成本)}
                      </td>
                      <td className={`px-3 py-1.5 text-[13px] text-right font-mono font-semibold ${getProfitRateColor(item.利润率)}`}>
                        +{item.利润率.toFixed(2)}%
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400 text-[13px]">
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
      <div className="bg-white rounded-xl p-3 border border-slate-200">
        <div className="flex items-center gap-3 mb-3">
          <LineChartIcon className="w-4 h-4 text-emerald-600" />
          <h3 className="text-[13px] font-semibold text-slate-900">{dimLabel}销量趋势</h3>
          <span className="text-[12px] text-slate-500">
            （按销售额降序，折线图为日销量趋势，共 {skuTrendData.length} 项）
          </span>
        </div>
        <div className="overflow-auto rounded-lg border border-slate-200 max-h-[420px]">
          <table className="w-full min-w-[900px]">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-200 bg-slate-100">
                <th className="px-3 py-2 text-left text-[13px] font-medium text-slate-500">
                  {dimLabel}名称
                </th>
                <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">
                  销售额
                </th>
                <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">
                  成本
                </th>
                <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">
                  销量
                </th>
                <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">
                  订单数
                </th>
                <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">
                  利润率
                </th>
                <th className="px-3 py-2 text-center text-[13px] font-medium text-slate-500">
                  销量趋势
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {skuTrendData.length > 0 ? (
                skuTrendData.map((item) => (
                  <tr
                    key={item.summary.规格}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-3 py-1.5 text-[13px] text-slate-700 max-w-[240px] truncate" title={item.summary.规格}>
                      {item.summary.规格}
                    </td>
                    <td className="px-3 py-1.5 text-[13px] text-emerald-600 text-right font-mono">
                      {formatAmount(item.summary.销售额)}
                    </td>
                    <td className="px-3 py-1.5 text-[13px] text-amber-600 text-right font-mono">
                      {formatAmount(item.summary.总成本)}
                    </td>
                    <td className="px-3 py-1.5 text-[13px] text-slate-700 text-right font-mono">
                      {formatNumber(item.summary.销量)}
                    </td>
                    <td className="px-3 py-1.5 text-[13px] text-slate-700 text-right font-mono">
                      {formatNumber(item.summary.订单数)}
                    </td>
                    <td className={`px-3 py-1.5 text-[13px] text-right font-mono font-semibold ${getProfitRateColor(item.summary.利润率)}`}>
                      {item.summary.利润率 >= 0 ? '+' : ''}
                      {item.summary.利润率.toFixed(2)}%
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex justify-center">
                        <MiniLineChart
                          data={item.trend}
                          width={120}
                          height={28}
                          color={item.summary.利润率 >= 0 ? '#10b981' : '#ef4444'}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 text-[13px]">
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 表2 & 表3: 并排显示 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {/* 表2: SKU销售TOP */}
        <div className="bg-white rounded-xl p-3 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-4 h-4 text-amber-600" />
            <h3 className="text-[13px] font-semibold text-slate-900">{dimLabel}销售TOP10</h3>
            <span className="text-[12px] text-slate-500">（按销售额排序）</span>
          </div>
          <div className="overflow-auto rounded-lg border border-slate-200 max-h-[360px]">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-200 bg-slate-100">
                  <th className="px-3 py-2 text-left text-[13px] font-medium text-slate-500">排名</th>
                  <th className="px-3 py-2 text-left text-[13px] font-medium text-slate-500">{dimLabel}</th>
                  <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">销售额</th>
                  <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">成本</th>
                  <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">销量</th>
                  <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">订单数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {salesTopData.length > 0 ? (
                  salesTopData.map((item, index) => (
                    <tr key={item.规格} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-1.5">
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[12px] font-bold ${
                          index === 0
                            ? 'bg-amber-100 text-amber-600'
                            : index === 1
                            ? 'bg-slate-200 text-slate-600'
                            : index === 2
                            ? 'bg-amber-100 text-amber-600'
                            : 'bg-slate-100 text-slate-400'
                        }`}>
                          {index + 1}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-[13px] text-slate-700 max-w-[180px] truncate" title={item.规格}>
                        {item.规格}
                      </td>
                      <td className="px-3 py-1.5 text-[13px] text-emerald-600 text-right font-mono">
                        {formatAmount(item.销售额)}
                      </td>
                      <td className="px-3 py-1.5 text-[13px] text-amber-600 text-right font-mono">
                        {formatAmount(item.总成本)}
                      </td>
                      <td className="px-3 py-1.5 text-[13px] text-slate-700 text-right font-mono">
                        {formatNumber(item.销量)}
                      </td>
                      <td className="px-3 py-1.5 text-[13px] text-slate-700 text-right font-mono">
                        {formatNumber(item.订单数)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400 text-[13px]">
                      暂无数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 表3: SKU利润TOP */}
        <div className="bg-white rounded-xl p-3 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <h3 className="text-[13px] font-semibold text-slate-900">{dimLabel}利润TOP10</h3>
            <span className="text-[12px] text-slate-500">（按净利润排序）</span>
          </div>
          <div className="overflow-auto rounded-lg border border-slate-200 max-h-[360px]">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-200 bg-slate-100">
                  <th className="px-3 py-2 text-left text-[13px] font-medium text-slate-500">排名</th>
                  <th className="px-3 py-2 text-left text-[13px] font-medium text-slate-500">{dimLabel}</th>
                  <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">销售额</th>
                  <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">成本</th>
                  <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">净利润</th>
                  <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">利润率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {profitTopData.length > 0 ? (
                  profitTopData.map((item, index) => (
                    <tr key={item.规格} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-1.5">
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[12px] font-bold ${
                          index === 0
                            ? 'bg-amber-100 text-amber-600'
                            : index === 1
                            ? 'bg-slate-200 text-slate-600'
                            : index === 2
                            ? 'bg-amber-100 text-amber-600'
                            : 'bg-slate-100 text-slate-400'
                        }`}>
                          {index + 1}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-[13px] text-slate-700 max-w-[180px] truncate" title={item.规格}>
                        {item.规格}
                      </td>
                      <td className="px-3 py-1.5 text-[13px] text-emerald-600 text-right font-mono">
                        {formatAmount(item.销售额)}
                      </td>
                      <td className="px-3 py-1.5 text-[13px] text-amber-600 text-right font-mono">
                        {formatAmount(item.总成本)}
                      </td>
                      <td className={`px-3 py-1.5 text-[13px] text-right font-mono font-semibold ${getProfitRateColor(item.净利润)}`}>
                        {item.净利润 >= 0 ? '+' : ''}
                        {formatAmount(item.净利润)}
                      </td>
                      <td className={`px-3 py-1.5 text-[13px] text-right font-mono ${getProfitRateColor(item.利润率)}`}>
                        {item.利润率 >= 0 ? '+' : ''}
                        {item.利润率.toFixed(2)}%
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400 text-[13px]">
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
      <div className="bg-white rounded-xl p-3 border border-slate-200">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <h3 className="text-[13px] font-semibold text-slate-900">低利润{dimLabel}关注</h3>
          <span className="text-[12px] text-slate-500">（按利润率升序，前10）</span>
        </div>
        <div className="overflow-auto rounded-lg border border-slate-200 max-h-[320px]">
          <table className="w-full min-w-[800px]">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-200 bg-slate-100">
                <th className="px-3 py-2 text-left text-[13px] font-medium text-slate-500">{dimLabel}</th>
                <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">销售额</th>
                <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">销量</th>
                <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">成本</th>
                <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">利润率</th>
                <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">净利润</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lowProfitData.length > 0 ? (
                lowProfitData.map((item) => (
                  <tr key={item.规格} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-1.5 text-[13px] text-slate-700 max-w-[240px] truncate" title={item.规格}>
                      {item.规格}
                    </td>
                    <td className="px-3 py-1.5 text-[13px] text-emerald-600 text-right font-mono">
                      {formatAmount(item.销售额)}
                    </td>
                    <td className="px-3 py-1.5 text-[13px] text-slate-700 text-right font-mono">
                      {formatNumber(item.销量)}
                    </td>
                    <td className="px-3 py-1.5 text-[13px] text-amber-600 text-right font-mono">
                      {formatAmount(item.总成本)}
                    </td>
                    <td className={`px-3 py-1.5 text-[13px] text-right font-mono font-semibold ${getProfitRateColor(item.利润率)}`}>
                      {item.利润率 >= 0 ? '+' : ''}
                      {item.利润率.toFixed(2)}%
                    </td>
                    <td className={`px-3 py-1.5 text-[13px] text-right font-mono ${getProfitRateColor(item.净利润)}`}>
                      {item.净利润 >= 0 ? '+' : ''}
                      {formatAmount(item.净利润)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400 text-[13px]">
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 表5: SKU涨价模拟 */}
      <div className="bg-white rounded-xl p-3 border border-slate-200">
        <div className="flex items-center gap-2 mb-2">
          <FlaskConical className="w-4 h-4 text-emerald-600" />
          <h3 className="text-[13px] font-semibold text-slate-900">{dimLabel}涨价模拟</h3>
          <span className="text-[12px] text-slate-500">
            （含价格弹性，中性弹性-0.5；按销售额降序，前15）
          </span>
        </div>
        <div className="overflow-auto rounded-lg border border-slate-200 max-h-[380px]">
          <table className="w-full min-w-[1280px]">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-200 bg-slate-100">
                <th className="px-3 py-2 text-left text-[13px] font-medium text-slate-500">{dimLabel}</th>
                <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">销售额</th>
                <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">成本</th>
                <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">当前利润</th>
                <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">涨1%后利润</th>
                <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">涨3%后利润</th>
                <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500">涨5%后利润</th>
                <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500" title="弹性-0.2，涨价对销量影响小">涨5%·乐观</th>
                <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-500" title="弹性-1.0，销量降幅≈涨幅">涨5%·保守</th>
                <th className="px-3 py-2 text-center text-[13px] font-medium text-slate-500">建议</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {priceSimulationData.length > 0 ? (
                priceSimulationData.map((item) => {
                  const suggestion = getPriceSuggestion(
                    item.summary.利润率,
                    item.summary.净利润
                  );
                  return (
                    <tr key={item.summary.规格} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-1.5 text-[13px] text-slate-700 max-w-[200px] truncate" title={item.summary.规格}>
                        {item.summary.规格}
                      </td>
                      <td className="px-3 py-1.5 text-[13px] text-emerald-600 text-right font-mono">
                        {formatAmount(item.summary.销售额)}
                      </td>
                      <td className="px-3 py-1.5 text-[13px] text-amber-600 text-right font-mono">
                        {formatAmount(item.summary.总成本)}
                      </td>
                      <td className={`px-3 py-1.5 text-[13px] text-right font-mono font-semibold ${getProfitRateColor(item.summary.净利润)}`}>
                        {item.summary.净利润 >= 0 ? '+' : ''}
                        {formatAmount(item.summary.净利润)}
                      </td>
                      <td className={`px-3 py-1.5 text-[13px] text-right font-mono ${getProfitRateColor(item.profit1)}`}>
                        {item.profit1 >= 0 ? '+' : ''}
                        {formatAmount(item.profit1)}
                      </td>
                      <td className={`px-3 py-1.5 text-[13px] text-right font-mono ${getProfitRateColor(item.profit3)}`}>
                        {item.profit3 >= 0 ? '+' : ''}
                        {formatAmount(item.profit3)}
                      </td>
                      <td className={`px-3 py-1.5 text-[13px] text-right font-mono ${getProfitRateColor(item.profit5)}`}>
                        {item.profit5 >= 0 ? '+' : ''}
                        {formatAmount(item.profit5)}
                      </td>
                      <td className={`px-3 py-1.5 text-[13px] text-right font-mono ${getProfitRateColor(item.profit5Optimistic)}`}>
                        {item.profit5Optimistic >= 0 ? '+' : ''}
                        {formatAmount(item.profit5Optimistic)}
                      </td>
                      <td className={`px-3 py-1.5 text-[13px] text-right font-mono ${getProfitRateColor(item.profit5Conservative)}`}>
                        {item.profit5Conservative >= 0 ? '+' : ''}
                        {formatAmount(item.profit5Conservative)}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[12px] font-medium border ${suggestion.color}`}>
                          {suggestion.text}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="py-6 text-center text-slate-400 text-[13px]">
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-2 pt-2 border-t border-slate-200 text-[12px] text-slate-400 leading-relaxed">
          <p className="mb-1">
            <span className="text-slate-500 font-medium">计算说明：</span>
            引入价格弹性：涨价 X% 后单价 ×(1+X%)、销量 ×(1+X%×E)，E 为价格弹性。
            随销量变化的成本（商品成本、商家优惠、快递费、包装耗材、运费险、营销花费、退款损失）按销量因子同步缩放，
            平台技术服务费(0.6%)按新销售额计取。
          </p>
          <p className="mb-1">
            <span className="text-slate-500 font-medium">弹性档位：</span>
            表格前三档为<b>中性弹性 -0.5</b>（涨 5% 销量约降 2.5%）；
            「涨5%·乐观」取弹性 -0.2（刚需，销量影响小）、「涨5%·保守」取弹性 -1.0（销量降幅≈涨幅）。
            真实弹性因品而异，建议以三档区间评估涨价风险，避免只看「销量不变」的理论上限。
          </p>
          <p>
            <span className="text-slate-500 font-medium">建议逻辑：</span>
            亏损{dimLabel} → 先止亏：核成本或涨价；利润率&lt;5% → 优先测涨价/降快递成本；利润率5-15% → 可测试涨价3%；利润率≥15% → 利润健康，保持当前定价。
          </p>
        </div>
      </div>
    </div>
  );
};

export default OrderOverview;
