import { OrderData, ProductSummary, DetailedCostConfig, TimeRange, MarketingDataRow, RefundStat, RefundOverview, PeriodComparison, MetricComparison, Advice, BudgetSuggestion } from '../types';

/**
 * 解析日期字符串为本地时间 Date 对象，避免时区偏差
 * 支持 "2026-06-20"、"2026/6/20"、"2026-06-20 10:21:37" 等格式
 */
function parseLocalDate(dateStr: string): Date {
  // 取日期部分（去掉时间部分）
  const datePart = dateStr.split(' ')[0].replace(/\//g, '-');
  const parts = datePart.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts.map(Number);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      return new Date(year, month - 1, day);
    }
  }
  // 兜底：直接解析（可能有时区问题，但仅对非标准格式）
  return new Date(datePart);
}

/**
 * 根据时间范围筛选订单数据
 * @param orders 订单数据数组
 * @param range 时间范围
 * @returns 筛选后的订单数据数组
 */
export function filterOrdersByTimeRange(orders: OrderData[], range: TimeRange): OrderData[] {
  if (range === 'all') return orders;

  const { start, end } = getTimeRangeBounds(range);
  return orders.filter(order => {
    // 从订单成交时间提取日期（格式：2026-06-20 10:21:37 -> 2026-06-20）
    const dateStr = order.订单成交时间.split(' ')[0];
    if (!dateStr) return false;
    const date = parseLocalDate(dateStr);
    if (isNaN(date.getTime())) return false;
    return date >= start && date <= end;
  });
}

/**
 * 根据时间范围筛选营销数据
 * @param marketingData 营销数据数组
 * @param range 时间范围
 * @returns 筛选后的营销数据数组
 */
export function filterMarketingByTimeRange(marketingData: MarketingDataRow[], range: TimeRange): MarketingDataRow[] {
  if (range === 'all') return marketingData;

  const { start, end } = getTimeRangeBounds(range);
  return marketingData.filter(row => {
    if (!row.日期) return false;
    const date = parseLocalDate(row.日期);
    if (isNaN(date.getTime())) return false;
    return date >= start && date <= end;
  });
}

/**
 * 获取时间范围的起止日期（按自然日，今日为结束日）
 */
function getTimeRangeBounds(range: TimeRange): { start: Date; end: Date } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  switch (range) {
    case 'today':
      // start 已经是今日 00:00:00
      break;
    case '7d':
      start.setDate(start.getDate() - 6); // 含今日共7天
      break;
    case '15d':
      start.setDate(start.getDate() - 14); // 含今日共15天
      break;
    case '30d':
      start.setDate(start.getDate() - 29); // 含今日共30天
      break;
    default:
      break;
  }

  return { start, end };
}

/**
 * 解析CSV行，处理引号包裹的字段及转义引号（""）
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      // 检查是否为转义引号（""）
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // 跳过下一个引号
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * 根据表头获取对应值
 */
function getValue(values: string[], headers: string[], fieldName: string): string {
  const index = headers.findIndex(h => h === fieldName);
  return index >= 0 && index < values.length ? values[index] : '';
}

/**
 * 转换为数字
 */
function toNumber(value: string): number {
  const num = parseFloat(value.replace(/[,\s]/g, ''));
  return isNaN(num) ? 0 : num;
}

/**
 * 判断订单是否有效（排除退款成功的订单）
 */
function isValidOrder(order: OrderData): boolean {
  // 排除退款成功的订单
  if (order.售后状态.includes('退款成功')) {
    return false;
  }

  // 只统计已收货或已发货的订单
  const validStatuses = ['已收货', '已发货', '待收货'];
  return validStatuses.some(status => order.订单状态.includes(status));
}

/**
 * 解析CSV订单数据
 * @param csvText CSV文本内容
 * @returns 解析后的订单数据数组
 */
export function parseOrderData(csvText: string): OrderData[] {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  // 获取表头
  const headers = parseCSVLine(lines[0]);

  // 解析数据行
  const orders: OrderData[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < headers.length) continue;

    const order: OrderData = {
      商品: getValue(values, headers, '商品'),
      订单号: getValue(values, headers, '订单号'),
      订单状态: getValue(values, headers, '订单状态'),
      商品总价: toNumber(getValue(values, headers, '商品总价(元)')),
      邮费: toNumber(getValue(values, headers, '邮费(元)')),
      店铺优惠折扣: toNumber(getValue(values, headers, '店铺优惠折扣(元)')),
      平台优惠折扣: toNumber(getValue(values, headers, '平台优惠折扣(元)')),
      多多支付立减金额: toNumber(getValue(values, headers, '多多支付立减金额(元)')),
      用户实付金额: toNumber(getValue(values, headers, '用户实付金额(元)')),
      商家实收金额: toNumber(getValue(values, headers, '商家实收金额(元)')),
      商品数量: toNumber(getValue(values, headers, '商品数量(件)')),
      发货时间: getValue(values, headers, '发货时间'),
      确认收货时间: getValue(values, headers, '确认收货时间'),
      商品id: getValue(values, headers, '商品id'),
      商品规格: getValue(values, headers, '商品规格'),
      样式ID: getValue(values, headers, '样式ID'),
      商家编码_规格维度: getValue(values, headers, '商家编码-规格维度'),
      商家编码_商品维度: getValue(values, headers, '商家编码-商品维度'),
      商家备注: getValue(values, headers, '商家备注'),
      售后状态: getValue(values, headers, '售后状态'),
      快递单号: getValue(values, headers, '快递单号'),
      快递公司: getValue(values, headers, '快递公司'),
      订单成交时间: getValue(values, headers, '订单成交时间')
    };

    orders.push(order);
  }

  return orders;
}

/**
 * 按商品规格分组统计
 * @param orders 订单数据数组
 * @returns 按规格分组的产品汇总数组
 */
export function groupBySpec(orders: OrderData[]): ProductSummary[] {
  // 按商品规格分组（包含所有订单，用于计算真实退款率）
  const specMap = new Map<string, {
    销售额: number;       // 有效订单销售额
    销量: number;
    订单数: number;       // 有效订单数
    商品名称: string;
    商品ID: string;
    退款成功额: number;   // 退款成功订单的商家实收金额
    总订单数: number;     // 含退款的全部订单数
  }>();

  orders.forEach(order => {
    const spec = order.商品规格 || '未知规格';
    const existing = specMap.get(spec) || {
      销售额: 0,
      销量: 0,
      订单数: 0,
      商品名称: order.商品,
      商品ID: order.商品id,
      退款成功额: 0,
      总订单数: 0,
    };

    existing.总订单数 += 1;

    if (isValidOrder(order)) {
      existing.销售额 += order.商家实收金额;
      existing.销量 += order.商品数量;
      existing.订单数 += 1;
    }

    if (order.售后状态.includes('退款成功')) {
      existing.退款成功额 += order.商家实收金额;
    }

    specMap.set(spec, existing);
  });

  // 转换为ProductSummary数组并计算平均客单价
  const summaries: ProductSummary[] = [];
  specMap.forEach((data, spec) => {
    // 真实退款率（按金额）：退款成功额 / (有效销售额 + 退款成功额) * 100
    const totalAmount = data.销售额 + data.退款成功额;
    const 真实退款率 = totalAmount > 0 ? (data.退款成功额 / totalAmount) * 100 : 0;

    const summary: ProductSummary = {
      规格: spec,
      商品ID: data.商品ID,
      商品名称: data.商品名称,
      销售额: Math.round(data.销售额 * 100) / 100,
      销量: data.销量,
      订单数: data.订单数,
      平均客单价: data.订单数 > 0 ? Math.round((data.销售额 / data.订单数) * 100) / 100 : 0,
      营销花费: 0,
      // 详细成本项（默认值，由calculateProfit填充）
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
      真实退款率: Math.round(真实退款率 * 100) / 100,
      订单引流成本: 0,
      总成本: 0,
      预估退款损失: 0,
      净利润: 0,
      利润率: 0,
      SKU净利润: 0
    };
    summaries.push(summary);
  });

  // 按销售额降序排序
  summaries.sort((a, b) => b.销售额 - a.销售额);

  return summaries;
}

/**
 * 合并营销数据到商品汇总
 * 按商品ID汇总总营销花费，计算订单引流成本 = 该商品ID总营销花费 / 该商品ID总订单数
 * @param summaries 商品汇总数组（按规格分组）
 * @param marketingData 营销数据数组
 * @returns 合并后的商品汇总数组（填充 营销花费 和 订单引流成本 字段）
 */
export function mergeMarketingData(
  summaries: ProductSummary[],
  marketingData: MarketingDataRow[]
): ProductSummary[] {
  if (marketingData.length === 0) {
    return summaries.map(item => ({ ...item, 营销花费: 0, 订单引流成本: 0 }));
  }

  // 按商品ID汇总总营销花费
  const marketingMap = new Map<string, number>();
  marketingData.forEach(row => {
    const id = row.商品ID;
    if (!id) return;
    marketingMap.set(id, (marketingMap.get(id) || 0) + (row.总营销花费 || 0));
  });

  // 按商品ID汇总订单数（同一商品ID可能对应多个规格）
  const orderCountMap = new Map<string, number>();
  summaries.forEach(item => {
    const id = item.商品ID;
    if (!id) return;
    orderCountMap.set(id, (orderCountMap.get(id) || 0) + item.订单数);
  });

  // 合并到 summaries：设置营销花费和订单引流成本
  return summaries.map(item => {
    const totalMarketing = marketingMap.get(item.商品ID) || 0;
    const totalOrders = orderCountMap.get(item.商品ID) || 0;
    const 订单引流成本 = totalOrders > 0 ? Math.round((totalMarketing / totalOrders) * 100) / 100 : 0;
    return {
      ...item,
      营销花费: Math.round(totalMarketing * 100) / 100,
      订单引流成本,
    };
  });
}

/**
 * 计算产品利润（详细版 - 支持多维度成本）
 * @param summary 产品汇总数据
 * @param costConfig 详细成本配置
 * @returns 包含完整利润信息的产品汇总
 */
export function calculateProfit(summary: ProductSummary, costConfig: DetailedCostConfig): ProductSummary {
  // 获取该规格的成本配置
  const costItem = costConfig[summary.规格] || { 成本单价: 0 };

  // 1. 商品成本 = 成本单价 × 销量
  const totalProductCost = (costItem.成本单价 || 0) * summary.销量;
  const laborCost = (costItem.人工成本 || 0) * summary.销量;
  const operatingCost = (costItem.运营成本 || 0) * summary.销量;

  // 2. 平台技术服务费（固定 0.6%）
  const platformFeeRate = 0.006; // 0.6%
  const platformFee = Math.round(summary.销售额 * platformFeeRate * 100) / 100;

  // 3. 商家承担优惠（单件费用 × 销量）
  const merchantDiscount = (costItem.商家承担优惠 || 0) * summary.销量;

  // 4. 快递费（单件费用 × 销量）
  const shippingFee = (costItem.启用快递费 ? (costItem.快递费 || 0) : 0) * summary.销量;

  // 5. 包装耗材（单件费用 × 销量）
  const packagingCost = (costItem.启用包装耗材 ? (costItem.包装耗材 || 0) : 0) * summary.销量;

  // 6. 商家版运费险（单件费用 × 销量）
  const shippingInsurance = (costItem.启用运费险 ? (costItem.运费险 || 0) : 0) * summary.销量;

  // 7. 计算总成本（所有项均为总额）
  const totalCost = Math.round((totalProductCost + laborCost + operatingCost + platformFee + merchantDiscount + shippingFee + packagingCost + shippingInsurance) * 100) / 100;

  // 8. 预估退款损失 = 退款收入损失 + 退回运费损失
  // 优先级：用户手动启用并输入 → 用用户值（假设分析）；否则 → 自动用真实退款率
  const userRefundRate = costItem.启用退款率 ? (costItem.退款率 || 0) : 0;
  const effectiveRefundRate = costItem.启用退款率 ? userRefundRate : (summary.真实退款率 || 0);
  // 退款收入损失 = 销售额 × 退款率
  const refundRevenueLoss = summary.销售额 * effectiveRefundRate / 100;
  // 退回运费损失 = 退货数量 × 单件快递费（退回运费 = 发送快递费）
  const unitShippingFee = costItem.启用快递费 ? (costItem.快递费 || 0) : 0;
  const returnShippingLoss = unitShippingFee > 0
    ? summary.销量 * effectiveRefundRate / 100 * unitShippingFee
    : 0;
  const estimatedRefundLoss = Math.round((refundRevenueLoss + returnShippingLoss) * 100) / 100;

  // 9. 订单引流成本总额 = 订单引流成本 × 订单数（来自营销数据合并）
  const 引流成本总额 = Math.round(((summary.订单引流成本 || 0) * summary.订单数) * 100) / 100;

  // 10. 净利润 = 销售额 - 总成本 - 预估退款损失 - 引流成本总额
  const netProfit = Math.round((summary.销售额 - totalCost - estimatedRefundLoss - 引流成本总额) * 100) / 100;

  // 11. 利润率 = 净利润 / 销售额 * 100
  const profitRate = summary.销售额 > 0 ? (netProfit / summary.销售额) * 100 : 0;

  // 12. SKU 单件净利润（与利润计算模块 CostInputPanel 一致）
  // 当定价 > 0 且成本单价 > 0 时计算：定价 - 单件总成本 - 单件预估退款损失
  let skuNetProfit = 0;
  const unitPrice = costItem.定价 || 0;
  const unitCost = costItem.成本单价 || 0;
  if (unitPrice > 0 && unitCost > 0) {
    const unitPlatformFee = unitPrice * 0.006;
    const unitOptionalCost = (costItem.商家承担优惠 || 0)
      + (costItem.人工成本 || 0)
      + (costItem.运营成本 || 0)
      + (costItem.启用快递费 ? (costItem.快递费 || 0) : 0)
      + (costItem.启用包装耗材 ? (costItem.包装耗材 || 0) : 0)
      + (costItem.启用运费险 ? (costItem.运费险 || 0) : 0);
    const unitTotalCost = unitCost + unitPlatformFee + unitOptionalCost;
    // 退款率优先级同上：用户启用 → 用户值；否则 → 真实退款率
    const unitRefundRate = costItem.启用退款率 ? (costItem.退款率 || 0) : (summary.真实退款率 || 0);
    // 单件退款损失 = 退款收入损失 + 退回运费损失（与 CostInputPanel 一致）
    const unitRefundRevenueLoss = unitRefundRate > 0 ? unitPrice * (unitRefundRate / 100) : 0;
    const unitReturnShippingLoss = unitShippingFee > 0 && unitRefundRate > 0
      ? unitShippingFee * (unitRefundRate / 100)
      : 0;
    const unitRefundLoss = unitRefundRevenueLoss + unitReturnShippingLoss;
    skuNetProfit = Math.round((unitPrice - unitTotalCost - unitRefundLoss) * 100) / 100;
  }

  // 返回新的汇总对象（不修改原对象）
  return {
    ...summary,
    成本单价: costItem.成本单价 || 0,
    总商品成本: Math.round(totalProductCost * 100) / 100,
    人工成本: Math.round(laborCost * 100) / 100,
    运营成本: Math.round(operatingCost * 100) / 100,
    平台技术服务费: platformFee,
    商家承担优惠: Math.round(merchantDiscount * 100) / 100,
    快递费: Math.round(shippingFee * 100) / 100,
    包装耗材: Math.round(packagingCost * 100) / 100,
    运费险: Math.round(shippingInsurance * 100) / 100,
    退款率: effectiveRefundRate,
    总成本: totalCost,
    预估退款损失: estimatedRefundLoss,
    净利润: netProfit,
    利润率: Math.round(profitRate * 100) / 100,
    SKU净利润: skuNetProfit
  };
}

/**
 * 解析营销数据CSV（从Excel导出的CSV格式）
 */
export function parseMarketingCSV(csvText: string): MarketingDataRow[] {
  const lines = csvText.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    return [];
  }

  // 解析表头
  const headers = parseCSVLine(lines[0]);
  if (!headers.includes('商品ID') || !headers.includes('总营销花费(元)')) {
    return [];
  }
  
  // 解析数据行
  const data: MarketingDataRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    
    if (values.length < headers.length || !values[0].trim()) {
      continue;
    }
    
    try {
      const row: MarketingDataRow = {
        日期: getValue(values, headers, '日期'),
        商品ID: getValue(values, headers, '商品ID'),
        商品名称: getValue(values, headers, '商品名称'),
        推广场景: getValue(values, headers, '推广场景'),
        推广名称: getValue(values, headers, '推广名称'),
        出价方式: getValue(values, headers, '出价方式'),
        分组: getValue(values, headers, '分组'),
        是否已删除: getValue(values, headers, '是否已删除'),
        成交营销花费: toNumber(getValue(values, headers, '成交营销花费(元)')),
        交易额: toNumber(getValue(values, headers, '交易额(元)')),
        实际投产比: toNumber(getValue(values, headers, '实际投产比')),
        总营销花费: toNumber(getValue(values, headers, '总营销花费(元)')),
        推广成交花费: toNumber(getValue(values, headers, '推广成交花费(元)')),
        结算券花费: toNumber(getValue(values, headers, '结算券花费(元)')),
        推广总花费: toNumber(getValue(values, headers, '推广总花费(元)')),
        净交易额: toNumber(getValue(values, headers, '净交易额(元)')),
        实际净投产比: toNumber(getValue(values, headers, '实际净投产比')),
        净成交笔数: parseInt(getValue(values, headers, '净成交笔数')) || 0,
        每笔净成交花费: toNumber(getValue(values, headers, '每笔净成交花费(元)')),
        净交易额占比: getValue(values, headers, '净交易额占比'),
        净成交笔数占比: getValue(values, headers, '净成交笔数占比'),
        每笔净成交金额: toNumber(getValue(values, headers, '每笔净成交金额(元)')),
        结算交易额: toNumber(getValue(values, headers, '结算交易额(元)')),
        结算投产比: toNumber(getValue(values, headers, '结算投产比')),
        结算成交笔数: parseInt(getValue(values, headers, '结算成交笔数')) || 0,
        退款豁免率: getValue(values, headers, '退款豁免率'),
        退单豁免率: getValue(values, headers, '退单豁免率'),
        净推广交易额: toNumber(getValue(values, headers, '净推广交易额(元)')),
        净成交券金额: toNumber(getValue(values, headers, '净成交券金额(元)')),
        实际净推广投产比: toNumber(getValue(values, headers, '实际净推广投产比')),
        每笔净成交推广花费: toNumber(getValue(values, headers, '每笔净成交推广花费(元)')),
        每笔结算成交花费: toNumber(getValue(values, headers, '每笔结算成交花费(元)')),
        交易额结算率: getValue(values, headers, '交易额结算率'),
        订单结算率: getValue(values, headers, '订单结算率'),
        每笔结算成交金额: toNumber(getValue(values, headers, '每笔结算成交金额(元)')),
        成交笔数: parseInt(getValue(values, headers, '成交笔数')) || 0,
        每笔成交花费: toNumber(getValue(values, headers, '每笔成交花费(元)')),
        每笔成交金额: toNumber(getValue(values, headers, '每笔成交金额(元)')),
        直接交易额: toNumber(getValue(values, headers, '直接交易额(元)')),
        间接交易额: toNumber(getValue(values, headers, '间接交易额(元)')),
        直接成交笔数: parseInt(getValue(values, headers, '直接成交笔数')) || 0,
        间接成交笔数: parseInt(getValue(values, headers, '间接成交笔数')) || 0,
        曝光量: parseInt(getValue(values, headers, '曝光量').replace(/,/g, '')) || 0,
        点击量: parseInt(getValue(values, headers, '点击量').replace(/,/g, '')) || 0,
        询单花费: toNumber(getValue(values, headers, '询单花费(元)')),
        询单量: parseInt(getValue(values, headers, '询单量')) || 0,
        平均询单成本: toNumber(getValue(values, headers, '平均询单成本(元)')),
        收藏花费: toNumber(getValue(values, headers, '收藏花费(元)')),
        收藏量: parseInt(getValue(values, headers, '收藏量')) || 0,
        平均收藏成本: toNumber(getValue(values, headers, '平均收藏成本(元)')),
        关注花费: toNumber(getValue(values, headers, '关注花费(元)')),
        关注量: parseInt(getValue(values, headers, '关注量')) || 0,
        平均关注成本: toNumber(getValue(values, headers, '平均关注成本(元)')),
      };
      
      data.push(row);
    } catch (error) {
      console.warn(`解析营销数据第${i + 1}行失败:`, error);
    }
  }
  
  return data;
}

// ============ 退款专项分析 ============

/**
 * 判断订单是否为退款订单（售后状态含"退款"）
 */
function isRefundOrder(order: OrderData): boolean {
  return order.售后状态.includes('退款');
}

/**
 * 判断订单是否为退款成功订单
 */
function isRefundSuccessOrder(order: OrderData): boolean {
  return order.售后状态.includes('退款成功');
}

/**
 * 计算退款总览统计
 */
export function calculateRefundOverview(orders: OrderData[]): RefundOverview {
  const totalOrders = orders.length;
  const refundOrders = orders.filter(isRefundOrder);
  const refundSuccessOrders = orders.filter(isRefundSuccessOrder);

  const refundSuccessAmount = refundSuccessOrders.reduce((sum, o) => sum + o.商家实收金额, 0);
  const validSales = orders
    .filter(o => !isRefundSuccessOrder(o))
    .reduce((sum, o) => sum + o.商家实收金额, 0);

  const overallRefundRate = totalOrders > 0 ? (refundOrders.length / totalOrders) * 100 : 0;
  const lossRatio = (validSales + refundSuccessAmount) > 0
    ? (refundSuccessAmount / (validSales + refundSuccessAmount)) * 100
    : 0;

  // 高退款率SKU数（在 calculateRefundStats 中计算）
  const stats = calculateRefundStats(orders);
  const highRefundSkuCount = stats.filter(s => s.退款率 > 20).length;

  return {
    总订单数: totalOrders,
    退款订单数: refundOrders.length,
    退款成功订单数: refundSuccessOrders.length,
    整体退款率: Math.round(overallRefundRate * 100) / 100,
    退款成功总金额: Math.round(refundSuccessAmount * 100) / 100,
    退款损失占比: Math.round(lossRatio * 100) / 100,
    高退款率SKU数: highRefundSkuCount,
  };
}

/**
 * 按规格维度计算退款统计
 */
export function calculateRefundStats(orders: OrderData[]): RefundStat[] {
  const map = new Map<string, {
    规格: string;
    商品ID: string;
    商品名称: string;
    总订单数: number;
    退款订单数: number;
    退款成功订单数: number;
    退款成功额: number;
    销售额: number;
  }>();

  orders.forEach(order => {
    const spec = order.商品规格 || '未知规格';
    const existing = map.get(spec) || {
      规格: spec,
      商品ID: order.商品id,
      商品名称: order.商品,
      总订单数: 0,
      退款订单数: 0,
      退款成功订单数: 0,
      退款成功额: 0,
      销售额: 0,
    };

    existing.总订单数 += 1;
    if (isRefundOrder(order)) existing.退款订单数 += 1;
    if (isRefundSuccessOrder(order)) {
      existing.退款成功订单数 += 1;
      existing.退款成功额 += order.商家实收金额;
    } else {
      existing.销售额 += order.商家实收金额;
    }

    map.set(spec, existing);
  });

  const result: RefundStat[] = [];
  map.forEach(data => {
    const 退款率 = data.总订单数 > 0 ? (data.退款订单数 / data.总订单数) * 100 : 0;
    const totalAmount = data.销售额 + data.退款成功额;
    const 退款损失占比 = totalAmount > 0 ? (data.退款成功额 / totalAmount) * 100 : 0;
    result.push({
      规格: data.规格,
      商品ID: data.商品ID,
      商品名称: data.商品名称,
      总订单数: data.总订单数,
      退款订单数: data.退款订单数,
      退款成功订单数: data.退款成功订单数,
      退款率: Math.round(退款率 * 100) / 100,
      退款成功额: Math.round(data.退款成功额 * 100) / 100,
      销售额: Math.round(data.销售额 * 100) / 100,
      退款损失占比: Math.round(退款损失占比 * 100) / 100,
    });
  });

  // 按退款率降序
  result.sort((a, b) => b.退款率 - a.退款率);
  return result;
}

// ============ 环比/同比对比 ============

/**
 * 获取时间范围的偏移天数
 */
function getRangeDays(range: TimeRange): number {
  switch (range) {
    case 'today': return 1;
    case '7d': return 7;
    case '15d': return 15;
    case '30d': return 30;
    default: return 0; // all 不支持环比
  }
}

/**
 * 获取上一周期的起止日期
 */
function getPreviousPeriodBounds(range: TimeRange): { start: Date; end: Date } {
  const days = getRangeDays(range);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  end.setDate(end.getDate() - days);

  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  return { start, end };
}

/**
 * 筛选指定日期范围内的订单
 */
function filterOrdersByDateRange(orders: OrderData[], start: Date, end: Date): OrderData[] {
  return orders.filter(order => {
    const dateStr = order.订单成交时间.split(' ')[0];
    if (!dateStr) return false;
    const date = parseLocalDate(dateStr);
    if (isNaN(date.getTime())) return false;
    return date >= start && date <= end;
  });
}

/**
 * 计算订单集合的关键指标
 */
function calculateOrdersMetrics(orders: OrderData[]): {
  销售额: number;
  销量: number;
  订单数: number;
  商家实收: number;
  平均客单价: number;
} {
  const validStatuses = ['已收货', '已发货', '待收货'];
  const validOrders = orders.filter(o =>
    !o.售后状态.includes('退款成功') &&
    validStatuses.some(s => o.订单状态.includes(s))
  );

  const 销售额 = validOrders.reduce((sum, o) => sum + o.商家实收金额, 0);
  const 销量 = validOrders.reduce((sum, o) => sum + o.商品数量, 0);
  const 订单数 = validOrders.length;
  const 商家实收 = 销售额;
  const 平均客单价 = 订单数 > 0 ? 销售额 / 订单数 : 0;

  return {
    销售额: Math.round(销售额 * 100) / 100,
    销量,
    订单数,
    商家实收: Math.round(商家实收 * 100) / 100,
    平均客单价: Math.round(平均客单价 * 100) / 100,
  };
}

/**
 * 计算单个指标的环比
 */
function compareMetric(current: number, previous: number): MetricComparison {
  const change = Math.round((current - previous) * 100) / 100;
  const changeRate = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : 0;
  return {
    current,
    previous,
    change,
    changeRate: Math.round(changeRate * 100) / 100,
  };
}

/**
 * 计算环比对比（当前周期 vs 上一周期）
 * @param orders 全部订单数据（未按时间筛选）
 * @param range 当前时间范围
 */
export function calculatePeriodComparison(orders: OrderData[], range: TimeRange): PeriodComparison | null {
  if (range === 'all') return null;

  const currentBounds = getTimeRangeBounds(range);
  const previousBounds = getPreviousPeriodBounds(range);

  const currentOrders = filterOrdersByDateRange(orders, currentBounds.start, currentBounds.end);
  const previousOrders = filterOrdersByDateRange(orders, previousBounds.start, previousBounds.end);

  const currentMetrics = calculateOrdersMetrics(currentOrders);
  const previousMetrics = calculateOrdersMetrics(previousOrders);

  return {
    销售额: compareMetric(currentMetrics.销售额, previousMetrics.销售额),
    销量: compareMetric(currentMetrics.销量, previousMetrics.销量),
    订单数: compareMetric(currentMetrics.订单数, previousMetrics.订单数),
    商家实收: compareMetric(currentMetrics.商家实收, previousMetrics.商家实收),
    平均客单价: compareMetric(currentMetrics.平均客单价, previousMetrics.平均客单价),
  };
}

// ============ 智能运营建议 ============

/**
 * 生成智能运营建议
 * @param summaries 商品汇总（含利润计算）
 * @param refundOverview 退款总览
 * @param refundStats 退款明细
 * @param marketingData 营销数据
 * @param periodComparison 环比对比（可选）
 */
export function generateAdvice(
  summaries: ProductSummary[],
  refundOverview: RefundOverview,
  refundStats: RefundStat[],
  marketingData: MarketingDataRow[],
  periodComparison?: PeriodComparison | null
): Advice[] {
  const advice: Advice[] = [];

  // 1. 亏损SKU建议
  const lossSkus = summaries.filter(s => s.销售额 > 0 && s.净利润 < 0);
  lossSkus.slice(0, 5).forEach(s => {
    advice.push({
      id: `loss-${s.规格}`,
      level: 'critical',
      category: 'profit',
      title: `亏损SKU：${s.规格}`,
      description: `销售额 ${s.销售额}，净利润 ${s.净利润}，利润率 ${s.利润率}%`,
      metric: `净利润 ${s.净利润}`,
      suggestion: '建议立即止亏：核查成本是否录入错误，或测试涨价3-5%；若持续亏损考虑下架。',
    });
  });

  // 2. 低利润高销量SKU
  const avgVolume = summaries.length > 0
    ? summaries.reduce((sum, s) => sum + s.销量, 0) / summaries.length
    : 0;
  const lowProfitHighVolume = summaries.filter(s => s.销量 >= avgVolume && s.利润率 < 5 && s.销售额 > 0);
  lowProfitHighVolume.slice(0, 3).forEach(s => {
    advice.push({
      id: `lowprofit-${s.规格}`,
      level: 'warning',
      category: 'profit',
      title: `低利润高销量：${s.规格}`,
      description: `销量 ${s.销量}（高于均值），但利润率仅 ${s.利润率}%`,
      metric: `利润率 ${s.利润率}%`,
      suggestion: '销量高但利润薄，建议优化供应链降成本，或测试小幅涨价（1-3%）看销量是否敏感。',
    });
  });

  // 3. 高退款率SKU
  const highRefundSkus = refundStats.filter(s => s.总订单数 >= 3 && s.退款率 > 20);
  highRefundSkus.slice(0, 5).forEach(s => {
    advice.push({
      id: `refund-${s.规格}`,
      level: s.退款率 > 40 ? 'critical' : 'warning',
      category: 'refund',
      title: `高退款率：${s.规格}`,
      description: `退款率 ${s.退款率}%（${s.退款订单数}/${s.总订单数}），退款损失 ${s.退款成功额} 元`,
      metric: `退款率 ${s.退款率}%`,
      suggestion: '排查商品质量、描述是否与实物相符、物流是否破损；考虑优化详情页或更换快递。',
    });
  });

  // 4. 低ROI推广
  const marketingByProduct = new Map<string, { 花费: number; 交易额: number; 净交易额: number }>();
  marketingData.forEach(row => {
    const id = row.商品ID;
    if (!id) return;
    const existing = marketingByProduct.get(id) || { 花费: 0, 交易额: 0, 净交易额: 0 };
    existing.花费 += row.总营销花费;
    existing.交易额 += row.交易额;
    existing.净交易额 += row.净交易额;
    marketingByProduct.set(id, existing);
  });

  const lowRoiProducts: Advice[] = [];
  marketingByProduct.forEach((data, id) => {
    if (data.花费 < 10) return; // 花费太低不评估
    const netRoi = data.花费 > 0 ? data.净交易额 / data.花费 : 0;
    if (netRoi < 1) {
      const summary = summaries.find(s => s.商品ID === id);
      lowRoiProducts.push({
        id: `lowroi-${id}`,
        level: netRoi < 0.5 ? 'critical' : 'warning',
        category: 'marketing',
        title: `低ROI推广：${summary?.商品名称 || id}`,
        description: `推广花费 ${data.花费.toFixed(2)}，净交易额 ${data.净交易额.toFixed(2)}，净ROI ${netRoi.toFixed(2)}`,
        metric: `净ROI ${netRoi.toFixed(2)}`,
        suggestion: '净ROI < 1 表示推广入不敷出，建议降低出价或暂停该商品推广，把预算转移到高ROI商品。',
      });
    }
  });
  advice.push(...lowRoiProducts.slice(0, 5));

  // 5. 销售环比下滑
  if (periodComparison) {
    if (periodComparison.销售额.changeRate < -10) {
      advice.push({
        id: 'sales-decline',
        level: 'warning',
        category: 'trend',
        title: '销售额环比下滑',
        description: `当前周期销售额 ${periodComparison.销售额.current}，上一周期 ${periodComparison.销售额.previous}，环比 ${periodComparison.销售额.changeRate}%`,
        metric: `环比 ${periodComparison.销售额.changeRate}%`,
        suggestion: '销售额环比下滑超过10%，建议排查：是否主推款断货、推广预算是否缩减、是否有竞品低价截流。',
      });
    }
    if (periodComparison.平均客单价.changeRate < -10) {
      advice.push({
        id: 'aov-decline',
        level: 'info',
        category: 'trend',
        title: '客单价环比下降',
        description: `当前客单价 ${periodComparison.平均客单价.current}，上一周期 ${periodComparison.平均客单价.previous}，环比 ${periodComparison.平均客单价.changeRate}%`,
        metric: `环比 ${periodComparison.平均客单价.changeRate}%`,
        suggestion: '客单价下降可能是低价款占比上升，建议优化关联销售或满减活动提升客单价。',
      });
    }
  }

  // 6. 整体退款率预警
  if (refundOverview.整体退款率 > 15) {
    advice.push({
      id: 'overall-refund',
      level: refundOverview.整体退款率 > 25 ? 'critical' : 'warning',
      category: 'refund',
      title: '整体退款率偏高',
      description: `整体退款率 ${refundOverview.整体退款率}%，退款损失 ${refundOverview.退款成功总金额} 元`,
      metric: `退款率 ${refundOverview.整体退款率}%`,
      suggestion: '整体退款率超过15%，建议全面排查商品质量、物流包装、描述一致性，重点关注高退款率SKU。',
    });
  }

  // 7. 利润健康度提示
  const totalProfit = summaries.reduce((sum, s) => sum + s.净利润, 0);
  const totalSales = summaries.reduce((sum, s) => sum + s.销售额, 0);
  const overallProfitRate = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
  if (overallProfitRate >= 15 && totalProfit > 0) {
    advice.push({
      id: 'profit-healthy',
      level: 'success',
      category: 'profit',
      title: '整体利润健康',
      description: `整体利润率 ${overallProfitRate.toFixed(2)}%，净利润 ${totalProfit.toFixed(2)} 元`,
      metric: `利润率 ${overallProfitRate.toFixed(2)}%`,
      suggestion: '当前盈利状况良好，可考虑加大爆品推广预算，或测试新品拓展。',
    });
  }

  // 排序：critical > warning > info > success
  const levelOrder: Record<string, number> = { critical: 0, warning: 1, info: 2, success: 3 };
  advice.sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);

  return advice;
}

// ============ 推广预算优化建议 ============

/**
 * 生成推广预算优化建议
 * @param marketingData 营销数据
 * @param summaries 商品汇总（用于获取利润率）
 */
export function generateBudgetSuggestions(
  marketingData: MarketingDataRow[],
  summaries: ProductSummary[]
): BudgetSuggestion[] {
  // 按商品ID汇总
  const map = new Map<string, {
    商品ID: string;
    商品名称: string;
    当前花费: number;
    交易额: number;
    净交易额: number;
  }>();

  marketingData.forEach(row => {
    const id = row.商品ID;
    if (!id) return;
    const existing = map.get(id) || {
      商品ID: id,
      商品名称: row.商品名称,
      当前花费: 0,
      交易额: 0,
      净交易额: 0,
    };
    existing.当前花费 += row.总营销花费;
    existing.交易额 += row.交易额;
    existing.净交易额 += row.净交易额;
    map.set(id, existing);
  });

  const result: BudgetSuggestion[] = [];
  map.forEach(data => {
    if (data.当前花费 < 10) return; // 花费太低不评估

    const 当前ROI = data.当前花费 > 0 ? data.交易额 / data.当前花费 : 0;
    const 净ROI = data.当前花费 > 0 ? data.净交易额 / data.当前花费 : 0;

    // 获取该商品的利润率（取该商品ID下任一规格）
    const summary = summaries.find(s => s.商品ID === data.商品ID);
    const profitRate = summary?.利润率 || 0;

    let 建议: BudgetSuggestion['建议'];
    let 建议说明: string;
    let 预计调整比例: number;
    let 预计影响利润: number;

    if (净ROI < 0.5) {
      // 净ROI极低，建议停止
      建议 = 'stop';
      建议说明 = `净ROI仅 ${净ROI.toFixed(2)}，推广严重入不敷出`;
      预计调整比例 = -100;
      // 停止推广后：节省花费，但损失净交易额对应的利润
      const 净交易额利润 = data.净交易额 * (profitRate / 100);
      预计影响利润 = Math.round((data.当前花费 - 净交易额利润) * 100) / 100;
    } else if (净ROI < 1) {
      // 净ROI < 1，建议大幅降低
      建议 = 'decrease';
      建议说明 = `净ROI ${净ROI.toFixed(2)} < 1，推广亏损`;
      预计调整比例 = -50;
      const newCost = data.当前花费 * 0.5;
      const newRevenue = data.净交易额 * 0.5;
      const newProfit = newRevenue * (profitRate / 100) - newCost;
      const oldProfit = data.净交易额 * (profitRate / 100) - data.当前花费;
      预计影响利润 = Math.round((newProfit - oldProfit) * 100) / 100;
    } else if (净ROI < 2) {
      // 净ROI 1-2，建议小幅降低或维持
      建议 = profitRate > 10 ? 'maintain' : 'decrease';
      建议说明 = 建议 === 'maintain'
        ? `净ROI ${净ROI.toFixed(2)}，利润率 ${profitRate.toFixed(2)}%健康，维持当前预算`
        : `净ROI ${净ROI.toFixed(2)}偏低，利润率 ${profitRate.toFixed(2)}%薄，建议小幅降低`;
      预计调整比例 = 建议 === 'maintain' ? 0 : -20;
      const factor = 建议 === 'maintain' ? 1 : 0.8;
      const newCost = data.当前花费 * factor;
      const newRevenue = data.净交易额 * factor;
      const newProfit = newRevenue * (profitRate / 100) - newCost;
      const oldProfit = data.净交易额 * (profitRate / 100) - data.当前花费;
      预计影响利润 = Math.round((newProfit - oldProfit) * 100) / 100;
    } else if (净ROI < 4) {
      // 净ROI 2-4，建议维持或小幅增加
      建议 = 'maintain';
      建议说明 = `净ROI ${净ROI.toFixed(2)}表现良好，维持当前预算`;
      预计调整比例 = 0;
      预计影响利润 = 0;
    } else {
      // 净ROI >= 4，建议增加预算
      建议 = 'increase';
      建议说明 = `净ROI ${净ROI.toFixed(2)}优秀，建议增加预算放大收益`;
      预计调整比例 = 30;
      const newCost = data.当前花费 * 1.3;
      const newRevenue = data.净交易额 * 1.3;
      const newProfit = newRevenue * (profitRate / 100) - newCost;
      const oldProfit = data.净交易额 * (profitRate / 100) - data.当前花费;
      预计影响利润 = Math.round((newProfit - oldProfit) * 100) / 100;
    }

    result.push({
      商品ID: data.商品ID,
      商品名称: data.商品名称,
      当前花费: Math.round(data.当前花费 * 100) / 100,
      交易额: Math.round(data.交易额 * 100) / 100,
      净交易额: Math.round(data.净交易额 * 100) / 100,
      当前ROI: Math.round(当前ROI * 100) / 100,
      净ROI: Math.round(净ROI * 100) / 100,
      建议,
      建议说明,
      预计调整比例,
      预计影响利润,
    });
  });

  // 按净ROI升序（最差的在前）
  result.sort((a, b) => a.净ROI - b.净ROI);
  return result;
}
