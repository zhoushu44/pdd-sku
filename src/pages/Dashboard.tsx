import { useState, useEffect, useCallback, useMemo } from 'react';
import OrderOverview from '../components/OrderOverview';
import ProductAnalysis from '../components/ProductAnalysis';
import CostInputPanel from '../components/CostInputPanel';
import MarketingAnalysis from '../components/MarketingAnalysis';
import RefundAnalysis from '../components/RefundAnalysis';
import AdviceCenter from '../components/AdviceCenter';
import { parseOrderData, groupBySpec, calculateProfit, filterOrdersByTimeRange, filterMarketingByTimeRange, mergeMarketingData, calculatePeriodComparison } from '../utils/dataProcessor';
import { OrderData, DetailedCostConfig, MarketingDataRow, TimeRange } from '../types';
import { LayoutDashboard, Upload, RefreshCw, ShoppingCart, Megaphone, Calendar, Search, X, RefreshCcw, Lightbulb } from 'lucide-react';

export default function Dashboard() {
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [marketingData] = useState<MarketingDataRow[]>([]);
  const [costConfig, setCostConfig] = useState<DetailedCostConfig>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'analysis' | 'cost' | 'marketing' | 'refund' | 'advice'>('overview');
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
    () => calculatePeriodComparison(orders, timeRange),
    [orders, timeRange]
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

  // 加载销售数据（CSV）
  const loadSalesData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/orders.csv');
      const csvText = await response.text();
      const parsedOrders = parseOrderData(csvText);
      setOrders(parsedOrders);
    } catch (error) {
      console.error('加载销售数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    // 从localStorage加载成本配置（兼容新旧key）
    const savedConfig = localStorage.getItem('detailedCostConfig') || localStorage.getItem('costConfig');
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        setCostConfig(parsed);
      } catch (e) {
        console.error('解析成本配置失败:', e);
      }
    }
    
    loadSalesData();
  }, []);

  // 成本变更处理
  const handleCostChange = useCallback((newCostConfig: DetailedCostConfig) => {
    setCostConfig(newCostConfig);
    localStorage.setItem('detailedCostConfig', JSON.stringify(newCostConfig));
  }, []);

  // 处理销售数据文件上传
  const handleSalesFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const parsedOrders = parseOrderData(text);
          setOrders(parsedOrders);
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
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">正在加载数据...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
      {/* 顶部导航栏 */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-700/50 sticky top-0 z-50">
        <div className="max-w-[1920px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/25">
                <LayoutDashboard className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">电商数据分析仪表板</h1>
                <p className="text-xs text-slate-400">支持销售数据与推广数据分析 | 成本输入与利润计算</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {/* 刷新按钮 */}
              <button
                onClick={loadSalesData}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                刷新数据
              </button>

              <label className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors cursor-pointer">
                <Upload className="w-4 h-4" />
                上传销售 CSV
                <input
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={handleSalesFileUpload}
                />
              </label>

              <div className="text-sm text-slate-400">
                更新: {new Date().toLocaleDateString('zh-CN')}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 数据状态栏 */}
      <div className="max-w-[1920px] mx-auto px-6 pt-4 space-y-3">
        {/* 商品ID搜索栏 */}
        <div className="bg-slate-800/30 rounded-lg px-4 py-3 border border-slate-700/30 flex items-center justify-between gap-4 flex-wrap">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="输入商品ID查询（如 123456）"
                className="pl-9 pr-3 py-1.5 bg-slate-900/60 border border-slate-700/50 rounded-md text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 w-72"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  title="清除"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-md text-sm transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
              查询
            </button>
            {searchProductId && (
              <div className="flex items-center gap-2 ml-2 px-3 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded-md">
                <span className="text-xs text-cyan-300">当前查询:</span>
                <span className="text-sm text-white font-mono">{searchProductId}</span>
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="text-cyan-400 hover:text-white"
                  title="取消查询"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </form>
          <div className="text-xs text-slate-400">
            {searchProductId
              ? `已按商品ID筛选：仅显示包含 "${searchProductId}" 的数据`
              : '未启用商品ID筛选：显示全部数据'}
          </div>
        </div>

        <div className="flex items-center justify-between bg-slate-800/30 rounded-lg px-4 py-3 border border-slate-700/30">
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-green-400" />
              <span className="text-slate-300">
                销售订单: <strong className="text-white">{filteredOrders.length}</strong> 条
              </span>
            </div>
            <div className="flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4 text-blue-400" />
              <span className="text-slate-300">
                商品规格: <strong className="text-white">{filteredSummaries.length}</strong> 个
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-purple-400" />
              <span className="text-slate-300">
                推广记录: <strong className="text-white">{filteredMarketingData.length}</strong> 条
              </span>
            </div>
          </div>
          
          {/* 时间筛选 + 快速跳转按钮 */}
          <div className="flex items-center gap-3">
            {/* 时间筛选 */}
            <div className="flex items-center gap-2 bg-slate-900/50 rounded-md p-1 border border-slate-700/50">
              <Calendar className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
              <div className="flex gap-0.5">
                {timeRangeOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTimeRange(opt.value)}
                    className={`px-2.5 py-1 rounded text-xs transition-colors ${
                      timeRange === opt.value
                        ? 'bg-cyan-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 快速跳转按钮 */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-3 py-1 rounded text-xs transition-colors ${
                  activeTab === 'overview'
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >总览</button>
              <button
                onClick={() => setActiveTab('analysis')}
                className={`px-3 py-1 rounded text-xs transition-colors ${
                  activeTab === 'analysis'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                商品分析
              </button>
              <button
                onClick={() => setActiveTab('cost')}
                className={`px-3 py-1 rounded text-xs transition-colors ${
                  activeTab === 'cost'
                    ? 'bg-orange-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >利润计算</button>
              <button
                onClick={() => setActiveTab('marketing')}
                className={`px-3 py-1 rounded text-xs transition-colors ${
                  activeTab === 'marketing'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                营销数据
              </button>
              <button
                onClick={() => setActiveTab('refund')}
                className={`flex items-center gap-1 px-3 py-1 rounded text-xs transition-colors ${
                  activeTab === 'refund'
                    ? 'bg-red-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <RefreshCcw className="w-3 h-3" />
                退款分析
              </button>
              <button
                onClick={() => setActiveTab('advice')}
                className={`flex items-center gap-1 px-3 py-1 rounded text-xs transition-colors ${
                  activeTab === 'advice'
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <Lightbulb className="w-3 h-3" />
                智能建议
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <main className="max-w-[1920px] mx-auto px-6 py-8">
        {activeTab === 'overview' && (
          <OrderOverview
            orders={filteredOrders}
            summaries={filteredSummaries}
            costConfig={costConfig}
            periodComparison={periodComparison}
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
      <footer className="mt-8 py-6 border-t border-slate-700/50 text-center">
        <p className="text-sm text-slate-500">
          电商数据分析仪表板 | 支持多数据源导入 | 实时计算成本与利润
        </p>
      </footer>
    </div>
  );
}
