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
    const totalImpressions = filteredData.reduce((sum, item) => sum + item.曝光量, 0);
    const totalClicks = filteredData.reduce((sum, item) => sum + item.点击量, 0);

    // 实际投产比
    const actualROI = totalMarketingCost > 0 ? totalTransactionAmount / totalMarketingCost : 0;

    // 点击率
    const clickRate = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

    return {
      totalMarketingCost,
      totalTransactionAmount,
      totalNetTransaction,
      totalNetOrders,
      totalImpressions,
      totalClicks,
      actualROI,
      clickRate
    };
  }, [filteredData]);

  // 格式化金额（使用全局 formatAmount）
  // 注：原 formatMoney 与 formatAmount 完全一致，统一使用 formatAmount

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
    increase: { label: '加预算', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10 border-emerald-500/30', icon: ArrowUpRight },
    decrease: { label: '减预算', color: 'text-orange-400', bgColor: 'bg-orange-500/10 border-orange-500/30', icon: ArrowDownRight },
    stop: { label: '暂停', color: 'text-red-400', bgColor: 'bg-red-500/10 border-red-500/30', icon: Ban },
    maintain: { label: '维持', color: 'text-slate-400', bgColor: 'bg-slate-700/30 border-slate-600/30', icon: Minus },
  };

  if (marketingData.length === 0) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-700/50 p-12">
        <div className="text-center">
          <Megaphone className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">暂无推广数据</h3>
          <p className="text-slate-400 mb-6">
            请上传推广数据文件（支持 Excel/CSV/TXT 格式）
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600/20 text-purple-400 rounded-lg text-sm">
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
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/25">
          <Megaphone className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">营销数据分析</h2>
          <p className="text-sm text-slate-400">
            共 {marketingData.length} 条推广记录，当前筛选后 {filteredData.length} 条
          </p>
        </div>
      </div>

      {/* 本地筛选工具栏：时间筛选 + 商品ID筛选 */}
      <div className="bg-slate-900 rounded-xl border border-slate-700/50 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
        {/* 商品ID筛选 */}
        <form onSubmit={handleProductSearchSubmit} className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={productIdInput}
              onChange={(e) => setProductIdInput(e.target.value)}
              placeholder="按商品ID筛选"
              className="pl-9 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-md text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 w-56"
            />
            {productIdInput && (
              <button
                type="button"
                onClick={handleClearProductSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                title="清除"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-sm transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
            筛选
          </button>
          {localProductId && (
            <div className="flex items-center gap-2 ml-2 px-3 py-1 bg-purple-500/10 border border-purple-500/30 rounded-md">
              <span className="text-xs text-purple-300">商品ID:</span>
              <span className="text-sm text-white font-mono">{localProductId}</span>
              <button
                type="button"
                onClick={handleClearProductSearch}
                className="text-purple-400 hover:text-white"
                title="取消筛选"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </form>

        {/* 时间筛选 */}
        <div className="flex items-center gap-2 bg-slate-800/50 rounded-md p-1 border border-slate-700/50">
          <Calendar className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
          <div className="flex gap-0.5">
            {timeRangeOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setLocalTimeRange(opt.value)}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  localTimeRange === opt.value
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
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
            <DollarSign className="w-8 h-8 text-red-400" />
            <span className="text-xs text-red-400 bg-red-500/20 px-2 py-1 rounded">花费</span>
          </div>
          <div className="text-2xl font-bold text-white mb-1">
            {formatAmount(summary.totalMarketingCost)}
          </div>
          <div className="text-sm text-slate-400">总营销花费</div>
        </div>

        {/* 总交易额 */}
        <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-xl p-5 border border-green-500/20">
          <div className="flex items-center justify-between mb-3">
            <TrendingUp className="w-8 h-8 text-green-400" />
            <span className="text-xs text-green-400 bg-green-500/20 px-2 py-1 rounded">收入</span>
          </div>
          <div className="text-2xl font-bold text-white mb-1">
            {formatAmount(summary.totalTransactionAmount)}
          </div>
          <div className="text-sm text-slate-400">总交易额</div>
        </div>

        {/* 实际投产比 */}
        <div className="bg-gradient-to-br from-yellow-500/10 to-amber-500/10 rounded-xl p-5 border border-yellow-500/20">
          <div className="flex items-center justify-between mb-3">
            <Target className="w-8 h-8 text-yellow-400" />
            <span className="text-xs text-yellow-400 bg-yellow-500/20 px-2 py-1 rounded">ROI</span>
          </div>
          <div className="text-2xl font-bold text-white mb-1">
            {summary.actualROI.toFixed(2)}
          </div>
          <div className="text-sm text-slate-400">实际投产比</div>
        </div>

        {/* 净成交笔数 */}
        <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-xl p-5 border border-blue-500/20">
          <div className="flex items-center justify-between mb-3">
            <Megaphone className="w-8 h-8 text-blue-400" />
            <span className="text-xs text-blue-400 bg-blue-500/20 px-2 py-1 rounded">订单</span>
          </div>
          <div className="text-2xl font-bold text-white mb-1">
            {formatNumber(summary.totalNetOrders)}
          </div>
          <div className="text-sm text-slate-400">净成交笔数</div>
        </div>
      </div>

      {/* 额外指标 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="w-4 h-4 text-cyan-400" />
            <span className="text-sm text-slate-400">总曝光量</span>
          </div>
          <div className="text-xl font-semibold text-white">{formatNumber(summary.totalImpressions)}</div>
        </div>
        
        <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30">
          <div className="flex items-center gap-2 mb-2">
            <MousePointerClick className="w-4 h-4 text-pink-400" />
            <span className="text-sm text-slate-400">总点击量</span>
          </div>
          <div className="text-xl font-semibold text-white">{formatNumber(summary.totalClicks)}</div>
        </div>
        
        <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30">
          <div className="flex items-center gap-2 mb-2">
            <MousePointerClick className="w-4 h-4 text-green-400" />
            <span className="text-sm text-slate-400">点击率</span>
          </div>
          <div className="text-xl font-semibold text-white">{summary.clickRate.toFixed(2)}%</div>
        </div>
      </div>

      {/* 每日营销数据表格 */}
      <div className="bg-slate-900 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700/50">
          <h3 className="font-semibold text-white">每日推广明细</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">日期</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">商品ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">商品名称</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">交易额</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">营销花费</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">净交易额</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">成交笔数</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">曝光量</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">点击量</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">点击率</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">投产比</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {reversedData.map((row, index) => {
                  const clickRateValue = row.曝光量 > 0 ? (row.点击量 / row.曝光量) * 100 : 0;
                  const roiValue = row.总营销花费 > 0 ? row.交易额 / row.总营销花费 : 0;

                  return (
                    <tr key={`${row.日期}-${row.商品ID}-${index}`} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-sm text-white whitespace-nowrap">{row.日期}</td>
                      <td className="px-4 py-3 text-sm text-purple-300 whitespace-nowrap font-mono">{row.商品ID || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-300 max-w-[200px] truncate" title={row.商品名称}>{row.商品名称 || '-'}</td>
                      <td className="px-4 py-3 text-sm text-green-400 text-right font-mono">{formatAmount(row.交易额)}</td>
                      <td className="px-4 py-3 text-sm text-red-400 text-right font-mono">{formatAmount(row.总营销花费)}</td>
                      <td className="px-4 py-3 text-sm text-blue-400 text-right font-mono">{formatAmount(row.净交易额)}</td>
                      <td className="px-4 py-3 text-sm text-white text-right">{row.成交笔数}</td>
                      <td className="px-4 py-3 text-sm text-slate-300 text-right">{formatNumber(row.曝光量)}</td>
                      <td className="px-4 py-3 text-sm text-slate-300 text-right">{formatNumber(row.点击量)}</td>
                      <td className="px-4 py-3 text-sm text-yellow-400 text-right font-mono">{clickRateValue.toFixed(2)}%</td>
                      <td className={`px-4 py-3 text-sm text-right font-mono ${roiValue >= 4 ? 'text-green-400' : roiValue >= 2 ? 'text-yellow-400' : 'text-red-400'}`}>
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
      <div className="bg-slate-900 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700/50">
          <h3 className="font-semibold text-white">商品维度汇总（按商品ID）</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">商品ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">商品名称</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">分组</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">交易额</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">营销花费</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">净交易额</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">成交笔数</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">投产比</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
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
                      orders: 0
                    };
                  }
                  acc[key].transaction += row.交易额;
                  acc[key].cost += row.总营销花费;
                  acc[key].netTransaction += row.净交易额;
                  acc[key].orders += row.成交笔数;
                  return acc;
                }, {} as Record<string, MarketingGroupStat>)
              ).map(([key, data]) => {
                const roi = data.cost > 0 ? data.transaction / data.cost : 0;

                return (
                  <tr key={key} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-purple-300 font-mono whitespace-nowrap">{data.id}</td>
                    <td className="px-4 py-3 text-sm text-white max-w-[300px] truncate" title={data.name}>
                      {data.name || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right">{data.group || '-'}</td>
                    <td className="px-4 py-3 text-sm text-green-400 text-right font-mono">{formatAmount(data.transaction)}</td>
                    <td className="px-4 py-3 text-sm text-red-400 text-right font-mono">{formatAmount(data.cost)}</td>
                    <td className="px-4 py-3 text-sm text-blue-400 text-right font-mono">{formatAmount(data.netTransaction)}</td>
                    <td className="px-4 py-3 text-sm text-white text-right">{data.orders}</td>
                    <td className={`px-4 py-3 text-sm text-right font-mono ${roi >= 4 ? 'text-green-400' : roi >= 2 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {roi.toFixed(2)}
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
        <div className="bg-slate-900 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700/50">
            <div className="flex items-center gap-2 mb-3">
              <Wallet className="w-5 h-5 text-amber-400" />
              <h3 className="text-lg font-semibold text-white">推广预算优化建议</h3>
              <span className="text-xs text-slate-400">（基于净ROI与利润率）</span>
            </div>
            {/* 建议汇总 */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded px-3 py-2">
                <div className="text-xs text-emerald-400">建议加预算</div>
                <div className="text-lg font-bold text-emerald-300">{budgetSummary.increase}</div>
              </div>
              <div className="bg-slate-700/30 border border-slate-600/30 rounded px-3 py-2">
                <div className="text-xs text-slate-400">建议维持</div>
                <div className="text-lg font-bold text-slate-300">{budgetSummary.maintain}</div>
              </div>
              <div className="bg-orange-500/10 border border-orange-500/30 rounded px-3 py-2">
                <div className="text-xs text-orange-400">建议减预算</div>
                <div className="text-lg font-bold text-orange-300">{budgetSummary.decrease}</div>
              </div>
              <div className="bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
                <div className="text-xs text-red-400">建议暂停</div>
                <div className="text-lg font-bold text-red-300">{budgetSummary.stop}</div>
              </div>
              <div className={`border rounded px-3 py-2 ${budgetSummary.totalImpact >= 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                <div className={`text-xs ${budgetSummary.totalImpact >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>预计利润影响</div>
                <div className={`text-lg font-bold ${budgetSummary.totalImpact >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                  {budgetSummary.totalImpact >= 0 ? '+' : ''}{formatAmount(budgetSummary.totalImpact)}
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50 sticky top-0 z-10">
                <tr className="text-slate-400 text-xs">
                  <th className="px-3 py-2.5 text-left font-medium">商品ID</th>
                  <th className="px-3 py-2.5 text-left font-medium">商品名称</th>
                  <th className="px-3 py-2.5 text-right font-medium">当前花费</th>
                  <th className="px-3 py-2.5 text-right font-medium">净交易额</th>
                  <th className="px-3 py-2.5 text-right font-medium">净ROI</th>
                  <th className="px-3 py-2.5 text-center font-medium">建议</th>
                  <th className="px-3 py-2.5 text-right font-medium">调整比例</th>
                  <th className="px-3 py-2.5 text-right font-medium">预计利润影响</th>
                  <th className="px-3 py-2.5 text-left font-medium">说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {budgetSuggestions.map(s => {
                  const config = budgetConfig[s.建议];
                  const Icon = config.icon;
                  return (
                    <tr key={s.商品ID} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-3 py-2.5 text-xs text-purple-300 font-mono whitespace-nowrap">{s.商品ID}</td>
                      <td className="px-3 py-2.5 text-sm text-slate-200 max-w-[200px] truncate" title={s.商品名称}>
                        {s.商品名称 || '-'}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-red-400 text-right font-mono">{formatAmount(s.当前花费)}</td>
                      <td className="px-3 py-2.5 text-sm text-blue-400 text-right font-mono">{formatAmount(s.净交易额)}</td>
                      <td className={`px-3 py-2.5 text-sm text-right font-mono font-bold ${s.净ROI >= 2 ? 'text-emerald-400' : s.净ROI >= 1 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {s.净ROI.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${config.bgColor} border ${config.color}`}>
                          <Icon className="w-3 h-3" />
                          {config.label}
                        </span>
                      </td>
                      <td className={`px-3 py-2.5 text-sm text-right font-mono ${s.预计调整比例 > 0 ? 'text-emerald-400' : s.预计调整比例 < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                        {s.预计调整比例 > 0 ? '+' : ''}{s.预计调整比例}%
                      </td>
                      <td className={`px-3 py-2.5 text-sm text-right font-mono ${s.预计影响利润 > 0 ? 'text-emerald-400' : s.预计影响利润 < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                        {s.预计影响利润 > 0 ? '+' : ''}{formatAmount(s.预计影响利润)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-400 max-w-[250px]" title={s.建议说明}>
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
