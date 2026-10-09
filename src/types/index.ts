// 订单数据（来自CSV）
export interface OrderData {
  商品: string;
  订单号: string;
  订单状态: string;
  商品总价: number;
  邮费: number;
  店铺优惠折扣: number;
  平台优惠折扣: number;
  多多支付立减金额: number;
  用户实付金额: number;
  商家实收金额: number;
  商品数量: number;
  发货时间: string;
  确认收货时间: string;
  商品id: string;
  商品规格: string;
  样式ID: string;
  商家编码_规格维度: string;
  商家编码_商品维度: string;
  商家备注: string;
  售后状态: string;
  快递单号: string;
  快递公司: string;
  订单成交时间: string;
}

// 商品规格汇总
export interface ProductSummary {
  规格: string;
  商品ID: string;        // 商品ID（宝贝ID）
  样式ID?: string;       // SKU ID（规格级ID）
  商品名称: string;
  销售额: number;        // 商家实收总额
  销量: number;          // 商品数量总和
  订单数: number;        // 订单数
  平均客单价: number;    // 销售额/订单数
  营销花费: number;      // 从营销数据获取
  
  // 详细成本项
  成本单价: number;      // 用户输入的商品成本单价
  总商品成本: number;    // 成本单价 * 销量
  人工成本: number;        // 人工成本单价 * 销量
  运营成本: number;        // 运营成本单价 * 销量
  平台技术服务费: number;// 统一 0.6% * 销售额
  商家承担优惠: number;   // 用户输入的商家承担优惠金额
  快递费: number;         // 用户输入的快递费（单件或总费用）
  包装耗材: number;       // 用户输入的包装耗材费用
  运费险: number;         // 用户输入的商家版运费险费用
  退款金额: number;       // 退款成功订单的商家实收金额（净销售额 = 销售额 - 退款金额）
  退款率: number;         // 可选，退款比例 (0-100)，用户手动输入
  真实退款率: number;     // 从订单数据自动计算的退款率（按金额：退款成功额 / 总销售额 * 100）
  发货后退款率: number;   // 发货后退款额 / (有效销售额 + 退款成功额) * 100（用于计算运费损失）
  订单引流成本: number;   // 单件：该商品ID总营销费用 / 该商品ID总订单数

  // 计算结果
  总成本: number;         // 所有成本项之和
  预估退款损失: number;   // 销售额 * 退款率 / 100
  净利润: number;         // 销售额 - 总成本 - 预估退款损失
  利润率: number;         // 净利润 / 销售额 * 100
  SKU净利润: number;      // 单件净利润（来自利润计算模块：定价 - 单件总成本 - 预估退款损失）
}

// 单个规格的成本明细配置
export interface CostItem {
  成本单价: number;       // 商品成本单价（必填）
  定价?: number;          // 商品定价（用户可设置，用于计算保本投产）

  // 可选成本项
  商家承担优惠?: number;  // 商家承担的优惠金额
  人工成本?: number;      // 人工成本（元/件）
  运营成本?: number;      // 运营成本（元/件）
  快递费?: number;        // 快递费（可选）
  包装耗材?: number;      // 包装耗材（可选）
  运费险?: number;        // 商家版运费险（可选）
  退款率?: number;        // 退款率百分比（可选，0-100）
  补偿?: number;          // 该款补偿金额（可选，计入单品利润）

  // 开关控制（是否启用该项）
  启用快递费?: boolean;
  启用包装耗材?: boolean;
  启用运费险?: boolean;
  启用退款率?: boolean;
}

// 详细成本配置（每个规格的完整成本信息）
export interface DetailedCostConfig {
  [规格: string]: CostItem;
}

// 简化版成本配置（向后兼容）
export type CostConfig = DetailedCostConfig;

// 数据类型枚举
export type DataType = 'sales' | 'marketing';

// 时间筛选范围
export type TimeRange = 'today' | '7d' | '15d' | '30d' | 'all';

// 营销数据完整结构（从Excel解析）
export interface MarketingDataRow {
  日期: string;
  商品ID: string;
  商品名称: string;
  推广场景: string;
  推广名称: string;
  出价方式: string;
  分组: string;
  是否已删除: string;
  成交营销花费: number;
  交易额: number;
  实际投产比: number;
  总营销花费: number;
  推广成交花费: number;
  结算券花费: number;
  推广总花费: number;
  净交易额: number;
  实际净投产比: number;
  净成交笔数: number;
  每笔净成交花费: number;
  退款豁免率: string;
  退单豁免率: string;
  净推广交易额: number;
  净成交券金额: number;
  实际净推广投产比: number;
  每笔净成交推广花费: number;
  每笔结算成交花费: number;
  交易额结算率: string;
  订单结算率: string;
  每笔结算成交金额: number;
  成交笔数: number;
  每笔成交花费: number;
  每笔成交金额: number;
  直接交易额: number;
  间接交易额: number;
  直接成交笔数: number;
  间接成交笔数: number;
  曝光量: number;
  点击量: number;
  询单花费: number;
  询单量: number;
  平均询单成本: number;
  收藏花费: number;
  收藏量: number;
  平均收藏成本: number;
  关注花费: number;
  关注量: number;
  平均关注成本: number;
}

// ============ 退款专项分析 ============

// 按规格维度的退款统计
export interface RefundStat {
  规格: string;
  商品ID: string;
  商品名称: string;
  总订单数: number;       // 含退款
  退款订单数: number;     // 售后状态含"退款"的订单
  退款成功订单数: number; // 售后状态含"退款成功"的订单
  退款率: number;         // 退款订单数 / 总订单数 * 100
  退款成功额: number;     // 退款成功订单的商家实收金额（负向损失）
  销售额: number;         // 有效订单销售额
  退款损失占比: number;   // 退款成功额 / (销售额 + 退款成功额) * 100
  // 新增：区分发货前/后退款
  发货前退款订单数: number;
  发货后退款订单数: number;
  发货前退款金额: number;
  发货后退款金额: number;
}

// 退款总览统计
export interface RefundOverview {
  总订单数: number;
  退款订单数: number;
  退款成功订单数: number;
  整体退款率: number;
  退款成功总金额: number;
  退款损失占比: number;
  高退款率SKU数: number; // 退款率 > 20%
  // 新增：区分发货前/后退款
  发货前退款订单数: number;
  发货后退款订单数: number;
  发货前退款金额: number;
  发货后退款金额: number;
}

// ============ 环比/同比对比 ============

// 单个指标的环比对比
export interface MetricComparison {
  current: number;   // 当前周期值
  previous: number;  // 上一周期值
  change: number;    // 变化值（current - previous）
  changeRate: number; // 变化率（%）
}

// 环比对比结果
export interface PeriodComparison {
  销售额: MetricComparison;
  销量: MetricComparison;
  订单数: MetricComparison;
  商家实收: MetricComparison;
  平均客单价: MetricComparison;
  利润率: MetricComparison;   // 整体净利润率（%）环比
  推广ROI: MetricComparison;  // 推广投产比（交易额 / 营销花费）环比
}

// ============ 智能运营建议 ============

export type AdviceLevel = 'critical' | 'warning' | 'info' | 'success';
export type AdviceCategory = 'profit' | 'refund' | 'marketing' | 'trend' | 'inventory';

export interface Advice {
  id: string;
  level: AdviceLevel;      // 严重程度
  category: AdviceCategory; // 分类
  title: string;            // 建议标题
  description: string;      // 建议描述
  metric?: string;          // 关键指标值
  suggestion: string;       // 具体建议
}

// ============ 推广预算优化建议 ============

export interface BudgetSuggestion {
  商品ID: string;
  商品名称: string;
  当前花费: number;
  交易额: number;
  净交易额: number;
  当前ROI: number;        // 交易额 / 花费
  净ROI: number;          // 净交易额 / 花费
  建议: 'increase' | 'decrease' | 'stop' | 'maintain';
  建议说明: string;
  预计调整比例: number;   // 建议调整比例（%），正数增加，负数减少
  预计影响利润: number;   // 调整后预计利润变化
}

// ============ 一键 AI：价格 & 分析 ============

// AI 建议项类型
export type AISuggestionType = 'overall' | 'pricing' | 'addSku' | 'bundle';
export type AILevel = 'critical' | 'warning' | 'info' | 'success';

// 单条 AI 分析建议
export interface AISuggestion {
  type: AISuggestionType;
  level: AILevel;
  title: string;
  detail: string;
  action: string;       // 具体行动建议
  metric?: string;      // 关键指标
  reference?: string;   // 论文/数据来源
}

// AI 价格计算输入参数
export interface AIPriceInput {
  成本单价?: number;      // 统一成本（留空则沿用各 SKU 已有成本）
  快递费?: number;        // 统一快递费
  包装耗材?: number;      // 统一包装耗材
  目标利润率: number;     // 目标利润率（%）
  应用范围: 'all' | 'empty'; // all=全部SKU，empty=仅未定价的SKU
}

// AI 价格计算结果（单个 SKU）
export interface AIPriceResult {
  规格: string;
  原定价: number;
  建议定价: number;
  固定成本: number;      // 单件固定成本
  退回运费损失: number;  // 单件退回运费损失
  预估利润率: number;    // 按建议定价预估的利润率（%）
  skipped: boolean;      // 是否跳过（无成本数据）
  reason?: string;       // 跳过原因
}

// 套餐组合建议（基于捆绑销售论文模型）
export interface BundleSuggestion {
  商品ID: string;
  商品名称: string;
  组合规格: string[];
  单买总价: number;
  建议套餐价: number;
  折扣率: number;
  预估套餐利润率: number;
  理由: string;
}

export type GeneratedSKUType = '低价引流' | '标准款' | '利润款' | '规格扩展' | '套餐组合' | '库存策略';

export interface GeneratedAISKU {
  id: string;
  规格: string;
  商品名称: string;
  类型: GeneratedSKUType;
  成本单价: number;
  快递费: number;
  包装耗材: number;
  人工成本: number;
  定价: number;
  利润率: number;
  建议理由: string;
  selected: boolean;
  组合规格?: string[];
}

export interface AIApplyPayload {
  config: DetailedCostConfig;
  summaries: ProductSummary[];
  bundles: BundleSuggestion[];
}

// ============ 单品明细（推广决策） ============

// 单品明细维度：sku=按规格明细，product=按商品ID汇总
export type SkuDetailDimension = 'sku' | 'product';

// 判定：单品维度=推广决策（停推广/降预算/可放大/无推广），SKU 维度=盈利×动销组合判定（盈利=全店利润率分位，动销=商品内销量占比）
export type SkuVerdict =
  | '停推广' | '降预算' | '可放大' | '无推广'
  | '明星款' | '潜力款' | '提曝光' | '现金牛' | '维持' | '观察'
  | '降本提价' | '精简' | '止损' | '清仓' | '清退' | '未配置';

// 单品明细行（按款/规格维度）
export interface SkuDetailRow {
  款号: string;          // 规格/款号
  商品ID: string;
  销售额: number;
  退款金额: number;
  订单数: number;
  客单价: number;        // 销售额 ÷ 订单数
  订单退款率: number;    // 退款金额 ÷ 销售额 × 100
  推广费: number;        // 分摊推广费
  净推广占比: number;    // 分摊推广费 ÷ 净销售额 × 100
  补偿: number;          // 该款补偿
  成本: number;          // 商品成本（成本单价 × 销量）
  单品毛利: number;      // 净销售额 - 成本
  实际毛利率: number;    // 单品毛利 ÷ 净销售额 × 100
  单品利润: number;      // 单品毛利 - 快递 - 运费险 - 扣点 - 分摊推广费 - 补偿
  实际保ROI: number;     // 净销售额 ÷ (单品利润 + 分摊推广费)
  实际ROI: number;       // 净销售额 ÷ 分摊推广费
  判定: SkuVerdict;
  判定依据: string;       // 判定规则的文字说明（悬浮提示用）
}

// 单品明细汇总（表头统计）
export interface SkuDetailOverview {
  款数: number;
  统计期起: string;
  统计期止: string;
  期间推广费: number;    // 所有款的推广费合计
  运费险: number;        // 运费险合计
}

// ============ 快递对账账单 ============

// 账单明细行（一行 = 一个运单）
export interface ExpressBillRecord {
  运单号: string;
  扫描时间: string;
  计费重量: number;
  总金额: number;   // 面单/运费金额
  预付: number;     // 预付（可为负）
  应付: number;     // 应付金额（= 总金额 + 预付；账单缺失该列时自动推导）
  计费省份: string;
  目的地: string;
  快递公司: string; // 账单结算对象名称（缺失时回退文件名）
  物料类型: string;
}

// 成本口径：payable=应付（实际结算，默认）；gross=总金额（面单运费）
export type ExpressBillAmountBasis = 'payable' | 'gross';

// 账单汇总
export interface ExpressBillSummary {
  总运单数: number;        // 有效运单行数
  总金额: number;          // 面单金额合计
  总预付: number;          // 预付合计
  总应付: number;          // 应付合计
  平均单件金额: number;    // 按当前口径的单件均值
  快递公司: string;
  文件名: string;
}

// 按SKU聚合的快递费
export interface SkuShippingFee {
  规格: string;
  商品ID: string;
  商品名称: string;
  订单数: number;        // 该规格订单数
  匹配运单数: number;    // 命中的账单运单数
  匹配件数: number;      // 命中订单的商品数量合计
  匹配率: number;        // 匹配运单数 / 订单数 * 100
  快递费合计: number;    // 命中运单金额合计（按口径）
  平均快递费: number;    // 单件快递费 = 合计 / 匹配件数（用于回填成本配置）
}

// 账单匹配结果
export interface ExpressBillMatchResult {
  汇总: ExpressBillSummary;
  按规格: SkuShippingFee[];
  匹配运单数: number;
  未匹配运单数: number;
  匹配率: number;        // 匹配运单数 / 总运单数 * 100
}
