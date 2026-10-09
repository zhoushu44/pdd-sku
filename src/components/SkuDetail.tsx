import React, { useMemo, useState } from 'react';
import { Search, ArrowUpDown, TableProperties, X } from 'lucide-react';
import type { OrderData, ProductSummary, DetailedCostConfig, MarketingDataRow, SkuVerdict, SkuDetailDimension } from '../types';
import { calculateSkuDetail } from '../utils/dataProcessor';
import { formatNumber } from '../lib/utils';

interface SkuDetailProps {
  summaries: ProductSummary[];
  marketingData: MarketingDataRow[];
  costConfig: DetailedCostConfig;
  orders: OrderData[];
  /** 展示维度：sku=按规格逐行，product=按商品汇总 */
  dimension: SkuDetailDimension;
}

type SortKey = '销售额' | '订单数' | '退款金额' | '净推广占比' | '单品利润' | '实际ROI' | '实际保ROI';

const sortOptions: { value: SortKey; label: string }[] = [
  { value: '销售额', label: '按销售额排序' },
  { value: '订单数', label: '按件数排序' },
  { value: '退款金额', label: '按退款金额排序' },
  { value: '净推广占比', label: '按净推广占比排序' },
  { value: '单品利润', label: '按单品利润排序' },
  { value: '实际ROI', label: '按实际ROI排序' },
  { value: '实际保ROI', label: '按实际保ROI排序' },
];

// 判定徽章样式（深色主题实底）：单品维度=推广决策，SKU 维度=盈利×动销组合
const verdictClass: Record<SkuVerdict, string> = {
  停推广: 'bg-red-500 text-white',
  降预算: 'bg-amber-500 text-white',
  可放大: 'bg-emerald-500 text-white',
  无推广: 'bg-slate-200 text-slate-600',
  明星款: 'bg-emerald-500 text-white',
  潜力款: 'bg-emerald-500 text-white',
  提曝光: 'bg-emerald-500 text-white',
  现金牛: 'bg-emerald-500 text-white',
  维持: 'bg-slate-300 text-slate-700',
  观察: 'bg-slate-200 text-slate-600',
  降本提价: 'bg-amber-500 text-white',
  精简: 'bg-amber-500 text-white',
  止损: 'bg-red-600 text-white',
  清仓: 'bg-red-500 text-white',
  清退: 'bg-slate-400 text-white',
  未配置: 'bg-slate-100 text-slate-400 border border-slate-300',
};

const SkuDetail: React.FC<SkuDetailProps> = ({ summaries, marketingData, costConfig, orders, dimension }) => {
  const [keyword, setKeyword] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('销售额');

  // SKU 维度的推广费为按销售额分摊值，ROI 与推广判定仅在单品维度评估
  const isProduct = dimension === 'product';
  const availableSortOptions = isProduct
    ? sortOptions
    : sortOptions.filter(o => o.value !== '实际ROI' && o.value !== '实际保ROI' && o.value !== '净推广占比');

  // 单品明细计算（按页面维度）
  const { rows, overview } = useMemo(
    () => calculateSkuDetail(summaries, marketingData, costConfig, orders, dimension),
    [summaries, marketingData, costConfig, orders, dimension]
  );

  // 搜索 + 排序
  const displayRows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const filtered = kw
      ? rows.filter(r => r.款号.toLowerCase().includes(kw) || r.商品ID.includes(kw))
      : rows;
    return [...filtered].sort((a, b) => (b[sortKey] as number) - (a[sortKey] as number));
  }, [rows, keyword, sortKey]);

  const money = (v: number) => `¥${v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const renderHeader = (label: string, align: 'left' | 'right' | 'center' = 'right', title?: string) => {
    const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
    return (
      <th
        title={title}
        className={`px-3 py-2 ${alignClass} text-[12px] font-medium text-slate-500 whitespace-nowrap bg-slate-100 border-b border-slate-200`}
      >
        {label}
      </th>
    );
  };

  return (
    <div className="w-full bg-white rounded-xl border border-slate-200 p-3">
      {/* 标题 */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-500/20 flex items-center justify-center text-emerald-600 flex-shrink-0">
          <TableProperties className="w-4 h-4" />
        </div>
        <h2 className="text-[13px] font-bold text-slate-900">
          {dimension === 'product' ? '单品明细' : 'SKU明细'}
        </h2>
        <span className="px-2.5 py-1 rounded-full text-[13px] font-medium bg-emerald-50 text-emerald-600 border border-emerald-200">
          {isProduct ? '推广决策' : '成本利润拆解'}
        </span>
      </div>

      {/* 口径说明 */}
      <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] leading-6 text-slate-500">
        <span className="text-slate-900 font-medium">
          {dimension === 'product' ? '单品明细' : 'SKU明细'} 共 {overview.款数} {dimension === 'sku' ? '个SKU' : '个单品'}
        </span>
        {overview.统计期起 && overview.统计期止 && (
          <> · 统计期 {overview.统计期起} ~ {overview.统计期止}</>
        )}
        {' '}· 期间推广费 <span className="text-emerald-600 font-mono">{money(overview.期间推广费)}</span>
        {' '}· 运费险 <span className="text-slate-700 font-mono">{money(overview.运费险)}</span>
        <span className="text-slate-400">（@导入值，按订单归因）</span>
        <br />
        · 客单价 = 销售额÷订单数 · 订单退款率 = 退款金额÷销售额 · 净销售额 = 销售额-退款金额
        <br />
        {isProduct && (
          <>
            · 净推广占比 = 分摊推广费÷净销售额 · 分摊推广费 = 该商品推广花费按销售额占比分摊（单品维度即该商品全部推广花费）
            <br />
          </>
        )}
        · 成本 = 商品成本 = 成本单价×销量
        <br />
        · 单品毛利 = 净销售额-成本
        <br />
        {isProduct
          ? '· 单品利润 = 单品毛利-快递-运费险-扣点-分摊推广费-该款补偿'
          : '· 单品利润 = 单品毛利-快递-运费险-扣点-该款补偿（不含分摊推广费，SKU 维度不摊推广）'}
        <br />
        · 实际毛利率 = 单品毛利÷净销售额
        {isProduct ? (
          <>
            <br />
            · 实际保ROI = 净销售额÷(单品利润+推广费)
            <br />
            · 实际ROI = 净销售额÷分摊推广费（与净推广占比互为倒数，与实际保ROI 同分母，两列可直接比较大小）
            <br />
            · 判定：单品利润&lt;0（亏损品）→ 利润门强制停推广；否则实际ROI 比实际保本ROI：低于保本线→停推广；保本线到1.2倍→降预算；1.2倍以上→可放大
          </>
        ) : (
          <>
            <br />
            · 盈利分级（全店相对，仅已配置成本且有销量的SKU参与排名）：单品利润&lt;0→亏损；利润率&lt;P25→偏低；P25~P75→正常；≥P75→优质；未填成本→未配置
            <br />
            · 动销分级（同商品ID内按销量占比）：占比≥40%或Top1且≥20%→主力；&lt;5%→滞销；零销量→零销；其余→动销
            <br />
            · 组合判定：优质×主力→明星款 · 优质×动销→潜力款 · 优质×滞销→提曝光 · 正常×主力→现金牛 · 正常×动销→维持 · 偏低×主力→降本提价 · 偏低×滞销→精简 · 亏损×主力→止损 · 亏损×其余→清仓 · 零销→清退 · 悬浮徽章可看判定依据
            <br />
            · ROI 与推广判定（停推广/降预算/可放大）基于单品级推广费投放，仅在「单品明细」维度评估
          </>
        )}
      </div>

      {/* 检索 / 排序 */}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={dimension === 'sku' ? '搜索款号，如 MY8857' : '搜索商品名称或商品ID'}
            className="pl-9 pr-8 py-1.5 w-64 bg-white border border-slate-300 rounded-md text-[13px] text-slate-700 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
          {keyword && (
            <button
              type="button"
              onClick={() => setKeyword('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              title="清除"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="pl-8 pr-6 py-1.5 bg-white border border-slate-300 rounded-md text-[13px] text-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 appearance-none cursor-pointer"
            >
              {availableSortOptions.map(opt => (
                <option key={opt.value} value={opt.value} className="bg-slate-100">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <span className="text-[13px] text-slate-400">向下滚动自动加载全部款号</span>
        </div>
      </div>

      {/* 表格 */}
      <div className="overflow-auto rounded-lg border border-slate-200">
        <div className="max-h-[360px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-100">
                {renderHeader(dimension === 'sku' ? '款号' : '单品', 'left', dimension === 'sku' ? '款号 / 规格' : '商品名称 / 商品ID')}
                {renderHeader('销售额', 'right', '有效订单商家实收合计')}
                {renderHeader('退款金额', 'right', '退款成功订单的商家实收金额')}
                {renderHeader('订单数', 'right')}
                {renderHeader('客单价', 'right', '销售额 ÷ 订单数')}
                {renderHeader('订单退款率', 'right', '退款金额 ÷ 销售额 × 100')}
                {isProduct && renderHeader('推广费', 'right', '分摊推广费')}
                {isProduct && renderHeader('净推广占比', 'right', '分摊推广费 ÷ 净销售额 × 100')}
                {renderHeader('补偿', 'right', '该款补偿金额')}
                {renderHeader('成本', 'right', '商品成本 = 成本单价 × 销量')}
                {renderHeader('单品毛利', 'right', '净销售额 - 成本')}
                {renderHeader('实际毛利率', 'right', '单品毛利 ÷ 净销售额 × 100')}
                {renderHeader('单品利润', 'right', '单品毛利 - 快递 - 运费险 - 扣点 - 推广费 - 补偿')}
                {isProduct && renderHeader('实际保ROI', 'right', '净销售额 ÷ (单品利润 + 推广费)')}
                {isProduct && renderHeader('实际ROI', 'right', '净销售额 ÷ 分摊推广费')}
                {renderHeader('判定', 'center', isProduct ? '单品利润<0（亏损品）→ 利润门强制停推广；否则实际ROI 对比实际保本ROI' : '盈利（全店利润率分位 P25/P75，仅已配置成本的SKU排名）× 动销（商品内销量占比）组合判定，悬浮查看依据')}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {displayRows.map((row, idx) => (
                <tr key={`${row.商品ID}-${row.款号}-${idx}`} className="hover:bg-slate-50 transition-colors duration-150">
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <div className="text-[13px] font-semibold text-slate-900 max-w-[220px] truncate" title={row.款号}>
                      {row.款号}
                    </div>
                    {row.商品ID && (
                      <div className="text-[13px] text-slate-400 font-mono truncate max-w-[220px]">{row.商品ID}</div>
                    )}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-right text-[13px] text-slate-700 font-mono">{money(row.销售额)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-right text-[13px] text-slate-500 font-mono">{money(row.退款金额)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-right text-[13px] text-slate-700 font-mono">{formatNumber(row.订单数)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-right text-[13px] text-slate-700 font-mono">{money(row.客单价)}</td>
                  <td className={`px-3 py-1.5 whitespace-nowrap text-right text-[13px] font-mono ${
                    row.订单退款率 >= 30 ? 'text-red-600' : row.订单退款率 >= 15 ? 'text-amber-600' : 'text-slate-600'
                  }`}>
                    {row.订单退款率.toFixed(1)}%
                  </td>
                  {isProduct && (
                    <>
                      <td className="px-3 py-1.5 whitespace-nowrap text-right text-[13px] text-slate-700 font-mono">
                        {row.推广费 > 0 ? money(row.推广费) : '—'}
                      </td>
                      <td className={`px-3 py-1.5 whitespace-nowrap text-right text-[13px] font-mono ${
                        row.净推广占比 > 40 ? 'text-red-600' : row.净推广占比 > 25 ? 'text-amber-600' : 'text-slate-600'
                      }`}>
                        {row.推广费 > 0 ? `${row.净推广占比.toFixed(1)}%` : '—'}
                      </td>
                    </>
                  )}
                  <td className="px-3 py-1.5 whitespace-nowrap text-right text-[13px] text-slate-500 font-mono">
                    {row.补偿 > 0 ? money(row.补偿) : '—'}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-right text-[13px] text-slate-700 font-mono">{money(row.成本)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-right text-[13px] text-slate-700 font-mono">{money(row.单品毛利)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-right text-[13px] text-slate-500 font-mono">
                    {row.实际毛利率.toFixed(1)}%
                  </td>
                  <td className={`px-3 py-1.5 whitespace-nowrap text-right text-[13px] font-semibold font-mono ${
                    row.单品利润 >= 0 ? 'text-emerald-600' : 'text-red-600'
                  }`}>
                    {row.单品利润 >= 0 ? '+' : ''}{money(row.单品利润)}
                  </td>
                  {isProduct && (
                    <>
                      <td className="px-3 py-1.5 whitespace-nowrap text-right text-[13px] text-slate-500 font-mono">
                        {row.推广费 > 0 ? row.实际保ROI.toFixed(2) : '—'}
                      </td>
                      <td className={`px-3 py-1.5 whitespace-nowrap text-right text-[13px] font-mono ${
                        row.推广费 > 0 && row.实际ROI >= row.实际保ROI ? 'text-emerald-600' : 'text-slate-600'
                      }`}>
                        {row.推广费 > 0 ? row.实际ROI.toFixed(2) : '—'}
                      </td>
                    </>
                  )}
                  <td className="px-3 py-1.5 whitespace-nowrap text-center">
                    <span
                      title={row.判定依据}
                      className={`inline-block px-2 py-0.5 rounded text-[13px] font-medium ${verdictClass[row.判定]}`}
                    >
                      {row.判定}
                    </span>
                  </td>
                </tr>
              ))}

              {displayRows.length === 0 && (
                <tr>
                  <td colSpan={isProduct ? 16 : 12} className="px-3 py-6 text-center text-[13px] text-slate-400">
                    暂无数据，请先导入销售与推广数据并配置成本
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 底部图例 */}
      <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-[13px] text-slate-400 flex-wrap gap-2">
        <div>
          共 {displayRows.length} {dimension === 'sku' ? '个SKU' : '个单品'}
          {keyword ? `（筛选自 ${rows.length} ${dimension === 'sku' ? '个SKU' : '个单品'}）` : ''}
        </div>
        {isProduct ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-1.5 rounded-full bg-red-500"></span>停推广
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-1.5 rounded-full bg-amber-500"></span>降预算
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-1.5 rounded-full bg-emerald-500"></span>可放大
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-1.5 rounded-full bg-slate-300"></span>无推广
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-emerald-500"></span>明星款</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-emerald-500"></span>潜力款</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-emerald-500"></span>提曝光</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-emerald-500"></span>现金牛</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-slate-300"></span>维持/观察</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-amber-500"></span>降本提价</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-amber-500"></span>精简</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-red-500"></span>止损/清仓</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-slate-400"></span>清退</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-slate-200"></span>未配置</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default SkuDetail;
