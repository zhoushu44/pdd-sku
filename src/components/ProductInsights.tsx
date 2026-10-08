import React, { useMemo, useState } from 'react';
import { Layers, Target, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import type { OrderData, ProductSummary, DetailedCostConfig, MarketingDataRow, SkuVerdict } from '../types';
import { calculateSkuDetail } from '../utils/dataProcessor';
import { formatAmount, formatNumber } from '../lib/utils';

interface ProductInsightsProps {
  /** SKU（规格）维度汇总（已应用成本配置） */
  skuSummaries: ProductSummary[];
  marketingData: MarketingDataRow[];
  costConfig: DetailedCostConfig;
  orders: OrderData[];
}

// 判定徽章样式（深色主题实底，与单品明细一致；本组件仅使用单品维度推广判定，其余键为类型完整性补充）
const verdictClass: Record<SkuVerdict, string> = {
  停推广: 'bg-red-500 text-white',
  降预算: 'bg-amber-500 text-white',
  可放大: 'bg-emerald-500 text-white',
  无推广: 'bg-slate-200 text-slate-600',
  明星款: 'bg-emerald-500 text-white',
  潜力款: 'bg-teal-500 text-white',
  提曝光: 'bg-cyan-500 text-white',
  现金牛: 'bg-sky-500 text-white',
  维持: 'bg-slate-300 text-slate-700',
  观察: 'bg-slate-200 text-slate-600',
  降本提价: 'bg-amber-500 text-white',
  精简: 'bg-orange-500 text-white',
  止损: 'bg-red-600 text-white',
  清仓: 'bg-red-500 text-white',
  清退: 'bg-slate-400 text-white',
  未配置: 'bg-slate-100 text-slate-400 border border-slate-300',
};

/**
 * 单品维度专属洞察：
 * 1) SKU结构健康度：SKU数、头部集中度、陪跑/零销量SKU
 * 2) 商品推广决策 + 下钻SKU明细
 */
const ProductInsights: React.FC<ProductInsightsProps> = ({
  skuSummaries,
  marketingData,
  costConfig,
  orders,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // SKU 结构：按商品ID分组
  const structure = useMemo(() => {
    const map = new Map<string, ProductSummary[]>();
    skuSummaries.forEach(s => {
      const key = s.商品ID || s.商品名称 || s.规格;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    return Array.from(map.entries())
      .map(([id, skus]) => {
        const 销售额 = skus.reduce((a, s) => a + s.销售额, 0);
        const sorted = [...skus].sort((a, b) => b.销售额 - a.销售额);
        const top = sorted[0];
        const 陪跑SKU = skus.filter(s => s.销售额 > 0 && s.净利润 <= 0).length;
        const 零销量SKU = skus.filter(s => s.销量 === 0).length;
        const 头部占比 = 销售额 > 0 ? (top.销售额 / 销售额) * 100 : 0;
        return {
          id,
          名称: skus[0].商品名称 || id,
          sku数: skus.length,
          头部SKU: top.规格,
          头部占比,
          陪跑SKU,
          零销量SKU,
          销售额,
          skus: sorted,
        };
      })
      .sort((a, b) => b.销售额 - a.销售额);
  }, [skuSummaries]);

  // 商品推广决策（复用单品明细计算，维度=product）
  const { rows: decisionRows } = useMemo(
    () => calculateSkuDetail(skuSummaries, marketingData, costConfig, orders, 'product'),
    [skuSummaries, marketingData, costConfig, orders]
  );
  const decisionMap = useMemo(() => {
    const m = new Map<string, (typeof decisionRows)[number]>();
    decisionRows.forEach(r => m.set(r.商品ID || r.款号, r));
    return m;
  }, [decisionRows]);

  return (
    <div className="space-y-6">
      {/* SKU结构健康度 */}
      <div className="bg-white rounded-xl p-6 border border-slate-200">
        <div className="flex items-center gap-3 mb-6">
          <Layers className="w-5 h-5 text-cyan-600" />
          <h3 className="text-base font-semibold text-slate-900">SKU结构健康度</h3>
          <span className="text-[13px] text-slate-500">
            （头部集中度 / 陪跑SKU = 有销量但不赚钱 / 零销量SKU = 占坑未出单）
          </span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100">
                <th className="px-3 py-2.5 text-left text-[13px] font-medium text-slate-500">商品</th>
                <th className="px-3 py-2.5 text-right text-[13px] font-medium text-slate-500">SKU数</th>
                <th className="px-3 py-2.5 text-left text-[13px] font-medium text-slate-500">头部SKU</th>
                <th className="px-3 py-2.5 text-right text-[13px] font-medium text-slate-500">头部占比</th>
                <th className="px-3 py-2.5 text-right text-[13px] font-medium text-slate-500">陪跑SKU</th>
                <th className="px-3 py-2.5 text-right text-[13px] font-medium text-slate-500">零销量SKU</th>
                <th className="px-3 py-2.5 text-left text-[13px] font-medium text-slate-500">结构评价</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {structure.length > 0 ? (
                structure.map(item => {
                  const 评价 =
                    item.头部占比 >= 80 && item.sku数 > 1
                      ? { text: '过度依赖头部，建议培养第二梯队', color: 'text-amber-600 bg-amber-50 border-amber-200' }
                      : item.陪跑SKU + item.零销量SKU >= item.sku数
                      ? { text: '多数SKU无效，建议精简', color: 'text-red-600 bg-red-50 border-red-200' }
                      : item.sku数 === 1
                      ? { text: '单品单SKU，可考虑扩展规格', color: 'text-slate-600 bg-slate-100 border-slate-200' }
                      : { text: '结构均衡', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' };
                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2.5 text-[13px] text-slate-700 max-w-[220px] truncate" title={item.名称}>
                        {item.名称}
                        <div className="text-[13px] text-slate-400 font-mono truncate max-w-[220px]">{item.id}</div>
                      </td>
                      <td className="px-3 py-2.5 text-[13px] text-slate-700 text-right font-mono">{item.sku数}</td>
                      <td className="px-3 py-2.5 text-[13px] text-slate-600 max-w-[160px] truncate" title={item.头部SKU}>
                        {item.头部SKU}
                      </td>
                      <td className={`px-3 py-2.5 text-[13px] text-right font-mono ${item.头部占比 >= 80 ? 'text-amber-600' : 'text-slate-600'}`}>
                        {item.头部占比.toFixed(1)}%
                      </td>
                      <td className={`px-3 py-2.5 text-[13px] text-right font-mono ${item.陪跑SKU > 0 ? 'text-orange-600' : 'text-slate-400'}`}>
                        {item.陪跑SKU}
                      </td>
                      <td className={`px-3 py-2.5 text-[13px] text-right font-mono ${item.零销量SKU > 0 ? 'text-slate-500' : 'text-slate-400'}`}>
                        {item.零销量SKU}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[13px] font-medium border ${评价.color}`}>
                          {评价.text}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 text-[13px]">暂无数据</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 商品推广决策 + 下钻 */}
      <div className="bg-white rounded-xl p-6 border border-slate-200">
        <div className="flex items-center gap-3 mb-6">
          <Target className="w-5 h-5 text-emerald-600" />
          <h3 className="text-base font-semibold text-slate-900">商品推广决策</h3>
          <span className="text-[13px] text-slate-500">（点击行展开查看该商品下各SKU贡献）</span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100">
                <th className="px-3 py-2.5 text-left text-[13px] font-medium text-slate-500">商品</th>
                <th className="px-3 py-2.5 text-right text-[13px] font-medium text-slate-500">推广费</th>
                <th className="px-3 py-2.5 text-right text-[13px] font-medium text-slate-500">净推广占比</th>
                <th className="px-3 py-2.5 text-right text-[13px] font-medium text-slate-500">单品利润</th>
                <th className="px-3 py-2.5 text-right text-[13px] font-medium text-slate-500">实际ROI</th>
                <th className="px-3 py-2.5 text-right text-[13px] font-medium text-slate-500">实际保ROI</th>
                <th className="px-3 py-2.5 text-center text-[13px] font-medium text-slate-500">判定</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {structure.length > 0 ? (
                structure.map(item => {
                  const row = decisionMap.get(item.id);
                  const isOpen = expandedId === item.id;
                  return (
                    <React.Fragment key={item.id}>
                      <tr
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => setExpandedId(isOpen ? null : item.id)}
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            {isOpen ? (
                              <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="text-[13px] text-slate-700 max-w-[200px] truncate" title={item.名称}>{item.名称}</div>
                              <div className="text-[13px] text-slate-400 font-mono truncate max-w-[200px]">{item.id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-[13px] text-slate-700 text-right font-mono">
                          {row && row.推广费 > 0 ? formatAmount(row.推广费) : '—'}
                        </td>
                        <td className={`px-3 py-2.5 text-[13px] text-right font-mono ${
                          row && row.净推广占比 > 40 ? 'text-red-600' : row && row.净推广占比 > 25 ? 'text-amber-600' : 'text-slate-600'
                        }`}>
                          {row && row.推广费 > 0 ? `${row.净推广占比.toFixed(1)}%` : '—'}
                        </td>
                        <td className={`px-3 py-2.5 text-[13px] text-right font-semibold font-mono ${
                          row && row.单品利润 >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}>
                          {row ? `${row.单品利润 >= 0 ? '+' : ''}${formatAmount(row.单品利润)}` : '—'}
                        </td>
                        <td className={`px-3 py-2.5 text-[13px] text-right font-mono ${
                          row && row.推广费 > 0 && row.实际ROI >= row.实际保ROI ? 'text-emerald-600' : 'text-slate-600'
                        }`}>
                          {row && row.推广费 > 0 ? row.实际ROI.toFixed(2) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-[13px] text-slate-500 text-right font-mono">
                          {row && row.推广费 > 0 ? row.实际保ROI.toFixed(2) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {row ? (
                            <span className={`inline-block px-2 py-0.5 rounded text-[13px] font-medium ${verdictClass[row.判定]}`}>
                              {row.判定}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[13px]">—</span>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-slate-50/40">
                          <td colSpan={7} className="px-3 py-3">
                            <div className="rounded-lg border border-slate-200 overflow-hidden">
                              <table className="w-full">
                                <thead>
                                  <tr className="bg-slate-100/40">
                                    <th className="px-3 py-2 text-left text-[13px] font-medium text-slate-400">SKU规格</th>
                                    <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-400">销售额</th>
                                    <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-400">销量</th>
                                    <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-400">净利润</th>
                                    <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-400">利润率</th>
                                    <th className="px-3 py-2 text-right text-[13px] font-medium text-slate-400">销售额占比</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {item.skus.map(sku => {
                                    const 占比 = item.销售额 > 0 ? (sku.销售额 / item.销售额) * 100 : 0;
                                    return (
                                      <tr key={sku.规格} className="hover:bg-slate-50">
                                        <td className="px-3 py-2 text-[13px] text-slate-600 max-w-[240px] truncate" title={sku.规格}>
                                          {sku.规格}
                                        </td>
                                        <td className="px-3 py-2 text-[13px] text-slate-700 text-right font-mono">{formatAmount(sku.销售额)}</td>
                                        <td className="px-3 py-2 text-[13px] text-slate-700 text-right font-mono">{formatNumber(sku.销量)}</td>
                                        <td className={`px-3 py-2 text-[13px] text-right font-mono ${sku.净利润 >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                          {sku.净利润 >= 0 ? '+' : ''}{formatAmount(sku.净利润)}
                                        </td>
                                        <td className={`px-3 py-2 text-[13px] text-right font-mono ${sku.利润率 >= 0 ? 'text-slate-600' : 'text-red-600'}`}>
                                          {sku.利润率.toFixed(2)}%
                                        </td>
                                        <td className="px-3 py-2 text-[13px] text-slate-500 text-right font-mono">{占比.toFixed(1)}%</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 text-[13px]">暂无数据</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 pt-3 border-t border-slate-200 flex items-center gap-2 text-[13px] text-slate-400">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
          <span>判定规则：实际ROI 低于保本ROI → 停推广；保本ROI~1.2倍 → 降预算；1.2倍以上 → 可放大。</span>
        </div>
      </div>
    </div>
  );
};

export default ProductInsights;
