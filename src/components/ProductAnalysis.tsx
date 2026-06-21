import React, { useState, useMemo } from 'react';
import { BarChart3, ArrowUpDown, Link2 } from 'lucide-react';
import type { ProductSummary, DetailedCostConfig } from '../types';
import { formatAmount, formatNumber } from '../lib/utils';

interface ProductAnalysisProps {
  summaries: ProductSummary[];
  costConfig: DetailedCostConfig;
}

type SortKey = keyof ProductSummary | '利润率';
type SortDirection = 'asc' | 'desc';

const ProductAnalysis: React.FC<ProductAnalysisProps> = ({ summaries, costConfig }) => {
  const [sortKey, setSortKey] = useState<SortKey>('销售额');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // 获取利润率颜色类名
  const getProfitRateColorClass = (rate: number): string => {
    if (rate >= 0) {
      return 'text-emerald-500';
    }
    return 'text-red-500';
  };

  // 获取利润率进度条样式
  const getProfitRateBarStyle = (rate: number): React.CSSProperties => {
    const absRate = Math.abs(rate);
    const clampedWidth = Math.min(absRate, 100); // 最大宽度限制为100%

    if (rate >= 0) {
      return {
        width: `${clampedWidth}%`,
        background: `linear-gradient(90deg, #10b981 0%, #34d399 100%)`,
      };
    } else {
      return {
        width: `${clampedWidth}%`,
        background: `linear-gradient(90deg, #ef4444 0%, #f87171 100%)`,
      };
    }
  };

  // 处理排序切换
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  // 排序后的数据
  const sortedSummaries = useMemo(() => {
    const sorted = [...summaries].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      switch (sortKey) {
        case '规格':
          aVal = a.规格;
          bVal = b.规格;
          break;
        case '商品ID':
          aVal = a.商品ID;
          bVal = b.商品ID;
          break;
        case '销售额':
          aVal = a.销售额;
          bVal = b.销售额;
          break;
        case '销量':
          aVal = a.销量;
          bVal = b.销量;
          break;
        case '订单数':
          aVal = a.订单数;
          bVal = b.订单数;
          break;
        case '平均客单价':
          aVal = a.平均客单价;
          bVal = b.平均客单价;
          break;
        case 'SKU净利润':
          aVal = a.SKU净利润;
          bVal = b.SKU净利润;
          break;
        case '总成本':
          aVal = a.总成本;
          bVal = b.总成本;
          break;
        case '订单引流成本':
          aVal = a.订单引流成本;
          bVal = b.订单引流成本;
          break;
        case '净利润':
          aVal = a.净利润;
          bVal = b.净利润;
          break;
        case '利润率':
          aVal = a.利润率;
          bVal = b.利润率;
          break;
        default:
          aVal = a.销售额;
          bVal = b.销售额;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal, 'zh-CN')
          : bVal.localeCompare(aVal, 'zh-CN');
      }

      return sortDirection === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

    return sorted;
  }, [summaries, sortKey, sortDirection]);

  // 计算合计行数据
  const totals = useMemo(() => {
    return {
      销售额: summaries.reduce((sum, item) => sum + item.销售额, 0),
      销量: summaries.reduce((sum, item) => sum + item.销量, 0),
      订单数: summaries.reduce((sum, item) => sum + item.订单数, 0),
      平均客单价: summaries.length > 0
        ? summaries.reduce((sum, item) => sum + item.销售额, 0) / summaries.reduce((sum, item) => sum + item.订单数, 0)
        : 0,
      总成本: summaries.reduce((sum, item) => sum + item.总成本, 0),
      引流成本总额: summaries.reduce((sum, item) => sum + item.订单引流成本 * item.订单数, 0),
      净利润: summaries.reduce((sum, item) => sum + item.净利润, 0),
      利润率: summaries.length > 0 && summaries.reduce((sum, item) => sum + item.销售额, 0) > 0
        ? (summaries.reduce((sum, item) => sum + item.净利润, 0)) /
          summaries.reduce((sum, item) => sum + item.销售额, 0) * 100
        : 0,
    };
  }, [summaries]);

  // 渲染表头单元格（带排序功能）
  const renderSortableHeader = (label: string, key: SortKey, align: 'left' | 'right' | 'center' = 'left') => {
    const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
    return (
      <th
        className={`px-4 py-3 ${alignClass} text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-300 transition-colors select-none`}
        onClick={() => handleSort(key)}
      >
        <div className="flex items-center gap-2">
          <span>{label}</span>
          <ArrowUpDown className={`w-3.5 h-3.5 ${sortKey === key ? 'text-blue-400' : 'text-slate-600'}`} />
        </div>
      </th>
    );
  };

  return (
    <div className="w-full bg-slate-900 rounded-lg p-6 shadow-xl">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-blue-400" />
          <h2 className="text-xl font-semibold text-white">商品销售分析</h2>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 border border-blue-500/30 rounded-full">
            <Link2 className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs text-blue-300">成本已与利润计算同步</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">
            共 {summaries.length} 个商品规格
          </span>
          <span className={`px-2 py-1 rounded text-xs ${
            Object.keys(costConfig).length > 0 
              ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
              : 'bg-slate-700/50 text-slate-400'
          }`}>
            已设置 {Object.keys(costConfig).length}/{summaries.length} 个成本
          </span>
        </div>
      </div>

      {/* 表格容器 */}
      <div className="overflow-x-auto">
        <table className="w-full">
          {/* 表头 */}
          <thead>
            <tr className="border-b border-slate-700/50">
              {renderSortableHeader('商品规格', '规格')}
              {renderSortableHeader('商品ID', '商品ID')}
              {renderSortableHeader('销售额', '销售额', 'right')}
              {renderSortableHeader('销量', '销量', 'right')}
              {renderSortableHeader('订单数', '订单数', 'right')}
              {renderSortableHeader('平均客单价', '平均客单价', 'right')}
              {renderSortableHeader('SKU净利润', 'SKU净利润', 'right')}
              {renderSortableHeader('总成本', '总成本', 'right')}
              {renderSortableHeader('订单引流成本', '订单引流成本', 'right')}
              {renderSortableHeader('真实退款率%', '真实退款率', 'right')}
              {renderSortableHeader('净利润', '净利润', 'right')}
              {renderSortableHeader('利润率%', '利润率', 'right')}
            </tr>
          </thead>

          {/* 表体 */}
          <tbody className="divide-y divide-slate-700/30">
            {sortedSummaries.map((item) => (
              <tr
                key={item.规格}
                className="hover:bg-slate-800/50 transition-colors duration-200"
              >
                {/* 商品规格 */}
                <td className="px-4 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-white max-w-[200px] truncate" title={item.规格}>
                    {item.规格}
                  </div>
                </td>

                {/* 商品ID */}
                <td className="px-4 py-4 whitespace-nowrap">
                  <div className="text-sm text-slate-300 font-mono max-w-[140px] truncate" title={item.商品ID}>
                    {item.商品ID || '-'}
                  </div>
                </td>

                {/* 销售额 */}
                <td className="px-4 py-4 whitespace-nowrap text-right">
                  <div className="text-sm text-slate-200 font-mono">
                    {formatAmount(item.销售额)}
                  </div>
                </td>

                {/* 销量 */}
                <td className="px-4 py-4 whitespace-nowrap text-right">
                  <div className="text-sm text-slate-200 font-mono">
                    {formatNumber(item.销量)}
                  </div>
                </td>

                {/* 订单数 */}
                <td className="px-4 py-4 whitespace-nowrap text-right">
                  <div className="text-sm text-slate-200 font-mono">
                    {formatNumber(item.订单数)}
                  </div>
                </td>

                {/* 平均客单价 */}
                <td className="px-4 py-4 whitespace-nowrap text-right">
                  <div className="text-sm text-slate-200 font-mono">
                    {formatAmount(item.平均客单价)}
                  </div>
                </td>

                {/* SKU净利润（来自利润计算模块，不可编辑） */}
                <td className="px-4 py-4 whitespace-nowrap text-right">
                  <div
                    className={`text-sm font-mono ${item.SKU净利润 > 0 ? 'text-emerald-400' : item.SKU净利润 < 0 ? 'text-red-400' : 'text-slate-400'}`}
                    title={`来自利润计算模块: ${item.SKU净利润 !== 0 ? formatAmount(item.SKU净利润) : '未设置（需在利润计算模块设置定价和成本单价）'}`}
                  >
                    {item.SKU净利润 !== 0 ? formatAmount(item.SKU净利润) : '-'}
                  </div>
                </td>

                {/* 总成本 */}
                <td className="px-4 py-4 whitespace-nowrap text-right">
                  <div className="text-sm text-slate-200 font-mono">
                    {formatAmount(item.总成本)}
                  </div>
                </td>

                {/* 订单引流成本（单件：该商品ID总营销费用/总订单数） */}
                <td className="px-4 py-4 whitespace-nowrap text-right">
                  <div
                    className="text-sm text-purple-300 font-mono"
                    title={`单件引流成本 = 商品ID总营销费用 / 商品ID总订单数\n净利润已扣除：${formatAmount(item.订单引流成本 * item.订单数)}`}
                  >
                    {item.订单引流成本 > 0 ? formatAmount(item.订单引流成本) : '-'}
                  </div>
                </td>

                {/* 真实退款率 */}
                <td className="px-4 py-4 whitespace-nowrap text-right">
                  <span
                    className={`text-sm font-mono ${
                      item.真实退款率 >= 20 ? 'text-red-400' :
                      item.真实退款率 >= 10 ? 'text-orange-400' :
                      item.真实退款率 > 0 ? 'text-amber-400' : 'text-slate-500'
                    }`}
                    title={`退款成功额 / (销售额 + 退款成功额) × 100\n利润计算已自动应用此退款率（除非手动覆盖）`}
                  >
                    {item.真实退款率 > 0 ? `${item.真实退款率.toFixed(2)}%` : '-'}
                  </span>
                </td>

                {/* 净利润 */}
                <td className="px-4 py-4 whitespace-nowrap text-right">
                  <div className={`text-sm font-semibold font-mono ${getProfitRateColorClass(item.净利润)}`}>
                    {item.净利润 >= 0 ? '+' : ''}
                    {formatAmount(item.净利润)}
                  </div>
                </td>

                {/* 利润率（带进度条可视化） */}
                <td className="px-4 py-4 whitespace-nowrap">
                  <div className="flex flex-col items-end gap-1">
                    <div className={`text-sm font-semibold font-mono ${getProfitRateColorClass(item.利润率)}`}>
                      {item.利润率 >= 0 ? '+' : ''}
                      {item.利润率.toFixed(2)}%
                    </div>
                    {/* 进度条 */}
                    <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={getProfitRateBarStyle(item.利润率)}
                      ></div>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>

          {/* 合计行 */}
          <tfoot>
            <tr className="border-t-2 border-slate-600 bg-slate-800/30">
              <td className="px-4 py-4 whitespace-nowrap">
                <div className="text-sm font-bold text-white">合计</div>
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-right">
                <div className="text-sm text-slate-400 font-mono">-</div>
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-right">
                <div className="text-sm font-bold text-white font-mono">
                  {formatAmount(totals.销售额)}
                </div>
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-right">
                <div className="text-sm font-bold text-white font-mono">
                  {formatNumber(totals.销量)}
                </div>
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-right">
                <div className="text-sm font-bold text-white font-mono">
                  {formatNumber(totals.订单数)}
                </div>
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-right">
                <div className="text-sm font-bold text-white font-mono">
                  {formatAmount(totals.平均客单价)}
                </div>
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-right">
                <div className="text-sm text-slate-400 font-mono">-</div>
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-right">
                <div className="text-sm font-bold text-white font-mono">
                  {formatAmount(totals.总成本)}
                </div>
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-right">
                <div className="text-sm font-bold text-purple-300 font-mono">
                  {totals.引流成本总额 > 0 ? formatAmount(totals.引流成本总额) : '-'}
                </div>
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-right">
                <div className="text-sm text-slate-400 font-mono">-</div>
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-right">
                <div className={`text-sm font-bold font-mono ${getProfitRateColorClass(totals.净利润)}`}>
                  {totals.净利润 >= 0 ? '+' : ''}
                  {formatAmount(totals.净利润)}
                </div>
              </td>
              <td className="px-4 py-4 whitespace-nowrap">
                <div className="flex flex-col items-end gap-1">
                  <div className={`text-sm font-bold font-mono ${getProfitRateColorClass(totals.利润率)}`}>
                    {totals.利润率 >= 0 ? '+' : ''}
                    {totals.利润率.toFixed(2)}%
                  </div>
                  {/* 合计行进度条 */}
                  <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={getProfitRateBarStyle(totals.利润率)}
                    ></div>
                  </div>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 表格底部信息 */}
      <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-center justify-between text-xs text-slate-500">
        <div>数据更新时间：{new Date().toLocaleString('zh-CN')}</div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-1.5 rounded-full bg-emerald-500"></span>
            正利润率
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-1.5 rounded-full bg-red-500"></span>
            负利润率
          </span>
          <span className="flex items-center gap-1 ml-2">
            <ArrowUpDown className="w-3.5 h-3.5" />
            点击列标题排序
          </span>
        </div>
      </div>
    </div>
  );
};

export default ProductAnalysis;
