import { OrderData, ProductSummary, DetailedCostConfig, CostItem, TimeRange, MarketingDataRow, RefundStat, RefundOverview, PeriodComparison, MetricComparison, Advice, BudgetSuggestion, AISuggestion, AIPriceInput, AIPriceResult, BundleSuggestion, SkuDetailRow, SkuDetailOverview, SkuVerdict, SkuDetailDimension } from '../types';

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
 * 订单去重：按「订单号 + 商品规格」为唯一键（同一订单可含多个规格行，分别保留）
 * 后出现的记录覆盖先出现的（同一键时取最新）
 */
export function dedupeOrders(orders: OrderData[]): OrderData[] {
  const map = new Map<string, OrderData>();
  for (const order of orders) {
    map.set(`${order.订单号}|${order.商品规格}`, order);
  }
  return Array.from(map.values());
}

/**
 * 合并订单：已有数据 + 新上传数据，去重后返回合并结果与统计
 * （用于多文件、多日期段、多店铺表格的累计导入；重复行以最新上传为准）
 */
export function mergeOrders(existing: OrderData[], incoming: OrderData[]): { merged: OrderData[]; added: number; duplicates: number } {
  const merged = dedupeOrders([...existing, ...incoming]);
  const added = merged.length - existing.length;
  return { merged, added, duplicates: incoming.length - added };
}

/**
 * 营销数据去重：按「日期 + 商品ID + 推广名称 + 推广场景」为唯一键
 * （同一商品在多个推广计划/场景下各有一行，需全部保留）
 */
export function dedupeMarketingData(rows: MarketingDataRow[]): MarketingDataRow[] {
  const map = new Map<string, MarketingDataRow>();
  for (const row of rows) {
    map.set(`${row.日期}|${row.商品ID}|${row.推广名称}|${row.推广场景}`, row);
  }
  return Array.from(map.values());
}

/**
 * 合并营销数据：已有数据 + 新上传数据，去重后返回合并结果与统计
 */
export function mergeMarketingRows(existing: MarketingDataRow[], incoming: MarketingDataRow[]): { merged: MarketingDataRow[]; added: number; duplicates: number } {
  const merged = dedupeMarketingData([...existing, ...incoming]);
  const added = merged.length - existing.length;
  return { merged, added, duplicates: incoming.length - added };
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
    发货后退款额: number; // 发货后退款成功的商家实收金额（用于计算运费损失）
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
      发货后退款额: 0,
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
      // 发货后退款才产生运费损失
      if (order.发货时间 && order.发货时间.trim() !== '') {
        existing.发货后退款额 += order.商家实收金额;
      }
    }

    specMap.set(spec, existing);
  });

  // 转换为ProductSummary数组并计算平均客单价
  const summaries: ProductSummary[] = [];
  specMap.forEach((data, spec) => {
    // 真实退款率（按金额）：退款成功额 / (有效销售额 + 退款成功额) * 100
    const totalAmount = data.销售额 + data.退款成功额;
    const 真实退款率 = totalAmount > 0 ? (data.退款成功额 / totalAmount) * 100 : 0;
    // 发货后退款率（按金额）：发货后退款额 / (有效销售额 + 退款成功额) * 100
    const 发货后退款率 = totalAmount > 0 ? (data.发货后退款额 / totalAmount) * 100 : 0;

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
      退款金额: Math.round(data.退款成功额 * 100) / 100,
      退款率: 0,
      真实退款率: Math.round(真实退款率 * 100) / 100,
      发货后退款率: Math.round(发货后退款率 * 100) / 100,
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
 * 将 SKU（规格）维度汇总聚合为单品（商品ID）维度汇总
 * 输入应为已应用成本配置的 SKU 汇总（calculateProfit 之后），各项成本/利润为总额可直接相加
 * 注意：营销花费为商品级数值（同商品各SKU相同），聚合时只取一次，不累加
 * @param skuSummaries SKU 维度汇总数组
 * @returns 单品维度汇总数组（按销售额降序），规格字段填商品名称作为展示名
 */
export function groupByProduct(skuSummaries: ProductSummary[]): ProductSummary[] {
  const map = new Map<string, ProductSummary>();

  skuSummaries.forEach(s => {
    const key = s.商品ID || s.商品名称 || s.规格;
    const existing = map.get(key);
    if (!existing) {
      // 首个 SKU：以它为模板（营销花费等商品级字段直接带入），展示名用商品名称
      map.set(key, {
        ...s,
        规格: s.商品名称 || s.商品ID || s.规格,
        SKU净利润: 0,
      });
      return;
    }
    // 累加可加字段（均为总额）
    existing.销售额 += s.销售额;
    existing.销量 += s.销量;
    existing.订单数 += s.订单数;
    existing.总商品成本 += s.总商品成本;
    existing.人工成本 += s.人工成本;
    existing.运营成本 += s.运营成本;
    existing.平台技术服务费 += s.平台技术服务费;
    existing.商家承担优惠 += s.商家承担优惠;
    existing.快递费 += s.快递费;
    existing.包装耗材 += s.包装耗材;
    existing.运费险 += s.运费险;
    existing.退款金额 += s.退款金额;
    existing.总成本 += s.总成本;
    existing.预估退款损失 += s.预估退款损失;
    existing.净利润 += s.净利润;
  });

  const result = Array.from(map.values());
  result.forEach(p => {
    p.平均客单价 = p.订单数 > 0 ? Math.round((p.销售额 / p.订单数) * 100) / 100 : 0;
    p.利润率 = p.销售额 > 0 ? Math.round((p.净利润 / p.销售额) * 100 * 100) / 100 : 0;
    const totalAmount = p.销售额 + p.退款金额;
    p.真实退款率 = totalAmount > 0 ? Math.round((p.退款金额 / totalAmount) * 100 * 100) / 100 : 0;
  });
  result.sort((a, b) => b.销售额 - a.销售额);
  return result;
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

  // 8. 预估退款损失 = 仅退回运费损失（发货后退款才产生运费损失，发货前退款无损失）
  const unitShippingFee = costItem.启用快递费 ? (costItem.快递费 || 0) : 0;
  const afterShipRefundRate = summary.发货后退款率 || 0;
  const estimatedRefundLoss = unitShippingFee > 0
    ? Math.round(summary.销量 * afterShipRefundRate / 100 * unitShippingFee * 100) / 100
    : 0;
  // 退款率（用于显示和SKU单件计算）
  const userRefundRate = costItem.启用退款率 ? (costItem.退款率 || 0) : 0;
  const effectiveRefundRate = costItem.启用退款率 ? userRefundRate : (summary.真实退款率 || 0);

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
    const unitAfterShipRefundRate = summary.发货后退款率 || 0;
    const unitRefundLoss = unitShippingFee > 0 && unitAfterShipRefundRate > 0
      ? unitShippingFee * (unitAfterShipRefundRate / 100)
      : 0;
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
 * 归一化表头：去空格（含全角空格）、全角转半角、统一小写。
 * 使「总花费（元）」与「总花费(元)」等价，抵御拼多多在空格、括号、全角、单位上的格式微调。
 */
function normalizeHeader(header: string): string {
  return header
    .replace(/[\s\u3000]+/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/％/g, '%')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .toLowerCase();
}

/**
 * 同义词剔除：拼多多导出模板常在「营销/推广/广告」等修饰词上做增删，
 * 归一化后再去掉这些同义词即可互相匹配（如「总营销花费」↔「总花费」）。
 */
const MARKETING_HEADER_SYNONYMS = /营销|推广|广告/g;

function canonicalHeader(header: string): string {
  return normalizeHeader(header).replace(MARKETING_HEADER_SYNONYMS, '');
}

/**
 * 列名别名表：拼多多调整列名时，只需在此登记一次，解析逻辑无需改动。
 * key 为代码中使用的列名，value 为其可能出现的其它写法。
 */
const MARKETING_FIELD_ALIASES: Record<string, string[]> = {
  // 词序调整类改名
  '实际净投产比': ['净实际投产比', '实际净推广投产比'],
  '实际净推广投产比': ['净实际推广投产比', '净实际投产比'],
};

/**
 * 构建「列名 → 下标」解析器。
 * 依次尝试：精确匹配 → 别名匹配 → 忽略同义词/词序后的归一化匹配，
 * 既兼容历史列名，也能自动适配拼多多后续的改名。
 */
function createMarketingHeaderResolver(headers: string[]) {
  const exact = new Map<string, number>();
  const canonical = new Map<string, number>();
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (!exact.has(normalized)) exact.set(normalized, index);
    const canon = canonicalHeader(header);
    if (!canonical.has(canon)) canonical.set(canon, index);
  });

  return (fieldName: string): number => {
    const candidates = [fieldName, ...(MARKETING_FIELD_ALIASES[fieldName] || [])];
    for (const name of candidates) {
      const hit = exact.get(normalizeHeader(name));
      if (hit !== undefined) return hit;
    }
    for (const name of candidates) {
      const hit = canonical.get(canonicalHeader(name));
      if (hit !== undefined) return hit;
    }
    return -1;
  };
}

/**
 * 判断某行是否为营销数据表头：
 * 不绑定易变的「总营销花费」列名，只要同时存在 商品ID、日期 与任一「花费」列即可。
 */
function isMarketingHeaderLine(line: string): boolean {
  const headers = parseCSVLine(line).map(canonicalHeader);
  return (
    headers.includes(canonicalHeader('商品ID')) &&
    headers.includes(canonicalHeader('日期')) &&
    headers.some(header => header.includes('花费'))
  );
}

/**
 * 解析营销数据CSV（从Excel导出的CSV格式）
 */
export function parseMarketingCSV(csvText: string): MarketingDataRow[] {
  const lines = csvText.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    return [];
  }

  // 定位表头：Excel 导出的说明行可能位于表头前后；识别逻辑不绑定具体列名，跨模板通用
  const headerIndex = lines.findIndex(isMarketingHeaderLine);
  if (headerIndex < 0) {
    return [];
  }
  const headers = parseCSVLine(lines[headerIndex]);
  const resolveIndex = createMarketingHeaderResolver(headers);
  
  // 解析数据行，并清理「全店托管」说明/合计行
  const data: MarketingDataRow[] = [];
  
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    
    if (
      values.length < headers.length ||
      !values[0].trim() ||
      values.some(value => value.includes('全店托管'))
    ) {
      continue;
    }

    // 按列名解析当前行取值（兼容多种列名写法，缺失列返回空串）
    const get = (fieldName: string): string => {
      const index = resolveIndex(fieldName);
      return index >= 0 && index < values.length ? values[index] : '';
    };
    
    try {
      const row: MarketingDataRow = {
        日期: get('日期'),
        商品ID: get('商品ID'),
        商品名称: get('商品名称'),
        推广场景: get('推广场景'),
        推广名称: get('推广名称'),
        出价方式: get('出价方式'),
        分组: get('分组'),
        是否已删除: get('是否已删除'),
        成交营销花费: toNumber(get('成交营销花费(元)')),
        交易额: toNumber(get('交易额(元)')),
        实际投产比: toNumber(get('实际投产比')),
        总营销花费: toNumber(get('总营销花费(元)')),
        推广成交花费: toNumber(get('推广成交花费(元)')),
        结算券花费: toNumber(get('结算券花费(元)')),
        推广总花费: toNumber(get('推广总花费(元)')),
        净交易额: toNumber(get('净交易额(元)')),
        实际净投产比: toNumber(get('实际净投产比')),
        净成交笔数: parseInt(get('净成交笔数')) || 0,
        每笔净成交花费: toNumber(get('每笔净成交花费(元)')),
        退款豁免率: get('退款豁免率'),
        退单豁免率: get('退单豁免率'),
        净推广交易额: toNumber(get('净推广交易额(元)')),
        净成交券金额: toNumber(get('净成交券金额(元)')),
        实际净推广投产比: toNumber(get('实际净推广投产比')),
        每笔净成交推广花费: toNumber(get('每笔净成交推广花费(元)')),
        每笔结算成交花费: toNumber(get('每笔结算成交花费(元)')),
        交易额结算率: get('交易额结算率'),
        订单结算率: get('订单结算率'),
        每笔结算成交金额: toNumber(get('每笔结算成交金额(元)')),
        成交笔数: parseInt(get('成交笔数')) || 0,
        每笔成交花费: toNumber(get('每笔成交花费(元)')),
        每笔成交金额: toNumber(get('每笔成交金额(元)')),
        直接交易额: toNumber(get('直接交易额(元)')),
        间接交易额: toNumber(get('间接交易额(元)')),
        直接成交笔数: parseInt(get('直接成交笔数')) || 0,
        间接成交笔数: parseInt(get('间接成交笔数')) || 0,
        曝光量: parseInt(get('曝光量').replace(/,/g, '')) || 0,
        点击量: parseInt(get('点击量').replace(/,/g, '')) || 0,
        询单花费: toNumber(get('询单花费(元)')),
        询单量: parseInt(get('询单量')) || 0,
        平均询单成本: toNumber(get('平均询单成本(元)')),
        收藏花费: toNumber(get('收藏花费(元)')),
        收藏量: parseInt(get('收藏量')) || 0,
        平均收藏成本: toNumber(get('平均收藏成本(元)')),
        关注花费: toNumber(get('关注花费(元)')),
        关注量: parseInt(get('关注量')) || 0,
        平均关注成本: toNumber(get('平均关注成本(元)')),
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
 * 判断订单是否已发货（有发货时间即表示已发货）
 */
function isShipped(order: OrderData): boolean {
  return !!(order.发货时间 && order.发货时间.trim() !== '');
}

/**
 * 判断是否为发货前退款（退款成功但未发货）
 */
function isRefundBeforeShip(order: OrderData): boolean {
  return isRefundSuccessOrder(order) && !isShipped(order);
}

/**
 * 判断是否为发货后退款（退款成功且已发货）
 */
function isRefundAfterShip(order: OrderData): boolean {
  return isRefundSuccessOrder(order) && isShipped(order);
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

  // 新增：区分发货前/后退款
  const refundBeforeShipOrders = refundSuccessOrders.filter(isRefundBeforeShip);
  const refundAfterShipOrders = refundSuccessOrders.filter(isRefundAfterShip);
  const refundBeforeShipAmount = refundBeforeShipOrders.reduce((sum, o) => sum + o.商家实收金额, 0);
  const refundAfterShipAmount = refundAfterShipOrders.reduce((sum, o) => sum + o.商家实收金额, 0);

  return {
    总订单数: totalOrders,
    退款订单数: refundOrders.length,
    退款成功订单数: refundSuccessOrders.length,
    整体退款率: Math.round(overallRefundRate * 100) / 100,
    退款成功总金额: Math.round(refundSuccessAmount * 100) / 100,
    退款损失占比: Math.round(lossRatio * 100) / 100,
    高退款率SKU数: highRefundSkuCount,
    发货前退款订单数: refundBeforeShipOrders.length,
    发货后退款订单数: refundAfterShipOrders.length,
    发货前退款金额: Math.round(refundBeforeShipAmount * 100) / 100,
    发货后退款金额: Math.round(refundAfterShipAmount * 100) / 100,
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
    发货前退款订单数: number;
    发货后退款订单数: number;
    发货前退款金额: number;
    发货后退款金额: number;
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
      发货前退款订单数: 0,
      发货后退款订单数: 0,
      发货前退款金额: 0,
      发货后退款金额: 0,
    };

    existing.总订单数 += 1;
    if (isRefundOrder(order)) existing.退款订单数 += 1;
    if (isRefundSuccessOrder(order)) {
      existing.退款成功订单数 += 1;
      existing.退款成功额 += order.商家实收金额;
      // 区分发货前/后退款
      if (isRefundBeforeShip(order)) {
        existing.发货前退款订单数 += 1;
        existing.发货前退款金额 += order.商家实收金额;
      } else if (isRefundAfterShip(order)) {
        existing.发货后退款订单数 += 1;
        existing.发货后退款金额 += order.商家实收金额;
      }
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
      发货前退款订单数: data.发货前退款订单数,
      发货后退款订单数: data.发货后退款订单数,
      发货前退款金额: Math.round(data.发货前退款金额 * 100) / 100,
      发货后退款金额: Math.round(data.发货后退款金额 * 100) / 100,
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
 * 按日期范围筛选营销数据
 */
function filterMarketingByBounds(
  marketingData: MarketingDataRow[],
  start: Date,
  end: Date
): MarketingDataRow[] {
  return marketingData.filter(row => {
    if (!row.日期) return false;
    const date = parseLocalDate(row.日期);
    if (isNaN(date.getTime())) return false;
    return date >= start && date <= end;
  });
}

/**
 * 计算周期整体利润率（%）：净利润合计 / 销售额合计
 * 与主流程口径一致：按规格分组 → 合并营销 → 应用成本配置
 */
function calculatePeriodProfitRate(
  orders: OrderData[],
  costConfig: DetailedCostConfig,
  marketingData: MarketingDataRow[]
): number {
  const grouped = groupBySpec(orders);
  const withMarketing = mergeMarketingData(grouped, marketingData);
  const withProfit = withMarketing.map(item => calculateProfit(item, costConfig));
  const totalSales = withProfit.reduce((sum, s) => sum + s.销售额, 0);
  const totalProfit = withProfit.reduce((sum, s) => sum + s.净利润, 0);
  return totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
}

/**
 * 计算周期推广ROI：营销交易额合计 / 营销花费合计
 */
function calculatePeriodROI(marketingData: MarketingDataRow[]): number {
  const spend = marketingData.reduce((sum, r) => sum + (r.总营销花费 || 0), 0);
  const gmv = marketingData.reduce((sum, r) => sum + (r.交易额 || 0), 0);
  return spend > 0 ? gmv / spend : 0;
}

/**
 * 计算环比对比（当前周期 vs 上一周期）
 * @param orders 全部订单数据（未按时间筛选）
 * @param range 当前时间范围
 * @param costConfig 成本配置（用于计算利润率环比，缺省为空配置）
 * @param marketingData 营销数据（用于计算推广ROI环比，缺省为空）
 */
export function calculatePeriodComparison(
  orders: OrderData[],
  range: TimeRange,
  costConfig: DetailedCostConfig = {},
  marketingData: MarketingDataRow[] = []
): PeriodComparison | null {
  if (range === 'all') return null;

  const currentBounds = getTimeRangeBounds(range);
  const previousBounds = getPreviousPeriodBounds(range);

  const currentOrders = filterOrdersByDateRange(orders, currentBounds.start, currentBounds.end);
  const previousOrders = filterOrdersByDateRange(orders, previousBounds.start, previousBounds.end);

  const currentMetrics = calculateOrdersMetrics(currentOrders);
  const previousMetrics = calculateOrdersMetrics(previousOrders);

  const currentMarketing = filterMarketingByBounds(marketingData, currentBounds.start, currentBounds.end);
  const previousMarketing = filterMarketingByBounds(marketingData, previousBounds.start, previousBounds.end);

  const currentProfitRate = calculatePeriodProfitRate(currentOrders, costConfig, currentMarketing);
  const previousProfitRate = calculatePeriodProfitRate(previousOrders, costConfig, previousMarketing);

  const currentROI = calculatePeriodROI(currentMarketing);
  const previousROI = calculatePeriodROI(previousMarketing);

  return {
    销售额: compareMetric(currentMetrics.销售额, previousMetrics.销售额),
    销量: compareMetric(currentMetrics.销量, previousMetrics.销量),
    订单数: compareMetric(currentMetrics.订单数, previousMetrics.订单数),
    商家实收: compareMetric(currentMetrics.商家实收, previousMetrics.商家实收),
    平均客单价: compareMetric(currentMetrics.平均客单价, previousMetrics.平均客单价),
    利润率: compareMetric(
      Math.round(currentProfitRate * 100) / 100,
      Math.round(previousProfitRate * 100) / 100
    ),
    推广ROI: compareMetric(
      Math.round(currentROI * 100) / 100,
      Math.round(previousROI * 100) / 100
    ),
  };
}

// ============ 科学分析统计工具 ============

/**
 * 中位数（抗异常值，优于均值用于长尾分布的分界）
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * 分位数（线性插值，q ∈ [0,1]）
 */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return base + 1 < sorted.length
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base];
}

/**
 * 变异系数 CV = 标准差 / 均值（衡量波动稳定性，样本<2 或均值≤0 时返回 0）
 */
export function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean <= 0) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/**
 * 赫芬达尔指数 HHI = Σ(份额)²，份额以百分比计（范围 0-10000），越高越集中
 */
export function computeHHI(values: number[]): number {
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return 0;
  return values.reduce((s, v) => s + ((v / total) * 100) ** 2, 0);
}

/**
 * 集中度 CRn：前 n 项占总额的比例（%）
 */
export function computeCR(values: number[], n: number): number {
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return 0;
  const top = [...values].sort((a, b) => b - a).slice(0, n).reduce((s, v) => s + v, 0);
  return (top / total) * 100;
}

export interface TrendAnalysis {
  n: number;              // 样本量
  slope: number;          // 原始斜率（单位/期）
  normalizedSlope: number;// 归一化斜率（斜率 / 均值），即每期相对变化
  r2: number;             // 拟合优度 R²（0-1）
  isDeclining: boolean;   // 综合判定：归一化斜率显著为负且拟合可信
}

/**
 * 线性回归趋势分析：归一化斜率 + R² + 最小样本量
 * 判定衰退需同时满足：样本量 ≥ minSamples、每期相对降幅 ≤ -2%、R² ≥ 0.3
 */
export function analyzeTrend(values: number[], minSamples = 5): TrendAnalysis {
  const n = values.length;
  const empty: TrendAnalysis = { n, slope: 0, normalizedSlope: 0, r2: 0, isDeclining: false };
  if (n < minSamples) return empty;

  const meanX = (n - 1) / 2;
  const meanY = values.reduce((s, v) => s + v, 0) / n;
  if (meanY <= 0) return empty;

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    const dy = values[i] - meanY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const r2 = sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;
  const normalizedSlope = slope / meanY;
  return {
    n,
    slope,
    normalizedSlope,
    r2,
    isDeclining: normalizedSlope <= -0.02 && r2 >= 0.3,
  };
}

// ============ 异常检测 / 预测 ============

export interface AnomalyResult {
  index: number;   // 在原始序列中的下标
  value: number;   // 原始值
  type: 'high' | 'low';
  zScore: number;  // 标准化偏离度（用于强度展示）
}

/**
 * 四分位距（IQR）异常检测
 * 上下界 = Q1/Q3 ∓ iqrFactor × IQR，超出即判为异常
 * @param values 数值序列（保持原始顺序）
 * @param iqrFactor 倍数，默认 1.5（标准箱线图口径，1.5 为温和异常，3 为极端异常）
 */
export function detectAnomalies(values: number[], iqrFactor = 1.5): AnomalyResult[] {
  if (values.length < 4) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  if (iqr <= 0) return [];
  const lower = q1 - iqrFactor * iqr;
  const upper = q3 + iqrFactor * iqr;

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);

  const result: AnomalyResult[] = [];
  values.forEach((v, i) => {
    if (v > upper || v < lower) {
      result.push({
        index: i,
        value: v,
        type: v > upper ? 'high' : 'low',
        zScore: std > 0 ? (v - mean) / std : 0,
      });
    }
  });
  return result;
}

/**
 * 简单移动平均（SMA）
 * 前 window-1 项无足够数据，返回 null
 */
export function movingAverage(values: number[], window: number): (number | null)[] {
  if (window < 1) return values.map(() => null);
  return values.map((_, i) => {
    if (i < window - 1) return null;
    let sum = 0;
    for (let j = i - window + 1; j <= i; j++) sum += values[j];
    return Math.round((sum / window) * 100) / 100;
  });
}

export interface ForecastPoint {
  step: number;    // 距最后一期的步数（1,2,3...）
  value: number;   // 预测值
  lower: number;   // 95% 预测区间下界
  upper: number;   // 95% 预测区间上界
}

/**
 * 基于最小二乘线性外推预测未来 periods 期
 * 用残差标准差估算 95% 预测区间（±1.96σ），负值截断为 0
 */
export function forecastLinear(values: number[], periods: number): ForecastPoint[] {
  const n = values.length;
  if (n < 3 || periods < 1) return [];
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, v) => sum + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (i - meanX) * (values[i] - meanY);
    sxx += (i - meanX) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanX;

  // 残差标准差
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const pred = slope * i + intercept;
    ssRes += (values[i] - pred) ** 2;
  }
  const residualStd = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0;
  const margin = 1.96 * residualStd;

  const result: ForecastPoint[] = [];
  for (let k = 1; k <= periods; k++) {
    const x = n - 1 + k;
    const value = slope * x + intercept;
    result.push({
      step: k,
      value: Math.round(Math.max(0, value) * 100) / 100,
      lower: Math.round(Math.max(0, value - margin) * 100) / 100,
      upper: Math.round(Math.max(0, value + margin) * 100) / 100,
    });
  }
  return result;
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

// ============ 一键 AI：价格 & 分析 ============

/**
 * AI 价格计算：根据输入的成本/快递/包装 + 目标利润率，反推每个 SKU 的建议定价
 * 公式：建议售价 = (固定成本 + 退回运费损失) ÷ (1 - 平台扣点率 - 目标利润率)
 * @param summaries 商品汇总（含发货后退款率）
 * @param costConfig 当前成本配置（用于补齐人工/运营/优惠等已有项）
 * @param input AI 价格输入参数
 */
export function calculateAIPricing(
  summaries: ProductSummary[],
  costConfig: DetailedCostConfig,
  input: AIPriceInput
): AIPriceResult[] {
  const PLATFORM_RATE = 0.006;
  const targetRate = input.目标利润率 / 100;
  const denominator = 1 - PLATFORM_RATE - targetRate;

  return summaries.map(s => {
    const cfg: CostItem = costConfig[s.规格] || { 成本单价: 0 };
    // 成本单价：优先用统一输入，否则沿用已有配置
    const 成本单价 = input.成本单价 != null && input.成本单价 > 0
      ? input.成本单价
      : (cfg.成本单价 || 0);
    // 快递费 / 包装耗材：优先用统一输入
    const 快递费 = input.快递费 != null && input.快递费 > 0
      ? input.快递费
      : (cfg.启用快递费 ? (cfg.快递费 || 0) : 0);
    const 包装耗材 = input.包装耗材 != null && input.包装耗材 > 0
      ? input.包装耗材
      : (cfg.启用包装耗材 ? (cfg.包装耗材 || 0) : 0);

    const 人工成本 = cfg.人工成本 || 0;
    const 运营成本 = cfg.运营成本 || 0;
    const 商家承担优惠 = cfg.商家承担优惠 || 0;
    const 运费险 = cfg.启用运费险 ? (cfg.运费险 || 0) : 0;

    const 固定成本 = 成本单价 + 人工成本 + 运营成本 + 商家承担优惠 + 快递费 + 包装耗材 + 运费险;
    const 退回运费损失 = 快递费 * ((s.发货后退款率 || 0) / 100);
    const 原定价 = cfg.定价 || 0;

    if (成本单价 <= 0) {
      return {
        规格: s.规格, 原定价, 建议定价: 0, 固定成本, 退回运费损失,
        预估利润率: 0, skipped: true, reason: '缺少成本单价',
      };
    }
    if (denominator <= 0) {
      return {
        规格: s.规格, 原定价, 建议定价: 0, 固定成本, 退回运费损失,
        预估利润率: 0, skipped: true, reason: '目标利润率过高，无法计算',
      };
    }

    const 建议定价 = Math.round(((固定成本 + 退回运费损失) / denominator) * 100) / 100;
    const 平台费 = 建议定价 * PLATFORM_RATE;
    const 净利润 = 建议定价 - 固定成本 - 平台费 - 退回运费损失;
    const 预估利润率 = 建议定价 > 0 ? Math.round((净利润 / 建议定价) * 10000) / 100 : 0;

    return {
      规格: s.规格, 原定价, 建议定价, 固定成本, 退回运费损失, 预估利润率, skipped: false,
    };
  });
}

/**
 * 生成套餐组合建议（基于捆绑销售论文模型）
 * - 按商品ID分组，同商品多规格可组合
 * - 折扣率随利润率递增：≥40% 让利 12%，20-40% 让利 8%，<20% 让利 4%
 * - 套餐利润率需 ≥ 单卖加权平均利润率才推荐
 * 参考：赵灯节等(2025)互补产品捆绑销售策略；Li & Chen(2019)；Harvard Nintendo 案例
 */
export function generateBundleSuggestions(
  summaries: ProductSummary[],
  costConfig: DetailedCostConfig
): BundleSuggestion[] {
  const groupByProduct = new Map<string, ProductSummary[]>();
  summaries.forEach(s => {
    if (!s.商品ID) return;
    const arr = groupByProduct.get(s.商品ID) || [];
    arr.push(s);
    groupByProduct.set(s.商品ID, arr);
  });

  const results: BundleSuggestion[] = [];
  groupByProduct.forEach((items, id) => {
    const withPrice = items.filter(s => (costConfig[s.规格]?.定价 || 0) > 0);
    if (withPrice.length < 2) return;

    const sorted = [...withPrice].sort((a, b) => b.销量 - a.销量);
    const combo = sorted.slice(0, Math.min(3, sorted.length));
    if (combo.length < 2) return;

    const 组合规格 = combo.map(s => s.规格);
    const 单买总价 = combo.reduce((sum, s) => sum + (costConfig[s.规格]?.定价 || 0), 0);

    const totalSales = combo.reduce((sum, s) => sum + s.销售额, 0);
    const totalProfit = combo.reduce((sum, s) => sum + s.净利润, 0);
    const weightedProfitRate = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;

    let 折扣率: number;
    if (weightedProfitRate >= 40) 折扣率 = 12;
    else if (weightedProfitRate >= 20) 折扣率 = 8;
    else 折扣率 = 4;

    const 建议套餐价 = Math.round(单买总价 * (1 - 折扣率 / 100) * 100) / 100;

    // 套餐成本 = 各规格单件成本之和
    const 套餐成本 = combo.reduce((sum, s) => {
      const c: CostItem = costConfig[s.规格] || { 成本单价: 0 };
      const unitCost = (c.成本单价 || 0) + (c.人工成本 || 0) + (c.运营成本 || 0)
        + (c.商家承担优惠 || 0)
        + (c.启用快递费 ? (c.快递费 || 0) : 0)
        + (c.启用包装耗材 ? (c.包装耗材 || 0) : 0)
        + (c.启用运费险 ? (c.运费险 || 0) : 0);
      return sum + unitCost;
    }, 0);
    const 套餐平台费 = 建议套餐价 * 0.006;
    const 套餐利润 = 建议套餐价 - 套餐成本 - 套餐平台费;
    const 预估套餐利润率 = 建议套餐价 > 0 ? Math.round((套餐利润 / 建议套餐价) * 10000) / 100 : 0;

    // 仅推荐套餐利润率不低于加权平均利润率的组合
    if (预估套餐利润率 < weightedProfitRate - 2) return;

    results.push({
      商品ID: id,
      商品名称: combo[0].商品名称,
      组合规格,
      单买总价: Math.round(单买总价 * 100) / 100,
      建议套餐价,
      折扣率,
      预估套餐利润率,
      理由: `组合热销规格提升客单价；套餐较单买省 ${折扣率}%，预估利润率 ${预估套餐利润率}%`,
    });
  });

  results.sort((a, b) => b.预估套餐利润率 - a.预估套餐利润率);
  return results.slice(0, 8);
}

/**
 * 生成 AI 分析报告：评估利润率/定价合理性，给出加价、加SKU、加套餐建议
 * 参考：拼多多实战（健康利润率15%+/单品30-50%）；捆绑销售论文模型
 */
export function generateAIAnalysis(
  summaries: ProductSummary[],
  costConfig: DetailedCostConfig
): AISuggestion[] {
  const suggestions: AISuggestion[] = [];
  const valid = summaries.filter(s => s.销售额 > 0 || (costConfig[s.规格]?.成本单价 || 0) > 0);

  if (valid.length === 0) {
    return [{
      type: 'overall', level: 'info',
      title: '暂无数据可分析',
      detail: '请先导入销售数据或批量导入成本配置',
      action: '使用批量导入或一键AI价格功能录入成本与定价',
    }];
  }

  // 1. 整体利润率评估
  const totalProfit = valid.reduce((sum, s) => sum + s.净利润, 0);
  const totalSales = valid.reduce((sum, s) => sum + s.销售额, 0);
  const overallRate = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
  const pricedSkus = valid.filter(s => (costConfig[s.规格]?.定价 || 0) > 0);

  if (overallRate >= 15 && totalProfit > 0) {
    suggestions.push({
      type: 'overall', level: 'success',
      title: '整体利润率健康',
      detail: `整体利润率 ${overallRate.toFixed(2)}%，净利润 ${totalProfit.toFixed(2)} 元，超过 15% 健康线`,
      action: '当前盈利良好，可加大爆品推广或测试新品拓展',
      metric: `利润率 ${overallRate.toFixed(2)}%`,
      reference: '拼多多实战：整体利润率 15%+ 为健康水位',
    });
  } else if (overallRate >= 0) {
    suggestions.push({
      type: 'overall', level: 'warning',
      title: '整体利润率偏低',
      detail: `整体利润率仅 ${overallRate.toFixed(2)}%，低于 15% 健康线`,
      action: '优化供应链降本，或对低利润高销量SKU测试加价 1-3%',
      metric: `利润率 ${overallRate.toFixed(2)}%`,
      reference: '拼多多实战：整体利润率 15%+ 为健康水位',
    });
  } else {
    suggestions.push({
      type: 'overall', level: 'critical',
      title: '整体处于亏损',
      detail: `整体利润率 ${overallRate.toFixed(2)}%，净利润 ${totalProfit.toFixed(2)} 元`,
      action: '立即核查成本录入，对亏损SKU加价 3-5% 或下架止亏',
      metric: `利润率 ${overallRate.toFixed(2)}%`,
    });
  }

  // 2. 加价建议
  const avgVolume = valid.length > 0 ? valid.reduce((sum, s) => sum + s.销量, 0) / valid.length : 0;

  const lossSkus = valid.filter(s => s.销售额 > 0 && s.净利润 < 0);
  lossSkus.slice(0, 3).forEach(s => {
    const cfg = costConfig[s.规格];
    const price = cfg?.定价 || 0;
    const add = price > 0 ? Math.ceil(price * 0.05 * 100) / 100 : 0;
    suggestions.push({
      type: 'pricing', level: 'critical',
      title: `亏损SKU建议加价：${s.规格}`,
      detail: `销售额 ${s.销售额}，净利润 ${s.净利润}，利润率 ${s.利润率}%`,
      action: price > 0
        ? `建议定价上调至 ¥${(price + add).toFixed(2)}（+${add.toFixed(2)}），或下架止亏`
        : '未设置定价，请用AI价格功能补齐定价',
      metric: `利润率 ${s.利润率}%`,
    });
  });

  const lowProfitHighVol = valid.filter(s =>
    s.销售额 > 0 && s.利润率 >= 0 && s.利润率 < 5 && s.销量 >= avgVolume
  );
  lowProfitHighVol.slice(0, 3).forEach(s => {
    const cfg = costConfig[s.规格];
    const price = cfg?.定价 || 0;
    const add = price > 0 ? Math.ceil(price * 0.03 * 100) / 100 : 0;
    suggestions.push({
      type: 'pricing', level: 'warning',
      title: `低利润高销量建议加价：${s.规格}`,
      detail: `销量 ${s.销量}（高于均值 ${Math.round(avgVolume)}），但利润率仅 ${s.利润率}%`,
      action: price > 0
        ? `测试小幅加价至 ¥${(price + add).toFixed(2)}（+3%），观察销量敏感性`
        : '请先设置定价',
      metric: `利润率 ${s.利润率}%`,
    });
  });

  const highProfitLowVol = valid.filter(s =>
    s.销售额 > 0 && s.利润率 > 30 && s.销量 < avgVolume && s.销量 > 0
  );
  if (highProfitLowVol.length > 0) {
    suggestions.push({
      type: 'pricing', level: 'info',
      title: `${highProfitLowVol.length} 个高利润低销量SKU`,
      detail: `利润率>30%但销量低于均值，存在价格弹性空间`,
      action: '可对部分SKU小幅降价（2-5%）测试销量提升，或增加规格覆盖更多价位段',
      metric: `${highProfitLowVol.length} 个SKU`,
    });
  }

  // 3. 加SKU建议（销量集中度）
  const totalVolume = valid.reduce((sum, s) => sum + s.销量, 0);
  if (totalVolume > 0) {
    const sortedByVol = [...valid].sort((a, b) => b.销量 - a.销量);
    const top1Rate = sortedByVol[0] ? (sortedByVol[0].销量 / totalVolume) * 100 : 0;
    const top3Vol = sortedByVol.slice(0, 3).reduce((sum, s) => sum + s.销量, 0);
    const top3Rate = (top3Vol / totalVolume) * 100;

    if (top1Rate > 50) {
      suggestions.push({
        type: 'addSku', level: 'warning',
        title: '销量过度集中于单一SKU',
        detail: `Top1 SKU「${sortedByVol[0].规格}」占总销量 ${top1Rate.toFixed(1)}%，集中度过高`,
        action: '围绕该爆款增加同款不同规格（颜色/尺寸/套餐），分散风险并覆盖更多人群',
        metric: `Top1占比 ${top1Rate.toFixed(1)}%`,
      });
    } else if (top3Rate > 80 && valid.length < 8) {
      suggestions.push({
        type: 'addSku', level: 'info',
        title: 'SKU数量偏少，建议拓展',
        detail: `Top3 SKU占总销量 ${top3Rate.toFixed(1)}%，但总SKU仅 ${valid.length} 个`,
        action: '增加新规格或互补品SKU，丰富价格带，提升客单价与覆盖面',
        metric: `SKU数 ${valid.length}`,
      });
    }
  }

  // 4. 加套餐建议（捆绑销售论文模型）
  const bundles = generateBundleSuggestions(valid, costConfig);
  if (bundles.length > 0) {
    const top = bundles[0];
    suggestions.push({
      type: 'bundle', level: 'success',
      title: `建议新增套餐：${top.商品名称}`,
      detail: `组合 ${top.组合规格.join(' + ')}，单买 ¥${top.单买总价}，套餐价 ¥${top.建议套餐价}（省 ${top.折扣率}%），预估利润率 ${top.预估套餐利润率}%`,
      action: `采用混合捆绑（单品仍可单买），套餐较单买让利 ${top.折扣率}% 提升客单价`,
      metric: `套餐利润率 ${top.预估套餐利润率}%`,
      reference: '赵灯节等(2025)互补产品捆绑销售策略；Harvard Nintendo案例：混合捆绑优于纯捆绑',
    });
    if (bundles.length > 1) {
      suggestions.push({
        type: 'bundle', level: 'info',
        title: `另有 ${bundles.length - 1} 个可选套餐组合`,
        detail: bundles.slice(1, 4).map(b => `${b.商品名称}：¥${b.建议套餐价}（省${b.折扣率}%）`).join('；'),
        action: '优先推广利润率最高的套餐，30-60天后评估效果',
        reference: '捆绑策略：套餐利润率需 ≥ 单卖加权平均利润率',
      });
    }
  } else if (pricedSkus.length >= 2) {
    const multiSpecProducts = new Map<string, number>();
    valid.forEach(s => {
      if (s.商品ID) multiSpecProducts.set(s.商品ID, (multiSpecProducts.get(s.商品ID) || 0) + 1);
    });
    const hasMultiSpec = Array.from(multiSpecProducts.values()).some(c => c >= 2);
    if (!hasMultiSpec) {
      suggestions.push({
        type: 'bundle', level: 'info',
        title: '可考虑跨商品组合套餐',
        detail: '当前各商品均为单规格，暂无同商品多规格可组合',
        action: '为热销商品增加互补规格后即可生成套餐建议；或手动搭配互补品（主品+配件）做组合套餐',
        reference: 'Li & Chen(2019)捆绑策略优于单独销售，产品互补性越高捆绑收益越大',
      });
    }
  }

  const levelOrder: Record<string, number> = { critical: 0, warning: 1, info: 2, success: 3 };
  suggestions.sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);
  return suggestions;
}

// ============ 单品明细（推广决策） ============

/** 平台扣点率（与利润计算保持一致） */
const PLATFORM_FEE_RATE = 0.006;

/**
 * 计算单品明细：每个款（规格）或每个单品（商品ID）的退款、推广分摊、毛利、利润与实际ROI，并给出推广判定
 *
 * 口径：
 * - 净销售额 = 销售额 - 退款金额
 * - 订单退款率 = 退款金额 ÷ 销售额 × 100
 * - 分摊推广费 = 该商品ID推广花费按销售额占比分摊（按商品维度时即该商品ID全部推广花费）
 * - 净推广占比 = 分摊推广费 ÷ 净销售额 × 100
 * - 单品毛利 = 净销售额 - 商品成本（成本单价 × 未退款件数）
 * - 单品利润 = 单品毛利 - 快递 - 运费险 - 扣点 - 分摊推广费 - 该款补偿
 * - 实际毛利率 = 单品毛利 ÷ 净销售额 × 100
 * - 实际ROI = 净销售额 ÷ 分摊推广费
 * - 实际保ROI = 净销售额 ÷ (单品利润 + 分摊推广费)
 * - 判定：实际ROI 低于保本线 → 停推广；保本线到 1.2 倍 → 降预算；1.2 倍以上 → 可放大
 *
 * @param summaries 商品汇总（含销售额/退款金额/销量/订单数）
 * @param marketingData 营销数据（按商品ID汇总推广花费）
 * @param costConfig 成本配置（成本单价/快递费/运费险/补偿）
 * @param orders 订单数据（仅用于推导统计期，可省略）
 * @param dimension 维度：sku=按规格明细，product=按商品ID汇总
 */
export function calculateSkuDetail(
  summaries: ProductSummary[],
  marketingData: MarketingDataRow[],
  costConfig: DetailedCostConfig,
  orders: OrderData[] = [],
  dimension: SkuDetailDimension = 'sku'
): { rows: SkuDetailRow[]; overview: SkuDetailOverview } {
  // 按商品ID汇总推广花费
  const spendByProduct = new Map<string, number>();
  marketingData.forEach(row => {
    if (!row.商品ID) return;
    spendByProduct.set(row.商品ID, (spendByProduct.get(row.商品ID) || 0) + (row.总营销花费 || 0));
  });

  // 商品ID下销售额合计（用于按销售额分摊推广费）
  const salesByProduct = new Map<string, number>();
  summaries.forEach(s => {
    if (!s.商品ID) return;
    salesByProduct.set(s.商品ID, (salesByProduct.get(s.商品ID) || 0) + s.销售额);
  });

  // 按维度聚合
  interface Bucket {
    款号: string;
    商品ID: string;
    销售额: number;
    退款金额: number;
    订单数: number;
    商品成本: number;
    快递费: number;
    运费险: number;
    补偿: number;
  }

  const buckets = new Map<string, Bucket>();
  summaries.forEach(s => {
    const isSku = dimension === 'sku';
    const key = isSku ? `sku:${s.规格}` : `product:${s.商品ID || s.商品名称 || s.规格}`;
    const cfg: CostItem = costConfig[s.规格] || { 成本单价: 0 };
    const 件数 = s.销量 || 0;

    const bucket = buckets.get(key) || {
      款号: isSku ? s.规格 : (s.商品名称 || s.商品ID || '未知商品'),
      商品ID: s.商品ID,
      销售额: 0,
      退款金额: 0,
      订单数: 0,
      商品成本: 0,
      快递费: 0,
      运费险: 0,
      补偿: 0,
    };

    bucket.销售额 += s.销售额 || 0;
    bucket.退款金额 += s.退款金额 || 0;
    bucket.订单数 += s.订单数 || 0;
    bucket.商品成本 += (cfg.成本单价 || 0) * 件数;
    bucket.快递费 += (cfg.启用快递费 ? (cfg.快递费 || 0) : 0) * 件数;
    bucket.运费险 += (cfg.启用运费险 ? (cfg.运费险 || 0) : 0) * 件数;
    bucket.补偿 += cfg.补偿 || 0;

    buckets.set(key, bucket);
  });

  const round2 = (v: number) => Math.round(v * 100) / 100;

  const rows: SkuDetailRow[] = [];
  buckets.forEach(bucket => {
    const 销售额 = bucket.销售额;
    const 退款金额 = bucket.退款金额;
    const 净销售额 = 销售额 - 退款金额;
    const 订单数 = bucket.订单数;
    const 客单价 = 订单数 > 0 ? 销售额 / 订单数 : 0;
    const 订单退款率 = 销售额 > 0 ? (退款金额 / 销售额) * 100 : 0;

    const productSpend = spendByProduct.get(bucket.商品ID) || 0;
    const productSales = salesByProduct.get(bucket.商品ID) || 0;
    const 推广费 = productSales > 0 ? productSpend * (销售额 / productSales) : 0;
    const 净推广占比 = 净销售额 > 0 ? (推广费 / 净销售额) * 100 : 0;

    const 单品毛利 = 净销售额 - bucket.商品成本;
    const 实际毛利率 = 净销售额 > 0 ? (单品毛利 / 净销售额) * 100 : 0;

    const 扣点 = 销售额 * PLATFORM_FEE_RATE;
    const 单品利润 = 单品毛利 - bucket.快递费 - bucket.运费险 - 扣点 - 推广费 - bucket.补偿;

    const 实际ROI = 推广费 > 0 ? 净销售额 / 推广费 : 0;
    const 保本分母 = 单品利润 + 推广费;
    const 实际保ROI = 保本分母 > 0 ? 净销售额 / 保本分母 : 0;

    let 判定: SkuVerdict;
    if (推广费 <= 0) {
      判定 = '无推广';
    } else if (实际ROI < 实际保ROI) {
      判定 = '停推广';
    } else if (实际ROI < 实际保ROI * 1.2) {
      判定 = '降预算';
    } else {
      判定 = '可放大';
    }

    rows.push({
      款号: bucket.款号,
      商品ID: bucket.商品ID,
      销售额: round2(销售额),
      退款金额: round2(退款金额),
      订单数,
      客单价: round2(客单价),
      订单退款率: round2(订单退款率),
      推广费: round2(推广费),
      净推广占比: round2(净推广占比),
      补偿: round2(bucket.补偿),
      单品毛利: round2(单品毛利),
      实际毛利率: round2(实际毛利率),
      单品利润: round2(单品利润),
      实际保ROI: round2(实际保ROI),
      实际ROI: round2(实际ROI),
      判定,
    });
  });

  rows.sort((a, b) => b.销售额 - a.销售额);

  // 统计期：取订单成交时间的最小/最大日期
  let 统计期起 = '';
  let 统计期止 = '';
  orders.forEach(o => {
    const dateStr = o.订单成交时间.split(' ')[0];
    if (!dateStr) return;
    if (!统计期起 || dateStr < 统计期起) 统计期起 = dateStr;
    if (!统计期止 || dateStr > 统计期止) 统计期止 = dateStr;
  });

  const overview: SkuDetailOverview = {
    款数: rows.length,
    统计期起,
    统计期止,
    期间推广费: round2(rows.reduce((sum, r) => sum + r.推广费, 0)),
    运费险: round2(summaries.reduce((sum, s) => {
      const cfg: CostItem = costConfig[s.规格] || { 成本单价: 0 };
      return sum + (cfg.启用运费险 ? (cfg.运费险 || 0) : 0) * (s.销量 || 0);
    }, 0)),
  };

  return { rows, overview };
}

