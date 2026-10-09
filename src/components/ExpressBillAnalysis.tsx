import React, { useMemo, useState } from 'react';
import { Truck, Wallet, PackageCheck, Percent, CheckCircle2, AlertCircle, Upload, Trash2 } from 'lucide-react';
import { OrderData, DetailedCostConfig, ExpressBillRecord, ExpressBillAmountBasis, SkuShippingFee } from '../types';
import { matchExpressBill } from '../utils/dataProcessor';
import { formatAmount, formatNumber } from '../lib/utils';

interface ExpressBillAnalysisProps {
  billRecords: ExpressBillRecord[];
  orders: OrderData[];
  costConfig: DetailedCostConfig;
  onCostChange: (config: DetailedCostConfig) => void;
  onClearBill: () => void;
  fileName: string;
}

const ExpressBillAnalysis: React.FC<ExpressBillAnalysisProps> = ({
  billRecords,
  orders,
  costConfig,
  onCostChange,
  onClearBill,
  fileName,
}) => {
  // 成本口径：应付（实付现金，默认） / 总金额（面单运费）
  const [basis, setBasis] = useState<ExpressBillAmountBasis>('payable');
  // 仅显示已匹配的规格
  const [onlyMatched, setOnlyMatched] = useState(true);

  const result = useMemo(
    () => matchExpressBill(billRecords, orders, basis, fileName),
    [billRecords, orders, basis, fileName]
  );

  const { 汇总, 按规格, 匹配运单数, 未匹配运单数, 匹配率 } = result;

  // 展示行：过滤 + 已匹配优先
  const rows = useMemo(() => {
    const list = onlyMatched ? 按规格.filter(r => r.匹配运单数 > 0) : 按规格;
    return list;
  }, [按规格, onlyMatched]);

  // 已匹配（含运单数>0）的规格数
  const matchedSkuCount = useMemo(() => 按规格.filter(r => r.匹配运单数 > 0).length, [按规格]);

  // 回填：把单件快递费写入成本配置并开启「启用快递费」
  const applyFees = (targets: SkuShippingFee[]) => {
    const valid = targets.filter(r => r.匹配运单数 > 0 && r.平均快递费 > 0);
    if (valid.length === 0) {
      alert('没有可回填的规格（需匹配到账单运单且单件快递费大于 0）');
      return;
    }
    const next: DetailedCostConfig = { ...costConfig };
    for (const row of valid) {
      const existing = next[row.规格] || { 成本单价: 0 };
      next[row.规格] = { ...existing, 快递费: row.平均快递费, 启用快递费: true };
    }
    onCostChange(next);
  };

  const handleApplyAll = () => {
    if (!confirm(`将把 ${matchedSkuCount} 个已匹配规格的单件快递费批量回填到成本配置，并开启「启用快递费」。是否继续？`)) return;
    applyFees(按规格.filter(r => r.匹配运单数 > 0));
  };

  const handleClear = () => {
    if (!confirm('确定清空已导入的快递对账账单吗？成本配置不受影响。')) return;
    onClearBill();
  };

  if (billRecords.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <Upload className="w-12 h-12 text-slate-300 mx-auto mb-2" />
        <h2 className="text-[13px] font-semibold text-slate-700 mb-2">尚未导入快递对账账单</h2>
        <p className="text-[13px] text-slate-500 leading-relaxed">
          请点击顶部「上传快递账单」，导入快递公司的对账单（Excel/CSV）。
          <br />
          系统将按运单号匹配订单，自动汇总各 SKU 的单件快递费并核算总快递成本。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 概览卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <div className="flex items-center gap-2 text-slate-500 text-[13px] mb-1">
            <Wallet className="w-4 h-4" />
            总应付（实付）
          </div>
          <div className="text-[16px] font-bold text-slate-900">{formatAmount(汇总.总应付)}</div>
          <div className="text-[12px] text-slate-400 mt-1">面单金额 {formatAmount(汇总.总金额)}</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <div className="flex items-center gap-2 text-slate-500 text-[13px] mb-1">
            <Truck className="w-4 h-4" />
            账单运单数
          </div>
          <div className="text-[16px] font-bold text-slate-900">{formatNumber(汇总.总运单数)}</div>
          <div className="text-[12px] text-slate-400 mt-1">运单笔数（去重后）</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <div className="flex items-center gap-2 text-slate-500 text-[13px] mb-1">
            <PackageCheck className="w-4 h-4" />
            单件均值
          </div>
          <div className="text-[16px] font-bold text-slate-900">{formatAmount(汇总.平均单件金额)}</div>
          <div className="text-[12px] text-slate-400 mt-1">按{ basis === 'payable' ? '应付' : '总金额' }口径</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <div className="flex items-center gap-2 text-slate-500 text-[13px] mb-1">
            <Percent className="w-4 h-4" />
            运单匹配率
          </div>
          <div className={`text-[16px] font-bold ${匹配率 >= 60 ? 'text-emerald-600' : 'text-amber-600'}`}>{匹配率.toFixed(1)}%</div>
          <div className="text-[12px] text-slate-400 mt-1">已匹配 {formatNumber(匹配运单数)} · 未匹配 {formatNumber(未匹配运单数)}</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <div className="flex items-center gap-2 text-slate-500 text-[13px] mb-1">
            <CheckCircle2 className="w-4 h-4" />
            已匹配规格
          </div>
          <div className="text-[16px] font-bold text-emerald-600">{formatNumber(matchedSkuCount)}</div>
          <div className="text-[12px] text-slate-400 mt-1">共 {formatNumber(按规格.length)} 个规格</div>
        </div>
      </div>

      {/* 未匹配提示 */}
      {未匹配运单数 > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-[13px] text-amber-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            有 {formatNumber(未匹配运单数)} 个运单未在订单中找到对应的「快递单号」。可能是订单未上传、时间范围不符，或运单号格式差异。
            未匹配运单仍计入上方「总应付」总额，但不会参与 SKU 快递费回填。
          </div>
        </div>
      )}

      {/* 操作栏 */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] text-slate-500">成本口径</span>
          <div className="flex rounded-lg border border-slate-300 overflow-hidden">
            {([
              { value: 'payable', label: '应付（实付）' },
              { value: 'gross', label: '总金额（面单）' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => setBasis(opt.value)}
                className={`px-3 py-1.5 text-[13px] transition-colors ${
                  basis === opt.value ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1.5 text-[13px] text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyMatched}
              onChange={e => setOnlyMatched(e.target.checked)}
              className="rounded border-slate-300"
            />
            仅显示已匹配
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleApplyAll}
            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[13px] transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" />
            一键回填全部快递费
          </button>
          <button
            onClick={handleClear}
            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-red-300 hover:bg-red-50 text-red-600 rounded-lg text-[13px] transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            清空账单
          </button>
        </div>
      </div>

      {/* SKU 快递费明细 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-slate-700">按 SKU 快递费汇总</h3>
          <span className="text-[12px] text-slate-400">单件快递费 = 匹配账单金额合计 ÷ 匹配商品件数（回填后「单件 × 销量 ≈ 实际账单」）</span>
        </div>
        <div className="overflow-auto max-h-[360px]">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 z-10 bg-slate-100 text-slate-500 text-[12px]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">规格</th>
                <th className="px-3 py-2 text-left font-medium">商品ID</th>
                <th className="px-3 py-2 text-right font-medium">匹配/订单</th>
                <th className="px-3 py-2 text-right font-medium">匹配件数</th>
                <th className="px-3 py-2 text-right font-medium">单件快递费</th>
                <th className="px-3 py-2 text-right font-medium">快递费合计</th>
                <th className="px-3 py-2 text-center font-medium">回填状态</th>
                <th className="px-3 py-2 text-center font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                    没有可展示的规格{onlyMatched ? '（取消「仅显示已匹配」可查看全部）' : ''}
                  </td>
                </tr>
              ) : (
                rows.map(row => {
                  const currentFee = costConfig[row.规格]?.快递费 || 0;
                  const enabled = !!costConfig[row.规格]?.启用快递费;
                  const applied = enabled && Math.abs(currentFee - row.平均快递费) < 0.005;
                  const canApply = row.匹配运单数 > 0 && row.平均快递费 > 0;
                  return (
                    <tr key={row.规格} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-1.5 text-slate-800 max-w-[280px] truncate" title={row.规格}>{row.规格}</td>
                      <td className="px-3 py-1.5 text-slate-500">{row.商品ID || '-'}</td>
                      <td className="px-3 py-1.5 text-right text-slate-700">
                        {formatNumber(row.匹配运单数)}/{formatNumber(row.订单数)}
                        <span className="text-slate-400 text-[12px] ml-1">({row.匹配率.toFixed(0)}%)</span>
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-700">{formatNumber(row.匹配件数)}</td>
                      <td className="px-3 py-1.5 text-right font-medium text-slate-900">{formatAmount(row.平均快递费)}</td>
                      <td className="px-3 py-1.5 text-right text-slate-700">{formatAmount(row.快递费合计)}</td>
                      <td className="px-3 py-1.5 text-center">
                        {applied ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <CheckCircle2 className="w-3.5 h-3.5" />已回填
                          </span>
                        ) : (
                          <span className="text-slate-400">{enabled ? `当前 ${formatAmount(currentFee)}` : '未启用'}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <button
                          disabled={!canApply}
                          onClick={() => applyFees([row])}
                          className={`px-3 py-1 rounded-md text-[12px] transition-colors ${
                            canApply
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                              : 'bg-slate-50 text-slate-300 border border-slate-200 cursor-not-allowed'
                          }`}
                        >
                          回填
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ExpressBillAnalysis;
