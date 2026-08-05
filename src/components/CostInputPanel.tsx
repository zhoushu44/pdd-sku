import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calculator,
  X,
  Upload,
  Download,
  Trash2,
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
  Sparkles,
  CircleHelp,
} from 'lucide-react';
import { ProductSummary, DetailedCostConfig, CostItem, AIApplyPayload } from '../types';
import AIPanel from './AIPanel';
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
  人工成本: 0,
  运营成本: 0,
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

export const CostInputPanel: React.FC<CostInputPanelProps> = ({
  productSummaries,
  onCostChange,
}) => {
  const [batchSourceSpec, setBatchSourceSpec] = useState<string>('');
  const [sortField, setSortField] = useState<'成本单价' | '定价' | '净利润' | '利润率' | '保本投产' | null>(null);
  const [targetProfitRate, setTargetProfitRate] = useState<number>(20);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [editingSpec, setEditingSpec] = useState<string | null>(null);
  const [tempCostItem, setTempCostItem] = useState<CostItem>(defaultCostItem);
  // 从 Excel 导入的额外商品（不在 orders.csv 中的）
  const [extraSummaries, setExtraSummaries] = useState<ProductSummary[]>([]);
  // 清空状态：为 true 时表格不显示任何行
  const [cleared, setCleared] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);

  // 合并原始 productSummaries 和导入的 extraSummaries
  const allSummaries = useMemo(() => {
    if (cleared) return [];
    const existingSpecs = new Set(productSummaries.map(s => s.规格));
    const extras = extraSummaries.filter(s => !existingSpecs.has(s.规格));
    return [...productSummaries, ...extras];
  }, [productSummaries, extraSummaries, cleared]);
  const [costConfig, setCostConfig] = useState<DetailedCostConfig>({});
  const [modalPreviewData, setModalPreviewData] = useState<{
    单件总成本: number;
    平台技术服务费: number;
    单件退回运费损失: number;
    利润率: number;
    净利润: number;
    保本投产: number | null;
    effectiveRefundRate: number;
    真实退款率: number;
    发货后退款率: number;
    定价: number;
  } | null>(null);

  // 从本地存储加载配置
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setCostConfig(parsed);
      } catch (e) {
        console.error('加载成本配置失败:', e);
      }
    }
  }, []);

  // 保存到本地存储
  const saveToLocalStorage = useCallback((config: DetailedCostConfig) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, []);

  // 计算单个商品的利润
  const calculateProfit = useCallback((spec: string, configOverride?: CostItem) => {
    const config = configOverride || costConfig[spec] || defaultCostItem;
    const summary = allSummaries.find(s => s.规格 === spec);

    if (!summary) return null;

    // 计算总成本
    const totalCost =
      (config.成本单价 || 0) +
      (config.人工成本 || 0) +
      (config.运营成本 || 0) +
      (config.商家承担优惠 || 0) +
      (config.启用快递费 ? (config.快递费 || 0) : 0) +
      (config.启用包装耗材 ? (config.包装耗材 || 0) : 0) +
      (config.启用运费险 ? (config.运费险 || 0) : 0);

    // 平台技术服务费 (0.6%)
    const platformFee = (config.定价 || 0) * 0.006;

    // 退款率（取配置值或自动计算）
    const effectiveRefundRate = config.启用退款率 ? (config.退款率 || 0) : summary.退款率;

    // 退回运费损失（只针对发货后退款，发货前退款无运费损失）
    const afterShipRefundRate = summary.发货后退款率 || 0;
    const returnShippingLoss = (config.启用快递费 ? (config.快递费 || 0) : 0) * (afterShipRefundRate / 100);

    // 净利润 = 定价 - 总成本 - 平台费 - 退回运费损失
    const netProfit = (config.定价 || 0) - totalCost - platformFee - returnShippingLoss;

    // 利润率
    const profitRate = config.定价 ? (netProfit / (config.定价 || 1)) * 100 : 0;

    // 保本投产 = 定价 / 净利润（净利润为正时才有保本投产，否则无法保本）
    const breakEvenROAS = netProfit > 0 ? (config.定价 || 0) / netProfit : null;

    return {
      总成本: totalCost,
      平台技术服务费: platformFee,
      单件退回运费损失: returnShippingLoss,
      净利润: netProfit,
      利润率: profitRate,
      保本投产: breakEvenROAS,
      effectiveRefundRate,
      真实退款率: summary.真实退款率 || 0,
      发货后退款率: summary.发货后退款率 || 0,
    };
  }, [costConfig, allSummaries]);

  // 编辑时根据临时配置实时刷新利润预览
  useEffect(() => {
    if (!editingSpec) return;

    const profitData = calculateProfit(editingSpec, tempCostItem);
    if (!profitData) return;

    setModalPreviewData({
      单件总成本: profitData.总成本,
      平台技术服务费: profitData.平台技术服务费,
      单件退回运费损失: profitData.单件退回运费损失,
      利润率: profitData.利润率,
      净利润: profitData.净利润,
      保本投产: profitData.保本投产,
      effectiveRefundRate: profitData.effectiveRefundRate,
      真实退款率: profitData.真实退款率,
      发货后退款率: profitData.发货后退款率,
      定价: tempCostItem.定价 || 0,
    });
  }, [editingSpec, tempCostItem, calculateProfit]);

  // 获取排序后的商品列表
  const getSortedSummaries = useCallback(() => {
    if (!sortField) return allSummaries;

    return [...allSummaries].sort((a, b) => {
      const profitA = calculateProfit(a.规格);
      const profitB = calculateProfit(b.规格);

      let valueA, valueB;
      if (sortField === '净利润') {
        valueA = profitA?.净利润 || 0;
        valueB = profitB?.净利润 || 0;
      } else if (sortField === '利润率') {
        valueA = profitA?.利润率 || 0;
        valueB = profitB?.利润率 || 0;
      } else if (sortField === '保本投产') {
        valueA = profitA?.保本投产 || 0;
        valueB = profitB?.保本投产 || 0;
      }

      return sortDirection === 'asc' ? valueA - valueB : valueB - valueA;
    });
  }, [allSummaries, sortField, sortDirection, calculateProfit]);

  // 保存并关闭编辑
  const saveAndClose = useCallback(() => {
    if (!editingSpec || !tempCostItem.成本单价) return;

    const nextConfig = {
      ...costConfig,
      [editingSpec]: {
        ...tempCostItem,
        // 确保启用状态与值匹配
        启用快递费: tempCostItem.启用快递费 && (tempCostItem.快递费 || 0) > 0,
        启用包装耗材: tempCostItem.启用包装耗材 && (tempCostItem.包装耗材 || 0) > 0,
        启用运费险: tempCostItem.启用运费险 && (tempCostItem.运费险 || 0) > 0,
        启用退款率: tempCostItem.启用退款率 && (tempCostItem.退款率 || 0) > 0,
      },
    };

    setCostConfig(nextConfig);
    onCostChange(nextConfig);
    saveToLocalStorage(nextConfig);
    setEditingSpec(null);
  }, [editingSpec, tempCostItem, costConfig, onCostChange, saveToLocalStorage]);

  // 切换启用状态
  const toggleSwitch = useCallback((field: keyof CostItem) => {
    if (!editingSpec) return;
    setTempCostItem(prev => ({
      ...prev,
      [field]: !prev[field],
      // 如果关闭，重置值
      ...(field === '启用快递费' && !prev.启用快递费 ? { 快递费: 0 } : {}),
      ...(field === '启用包装耗材' && !prev.启用包装耗材 ? { 包装耗材: 0 } : {}),
      ...(field === '启用运费险' && !prev.启用运费险 ? { 运费险: 0 } : {}),
      ...(field === '启用退款率' && !prev.启用退款率 ? { 退款率: 0 } : {}),
    }));
  }, [editingSpec]);

  // 批量导入（支持 xlsx/xls/txt/csv，兼容 2 种 SKU 表格格式）
  const handleBatchImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      let rows: Record<string, unknown>[] = [];

      if (/\.(xlsx|xls)$/i.test(file.name)) {
        // Excel 文件：用 xlsx 库解析
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!worksheet) throw new Error('工作簿不包含可读取的工作表');
        rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
      } else {
        // txt/csv 文件：Tab 或逗号分隔
        const text = await file.text();
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) throw new Error('文件内容为空');
        const delimiter = lines[0].includes('\t') ? '\t' : ',';
        const headers = lines[0].split(delimiter).map(h => h.trim());
        rows = lines.slice(1).map(line => {
          const values = line.split(delimiter);
          const obj: Record<string, unknown> = {};
          headers.forEach((h, i) => { obj[h] = values[i]?.trim() ?? ''; });
          return obj;
        });
      }

      if (rows.length === 0) throw new Error('表格为空');

      const firstRow = rows[0];
      const allKeys = Object.keys(firstRow);

      // === 自动检测规格列 ===
      let specColumn: string | undefined = allKeys.find(k => k === '规格')
        || allKeys.find(k => k === '商品规格')
        || allKeys.find(k => k === 'SKU')
        || allKeys.find(k => k === 'SKU信息')
        || allKeys.find(k => k === '商品名称');

      // 文件1特殊处理：尺寸+款式 组合作为规格
      const has尺寸 = allKeys.includes('尺寸');
      const has款式 = allKeys.includes('款式');
      if (!specColumn && has尺寸 && has款式) {
        specColumn = '__combined__';
      }
      if (!specColumn) throw new Error('无法识别规格列，请确保包含"规格"、"商品规格"、"SKU"、"SKU信息"或"商品名称"列');

      // === 自动检测定价列 ===
      const priceColumn = allKeys.find(k => k === '定价')
        || allKeys.find(k => k === '拼团价')
        || allKeys.find(k => k === '价格')
        || allKeys.find(k => k === '售价')
        || allKeys.find(k => k === '券后价')
        || allKeys.find(k => k === '券后价格');

      // === 自动检测成本列（兼容多种列名）===
      const findCol = (candidates: string[]) => candidates.find(c => allKeys.includes(c));
      const colMap = {
        成本单价: findCol(['成本单价', '商品成本', '单位成本', '成本', '原材料成本']) || '成本单价',
        人工成本: findCol(['人工成本', '人工']) || '人工成本',
        运营成本: findCol(['运营成本', '运营']) || '运营成本',
        商家承担优惠: findCol(['商家承担优惠', '优惠承担', '商家优惠']) || '商家承担优惠',
        快递费: findCol(['快递费', '运费']) || '快递费',
        包装耗材: findCol(['包装耗材', '包装费', '耗材']) || '包装耗材',
        运费险: findCol(['运费险', '保险']) || '运费险',
        退款率: findCol(['退款率', '退货率']) || '退款率',
      };

      const nextConfig: DetailedCostConfig = { ...costConfig };
      const newSummaries: ProductSummary[] = [];
      let matched = 0;

      // 检测商品ID列
      const idColumn = allKeys.find(k => k === '商品ID' || k === '商品id' || k === 'SKUID');

      // 已有的规格集合（含导入的）
      const existingSpecs = new Set(allSummaries.map(item => item.规格));

      for (const row of rows) {
        // 获取规格名
        let spec: string;
        let productName: string;
        if (specColumn === '__combined__') {
          const size = String(row['尺寸'] ?? '').trim();
          const style = String(row['款式'] ?? '').trim();
          spec = `${size} ${style}`.trim();
          productName = spec;
        } else {
          spec = String(row[specColumn] ?? '').trim();
          productName = spec;
        }
        if (!spec) continue;

        const numVal = (colName: string) => {
          const v = Number(row[colName]);
          return Number.isFinite(v) && v >= 0 ? v : 0;
        };

        const priceValue = priceColumn ? numVal(priceColumn) : 0;
        const existingPrice = nextConfig[spec]?.定价 || 0;
        const productId = idColumn ? String(row[idColumn] ?? '').trim() : '';

        // 如果当前利润表中没有该规格，创建新的 ProductSummary
        if (!existingSpecs.has(spec)) {
          newSummaries.push({
            规格: spec,
            商品ID: productId,
            商品名称: productName,
            销售额: 0,
            销量: 0,
            订单数: 0,
            平均客单价: 0,
            营销花费: 0,
            成本单价: 0,
            总商品成本: 0,
            人工成本: 0,
            运营成本: 0,
            平台技术服务费: 0,
            商家承担优惠: 0,
            快递费: 0,
            包装耗材: 0,
            运费险: 0,
            退款率: 0,
            真实退款率: 0,
            发货后退款率: 0,
            订单引流成本: 0,
            总成本: 0,
            预估退款损失: 0,
            净利润: 0,
            利润率: 0,
            SKU净利润: 0,
          });
          existingSpecs.add(spec);
        }

        nextConfig[spec] = {
          ...cloneCostItem(nextConfig[spec]),
          成本单价: numVal(colMap.成本单价),
          人工成本: numVal(colMap.人工成本),
          运营成本: numVal(colMap.运营成本),
          商家承担优惠: numVal(colMap.商家承担优惠),
          快递费: numVal(colMap.快递费),
          包装耗材: numVal(colMap.包装耗材),
          运费险: numVal(colMap.运费险),
          定价: priceValue || existingPrice,
          退款率: numVal(colMap.退款率),
          启用快递费: numVal(colMap.快递费) > 0,
          启用包装耗材: numVal(colMap.包装耗材) > 0,
          启用运费险: numVal(colMap.运费险) > 0,
          启用退款率: numVal(colMap.退款率) > 0,
        };
        matched += 1;
      }

      if (matched === 0) {
        throw new Error('未导入任何数据，请检查表格内容');
      }

      // 将新规格添加到 extraSummaries，并取消清空状态
      setCleared(false);
      if (newSummaries.length > 0) {
        setExtraSummaries(prev => [...prev, ...newSummaries]);
      }

      setCostConfig(nextConfig);
      onCostChange(nextConfig);
      saveToLocalStorage(nextConfig);
      alert(`已导入 ${matched} 条配置${priceColumn ? `（定价来源：${priceColumn}）` : ''}${newSummaries.length > 0 ? `，新增 ${newSummaries.length} 个规格` : ''}。`);
    } catch (error) {
      alert(error instanceof Error ? error.message : '导入失败，请检查文件内容');
    } finally {
      event.target.value = '';
    }
  }, [costConfig, allSummaries, onCostChange, saveToLocalStorage]);

  // 打开编辑模态框
  const openEditModal = useCallback((spec: string) => {
    setEditingSpec(spec);
    setTempCostItem(costConfig[spec] || defaultCostItem);

    // 计算当前预览数据
    const profitData = calculateProfit(spec);
    if (profitData) {
      setModalPreviewData({
        单件总成本: profitData.总成本,
        平台技术服务费: profitData.平台技术服务费,
        单件退回运费损失: profitData.单件退回运费损失,
        利润率: profitData.利润率,
        净利润: profitData.净利润,
        保本投产: profitData.保本投产,
        effectiveRefundRate: profitData.effectiveRefundRate,
        真实退款率: profitData.真实退款率,
        发货后退款率: profitData.发货后退款率,
        定价: costConfig[spec]?.定价 || 0,
      });
    }
  }, [costConfig, calculateProfit]);

  // 关闭模态框
  const closeModal = useCallback(() => {
    setEditingSpec(null);
    setModalPreviewData(null);
  }, []);

  // 更新临时字段
  const updateTempField = useCallback((field: keyof CostItem, value: any) => {
    setTempCostItem(prev => ({ ...prev, [field]: value }));
  }, []);

  // 内联定价变更
  const handlePriceInlineChange = useCallback((spec: string, value: number) => {
    const nextConfig = {
      ...costConfig,
      [spec]: {
        ...(costConfig[spec] || defaultCostItem),
        定价: value,
      },
    };
    setCostConfig(nextConfig);
    onCostChange(nextConfig);
    saveToLocalStorage(nextConfig);
  }, [costConfig, onCostChange, saveToLocalStorage]);

  // 获取利润率的样式类
  const getProfitRateClass = useCallback((rate: number) => {
    if (rate >= 15) return 'text-emerald-400 bg-emerald-500/10';
    if (rate >= 10) return 'text-green-400 bg-green-500/10';
    if (rate >= 5) return 'text-amber-400 bg-amber-500/10';
    if (rate >= 0) return 'text-yellow-400 bg-yellow-500/10';
    return 'text-red-400 bg-red-500/10';
  }, []);

  const sortedSummaries = getSortedSummaries();

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-700/50 overflow-hidden">
      <div className="p-4 flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">成本配置</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAIPanel(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-md text-sm transition-colors shadow-lg shadow-purple-500/20"
          >
            <Sparkles className="w-4 h-4" />
            一键 AI
          </button>
          <button
            onClick={() => document.getElementById('batch-import')?.click()}
            title="表格来源：店透视插件-SKU预览-导出表格（支持淘宝、拼多多等电商平台）"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-md text-sm transition-colors"
          >
            <CircleHelp className="w-4 h-4" />
            批量导入
          </button>
          <input
            id="batch-import"
            type="file"
            accept=".xlsx,.xls,.txt,.csv"
            className="hidden"
            onChange={handleBatchImport}
          />
          <button
            onClick={() => {
              const headers = '规格\t原材料成本\t人工成本\t运营成本\t商家承担优惠\t快递费\t包装耗材\t运费险\t定价\t退款率';
              const content = sortedSummaries
                .map(s => {
                  const config = costConfig[s.规格] || defaultCostItem;
                  return `${s.规格}\t${config.成本单价}\t${config.人工成本}\t${config.运营成本}\t${config.商家承担优惠}\t${config.快递费}\t${config.包装耗材}\t${config.运费险}\t${config.定价}\t${config.退款率}`;
                })
                .join('\n');

              const blob = new Blob([headers, '\n', content], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `成本配置_${new Date().toISOString().slice(0, 10)}.txt`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            title="表格来源：导出的表格（可作为批量导入文件使用）"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-md text-sm transition-colors"
          >
            <CircleHelp className="w-4 h-4" />
            批量导出
          </button>
          <button
            onClick={() => {
              if (!confirm('确定清空所有行和数据吗？')) return;
              setCleared(true);
              setCostConfig({});
              setExtraSummaries([]);
              setBatchSourceSpec('');
              setSortField(null);
              setSortDirection('desc');
              setEditingSpec(null);
              setTempCostItem(defaultCostItem);
              setModalPreviewData(null);
              onCostChange({});
              localStorage.removeItem(STORAGE_KEY);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded-md text-sm transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            清空
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-900/50 text-slate-400 text-sm">
              <th className="py-2 px-3 text-left">规格</th>
              <th className="py-2 px-3 text-left">商品ID</th>
              <th
                className="py-2 px-3 text-left cursor-pointer hover:bg-slate-800/50"
                onClick={() => {
                  if (sortField === '成本单价') {
                    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                  } else {
                    setSortField('成本单价');
                    setSortDirection('desc');
                  }
                }}
              >
                <div className="flex items-center gap-1">
                  成本单价
                  {sortField === '成本单价' && (
                    sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                  )}
                </div>
              </th>
              <th
                className="py-2 px-3 text-left cursor-pointer hover:bg-slate-800/50"
                onClick={() => {
                  if (sortField === '定价') {
                    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                  } else {
                    setSortField('定价');
                    setSortDirection('desc');
                  }
                }}
              >
                <div className="flex items-center gap-1">
                  定价
                  {sortField === '定价' && (
                    sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                  )}
                </div>
              </th>
              <th
                className="py-2 px-3 text-left cursor-pointer hover:bg-slate-800/50"
                onClick={() => {
                  if (sortField === '利润率') {
                    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                  } else {
                    setSortField('利润率');
                    setSortDirection('desc');
                  }
                }}
              >
                <div className="flex items-center gap-1">
                  利润率
                  {sortField === '利润率' && (
                    sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                  )}
                </div>
              </th>
              <th
                className="py-2 px-3 text-left cursor-pointer hover:bg-slate-800/50"
                onClick={() => {
                  if (sortField === '保本投产') {
                    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                  } else {
                    setSortField('保本投产');
                    setSortDirection('desc');
                  }
                }}
              >
                <div className="flex items-center gap-1">
                  保本投产
                  {sortField === '保本投产' && (
                    sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                  )}
                </div>
              </th>
              <th
                className="py-2 px-3 text-left cursor-pointer hover:bg-slate-800/50"
                onClick={() => {
                  if (sortField === '净利润') {
                    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                  } else {
                    setSortField('净利润');
                    setSortDirection('desc');
                  }
                }}
              >
                <div className="flex items-center gap-1">
                  净利润
                  {sortField === '净利润' && (
                    sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                  )}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedSummaries.map((item) => {
              const summary = calculateProfit(item.规格);
              return (
                <tr
                  key={item.规格}
                  className={editingSpec === item.规格 ? 'bg-slate-800' : 'hover:bg-slate-800/50'}
                >
                  <td className="py-3 px-3 text-white" title={item.商品名称}>
                    <div className="max-w-[420px] truncate">{item.规格}</div>
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
                      value={costConfig[item.规格]?.定价 !== undefined && costConfig[item.规格]?.定价 !== null ? String(costConfig[item.规格]?.定价) : ''}
                      onChange={(e) =>
                        handlePriceInlineChange(item.规格, parseFloat(e.target.value) || 0)
                      }
                      placeholder="输入定价"
                      className="w-24 px-2 py-1.5 bg-slate-800 border border-slate-600 rounded-md text-right text-emerald-400 font-medium placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                      min="0"
                      step="0.01"
                    />
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
                      ? summary.保本投产.toFixed(1)
                      : '无法保本'}
                  </td>
                  <td
                    className={`py-3 px-3 text-right font-medium ${
                      summary ? getProfitRateClass(summary.利润率).split(' ')[0] : 'text-gray-500'
                    }`}
                  >
                    ¥{formatMoney(summary?.净利润 || 0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showAIPanel && (
        <AIPanel
          allSummaries={allSummaries}
          costConfig={costConfig}
          onClose={() => setShowAIPanel(false)}
          onApply={(payload: AIApplyPayload) => {
            setCostConfig(payload.config);
            if (payload.summaries.length > allSummaries.length) {
              const currentSpecs = new Set(productSummaries.map(item => item.规格));
              setExtraSummaries(payload.summaries.filter(item => !currentSpecs.has(item.规格)));
            }
            onCostChange(payload.config);
            saveToLocalStorage(payload.config);
            if (payload.bundles.length > 0) {
              localStorage.setItem('aiBundleSuggestions', JSON.stringify(payload.bundles));
            }
          }}
        />
      )}

      {editingSpec && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl shadow-2xl overflow-hidden">
            <div className="flex-shrink-0 p-4 bg-slate-900/50 flex items-center justify-between border-b border-slate-700/50">
              <div>
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

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
                    value={tempCostItem.成本单价 !== undefined && tempCostItem.成本单价 !== null ? String(tempCostItem.成本单价) : ''}
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
                      value={tempCostItem.定价 !== undefined && tempCostItem.定价 !== null ? String(tempCostItem.定价) : ''}
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
                      value={modalPreviewData && modalPreviewData.利润率 !== undefined && modalPreviewData.利润率 !== null ? String(Number(modalPreviewData.利润率.toFixed(2))) : ''}
                      onChange={(e) => {
                        const rate = Math.min(99, Math.max(-99, parseFloat(e.target.value) || 0));
                        // 反推定价：P = (固定成本 + 退回运费损失) / (1 - 平台扣点率 - 目标利润率)
                        // 退款损失仅为发货后退回运费，不再有退款收入损失
                        const PLATFORM_RATE = 0.006;
                        const targetRate = rate / 100;
                        const fixedCost = (tempCostItem.成本单价 || 0)
                          + (tempCostItem.人工成本 || 0)
                          + (tempCostItem.运营成本 || 0)
                          + (tempCostItem.商家承担优惠 || 0)
                          + (tempCostItem.启用快递费 ? (tempCostItem.快递费 || 0) : 0)
                          + (tempCostItem.启用包装耗材 ? (tempCostItem.包装耗材 || 0) : 0)
                          + (tempCostItem.启用运费险 ? (tempCostItem.运费险 || 0) : 0);
                        const returnShipping = modalPreviewData?.单件退回运费损失 || 0;
                        const denominator = 1 - PLATFORM_RATE - targetRate;
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
                      value={tempCostItem.商家承担优惠 !== undefined && tempCostItem.商家承担优惠 !== null ? String(tempCostItem.商家承担优惠) : ''}
                      onChange={(e) =>
                        updateTempField('商家承担优惠', parseFloat(e.target.value) || 0)
                      }
                      placeholder="0.00"
                      className="w-32 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-right text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                      min="0"
                      step="0.01"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center justify-between gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700 text-sm text-gray-300">
                      人工成本（元/件）
                      <input type="number" value={tempCostItem.人工成本 !== undefined && tempCostItem.人工成本 !== null ? String(tempCostItem.人工成本) : ''} onChange={(e) => updateTempField('人工成本', parseFloat(e.target.value) || 0)} placeholder="0.00" className="w-24 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-right text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" min="0" step="0.01" />
                    </label>
                    <label className="flex items-center justify-between gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700 text-sm text-gray-300">
                      运营成本（元/件）
                      <input type="number" value={tempCostItem.运营成本 !== undefined && tempCostItem.运营成本 !== null ? String(tempCostItem.运营成本) : ''} onChange={(e) => updateTempField('运营成本', parseFloat(e.target.value) || 0)} placeholder="0.00" className="w-24 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-md text-right text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" min="0" step="0.01" />
                    </label>
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
                        value={tempCostItem.快递费 !== undefined && tempCostItem.快递费 !== null ? String(tempCostItem.快递费) : ''}
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
                        value={tempCostItem.包装耗材 !== undefined && tempCostItem.包装耗材 !== null ? String(tempCostItem.包装耗材) : ''}
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
                        value={tempCostItem.运费险 !== undefined && tempCostItem.运费险 !== null ? String(tempCostItem.运费险) : ''}
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
                      <span className="text-sm text-gray-300">退款率</span>
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
                    {tempCostItem.启用退款率 && modalPreviewData && (
                      <div className="text-right">
                        <div className="text-sm text-slate-400">
                          退款率 <span className="font-mono text-amber-400">{modalPreviewData.真实退款率.toFixed(2)}%</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          发货后退款率 <span className="font-mono text-red-400 font-semibold">{modalPreviewData.发货后退款率.toFixed(2)}%</span>
                          <span className="text-[10px] text-slate-500 ml-1">（产生运费损失）</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {modalPreviewData && (
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-emerald-400 uppercase tracking-wide">
                    利润计算结果
                  </h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="text-sm text-gray-400">单件总成本</div>
                      <div className="text-xl font-bold text-white">
                        ¥{formatMoney(modalPreviewData.单件总成本)}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="text-sm text-gray-400">净利润</div>
                      <div className="text-xl font-bold text-white">
                        ¥{formatMoney(modalPreviewData.净利润)}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="text-sm text-gray-400">利润率</div>
                      <div className="text-xl font-bold text-white">
                        {modalPreviewData.利润率.toFixed(2)}%
                      </div>
                    </div>
                    <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div className="text-sm text-gray-400">保本投产</div>
                      <div className="text-xl font-bold text-white">
                        {modalPreviewData.保本投产 != null ? modalPreviewData.保本投产.toFixed(1) : '无法保本'}
                      </div>
                    </div>
                  </div>

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
                      // 公式推导：
                      // 净利润 = 售价 - 固定成本 - 售价×平台扣点率 - 退回运费损失
                      // 目标：净利润/售价 = 目标利润率
                      // => 售价×(1 - 平台扣点率 - 目标利润率) = 固定成本 + 退回运费损失
                      // => 建议售价 = (固定成本 + 退回运费损失) ÷ (1 - 平台扣点率 - 目标利润率)
                      const PLATFORM_RATE = 0.006; // 平台扣点率 0.6%
                      const targetRate = targetProfitRate / 100;
                      // 单件固定成本 = 单件总成本 - 平台费（平台费基于售价变动，不放入固定成本）
                      const fixedCost = modalPreviewData.单件总成本 - modalPreviewData.平台技术服务费;
                      // 退回运费损失（单件，仅发货后退款）
                      const returnShipping = modalPreviewData.单件退回运费损失 || 0;
                      const denominator = 1 - PLATFORM_RATE - targetRate;
                      if (denominator <= 0) {
                        return (
                          <div className="text-xs text-red-400">
                            平台扣点(0.6%) + 目标利润率 ≥ 100%，无法计算合理售价
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
                              = ({fixedCost.toFixed(2)} + {returnShipping.toFixed(2)}) ÷ (1 - 0.6% - {targetProfitRate}%)
                            </div>
                          </div>
                          {modalPreviewData.定价 > 0 && (
                            <div className={`text-xs font-medium ${
                              Math.abs(diff) < 5 ? 'text-emerald-400' :
                              diff > 0 ? 'text-blue-400' : 'text-orange-400'
                            }`}
                            >
                              当前定价{diff > 0 ? '高' : '低'}于建议 {Math.abs(diff).toFixed(1)}%
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {!modalPreviewData && (
                <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 text-center text-gray-400 text-sm">
                  请设置成本单价和定价后查看利润计算结果
                </div>
              )}
            </div>

            <div className="flex-shrink-0 bg-slate-900 border-t border-slate-700 px-6 py-4 flex items-center justify-end gap-3 rounded-b-xl">
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
    </div>
  );
};

export default CostInputPanel;
