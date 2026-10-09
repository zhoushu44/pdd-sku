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
    if (rate >= 40) return 'text-red-600';
    if (rate >= 20) return 'text-amber-600';
    if (rate >= 10) return 'text-amber-600';
    return 'text-slate-600';
  };

  // 退款率背景色
  const getRefundRateBg = (rate: number): string => {
    if (rate >= 40) return 'bg-red-50 border-red-200';
    if (rate >= 20) return 'bg-amber-50 border-amber-200';
    if (rate >= 10) return 'bg-amber-50 border-amber-200';
    return 'bg-white border-slate-200';
  };

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <RefreshCcw className="w-12 h-12 mb-2 opacity-50" />
        <p className="text-base">暂无订单数据</p>
        <p className="text-[13px] mt-2">请先上传销售订单CSV文件</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 退款总览卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <div className="bg-white rounded-xl p-3 border border-slate-200">
          <div className="flex items-center gap-2 text-slate-500 text-[13px] mb-2">
            <Package className="w-3.5 h-3.5" />
            <span>总订单数</span>
          </div>
          <div className="text-[14px] font-bold text-slate-900">{formatNumber(overview.总订单数)}</div>
        </div>

        <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
          <div className="flex items-center gap-2 text-amber-600 text-[13px] mb-2">
            <RefreshCcw className="w-3.5 h-3.5" />
            <span>退款订单</span>
          </div>
          <div className="text-[14px] font-bold text-amber-600">{formatNumber(overview.退款订单数)}</div>
        </div>

        <div className="bg-red-50 rounded-xl p-3 border border-red-200">
          <div className="flex items-center gap-2 text-red-600 text-[13px] mb-2">
            <TrendingDown className="w-3.5 h-3.5" />
            <span>退款成功</span>
          </div>
          <div className="text-[14px] font-bold text-red-600">{formatNumber(overview.退款成功订单数)}</div>
        </div>

        <div className={`rounded-xl p-3 border ${getRefundRateBg(overview.整体退款率)}`}>
          <div className="flex items-center gap-2 text-slate-500 text-[13px] mb-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>整体退款率</span>
          </div>
          <div className={`text-[14px] font-bold ${getRefundRateClass(overview.整体退款率)}`}>
            {overview.整体退款率}%
          </div>
        </div>

        <div className="bg-red-50 rounded-xl p-3 border border-red-200">
          <div className="flex items-center gap-2 text-red-600 text-[13px] mb-2">
            <TrendingDown className="w-3.5 h-3.5" />
            <span>退款损失额</span>
          </div>
          <div className="text-[14px] font-bold text-red-600">{formatAmount(overview.退款成功总金额)}</div>
        </div>

        <div className="bg-red-50 rounded-xl p-3 border border-red-200">
          <div className="flex items-center gap-2 text-red-600 text-[13px] mb-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>高退款率SKU</span>
          </div>
          <div className="text-[14px] font-bold text-red-600">{overview.高退款率SKU数}</div>
        </div>
      </div>

      {/* 发货前/后退款对比 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4 text-amber-600" />
            <h3 className="text-[13px] font-medium text-amber-600">发货前退款（无运费损失）</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[13px] text-slate-500 mb-1">订单数</div>
              <div className="text-[14px] font-bold text-amber-600">{formatNumber(overview.发货前退款订单数)}</div>
            </div>
            <div>
              <div className="text-[13px] text-slate-500 mb-1">退款金额</div>
              <div className="text-[14px] font-bold text-amber-600">{formatAmount(overview.发货前退款金额)}</div>
            </div>
          </div>
        </div>

        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-red-600" />
            <h3 className="text-[13px] font-medium text-red-600">发货后退款（有运费损失）</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[13px] text-slate-500 mb-1">订单数</div>
              <div className="text-[14px] font-bold text-red-600">{formatNumber(overview.发货后退款订单数)}</div>
            </div>
            <div>
              <div className="text-[13px] text-slate-500 mb-1">退款金额</div>
              <div className="text-[14px] font-bold text-red-600">{formatAmount(overview.发货后退款金额)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 高退款率SKU预警 */}
      {highRiskSkus.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <h3 className="text-[13px] font-medium text-red-600">
              高退款率SKU预警（退款率 &gt; 20%，订单数 ≥ 3）
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {highRiskSkus.slice(0, 6).map(sku => (
              <div
                key={sku.规格}
                className="flex items-center justify-between bg-slate-100 rounded px-3 py-2 border border-slate-100"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-slate-700 truncate" title={sku.规格}>{sku.规格}</div>
                  <div className="text-[13px] text-slate-400">{sku.退款订单数}/{sku.总订单数}单</div>
                </div>
                <div className={`text-[13px] font-bold ml-2 ${getRefundRateClass(sku.退款率)}`}>
                  {sku.退款率}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 退款明细表 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13px] font-medium text-slate-700 flex items-center gap-2">
            <RefreshCcw className="w-4 h-4 text-amber-600" />
            退款明细（按规格）
          </h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="搜索规格/商品ID/名称"
                className="pl-7 pr-7 py-1.5 text-[13px] bg-white border border-slate-300 rounded-md text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 w-48"
              />
              {keyword && (
                <button
                  onClick={() => setKeyword('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="px-3 py-1.5 text-[13px] bg-white border border-slate-300 rounded-md text-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            >
              <option value="退款率">按退款率排序</option>
              <option value="退款成功额">按退款损失排序</option>
              <option value="总订单数">按订单数排序</option>
            </select>
          </div>
        </div>

        <div className="overflow-auto max-h-[360px]">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-100 text-[12px] font-medium text-slate-500 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-left font-medium">规格</th>
                <th className="px-3 py-2 text-right font-medium">总订单</th>
                <th className="px-3 py-2 text-right font-medium">退款订单</th>
                <th className="px-3 py-2 text-right font-medium">退款成功</th>
                <th className="px-3 py-2 text-right font-medium">退款率</th>
                <th className="px-3 py-2 text-right font-medium">退款损失额</th>
                <th className="px-3 py-2 text-right font-medium">发货前退款</th>
                <th className="px-3 py-2 text-right font-medium">发货后退款</th>
                <th className="px-3 py-2 text-right font-medium">有效销售额</th>
                <th className="px-3 py-2 text-right font-medium">损失占比</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStats.length === 0 && (
                <tr className="hover:bg-slate-50">
                  <td colSpan={10} className="px-3 py-6 text-center text-slate-400 text-[13px]">
                    {keyword ? '未找到匹配的记录' : '暂无退款数据'}
                  </td>
                </tr>
              )}
              {filteredStats.map(stat => (
                <tr key={stat.规格} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-1.5 text-slate-700 max-w-[200px] truncate" title={stat.规格}>
                    {stat.规格}
                  </td>
                  <td className="px-3 py-1.5 text-right text-slate-600 font-mono">{stat.总订单数}</td>
                  <td className="px-3 py-1.5 text-right text-amber-600 font-mono">{stat.退款订单数}</td>
                  <td className="px-3 py-1.5 text-right text-red-600 font-mono">{stat.退款成功订单数}</td>
                  <td className={`px-3 py-1.5 text-right font-mono font-bold ${getRefundRateClass(stat.退款率)}`}>
                    {stat.退款率}%
                  </td>
                  <td className="px-3 py-1.5 text-right text-red-600 font-mono">
                    {formatAmount(stat.退款成功额)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-amber-600 font-mono">
                    {stat.发货前退款订单数}
                    <div className="text-[13px] text-slate-400">{formatAmount(stat.发货前退款金额)}</div>
                  </td>
                  <td className="px-3 py-1.5 text-right text-red-600 font-mono">
                    {stat.发货后退款订单数}
                    <div className="text-[13px] text-slate-400">{formatAmount(stat.发货后退款金额)}</div>
                  </td>
                  <td className="px-3 py-1.5 text-right text-emerald-600 font-mono">
                    {formatAmount(stat.销售额)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-slate-500 font-mono">
                    {stat.退款损失占比}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RefundAnalysis;
