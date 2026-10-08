import { useState, useEffect, useCallback, useMemo } from 'react';
import OrderOverview from '../components/OrderOverview';
import ProductAnalysis from '../components/ProductAnalysis';
import SkuDetail from '../components/SkuDetail';
import CostInputPanel from '../components/CostInputPanel';
import MarketingAnalysis from '../components/MarketingAnalysis';
import RefundAnalysis from '../components/RefundAnalysis';
import AdviceCenter from '../components/AdviceCenter';
import { parseOrderData, parseMarketingCSV, groupBySpec, calculateProfit, filterOrdersByTimeRange, filterMarketingByTimeRange, mergeMarketingData, calculatePeriodComparison, mergeOrders, mergeMarketingRows } from '../utils/dataProcessor';
import { OrderData, DetailedCostConfig, MarketingDataRow, TimeRange } from '../types';
import { loadCostConfig, saveCostConfig } from '../lib/configStore';
import { loadSalesOrders, saveSalesOrders, loadMarketingData, saveMarketingData, clearSalesOrders, clearMarketingData } from '../lib/dataStore';
import { LayoutDashboard, Upload, RefreshCw, ShoppingCart, Megaphone, Calendar, Search, X, CircleHelp, Trash2 } from 'lucide-react';

export default function Dashboard() {
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [marketingData, setMarketingData] = useState<MarketingDataRow[]>([]);
  // 当前订单是否来自内置样例（public/orders.csv）。为真时首次上传直接覆盖，避免样例数据混入
  const [isSampleData, setIsSampleData] = useState(false);
  const [costConfig, setCostConfig] = useState<DetailedCostConfig>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'sku' | 'product' | 'analysis' | 'cost' | 'marketing' | 'refund' | 'advice'>('overview');
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [searchProductId, setSearchProductId] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // 时间筛选选项配置
  const timeRangeOptions: { value: TimeRange; label: string }[] = [
    { value: 'today', label: '今日' },
    { value: '7d', label: '最近7天' },
    { value: '15d', label: '最近15天' },
    { value: '30d', label: '最近30天' },
    { value: 'all', label: '全部' },
  ];

  // 根据时间筛选过滤后的订单数据
  const timeFilteredOrders = useMemo(
    () => filterOrdersByTimeRange(orders, timeRange),
    [orders, timeRange]
  );

  // 根据时间筛选过滤后的营销数据
  const timeFilteredMarketingData = useMemo(
    () => filterMarketingByTimeRange(marketingData, timeRange),
    [marketingData, timeRange]
  );

  // 商品ID搜索关键字（去空格，空字符串表示不筛选）
  const productIdKeyword = searchProductId.trim();

  // 在时间筛选基础上，再按商品ID筛选订单
  const filteredOrders = useMemo(() => {
    if (!productIdKeyword) return timeFilteredOrders;
    return timeFilteredOrders.filter(order => order.商品id.includes(productIdKeyword));
  }, [timeFilteredOrders, productIdKeyword]);

  // 在时间筛选基础上，再按商品ID筛选营销数据
  const filteredMarketingData = useMemo(() => {
    if (!productIdKeyword) return timeFilteredMarketingData;
    return timeFilteredMarketingData.filter(row => row.商品ID.includes(productIdKeyword));
  }, [timeFilteredMarketingData, productIdKeyword]);

  // 基于筛选后的订单重新生成商品汇总（合并营销数据后应用成本配置）
  const filteredSummaries = useMemo(
    () => {
      const grouped = groupBySpec(filteredOrders);
      const withMarketing = mergeMarketingData(grouped, filteredMarketingData);
      return withMarketing.map(item => calculateProfit(item, costConfig));
    },
    [filteredOrders, filteredMarketingData, costConfig]
  );

  // 环比对比（基于全部订单，按当前时间范围计算）
  const periodComparison = useMemo(
    () => calculatePeriodComparison(orders, timeRange, costConfig, marketingData),
    [orders, timeRange, costConfig, marketingData]
  );

  // 触发商品ID查询
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchProductId(searchInput);
  };

  // 清除查询
  const handleClearSearch = () => {
    setSearchInput('');
    setSearchProductId('');
  };

  // 加载销售数据：优先已持久化数据，无则回退内置样例 CSV
  const loadSalesData = async () => {
    try {
      setLoading(true);
      const saved = await loadSalesOrders();
      // saved 为 null 表示从未上传（回退样例）；为数组（含空数组=已清空）则直接采用
      if (saved !== null) {
        setOrders(saved);
        setIsSampleData(false);
        return;
      }
      // 无持久化数据 → 加载内置样例
      const response = await fetch('/orders.csv');
      const csvText = await response.text();
      const parsedOrders = parseOrderData(csvText);
      setOrders(parsedOrders);
      setIsSampleData(true);
    } catch (error) {
      console.error('加载销售数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 加载营销数据：优先已持久化数据
  const loadMarketingDataFromStore = async () => {
    const saved = await loadMarketingData();
    if (saved !== null) setMarketingData(saved);
  };

  // 清空全部上传数据（订单 + 营销），并持久化空状态
  const handleClearAllData = async () => {
    if (!confirm('确定清空全部上传数据吗？\n将删除已导入的销售订单和推广数据（成本配置不受影响）。')) return;
    setOrders([]);
    setMarketingData([]);
    setIsSampleData(false);
    setSearchInput('');
    setSearchProductId('');
    await Promise.all([clearSalesOrders(), clearMarketingData()]);
  };

  // 处理推广数据文件上传
  const handleMarketingFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      let csvText: string;
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!worksheet) throw new Error('工作簿不包含可读取的工作表');
        csvText = XLSX.utils.sheet_to_csv(worksheet);
      } else {
        csvText = await file.text();
      }

      const parsedMarketing = parseMarketingCSV(csvText);
      if (parsedMarketing.length === 0) {
        alert('文件解析失败，请检查推广数据表头和格式');
        return;
      }
      // 与已有数据合并去重（支持最近30天/多店铺多文件累计导入）
      const { merged, added, duplicates } = mergeMarketingRows(marketingData, parsedMarketing);
      setMarketingData(merged);
      await saveMarketingData(merged);
      if (duplicates > 0) {
        alert(`推广数据导入完成：新增 ${added} 条，去重 ${duplicates} 条（共 ${merged.length} 条）`);
      }
      setActiveTab('marketing');
    } catch (error) {
      console.error('解析推广数据失败:', error);
      alert('文件解析失败，请检查推广数据格式');
    } finally {
      e.target.value = '';
    }
  };

  // 初始加载
  useEffect(() => {
    // 成本配置：服务器优先加载（聚水潭式资料库），失败回退 localStorage
    loadCostConfig().then((config) => {
      if (config) setCostConfig(config);
    });

    loadSalesData();
    loadMarketingDataFromStore();
  }, []);

  // 成本变更处理（localStorage + 服务器双写持久化）
  const handleCostChange = useCallback((newCostConfig: DetailedCostConfig) => {
    setCostConfig(newCostConfig);
    saveCostConfig(newCostConfig);
  }, []);

  // 定价默认取导入销售数据的平均客单价：仅对未设置定价的规格自动预填，不覆盖用户已填值
  useEffect(() => {
    if (filteredSummaries.length === 0) return;
    let changed = false;
    const nextConfig: DetailedCostConfig = { ...costConfig };
    for (const item of filteredSummaries) {
      const current = nextConfig[item.规格];
      const currentPrice = current?.定价 || 0;
      if (currentPrice === 0 && item.平均客单价 > 0) {
        nextConfig[item.规格] = { 成本单价: 0, ...current, 定价: item.平均客单价 };
        changed = true;
      }
    }
    if (changed) handleCostChange(nextConfig);
  }, [filteredSummaries, costConfig, handleCostChange]);

  // 处理销售数据文件上传（合并去重 + 持久化）
  const handleSalesFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const text = event.target?.result as string;
          const parsedOrders = parseOrderData(text);
          if (parsedOrders.length === 0) {
            alert('文件解析失败，请检查销售数据表头和格式');
            return;
          }
          // 样例数据或首次上传：直接覆盖；否则与已有数据合并去重
          const base = isSampleData ? [] : orders;
          const { merged, added, duplicates } = mergeOrders(base, parsedOrders);
          setOrders(merged);
          setIsSampleData(false);
          await saveSalesOrders(merged);
          if (duplicates > 0) {
            alert(`销售数据导入完成：新增 ${added} 条，去重 ${duplicates} 条（共 ${merged.length} 条）`);
          }
          setActiveTab('overview');
        } catch (error) {
          console.error('解析销售数据失败:', error);
          alert('文件解析失败，请检查CSV格式');
        }
      };
      reader.onerror = () => {
        alert('读取文件失败，请重试');
      };
      reader.readAsText(file);
    } catch (error) {
      console.error('上传销售数据失败:', error);
      alert('上传失败，请重试');
    }
    // 重置input以便重复选择同一文件
    e.target.value = '';
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-emerald-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-500 text-[13px]">正在加载数据...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 顶部导航栏 */}
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-[1920px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                <LayoutDashboard className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-900">电商数据分析仪表板</h1>
                <p className="text-[13px] text-slate-500">支持销售数据与推广数据分析 | 成本输入与利润计算</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* 刷新按钮 */}
              <button
                onClick={loadSalesData}
                title="重新载入已保存的数据（本地/服务器）"
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-[13px] transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                刷新数据
              </button>

              <label
                title="支持多次上传、多店铺/多日期段累计导入，自动按订单号去重并持久化保存"
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[13px] transition-colors cursor-pointer shadow-sm"
              >
                <Upload className="w-4 h-4" />
                上传销售 CSV
                <input
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={handleSalesFileUpload}
                />
              </label>

              <label
                title="推广数据表下载：拼多多推广后台 → 报表/数据 → 导出报表（支持 Excel/CSV）。支持多次上传累计导入，自动去重并持久化"
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-[13px] transition-colors cursor-pointer"
              >
                <CircleHelp className="w-4 h-4" />
                推广数据
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt"
                  className="hidden"
                  onChange={handleMarketingFileUpload}
                />
              </label>

              <button
                onClick={handleClearAllData}
                title="清空已导入的销售订单与推广数据（成本配置不受影响）"
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[13px] transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                清空数据
              </button>

              <div className="text-[13px] text-slate-500">
                更新: {new Date().toLocaleDateString('zh-CN')}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 数据状态栏 */}
      <div className="max-w-[1920px] mx-auto px-6 pt-4 space-y-3">
        {/* 商品ID搜索栏 */}
        <div className="bg-white rounded-xl px-4 py-3 border border-slate-200 flex items-center justify-between gap-4 flex-wrap">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="输入商品ID查询（如 123456）"
                className="pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-md text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 w-72"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  title="清除"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[13px] transition-colors shadow-sm"
            >
              <Search className="w-3.5 h-3.5" />
              查询
            </button>
            {searchProductId && (
              <div className="flex items-center gap-2 ml-2 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-md">
                <span className="text-[13px] text-emerald-700">当前查询:</span>
                <span className="text-[13px] text-slate-700 font-mono">{searchProductId}</span>
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="text-emerald-600 hover:text-slate-700"
                  title="取消查询"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </form>
          <div className="text-[13px] text-slate-500">
            {searchProductId
              ? `已按商品ID筛选：仅显示包含 "${searchProductId}" 的数据`
              : '未启用商品ID筛选：显示全部数据'}
          </div>
        </div>

        <div className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-slate-200 flex-wrap gap-3">
          <div className="flex items-center gap-6 text-[13px]">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-emerald-600" />
              <span className="text-slate-500">
                销售订单: <strong className="text-slate-900">{filteredOrders.length}</strong> 条
              </span>
            </div>
            <div className="flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4 text-cyan-600" />
              <span className="text-slate-500">
                商品规格: <strong className="text-slate-900">{filteredSummaries.length}</strong> 个
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-purple-600" />
              <span className="text-slate-500">
                推广记录: <strong className="text-slate-900">{filteredMarketingData.length}</strong> 条
              </span>
            </div>
          </div>

          {/* 时间筛选 + 快速跳转按钮 */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* 时间筛选 */}
            <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1 border border-slate-200">
              <Calendar className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
              <div className="flex gap-0.5">
                {timeRangeOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTimeRange(opt.value)}
                    className={`px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                      timeRange === opt.value
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-900 hover:bg-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 快速跳转按钮 */}
            <div className="flex gap-1.5 flex-wrap">
              {([
                { tab: 'product', label: '单品明细' },
                { tab: 'sku', label: 'SKU明细' },
                { tab: 'overview', label: '总览' },
                { tab: 'analysis', label: '商品分析' },
                { tab: 'cost', label: '利润计算' },
                { tab: 'marketing', label: '营销数据' },
                { tab: 'refund', label: '退款分析' },
                { tab: 'advice', label: '智能建议' },
              ] as const).map(({ tab, label }) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                    activeTab === tab
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white border border-slate-300 text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <main className="max-w-[1920px] mx-auto px-6 py-8">
        {activeTab === 'sku' && (
          <SkuDetail
            summaries={filteredSummaries}
            marketingData={filteredMarketingData}
            costConfig={costConfig}
            orders={filteredOrders}
            dimension="sku"
          />
        )}

        {activeTab === 'product' && (
          <SkuDetail
            summaries={filteredSummaries}
            marketingData={filteredMarketingData}
            costConfig={costConfig}
            orders={filteredOrders}
            dimension="product"
          />
        )}

        {activeTab === 'overview' && (
          <OrderOverview
            orders={filteredOrders}
            summaries={filteredSummaries}
            costConfig={costConfig}
            periodComparison={periodComparison}
            marketingData={filteredMarketingData}
          />
        )}

        {activeTab === 'analysis' && (
          <ProductAnalysis
            summaries={filteredSummaries}
            costConfig={costConfig}
          />
        )}

        {activeTab === 'cost' && (
          <CostInputPanel
            productSummaries={filteredSummaries}
            costConfig={costConfig}
            onCostChange={handleCostChange}
          />
        )}

        {activeTab === 'marketing' && (
          <MarketingAnalysis
            marketingData={filteredMarketingData}
            summaries={filteredSummaries}
          />
        )}

        {activeTab === 'refund' && (
          <RefundAnalysis orders={filteredOrders} />
        )}

        {activeTab === 'advice' && (
          <AdviceCenter
            orders={filteredOrders}
            summaries={filteredSummaries}
            marketingData={filteredMarketingData}
            timeRange={timeRange}
            periodComparison={periodComparison}
          />
        )}
      </main>

      {/* 底部信息 */}
      <footer className="mt-8 py-6 border-t border-slate-200 text-center">
        <p className="text-[13px] text-slate-500">
          电商数据分析仪表板 | 支持多数据源导入 | 实时计算成本与利润
        </p>
      </footer>
    </div>
  );
}
