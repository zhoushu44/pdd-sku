import React, { useMemo, useState } from 'react';
import { Megaphone, DollarSign, Target, TrendingUp, Eye, MousePointerClick, Calendar, Search, X, Wallet, ArrowUpRight, ArrowDownRight, Ban, Minus } from 'lucide-react';
import { MarketingDataRow, TimeRange, ProductSummary, BudgetSuggestion } from '../types';
import { filterMarketingByTimeRange, generateBudgetSuggestions } from '../utils/dataProcessor';
import { formatAmount, formatNumber } from '../lib/utils';

interface MarketingAnalysisProps {
  marketingData: MarketingDataRow[];
  summaries?: ProductSummary[];
}

interface MarketingGroupStat {
  id: string;
  name: string;
  group: string;
  transaction: number;
  cost: number;
  netTransaction: number;
  orders: number;
  impressions: number;
  clicks: number;
}

const MarketingAnalysis: React.FC<MarketingAnalysisProps> = ({ marketingData, summaries = [] }) => {
  // 本地筛选状态：时间范围 + 商品ID
  const [localTimeRange, setLocalTimeRange] = useState<TimeRange>('all');
  const [localProductId, setLocalProductId] = useState('');
  const [productIdInput, setProductIdInput] = useState('');

  const timeRangeOptions: { value: TimeRange; label: string }[] = [
    { value: 'today', label: '今日' },
    { value: '7d', label: '最近7天' },
    { value: '15d', label: '最近15天' },
    { value: '30d', label: '最近30天' },
    { value: 'all', label: '全部' },
  ];

  // 关键字（去空格）
  const productIdKeyword = localProductId.trim();

  // 先按时间筛选，再按商品ID筛选
  const filteredData = useMemo(() => {
    const timeFiltered = filterMarketingByTimeRange(marketingData, localTimeRange);
    if (!productIdKeyword) return timeFiltered;
    return timeFiltered.filter(row => row.商品ID.includes(productIdKeyword));
  }, [marketingData, localTimeRange, productIdKeyword]);

  // 倒序展示（最新日期在前），用 useMemo 避免每次 render 重复 reverse
  const reversedData = useMemo(() => {
    const arr = filteredData.slice();
    arr.reverse();
    return arr;
  }, [filteredData]);

  const handleProductSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalProductId(productIdInput);
  };

  const handleClearProductSearch = () => {
    setProductIdInput('');
    setLocalProductId('');
  };

  // 计算汇总指标（基于本地筛选后的数据）
  const summary = useMemo(() => {
    const totalMarketingCost = filteredData.reduce((sum, item) => sum + item.总营销花费, 0);
    const totalTransactionAmount = filteredData.reduce((sum, item) => sum + item.交易额, 0);
    const totalNetTransaction = filteredData.reduce((sum, item) => sum + item.净交易额, 0);
    const totalNetOrders = filteredData.reduce((sum, item) => sum + item.净成交笔数, 0);
    const totalOrders = filteredData.reduce((sum, item) => sum + item.成交笔数, 0);
    const totalImpressions = filteredData.reduce((sum, item) => sum + item.曝光量, 0);
    const totalClicks = filteredData.reduce((sum, item) => sum + item.点击量, 0);

    // 实际投产比
    const actualROI = totalMarketingCost > 0 ? totalTransactionAmount / totalMarketingCost : 0;

    // 点击率（整体均值：总点击 ÷ 总曝光）
    const clickRate = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

    // 成交转化率（整体均值：总成交笔数 ÷ 总点击）
    const conversionRate = totalClicks > 0 ? (totalOrders / totalClicks) * 100 : 0;

    return {
      totalMarketingCost,
      totalTransactionAmount,
      totalNetTransaction,
      totalNetOrders,
      totalImpressions,
      totalClicks,
      actualROI,
      clickRate,
      conversionRate
    };
  }, [filteredData]);

  // 格式化金额（使用全局 formatAmount）
  // 注：原 formatMoney 与 formatAmount 完全一致，统一使用 formatAmount

  // 营销漏斗：曝光 → 点击 → 询单/收藏 → 成交
  const funnel = useMemo(() => {
    const impressions = filteredData.reduce((sum, item) => sum + item.曝光量, 0);
    const clicks = filteredData.reduce((sum, item) => sum + item.点击量, 0);
    const inquiries = filteredData.reduce((sum, item) => sum + item.询单量, 0);
    const favorites = filteredData.reduce((sum, item) => sum + item.收藏量, 0);
    const orders = filteredData.reduce((sum, item) => sum + item.成交笔数, 0);
    if (impressions <= 0) return null;

    // 兴趣层 = 询单 + 收藏（取并集近似为意向行为，避免重复计数的保守处理）
    const interest = inquiries + favorites;
    const stages = [
      { key: 'impression', label: '曝光', value: impressions, color: 'from-slate-400 to-slate-500' },
      { key: 'click', label: '点击', value: clicks, color: 'from-cyan-500 to-sky-500' },
      { key: 'interest', label: '询单/收藏', value: interest, color: 'from-indigo-500 to-violet-500' },
      { key: 'order', label: '成交', value: orders, color: 'from-emerald-500 to-teal-500' },
    ];
    const rates = {
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0, // 点击率
      interestRate: clicks > 0 ? (interest / clicks) * 100 : 0, // 点击→意向
      conversionRate: interest > 0 ? (orders / interest) * 100 : 0, // 意向→成交
      overallRate: impressions > 0 ? (orders / impressions) * 100 : 0, // 全链路
    };
    return { stages, rates, impressions, clicks, interest, orders };
  }, [filteredData]);

  // 推广预算优化建议
  const budgetSuggestions = useMemo<BudgetSuggestion[]>(() => {
    return generateBudgetSuggestions(filteredData, summaries);
  }, [filteredData, summaries]);

  // 预算建议汇总
  const budgetSummary = useMemo(() => {
    const increase = budgetSuggestions.filter(s => s.建议 === 'increase').length;
    const decrease = budgetSuggestions.filter(s => s.建议 === 'decrease').length;
    const stop = budgetSuggestions.filter(s => s.建议 === 'stop').length;
    const maintain = budgetSuggestions.filter(s => s.建议 === 'maintain').length;
    const totalImpact = budgetSuggestions.reduce((sum, s) => sum + s.预计影响利润, 0);
    return { increase, decrease, stop, maintain, totalImpact };
  }, [budgetSuggestions]);

  // 预算建议配置
  const budgetConfig: Record<BudgetSuggestion['建议'], {
    label: string;
    color: string;
    bgColor: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = {
    increase: { label: '加预算', color: 'text-emerald-600', bgColor: 'bg-emerald-50 border-emerald-200', icon: ArrowUpRight },
    decrease: { label: '减预算', color: 'text-orange-600', bgColor: 'bg-orange-50 border-orange-200', icon: ArrowDownRight },
    stop: { label: '暂停', color: 'text-red-600', bgColor: 'bg-red-50 border-red-200', icon: Ban },
    maintain: { label: '维持', color: 'text-slate-500', bgColor: 'bg-slate-100 border-slate-200', icon: Minus },
  };

  if (marketingData.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12">
        <div className="text-center">
          <Megaphone className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <h3 className="text-base font-semibold text-slate-900 mb-2">暂无推广数据</h3>
          <p className="text-slate-500 mb-6">
            请上传推广数据文件（支持 Excel/CSV/TXT 格式）
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600/20 text-emerald-600 rounded-lg text-[13px]">
            <span>点击顶部</span>
            <strong>"推广数据"</strong>
            <span>按钮上传</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/25">
          <Megaphone className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">营销数据分析</h2>
          <p className="text-[13px] text-slate-500">
            共 {marketingData.length} 条推广记录，当前筛选后 {filteredData.length} 条
          </p>
        </div>
      </div>

      {/* 本地筛选工具栏：时间筛选 + 商品ID筛选 */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
        {/* 商品ID筛选 */}
        <form onSubmit={handleProductSearchSubmit} className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={productIdInput}
              onChange={(e) => setProductIdInput(e.target.value)}
              placeholder="按商品ID筛选"
              className="pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-md text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 w-56"
            />
            {productIdInput && (
              <button
                type="button"
                onClick={handleClearProductSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900"
                title="清除"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[13px] transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
            筛选
          </button>
          {localProductId && (
            <div className="flex items-center gap-2 ml-2 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-md">
              <span className="text-[13px] text-emerald-600">商品ID:</span>
              <span className="text-[13px] text-slate-900 font-mono">{localProductId}</span>
              <button
                type="button"
                onClick={handleClearProductSearch}
                className="text-emerald-600 hover:text-slate-900"
                title="取消筛选"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </form>

        {/* 时间筛选 */}
        <div className="flex items-center gap-2 bg-slate-100 rounded-md p-1 border border-slate-200">
          <Calendar className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
          <div className="flex gap-0.5">
            {timeRangeOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setLocalTimeRange(opt.value)}
                className={`px-3 py-1.5 rounded text-[13px] transition-colors ${
                  localTimeRange === opt.value
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 关键指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 总营销花费 */}
        <div className="bg-gradient-to-br from-red-500/10 to-orange-500/10 rounded-xl p-5 border border-red-500/20">
          <div className="flex items-center justify-between mb-3">
            <DollarSign className="w-8 h-8 text-red-600" />
            <span className="text-[13px] text-red-600 bg-red-100 px-2 py-1 rounded">花费</span>
          </div>
          <div className="text-base font-bold text-slate-900 mb-1">
            {formatAmount(summary.totalMarketingCost)}
          </div>
          <div className="text-[13px] text-slate-500">总营销花费</div>
        </div>

        {/* 总交易额 */}
        <div className="bg-gradient-to-br from-emerald-400/10 to-emerald-500/10 rounded-xl p-5 border border-emerald-500/20">
          <div className="flex items-center justify-between mb-3">
            <TrendingUp className="w-8 h-8 text-emerald-600" />
            <span className="text-[13px] text-emerald-600 bg-emerald-100 px-2 py-1 rounded">收入</span>
          </div>
          <div className="text-base font-bold text-slate-900 mb-1">
            {formatAmount(summary.totalTransactionAmount)}
          </div>
          <div className="text-[13px] text-slate-500">总交易额</div>
        </div>

        {/* 实际投产比 */}
        <div className="bg-gradient-to-br from-amber-400/10 to-amber-500/10 rounded-xl p-5 border border-amber-500/20">
          <div className="flex items-center justify-between mb-3">
            <Target className="w-8 h-8 text-amber-600" />
            <span className="text-[13px] text-amber-600 bg-amber-500/20 px-2 py-1 rounded">ROI</span>
          </div>
          <div className="text-base font-bold text-slate-900 mb-1">
            {summary.actualROI.toFixed(2)}
          </div>
          <div className="text-[13px] text-slate-500">实际投产比</div>
        </div>

        {/* 净成交笔数 */}
        <div className="bg-gradient-to-br from-cyan-500/10 to-teal-500/10 rounded-xl p-5 border border-cyan-500/20">
          <div className="flex items-center justify-between mb-3">
            <Megaphone className="w-8 h-8 text-cyan-600" />
            <span className="text-[13px] text-cyan-600 bg-cyan-500/20 px-2 py-1 rounded">订单</span>
          </div>
          <div className="text-base font-bold text-slate-900 mb-1">
            {formatNumber(summary.totalNetOrders)}
          </div>
          <div className="text-[13px] text-slate-500">净成交笔数</div>
        </div>

        {/* 点击率（整体均值） */}
        <div className="bg-gradient-to-br from-indigo-500/10 to-violet-500/10 rounded-xl p-5 border border-indigo-500/20">
          <div className="flex items-center justify-between mb-3">
            <MousePointerClick className="w-8 h-8 text-indigo-600" />
            <span className="text-[13px] text-indigo-600 bg-indigo-500/20 px-2 py-1 rounded">CTR</span>
          </div>
          <div className="text-base font-bold text-slate-900 mb-1">
            {summary.clickRate.toFixed(2)}%
          </div>
          <div className="text-[13px] text-slate-500">点击率（总点击÷总曝光）</div>
        </div>

        {/* 成交转化率（整体均值） */}
        <div className="bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 rounded-xl p-5 border border-violet-500/20">
          <div className="flex items-center justify-between mb-3">
            <Target className="w-8 h-8 text-violet-600" />
            <span className="text-[13px] text-violet-600 bg-violet-500/20 px-2 py-1 rounded">CVR</span>
          </div>
          <div className="text-base font-bold text-slate-900 mb-1">
            {summary.conversionRate.toFixed(2)}%
          </div>
          <div className="text-[13px] text-slate-500">转化率（总成交÷总点击）</div>
        </div>
      </div>

      {/* 额外指标 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="w-4 h-4 text-cyan-600" />
            <span className="text-[13px] text-slate-500">总曝光量</span>
          </div>
          <div className="text-base font-semibold text-slate-900">{formatNumber(summary.totalImpressions)}</div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <MousePointerClick className="w-4 h-4 text-emerald-600" />
            <span className="text-[13px] text-slate-500">总点击量</span>
          </div>
          <div className="text-base font-semibold text-slate-900">{formatNumber(summary.totalClicks)}</div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-indigo-600" />
            <span className="text-[13px] text-slate-500">全链路转化率（曝光→成交）</span>
          </div>
          <div className="text-base font-semibold text-slate-900">
            {summary.totalImpressions > 0 ? ((summary.totalNetOrders / summary.totalImpressions) * 100).toFixed(2) : '0.00'}%
          </div>
        </div>
      </div>

      {/* 营销漏斗转化 */}
      {funnel && (
        <div className="bg-white rounded-xl p-6 border border-slate-200">
          <div className="flex items-center gap-3 mb-6">
            <Target className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-semibold text-slate-900">营销漏斗转化</h3>
            <span className="text-[13px] text-slate-500">（曝光 → 点击 → 询单/收藏 → 成交）</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 漏斗层级 */}
            <div className="space-y-3">
              {funnel.stages.map((stage, i) => {
                const maxValue = funnel.impressions;
                const widthPct = maxValue > 0 ? Math.max((stage.value / maxValue) * 100, 2) : 2;
                return (
                  <div key={stage.key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[13px] text-slate-600">{stage.label}</span>
                      <span className="text-[13px] font-mono text-slate-700">{formatNumber(stage.value)}</span>
                    </div>
                    <div className="h-7 bg-slate-100 rounded-md overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r ${stage.color} rounded-md transition-all duration-500 flex items-center justify-end pr-2`}
                        style={{ width: `${widthPct}%` }}
                      >
                        {widthPct > 18 && (
                          <span className="text-[13px] text-white font-mono">
                            {((stage.value / maxValue) * 100).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                    {i < funnel.stages.length - 1 && (
                      <div className="flex items-center gap-1 mt-1 pl-1">
                        <ArrowDownRight className="w-3 h-3 text-slate-400" />
                        <span className="text-[13px] text-slate-400">
                          下一步转化率
                          <span className="ml-1 font-mono text-slate-500">
                            {i === 0 && funnel.rates.ctr.toFixed(2) + '%'}
                            {i === 1 && funnel.rates.interestRate.toFixed(2) + '%'}
                            {i === 2 && funnel.rates.conversionRate.toFixed(2) + '%'}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 关键转化率 */}
            <div className="grid grid-cols-2 gap-3 content-start">
              {([
                { label: '点击率 CTR', value: funnel.rates.ctr, hint: '曝光 → 点击', color: 'text-cyan-600' },
                { label: '意向率', value: funnel.rates.interestRate, hint: '点击 → 询单/收藏', color: 'text-indigo-600' },
                { label: '成交转化率', value: funnel.rates.conversionRate, hint: '询单/收藏 → 成交', color: 'text-emerald-600' },
                { label: '全链路转化率', value: funnel.rates.overallRate, hint: '曝光 → 成交', color: 'text-slate-700' },
              ]).map(item => (
                <div key={item.label} className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                  <p className="text-[13px] text-slate-500 mb-1">{item.label}</p>
                  <p className={`text-base font-bold font-mono ${item.color}`}>{item.value.toFixed(2)}%</p>
                  <p className="text-[13px] text-slate-400 mt-1">{item.hint}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-200 text-[13px] text-slate-400 leading-relaxed">
            <p>
              <span className="text-slate-500 font-medium">口径说明：</span>
              漏斗按曝光量→点击量→（询单量+收藏量）→成交笔数逐层计算。
              逐层转化率可定位流失最严重的环节：点击率低说明素材/人群不精准，意向率低说明详情页说服力不足，
              成交转化率低说明价格/评价/服务存在顾虑。
            </p>
          </div>
        </div>
      )}

      {/* 每日营销数据表格 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">每日推广明细</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-slate-500">日期</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-slate-500">商品ID</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-slate-500">商品名称</th>
                <th className="px-4 py-3 text-right text-[13px] font-medium text-slate-500">交易额</th>
                <th className="px-4 py-3 text-right text-[13px] font-medium text-slate-500">营销花费</th>
                <th className="px-4 py-3 text-right text-[13px] font-medium text-slate-500">净交易额</th>
                <th className="px-4 py-3 text-right text-[13px] font-medium text-slate-500">成交笔数</th>
                <th className="px-4 py-3 text-right text-[13px] font-medium text-slate-500">曝光量</th>
                <th className="px-4 py-3 text-right text-[13px] font-medium text-slate-500">点击量</th>
                <th className="px-4 py-3 text-right text-[13px] font-medium text-slate-500">点击率</th>
                <th className="px-4 py-3 text-right text-[13px] font-medium text-slate-500">投产比</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reversedData.map((row, index) => {
                  const clickRateValue = row.曝光量 > 0 ? (row.点击量 / row.曝光量) * 100 : 0;
                  const roiValue = row.总营销花费 > 0 ? row.交易额 / row.总营销花费 : 0;

                  return (
                    <tr key={`${row.日期}-${row.商品ID}-${index}`} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-[13px] text-slate-900 whitespace-nowrap">{row.日期}</td>
                      <td className="px-4 py-3 text-[13px] text-emerald-600 whitespace-nowrap font-mono">{row.商品ID || '-'}</td>
                      <td className="px-4 py-3 text-[13px] text-slate-600 max-w-[200px] truncate" title={row.商品名称}>{row.商品名称 || '-'}</td>
                      <td className="px-4 py-3 text-[13px] text-emerald-600 text-right font-mono">{formatAmount(row.交易额)}</td>
                      <td className="px-4 py-3 text-[13px] text-red-600 text-right font-mono">{formatAmount(row.总营销花费)}</td>
                      <td className="px-4 py-3 text-[13px] text-cyan-600 text-right font-mono">{formatAmount(row.净交易额)}</td>
                      <td className="px-4 py-3 text-[13px] text-slate-900 text-right">{row.成交笔数}</td>
                      <td className="px-4 py-3 text-[13px] text-slate-600 text-right">{formatNumber(row.曝光量)}</td>
                      <td className="px-4 py-3 text-[13px] text-slate-600 text-right">{formatNumber(row.点击量)}</td>
                      <td className="px-4 py-3 text-[13px] text-amber-600 text-right font-mono">{clickRateValue.toFixed(2)}%</td>
                      <td className={`px-4 py-3 text-[13px] text-right font-mono ${roiValue >= 4 ? 'text-emerald-600' : roiValue >= 2 ? 'text-amber-600' : 'text-red-600'}`}>
                        {roiValue.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 商品维度汇总（按商品ID分组） */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">商品维度汇总（按商品ID）</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-slate-500">商品ID</th>
                <th className="px-4 py-3 text-left text-[13px] font-medium text-slate-500">商品名称</th>
                <th className="px-4 py-3 text-right text-[13px] font-medium text-slate-500">分组</th>
                <th className="px-4 py-3 text-right text-[13px] font-medium text-slate-500">交易额</th>
                <th className="px-4 py-3 text-right text-[13px] font-medium text-slate-500">营销花费</th>
                <th className="px-4 py-3 text-right text-[13px] font-medium text-slate-500">净交易额</th>
                <th className="px-4 py-3 text-right text-[13px] font-medium text-slate-500">成交笔数</th>
                <th className="px-4 py-3 text-right text-[13px] font-medium text-slate-500">点击率</th>
                <th className="px-4 py-3 text-right text-[13px] font-medium text-slate-500">转化率</th>
                <th className="px-4 py-3 text-right text-[13px] font-medium text-slate-500">投产比</th>
                <th className="px-4 py-3 text-center text-[13px] font-medium text-slate-500">诊断</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.entries(
                filteredData.reduce((acc, row) => {
                  // 按商品ID分组（不同ID分别统计）
                  const key = row.商品ID || '未指定ID';
                  if (!acc[key]) {
                    acc[key] = {
                      id: key,
                      name: row.商品名称,
                      group: row.分组,
                      transaction: 0,
                      cost: 0,
                      netTransaction: 0,
                      orders: 0,
                      impressions: 0,
                      clicks: 0
                    };
                  }
                  acc[key].transaction += row.交易额;
                  acc[key].cost += row.总营销花费;
                  acc[key].netTransaction += row.净交易额;
                  acc[key].orders += row.成交笔数;
                  acc[key].impressions += row.曝光量;
                  acc[key].clicks += row.点击量;
                  return acc;
                }, {} as Record<string, MarketingGroupStat>)
              ).map(([key, data]) => {
                const roi = data.cost > 0 ? data.transaction / data.cost : 0;
                // CTR/CVR：点击率=点击÷曝光；转化率=成交÷点击（点击→成交）
                const ctr = data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0;
                const cvr = data.clicks > 0 ? (data.orders / data.clicks) * 100 : 0;
                // 诊断：与整体均值对比（±20% 内视为达标）
                const ctrVsAvg = summary.clickRate > 0 ? (ctr / summary.clickRate - 1) * 100 : 0;
                const cvrVsAvg = summary.conversionRate > 0 ? (cvr / summary.conversionRate - 1) * 100 : 0;
                let diagnosis = '';
                let diagClass = '';
                if (ctrVsAvg < -20 && cvrVsAvg < -20) {
                  diagnosis = '素材与承接页都弱'; diagClass = 'bg-red-100 text-red-600';
                } else if (ctrVsAvg < -20) {
                  diagnosis = '点击率低·换素材/主图'; diagClass = 'bg-orange-100 text-orange-600';
                } else if (cvrVsAvg < -20) {
                  diagnosis = '转化率低·优化详情/价格'; diagClass = 'bg-amber-100 text-amber-600';
                } else if (ctrVsAvg > 20 && cvrVsAvg > 20) {
                  diagnosis = '双优·可放量'; diagClass = 'bg-emerald-100 text-emerald-600';
                } else {
                  diagnosis = '达标'; diagClass = 'bg-slate-100 text-slate-600';
                }

                return (
                  <tr key={key} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-[13px] text-emerald-600 font-mono whitespace-nowrap">{data.id}</td>
                    <td className="px-4 py-3 text-[13px] text-slate-900 max-w-[300px] truncate" title={data.name}>
                      {data.name || '-'}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-slate-600 text-right">{data.group || '-'}</td>
                    <td className="px-4 py-3 text-[13px] text-emerald-600 text-right font-mono">{formatAmount(data.transaction)}</td>
                    <td className="px-4 py-3 text-[13px] text-red-600 text-right font-mono">{formatAmount(data.cost)}</td>
                    <td className="px-4 py-3 text-[13px] text-cyan-600 text-right font-mono">{formatAmount(data.netTransaction)}</td>
                    <td className="px-4 py-3 text-[13px] text-slate-900 text-right">{data.orders}</td>
                    <td className={`px-4 py-3 text-[13px] text-right font-mono ${ctr < summary.clickRate * 0.8 ? 'text-orange-600' : 'text-slate-600'}`}>
                      {ctr.toFixed(2)}%
                    </td>
                    <td className={`px-4 py-3 text-[13px] text-right font-mono ${cvr < summary.conversionRate * 0.8 ? 'text-amber-600' : 'text-slate-600'}`}>
                      {cvr.toFixed(2)}%
                    </td>
                    <td className={`px-4 py-3 text-[13px] text-right font-mono ${roi >= 4 ? 'text-emerald-600' : roi >= 2 ? 'text-amber-600' : 'text-red-600'}`}>
                      {roi.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[13px] font-medium ${diagClass}`} title={`点击率较均值 ${ctrVsAvg >= 0 ? '+' : ''}${ctrVsAvg.toFixed(1)}%，转化率较均值 ${cvrVsAvg >= 0 ? '+' : ''}${cvrVsAvg.toFixed(1)}%`}>
                        {diagnosis}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 推广预算优化建议 */}
      {budgetSuggestions.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <Wallet className="w-5 h-5 text-amber-600" />
              <h3 className="text-base font-semibold text-slate-900">推广预算优化建议</h3>
              <span className="text-[13px] text-slate-500">（基于净ROI与利润率）</span>
            </div>
            {/* 建议汇总 */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <div className="bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
                <div className="text-[13px] text-emerald-600">建议加预算</div>
                <div className="text-base font-bold text-emerald-600">{budgetSummary.increase}</div>
              </div>
              <div className="bg-slate-100 border border-slate-200 rounded px-3 py-2">
                <div className="text-[13px] text-slate-500">建议维持</div>
                <div className="text-base font-bold text-slate-600">{budgetSummary.maintain}</div>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded px-3 py-2">
                <div className="text-[13px] text-orange-600">建议减预算</div>
                <div className="text-base font-bold text-orange-600">{budgetSummary.decrease}</div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded px-3 py-2">
                <div className="text-[13px] text-red-600">建议暂停</div>
                <div className="text-base font-bold text-red-600">{budgetSummary.stop}</div>
              </div>
              <div className={`border rounded px-3 py-2 ${budgetSummary.totalImpact >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                <div className={`text-[13px] ${budgetSummary.totalImpact >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>预计利润影响</div>
                <div className={`text-base font-bold ${budgetSummary.totalImpact >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {budgetSummary.totalImpact >= 0 ? '+' : ''}{formatAmount(budgetSummary.totalImpact)}
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-slate-100 sticky top-0 z-10">
                <tr className="text-[13px]">
                  <th className="px-3 py-2.5 text-left font-medium text-slate-500">商品ID</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-500">商品名称</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-500">当前花费</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-500">净交易额</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-500">净ROI</th>
                  <th className="px-3 py-2.5 text-center font-medium text-slate-500">建议</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-500">调整比例</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-500">预计利润影响</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-500">说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {budgetSuggestions.map(s => {
                  const config = budgetConfig[s.建议];
                  const Icon = config.icon;
                  return (
                    <tr key={s.商品ID} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2.5 text-[13px] text-emerald-600 font-mono whitespace-nowrap">{s.商品ID}</td>
                      <td className="px-3 py-2.5 text-[13px] text-slate-700 max-w-[200px] truncate" title={s.商品名称}>
                        {s.商品名称 || '-'}
                      </td>
                      <td className="px-3 py-2.5 text-[13px] text-red-600 text-right font-mono">{formatAmount(s.当前花费)}</td>
                      <td className="px-3 py-2.5 text-[13px] text-cyan-600 text-right font-mono">{formatAmount(s.净交易额)}</td>
                      <td className={`px-3 py-2.5 text-[13px] text-right font-mono font-bold ${s.净ROI >= 2 ? 'text-emerald-600' : s.净ROI >= 1 ? 'text-amber-600' : 'text-red-600'}`}>
                        {s.净ROI.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[13px] ${config.bgColor} border ${config.color}`}>
                          <Icon className="w-3 h-3" />
                          {config.label}
                        </span>
                      </td>
                      <td className={`px-3 py-2.5 text-[13px] text-right font-mono ${s.预计调整比例 > 0 ? 'text-emerald-600' : s.预计调整比例 < 0 ? 'text-red-600' : 'text-slate-500'}`}>
                        {s.预计调整比例 > 0 ? '+' : ''}{s.预计调整比例}%
                      </td>
                      <td className={`px-3 py-2.5 text-[13px] text-right font-mono ${s.预计影响利润 > 0 ? 'text-emerald-600' : s.预计影响利润 < 0 ? 'text-red-600' : 'text-slate-500'}`}>
                        {s.预计影响利润 > 0 ? '+' : ''}{formatAmount(s.预计影响利润)}
                      </td>
                      <td className="px-3 py-2.5 text-[13px] text-slate-500 max-w-[250px]" title={s.建议说明}>
                        {s.建议说明}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketingAnalysis;
