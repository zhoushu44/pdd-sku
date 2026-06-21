import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calculator,
  Save,
  X,
  Package,
  Truck,
  Shield,
  Percent,
  DollarSign,
  ToggleLeft,
  ToggleRight,
  Check,
  Copy,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { ProductSummary, DetailedCostConfig, CostItem } from '../types';
import { formatMoney } from '../lib/utils';

interface CostInputPanelProps {
  productSummaries: ProductSummary[];
  onCostChange: (costConfig: DetailedCostConfig) => void;
}

const STORAGE_KEY = 'detailedCostConfig';

const defaultCostItem: CostItem = {
  成本单价: 0,
  定价: 0,
  商家承担优惠: 0,
  快递费: 0,
  包装耗材: 0,
  运费险: 0,
  退款率: 0,
  启用快递费: false,
  启用包装耗材: false,
  启用运费险: false,
  启用退款率: false,
};

const cloneCostItem = (item?: CostItem): CostItem => ({
  ...defaultCostItem,
  ...item,
});

const CostInputPanel: React.FC<CostInputPanelProps> = ({
  productSummaries,
  onCostChange,
}) => {
  const [costConfig, setCostConfig] = useState<DetailedCostConfig>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSpec, setEditingSpec] = useState<string>('');
  const [tempCostItem, setTempCostItem] = useState<CostItem>(cloneCostItem());
  const [batchSourceSpec, setBatchSourceSpec] = useState<string>('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [sortField, setSortField] = useState<'净利润' | '利润率' | '保本投产' | null>(null);
  const [targetProfitRate, setTargetProfitRate] = useState<number>(20);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem(STORAGE_KEY);
      if (savedConfig) {
        const parsedConfig: DetailedCostConfig = JSON.parse(savedConfig);
        setCostConfig(parsedConfig);
        onCostChange(parsedConfig);
      }
    } catch (error) {
      console.error('加载成本配置失败:', error);
    }
  }, [onCostChange]);

  const saveToLocalStorage = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(costConfig));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error('保存成本配置失败:', error);
    }
  }, [costConfig]);

  const openEditModal = useCallback((spec: string) => {
    setEditingSpec(spec);
    setTempCostItem(cloneCostItem(costConfig[spec]));
    setModalOpen(true);
  }, [costConfig]);

  const closeModal = () => {
    setModalOpen(false);
    setEditingSpec('');
    setTempCostItem(cloneCostItem());
  };

  const saveAndClose = useCallback(() => {
    const newConfig = { ...costConfig, [editingSpec]: tempCostItem };
    setCostConfig(newConfig);
    onCostChange(newConfig);
    saveToLocalStorage();
    closeModal();
  }, [costConfig, editingSpec, tempCostItem, onCostChange, saveToLocalStorage]);

  const updateTempField = <K extends keyof CostItem>(field: K, value: CostItem[K]) => {
    setTempCostItem((prev) => ({ ...prev, [field]: value }));
  };

  const toggleSwitch = (field: '启用快递费' | '启用包装耗材' | '启用运费险' | '启用退款率') => {
    setTempCostItem((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const calculateSpecSummary = useMemo(() => {
    return (spec: string) => {
      const product = productSummaries.find((p) => p.规格 === spec);
      if (!product) return null;
      const costItem = costConfig[spec];
      if (!costItem || !costItem.成本单价) return null;

      const 定价 = costItem.定价 || 0;
      if (定价 <= 0) return null;

      // 单件利润计算（不涉及销量）
      const 单件商品成本 = costItem.成本单价;
      // 平台技术服务费 = 定价 × 0.6%
      const 平台技术服务费 = 定价 * 0.006;

      let 可选成本总和 = 0;
      if (costItem.商家承担优惠) 可选成本总和 += costItem.商家承担优惠;
      if (costItem.启用快递费 && costItem.快递费) 可选成本总和 += costItem.快递费;
      if (costItem.启用包装耗材 && costItem.包装耗材) 可选成本总和 += costItem.包装耗材;
      if (costItem.启用运费险 && costItem.运费险) 可选成本总和 += costItem.运费险;

      const 单件总成本 = 单件商品成本 + 平台技术服务费 + 可选成本总和;
      // 退款率优先级：用户启用 → 用户值；否则 → 真实退款率（自动回用）
      const effectiveRefundRate = costItem.启用退款率 ? (costItem.退款率 || 0) : (product.真实退款率 || 0);
      // 预估退款损失 = 退款收入损失 + 退回运费损失（退回运费 = 发送快递费）
      const 单件退款收入损失 = effectiveRefundRate > 0 ? 定价 * (effectiveRefundRate / 100) : 0;
      const 单件退回运费损失 = costItem.启用快递费 && costItem.快递费 ? costItem.快递费 * (effectiveRefundRate / 100) : 0;
      const 预估退款损失 = 单件退款收入损失 + 单件退回运费损失;
      // 单件净利润
      const 净利润 = 定价 - 单件总成本 - 预估退款损失;
      const 利润率 = (净利润 / 定价) * 100;

      // 保本投产 = 定价 / 单件净利润（含退款损失）
      // 行业公式：ROI达标门槛 = 1 / (净利率)，即定价 / 净利润
      let 保本投产: number | null = null;
      if (净利润 > 0) {
        保本投产 = 定价 / 净利润;
      }

      return { 单件商品成本, 平台技术服务费, 可选成本总和, 单件总成本, 预估退款损失, 净利润, 利润率, 定价, 保本投产, effectiveRefundRate, 真实退款率: product.真实退款率, 单件退回运费损失 };
    };
  }, [productSummaries, costConfig]);

  const modalPreviewData = useMemo(() => {
    if (!editingSpec || !tempCostItem.成本单价) return null;
    const product = productSummaries.find((p) => p.规格 === editingSpec);
    if (!product) return null;

    const 定价 = tempCostItem.定价 || 0;
    if (定价 <= 0) return null;

    // 单件利润计算（不涉及销量）
    const 单件商品成本 = tempCostItem.成本单价;
    // 平台技术服务费 = 定价 × 0.6%
    const 平台技术服务费 = 定价 * 0.006;

    let 可选成本总和 = 0;
    if (tempCostItem.商家承担优惠) 可选成本总和 += tempCostItem.商家承担优惠;
    if (tempCostItem.启用快递费 && tempCostItem.快递费) 可选成本总和 += tempCostItem.快递费;
    if (tempCostItem.启用包装耗材 && tempCostItem.包装耗材) 可选成本总和 += tempCostItem.包装耗材;
    if (tempCostItem.启用运费险 && tempCostItem.运费险) 可选成本总和 += tempCostItem.运费险;

    const 单件总成本 = 单件商品成本 + 平台技术服务费 + 可选成本总和;
    // 退款率优先级：用户启用 → 用户值；否则 → 真实退款率（自动回用）
    const effectiveRefundRate = tempCostItem.启用退款率 ? (tempCostItem.退款率 || 0) : (product.真实退款率 || 0);
    // 预估退款损失 = 退款收入损失 + 退回运费损失（退回运费 = 发送快递费）
    const 单件退款收入损失 = effectiveRefundRate > 0 ? 定价 * (effectiveRefundRate / 100) : 0;
    const 单件退回运费损失 = tempCostItem.启用快递费 && tempCostItem.快递费 ? tempCostItem.快递费 * (effectiveRefundRate / 100) : 0;
    const 预估退款损失 = 单件退款收入损失 + 单件退回运费损失;
    // 单件净利润
    const 净利润 = 定价 - 单件总成本 - 预估退款损失;
    const 利润率 = (净利润 / 定价) * 100;

    // 保本投产 = 定价 / 单件净利润（含退款损失）
    let 保本投产: number | null = null;
    if (净利润 > 0) {
      保本投产 = 定价 / 净利润;
    }

    return { 单件商品成本, 平台技术服务费, 可选成本总和, 单件总成本, 预估退款损失, 净利润, 利润率, 定价, 保本投产, effectiveRefundRate, 真实退款率: product.真实退款率, 单件退回运费损失 };
  }, [editingSpec, tempCostItem, productSummaries]);

  const handleBatchApply = () => {
    if (!batchSourceSpec || !costConfig[batchSourceSpec]) return;
    const sourceConfig = costConfig[batchSourceSpec];
    const newConfig: DetailedCostConfig = {};
    productSummaries.forEach((item) => {
      newConfig[item.规格] = cloneCostItem(sourceConfig);
    });
    setCostConfig(newConfig);
    onCostChange(newConfig);
    saveToLocalStorage();
    setBatchSourceSpec('');
  };

  // 内联修改定价（不弹窗）
  const handlePriceInlineChange = (spec: string, price: number) => {
    const existingItem = costConfig[spec] || cloneCostItem();
    const newConfig: DetailedCostConfig = {
      ...costConfig,
      [spec]: { ...existingItem, 定价: price },
    };
    setCostConfig(newConfig);
    onCostChange(newConfig);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
    } catch (error) {
      console.error('保存定价失败:', error);
    }
  };

  const getProfitRateClass = (rate: number): string => {
    if (rate > 0) return 'text-green-400 bg-green-500/10';
    if (rate < 0) return 'text-red-400 bg-red-500/10';
    return 'text-gray-400 bg-gray-500/10';
  };

  // 切换排序
  const handleSort = (field: '净利润' | '利润率' | '保本投产') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // 排序后的列表
  const sortedSummaries = useMemo(() => {
    if (!sortField) return productSummaries;
    const sorted = [...productSummaries];
    sorted.sort((a, b) => {
      const sa = calculateSpecSummary(a.规格);
      const sb = calculateSpecSummary(b.规格);
      let va = 0, vb = 0;
      if (sortField === '净利润') {
        va = sa?.净利润 ?? 0;
        vb = sb?.净利润 ?? 0;
      } else if (sortField === '利润率') {
        va = sa?.利润率 ?? 0;
        vb = sb?.利润率 ?? 0;
      } else if (sortField === '保本投产') {
        va = sa?.保本投产 ?? -1;
        vb = sb?.保本投产 ?? -1;
      }
      return sortDirection === 'asc' ? va - vb : vb - va;
    });
    return sorted;
  }, [productSummaries, sortField, sortDirection, calculateSpecSummary]);

  // 排序图标
  const getSortIcon = (field: '净利润' | '利润率' | '保本投产') => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-40" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="w-3 h-3 inline ml-1 text-blue-400" />
      : <ArrowDown className="w-3 h-3 inline ml-1 text-blue-400" />;
  };

  return (
    <div className="bg-slate-900 rounded-lg shadow-xl p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Calculator className="w-6 h-6 text-blue-400" />
          <h2 className="text-xl font-bold text-white">成本与利润计算器</h2>
        </div>
        <button
          onClick={saveToLocalStorage}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
            saveSuccess ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          <Save className="w-4 h-4" />
          {saveSuccess ? '已保存' : '保存配置'}
        </button>
      </div>

      <div className="mb-6 p-4 bg-slate-800 rounded-lg border border-slate-700">
        <div className="flex items-center gap-3 flex-wrap">
          <Copy className="w-5 h-5 text-purple-400" />
          <span className="text-sm text-gray-300">批量应用配置：</span>
          <select
            value={batchSourceSpec}
            onChange={(e) => setBatchSourceSpec(e.target.value)}
            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          >
            <option value="">选择源规格...</option>
            {productSummaries
              .filter((item) => costConfig[item.规格]?.成本单价 > 0)
              .map((item) => (
                <option key={item.规格} value={item.规格}>
                  {item.规格}
                </option>
              ))}
          </select>
          <button
            onClick={handleBatchApply}
            disabled={!batchSourceSpec}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-md transition-colors"
          >
            应用到全部规格
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-3 px-3 text-gray-300 font-semibold">SKU</th>
              <th className="text-left py-3 px-3 text-gray-300 font-semibold">商品ID</th>
              <th className="text-right py-3 px-3 text-gray-300 font-semibold cursor-pointer hover:text-blue-400">
                成本单价
              </th>
              <th className="text-right py-3 px-3 text-gray-300 font-semibold">定价</th>
              <th
                className="text-right py-3 px-3 text-gray-300 font-semibold cursor-pointer hover:text-blue-400"
                onClick={() => handleSort('净利润')}
              >
                净利润{getSortIcon('净利润')}
              </th>
              <th
                className="text-right py-3 px-3 text-gray-300 font-semibold cursor-pointer hover:text-blue-400"
                onClick={() => handleSort('利润率')}
              >
                利润率%{getSortIcon('利润率')}
              </th>
              <th
                className="text-right py-3 px-3 text-gray-300 font-semibold cursor-pointer hover:text-blue-400"
                onClick={() => handleSort('保本投产')}
              >
                保本投产{getSortIcon('保本投产')}
              </th>
              <th className="text-right py-3 px-3 text-gray-300 font-semibold">
                退款率
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedSummaries.map((item, index) => {
              const summary = calculateSpecSummary(item.规格);
              const isLoss = summary != null && summary.净利润 < 0;

              return (
                <tr
                  key={item.规格 || index}
                  className={`border-b border-slate-800 transition-colors ${
                    isLoss
                      ? 'bg-red-500/10 hover:bg-red-500/20'
                      : 'hover:bg-slate-800/50'
                  }`}
                >
                  <td className="py-3 px-3 text-white" title={item.商品名称}>
                    <div className="max-w-[200px] truncate">{item.规格}</div>
                  </td>
                  <td className="py-3 px-3 text-gray-400 text-xs">
                    <div className="max-w-[120px] truncate" title={item.商品ID}>
                      {item.商品ID || '-'}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <button
                      onClick={() => openEditModal(item.规格)}
                      className={`w-full px-3 py-1.5 rounded-md text-right font-medium transition-all ${
                        costConfig[item.规格]?.成本单价
                          ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30'
                          : 'bg-slate-700 text-gray-400 border border-slate-600 hover:border-blue-500/50 hover:text-blue-300'
                      }`}
                    >
                      {costConfig[item.规格]?.成本单价
                        ? `¥${formatMoney(costConfig[item.规格].成本单价)}`
                        : '点击输入'}
                    </button>
                  </td>
                  <td className="py-3 px-3">
                    <input
                      type="number"
                      value={costConfig[item.规格]?.定价 || ''}
                      onChange={(e) =>
                        handlePriceInlineChange(item.规格, parseFloat(e.target.value) || 0)
                      }
                      placeholder="输入定价"
                      className="w-full px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-md text-right text-emerald-400 font-medium placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td
                    className={`py-3 px-3 text-right font-medium ${
                      summary ? getProfitRateClass(summary.利润率).split(' ')[0] : 'text-gray-500'
                    }`}
                  >
                    ¥{formatMoney(summary?.净利润 || 0)}
                  </td>
                  <td
                    className={`py-3 px-3 text-right font-bold px-2 py-1 rounded ${
                      summary ? getProfitRateClass(summary.利润率) : 'text-gray-500'
                    }`}
                  >
                    {summary ? `${summary.利润率.toFixed(2)}%` : '-'}
                  </td>
                  <td className="py-3 px-3 text-right font-medium text-cyan-400">
                    {summary == null
                      ? '-'
                      : summary.保本投产 != null
                      ? summary.保本投产.toFixed(2)
                      : '无法保本'}
                  </td>
                  <td className="py-3 px-3 text-right">
                    {summary == null ? (
                      <span className="text-gray-500">-</span>
                    ) : (() => {
                      const isManual = costConfig[item.规格]?.启用退款率;
                      return (
                        <div className="flex flex-col items-end">
                          <span
                            className={`text-xs font-mono ${
                              summary.effectiveRefundRate >= 20 ? 'text-red-400' :
                              summary.effectiveRefundRate >= 10 ? 'text-orange-400' :
                              summary.effectiveRefundRate > 0 ? 'text-amber-400' : 'text-gray-500'
                            }`}
                            title={`真实退款率: ${summary.真实退款率.toFixed(2)}%\n${
                              isManual ? '当前: 手动输入' : '当前: 自动回用真实退款率'
                            }`}
                          >
                            {summary.effectiveRefundRate > 0 ? `${summary.effectiveRefundRate.toFixed(2)}%` : '-'}
                          </span>
                          <span className="text-[10px] text-gray-500">
                            {isManual ? '手动' : `真实${summary.真实退款率.toFixed(1)}%`}
                          </span>
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeModal}
          />

          <div className="relative bg-slate-900 rounded-xl shadow-2xl border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-bold text-white">
                  编辑成本配置 - {editingSpec}
                </h3>
              </div>
              <button
                onClick={closeModal}
                className="p-1 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400 hover:text-white" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-blue-400 uppercase tracking-wide">
                  基本信息
                </h4>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <DollarSign className="w-4 h-4 text-yellow-400" />
                    商品成本单价（元/件）
                    <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    value={tempCostItem.成本单价 || ''}
                    onChange={(e) =>
                      updateTempField('成本单价', parseFloat(e.target.value) || 0)
                    }
                    placeholder="请输入成本单价"
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                    min="0"
                    step="0.01"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* 定价输入：编辑定价 → 自动算利润率 */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-1.5 text-sm text-gray-300">
                      <DollarSign className="w-4 h-4 text-emerald-400" />
                      商品定价（元/件）
                    </label>
                    <input
                      type="number"
                      value={tempCostItem.定价 || ''}
                      onChange={(e) =>
                        updateTempField('定价', parseFloat(e.target.value) || 0)
                      }
                      placeholder="输入定价"
                      className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                      min="0"
                      step="0.01"
                    />
                  </div>

                  {/* 利润率输入：编辑利润率 → 反推定价 */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-1.5 text-sm text-gray-300">
                      <Percent className="w-4 h-4 text-blue-400" />
                      目标利润率（%）
                    </label>
                    <input
                      type="number"
                      value={modalPreviewData ? Number(modalPreviewData.利润率.toFixed(2)) : ''}
                      onChange={(e) => {
                        const rate = Math.min(99, Math.max(-99, parseFloat(e.target.value) || 0));
                        // 反推定价：P = (固定成本 + 退回运费损失) / (1 - 平台扣点率 - 退款率 - 目标利润率)
                        const PLATFORM_RATE = 0.006;
                        const refundRate = (modalPreviewData?.effectiveRefundRate || 0) / 100;
                        const targetRate = rate / 100;
                        const fixedCost = (tempCostItem.成本单价 || 0)
                          + (tempCostItem.商家承担优惠 || 0)
                          + (tempCostItem.启用快递费 ? (tempCostItem.快递费 || 0) : 0)
                          + (tempCostItem.启用包装耗材 ? (tempCostItem.包装耗材 || 0) : 0)
                          + (tempCostItem.启用运费险 ? (tempCostItem.运费险 || 0) : 0);
                        const returnShipping = (tempCostItem.启用快递费 ? (tempCostItem.快递费 || 0) : 0) * refundRate;
                        const denominator = 1 - PLATFORM_RATE - refundRate - targetRate;
                        if (denominator > 0 && fixedCost > 0) {
                          const suggestedPrice = (fixedCost + returnShipping) / denominator;
                          updateTempField('定价', Math.round(suggestedPrice * 100) / 100);
                        }
                      }}
                      placeholder="输入利润率"
                      className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                      min="-99"
                      max="99"
                      step="0.1"
                    />
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  定价与利润率双向联动：修改任一项，另一项自动计算
                </div>

                <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">平台技术服务费</span>
                    <span className="font-medium text-cyan-400">
                      ¥{formatMoney(modalPreviewData?.平台技术服务费 || 0)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    费率 0.6% × 定价（未设置定价则为0）
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-purple-400 uppercase tracking-wide">
                  可选成本项
                </h4>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                    <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer flex-1">
                      <DollarSign className="w-4 h-4 text-orange-400" />
                      商家承担优惠（元）
                    </label>
                    <input
                      type="number"
                      value={tempCostItem.商家承担优惠 || ''}
                      onChange={(e) =>
                        updateTempField('商家承担优惠', parseFloat(e.target.value) || 0)
                      }
                      placeholder="0.00"
                      className="w-32 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-right text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                      min="0"
                      step="0.01"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                    <div className="flex items-center gap-3 flex-1">
                      <Truck className="w-4 h-4 text-blue-400" />
                      <span className="text-sm text-gray-300">快递费（元）</span>
                      <button
                        onClick={() => toggleSwitch('启用快递费')}
                        className="ml-2"
                      >
                        {tempCostItem.启用快递费 ? (
                          <ToggleRight className="w-8 h-8 text-blue-500" />
                        ) : (
                          <ToggleLeft className="w-8 h-8 text-gray-500" />
                        )}
                      </button>
                    </div>
                    {tempCostItem.启用快递费 && (
                      <input
                        type="number"
                        value={tempCostItem.快递费 || ''}
                        onChange={(e) =>
                          updateTempField('快递费', parseFloat(e.target.value) || 0)
                        }
                        placeholder="0.00"
                        className="w-32 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-right text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                        min="0"
                        step="0.01"
                      />
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                    <div className="flex items-center gap-3 flex-1">
                      <Package className="w-4 h-4 text-green-400" />
                      <span className="text-sm text-gray-300">包装耗材（元）</span>
                      <button
                        onClick={() => toggleSwitch('启用包装耗材')}
                        className="ml-2"
                      >
                        {tempCostItem.启用包装耗材 ? (
                          <ToggleRight className="w-8 h-8 text-blue-500" />
                        ) : (
                          <ToggleLeft className="w-8 h-8 text-gray-500" />
                        )}
                      </button>
                    </div>
                    {tempCostItem.启用包装耗材 && (
                      <input
                        type="number"
                        value={tempCostItem.包装耗材 || ''}
                        onChange={(e) =>
                          updateTempField('包装耗材', parseFloat(e.target.value) || 0)
                        }
                        placeholder="0.00"
                        className="w-32 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-right text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                        min="0"
                        step="0.01"
                      />
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                    <div className="flex items-center gap-3 flex-1">
                      <Shield className="w-4 h-4 text-indigo-400" />
                      <span className="text-sm text-gray-300">商家版运费险（元）</span>
                      <button
                        onClick={() => toggleSwitch('启用运费险')}
                        className="ml-2"
                      >
                        {tempCostItem.启用运费险 ? (
                          <ToggleRight className="w-8 h-8 text-blue-500" />
                        ) : (
                          <ToggleLeft className="w-8 h-8 text-gray-500" />
                        )}
                      </button>
                    </div>
                    {tempCostItem.启用运费险 && (
                      <input
                        type="number"
                        value={tempCostItem.运费险 || ''}
                        onChange={(e) =>
                          updateTempField('运费险', parseFloat(e.target.value) || 0)
                        }
                        placeholder="0.00"
                        className="w-32 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-right text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                        min="0"
                        step="0.01"
                      />
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                    <div className="flex items-center gap-3 flex-1">
                      <Percent className="w-4 h-4 text-red-400" />
                      <span className="text-sm text-gray-300">退款率（%）</span>
                      <button
                        onClick={() => toggleSwitch('启用退款率')}
                        className="ml-2"
                      >
                        {tempCostItem.启用退款率 ? (
                          <ToggleRight className="w-8 h-8 text-blue-500" />
                        ) : (
                          <ToggleLeft className="w-8 h-8 text-gray-500" />
                        )}
                      </button>
                    </div>
                    {tempCostItem.启用退款率 && (
                      <input
                        type="number"
                        value={tempCostItem.退款率 || ''}
                        onChange={(e) => {
                          const val = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                          updateTempField('退款率', val);
                        }}
                        placeholder="0-100"
                        className="w-32 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-right text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                        min="0"
                        max="100"
                        step="0.1"
                      />
                    )}
                    {!tempCostItem.启用退款率 && modalPreviewData && modalPreviewData.真实退款率 > 0 && (
                      <span className="text-xs text-amber-400 ml-2" title="未启用手动退款率时，自动使用订单数据计算的真实退款率">
                        自动: {modalPreviewData.真实退款率.toFixed(2)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {modalPreviewData && (
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-emerald-400 uppercase tracking-wide">
                    实时计算结果
                  </h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="text-xs text-gray-400 mb-1">单件商品成本</div>
                      <div className="text-base font-bold text-yellow-400">
                        ¥{formatMoney(modalPreviewData.单件商品成本)}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="text-xs text-gray-400 mb-1">平台技术服务费</div>
                      <div className="text-base font-bold text-cyan-400">
                        ¥{formatMoney(modalPreviewData.平台技术服务费)}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="text-xs text-gray-400 mb-1">可选成本总和</div>
                      <div className="text-base font-bold text-purple-400">
                        ¥{formatMoney(modalPreviewData.可选成本总和)}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="text-xs text-gray-400 mb-1">单件总成本</div>
                      <div className="text-base font-bold text-orange-400">
                        ¥{formatMoney(modalPreviewData.单件总成本)}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="text-xs text-gray-400 mb-1">
                        预估退款损失
                        <span className="ml-1 text-gray-500" title="= 退款收入损失 + 退回运费损失">
                          (含退回运费)
                        </span>
                      </div>
                      <div className="text-base font-bold text-red-400">
                        ¥{formatMoney(modalPreviewData.预估退款损失)}
                      </div>
                      {modalPreviewData.单件退回运费损失 > 0 && (
                        <div className="text-[10px] text-gray-500 mt-0.5">
                          退回运费: ¥{formatMoney(modalPreviewData.单件退回运费损失)}
                        </div>
                      )}
                    </div>

                    <div
                      className={`p-3 rounded-lg border ${
                        modalPreviewData.净利润 >= 0
                          ? 'bg-green-500/10 border-green-500/30'
                          : 'bg-red-500/10 border-red-500/30'
                      }`}
                    >
                      <div className="text-xs text-gray-400 mb-1">净利润</div>
                      <div
                        className={`text-base font-bold ${
                          modalPreviewData.净利润 >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        ¥{formatMoney(modalPreviewData.净利润)}
                      </div>
                    </div>

                    <div
                      className={`col-span-2 p-3 rounded-lg border ${
                        modalPreviewData.利润率 >= 0
                          ? 'bg-green-500/10 border-green-500/30'
                          : 'bg-red-500/10 border-red-500/30'
                      }`}
                    >
                      <div className="text-xs text-gray-400 mb-1">利润率</div>
                      <div
                        className={`text-xl font-bold ${
                          modalPreviewData.利润率 >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        {modalPreviewData.利润率.toFixed(2)}%
                      </div>
                    </div>

                    <div className="col-span-2 p-3 bg-cyan-500/10 rounded-lg border border-cyan-500/30">
                      <div className="text-xs text-gray-400 mb-1">
                        保本投产比
                        <span className="ml-2 text-gray-500">
                          （定价 ÷ 净利润，含退款损失，营销投产达到此值即保本）
                        </span>
                      </div>
                      <div className="text-xl font-bold text-cyan-400">
                        {modalPreviewData.保本投产 != null
                          ? modalPreviewData.保本投产.toFixed(2)
                          : modalPreviewData.定价 > 0
                          ? '无法保本（单件成本+退款损失 ≥ 定价）'
                          : '请先设置定价'}
                      </div>
                    </div>

                    {/* 定价建议：基于目标利润率反推售价 */}
                    <div className="col-span-2 p-3 bg-indigo-500/10 rounded-lg border border-indigo-500/30">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs text-gray-400">
                          定价建议
                          <span className="ml-2 text-gray-500">
                            （基于目标利润率反推售价）
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400">目标利润率</span>
                          <input
                            type="number"
                            value={targetProfitRate}
                            onChange={e => {
                              const val = Math.min(90, Math.max(0, parseFloat(e.target.value) || 0));
                              setTargetProfitRate(val);
                            }}
                            className="w-16 px-2 py-0.5 bg-slate-700 border border-slate-600 rounded text-right text-xs text-white focus:outline-none focus:border-indigo-500"
                            min="0"
                            max="90"
                            step="1"
                          />
                          <span className="text-xs text-gray-400">%</span>
                        </div>
                      </div>
                      {(() => {
                        // 行业公式推导：
                        // 净利润 = 售价 - 固定成本 - 售价×平台扣点率 - 售价×退款率 - 退回运费损失
                        // 目标：净利润/售价 = 目标利润率
                        // => 售价×(1 - 平台扣点率 - 退款率 - 目标利润率) = 固定成本 + 退回运费损失
                        // => 建议售价 = (固定成本 + 退回运费损失) ÷ (1 - 平台扣点率 - 退款率 - 目标利润率)
                        const PLATFORM_RATE = 0.006; // 平台扣点率 0.6%
                        const refundRate = modalPreviewData.effectiveRefundRate / 100;
                        const targetRate = targetProfitRate / 100;
                        // 单件固定成本 = 单件总成本 - 平台费（平台费基于售价变动，不放入固定成本）
                        const fixedCost = modalPreviewData.单件总成本 - modalPreviewData.平台技术服务费;
                        // 退回运费损失（单件）
                        const returnShipping = modalPreviewData.单件退回运费损失 || 0;
                        const denominator = 1 - PLATFORM_RATE - refundRate - targetRate;
                        if (denominator <= 0) {
                          return (
                            <div className="text-xs text-red-400">
                              平台扣点(0.6%) + 退款率 + 目标利润率 ≥ 100%，无法计算合理售价
                            </div>
                          );
                        }
                        const suggestedPrice = (fixedCost + returnShipping) / denominator;
                        const diff = modalPreviewData.定价 > 0
                          ? ((modalPreviewData.定价 - suggestedPrice) / suggestedPrice) * 100
                          : 0;
                        return (
                          <div className="flex items-end justify-between">
                            <div>
                              <div className="text-xl font-bold text-indigo-300">
                                ¥{suggestedPrice.toFixed(2)}
                              </div>
                              <div className="text-[10px] text-gray-500 mt-0.5">
                                = ({fixedCost.toFixed(2)} + {returnShipping.toFixed(2)}) ÷ (1 - 0.6% - {modalPreviewData.effectiveRefundRate.toFixed(2)}% - {targetProfitRate}%)
                              </div>
                            </div>
                            {modalPreviewData.定价 > 0 && (
                              <div className={`text-xs font-medium ${
                                Math.abs(diff) < 5 ? 'text-emerald-400' :
                                diff > 0 ? 'text-blue-400' : 'text-orange-400'
                              }`}>
                                当前定价{diff > 0 ? '高' : '低'}于建议 {Math.abs(diff).toFixed(1)}%
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {!modalPreviewData && (
                <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 text-center text-gray-400 text-sm">
                  请设置成本单价和定价后查看利润计算结果
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-slate-900 border-t border-slate-700 px-6 py-4 flex items-center justify-end gap-3 rounded-b-xl">
              <button
                onClick={closeModal}
                className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-gray-300 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={saveAndClose}
                disabled={!tempCostItem.成本单价}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                <Check className="w-4 h-4" />
                保存并关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {productSummaries.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Calculator className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>暂无商品数据</p>
        </div>
      )}
    </div>
  );
};

export default CostInputPanel;
