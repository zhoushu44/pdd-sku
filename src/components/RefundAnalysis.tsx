import React, { useMemo, useState } from 'react';
import { AlertTriangle, TrendingDown, RefreshCcw, Package, Search, X } from 'lucide-react';
import type { OrderData, RefundStat, RefundOverview } from '../types';
import { calculateRefundOverview, calculateRefundStats } from '../utils/dataProcessor';
import { formatAmount, formatNumber } from '../lib/utils';

interface RefundAnalysisProps {
  orders: OrderData[];
}

const RefundAnalysis: React.FC<RefundAnalysisProps> = ({ orders }) => {
  const [keyword, setKeyword] = useState('');
  const [sortBy, setSortBy] = useState<'退款率' | '退款成功额' | '总订单数'>('退款率');

  const overview = useMemo<RefundOverview>(() => calculateRefundOverview(orders), [orders]);
  const stats = useMemo<RefundStat[]>(() => calculateRefundStats(orders), [orders]);

  const filteredStats = useMemo(() => {
    let result = stats;
    if (keyword) {
      result = result.filter(s =>
        s.规格.includes(keyword) ||
        s.商品ID.includes(keyword) ||
        s.商品名称.includes(keyword)
      );
    }
    return [...result].sort((a, b) => {
      if (sortBy === '退款率') return b.退款率 - a.退款率;
      if (sortBy === '退款成功额') return b.退款成功额 - a.退款成功额;
      return b.总订单数 - a.总订单数;
    });
  }, [stats, keyword, sortBy]);

  // 高退款率SKU（退款率 > 20% 且订单数 >= 3）
  const highRiskSkus = useMemo(
    () => stats.filter(s => s.总订单数 >= 3 && s.退款率 > 20),
    [stats]
  );

  // 退款率颜色
  const getRefundRateClass = (rate: number): string => {
    if (rate >= 40) return 'text-red-400';
    if (rate >= 20) return 'text-orange-400';
    if (rate >= 10) return 'text-amber-400';
    return 'text-slate-300';
  };

  // 退款率背景色
  const getRefundRateBg = (rate: number): string => {
    if (rate >= 40) return 'bg-red-500/10 border-red-500/30';
    if (rate >= 20) return 'bg-orange-500/10 border-orange-500/30';
    if (rate >= 10) return 'bg-amber-500/10 border-amber-500/30';
    return 'bg-slate-800/50 border-slate-700/50';
  };

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <RefreshCcw className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-lg">暂无订单数据</p>
        <p className="text-sm mt-2">请先上传销售订单CSV文件</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 退款总览卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
            <Package className="w-3.5 h-3.5" />
            <span>总订单数</span>
          </div>
          <div className="text-xl font-bold text-slate-100">{formatNumber(overview.总订单数)}</div>
        </div>

        <div className="bg-orange-500/10 rounded-lg p-4 border border-orange-500/30">
          <div className="flex items-center gap-2 text-orange-400 text-xs mb-2">
            <RefreshCcw className="w-3.5 h-3.5" />
            <span>退款订单</span>
          </div>
          <div className="text-xl font-bold text-orange-300">{formatNumber(overview.退款订单数)}</div>
        </div>

        <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/30">
          <div className="flex items-center gap-2 text-red-400 text-xs mb-2">
            <TrendingDown className="w-3.5 h-3.5" />
            <span>退款成功</span>
          </div>
          <div className="text-xl font-bold text-red-300">{formatNumber(overview.退款成功订单数)}</div>
        </div>

        <div className={`rounded-lg p-4 border ${getRefundRateBg(overview.整体退款率)}`}>
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>整体退款率</span>
          </div>
          <div className={`text-xl font-bold ${getRefundRateClass(overview.整体退款率)}`}>
            {overview.整体退款率}%
          </div>
        </div>

        <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/30">
          <div className="flex items-center gap-2 text-red-400 text-xs mb-2">
            <TrendingDown className="w-3.5 h-3.5" />
            <span>退款损失额</span>
          </div>
          <div className="text-xl font-bold text-red-300">{formatAmount(overview.退款成功总金额)}</div>
        </div>

        <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/30">
          <div className="flex items-center gap-2 text-red-400 text-xs mb-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>高退款率SKU</span>
          </div>
          <div className="text-xl font-bold text-red-300">{overview.高退款率SKU数}</div>
        </div>
      </div>

      {/* 高退款率SKU预警 */}
      {highRiskSkus.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <h3 className="text-sm font-medium text-red-300">
              高退款率SKU预警（退款率 &gt; 20%，订单数 ≥ 3）
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {highRiskSkus.slice(0, 6).map(sku => (
              <div
                key={sku.规格}
                className="flex items-center justify-between bg-slate-800/50 rounded px-3 py-2 border border-slate-700/30"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-200 truncate" title={sku.规格}>{sku.规格}</div>
                  <div className="text-xs text-slate-500">{sku.退款订单数}/{sku.总订单数}单</div>
                </div>
                <div className={`text-sm font-bold ml-2 ${getRefundRateClass(sku.退款率)}`}>
                  {sku.退款率}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 退款明细表 */}
      <div className="bg-slate-800/30 rounded-lg border border-slate-700/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-slate-200 flex items-center gap-2">
            <RefreshCcw className="w-4 h-4 text-orange-400" />
            退款明细（按规格）
          </h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="搜索规格/商品ID/名称"
                className="pl-7 pr-7 py-1.5 text-xs bg-slate-900/50 border border-slate-700/50 rounded text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-slate-600 w-48"
              />
              {keyword && (
                <button
                  onClick={() => setKeyword('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="px-2 py-1.5 text-xs bg-slate-900/50 border border-slate-700/50 rounded text-slate-200 focus:outline-none focus:border-slate-600"
            >
              <option value="退款率">按退款率排序</option>
              <option value="退款成功额">按退款损失排序</option>
              <option value="总订单数">按订单数排序</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/50 sticky top-0 z-10">
              <tr className="text-slate-400 text-xs">
                <th className="px-3 py-2.5 text-left font-medium">规格</th>
                <th className="px-3 py-2.5 text-right font-medium">总订单</th>
                <th className="px-3 py-2.5 text-right font-medium">退款订单</th>
                <th className="px-3 py-2.5 text-right font-medium">退款成功</th>
                <th className="px-3 py-2.5 text-right font-medium">退款率</th>
                <th className="px-3 py-2.5 text-right font-medium">退款损失额</th>
                <th className="px-3 py-2.5 text-right font-medium">有效销售额</th>
                <th className="px-3 py-2.5 text-right font-medium">损失占比</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {filteredStats.map(stat => (
                <tr key={stat.规格} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-3 py-2.5 text-slate-200 max-w-[200px] truncate" title={stat.规格}>
                    {stat.规格}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-300 font-mono">{stat.总订单数}</td>
                  <td className="px-3 py-2.5 text-right text-orange-400 font-mono">{stat.退款订单数}</td>
                  <td className="px-3 py-2.5 text-right text-red-400 font-mono">{stat.退款成功订单数}</td>
                  <td className={`px-3 py-2.5 text-right font-mono font-bold ${getRefundRateClass(stat.退款率)}`}>
                    {stat.退款率}%
                  </td>
                  <td className="px-3 py-2.5 text-right text-red-400 font-mono">
                    {formatAmount(stat.退款成功额)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-emerald-400 font-mono">
                    {formatAmount(stat.销售额)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-400 font-mono">
                    {stat.退款损失占比}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredStats.length === 0 && (
            <div className="py-12 text-center text-slate-500 text-sm">
              {keyword ? '未找到匹配的记录' : '暂无退款数据'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RefundAnalysis;
