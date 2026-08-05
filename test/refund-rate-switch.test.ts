/**
 * 退款率开关测试用例
 * 
 * 测试目标：验证关闭退款率开关后，利润计算是否正确（不计算退款损失）
 */

// 模拟类型定义
interface CostItem {
  '成本单价': number;
  '定价': number;
  '商家承担优惠': number;
  '人工成本': number;
  '运营成本': number;
  '快递费': number;
  '包装耗材': number;
  '运费险': number;
  '退款率': number;
  '启用快递费': boolean;
  '启用包装耗材': boolean;
  '启用运费险': boolean;
  '启用退款率': boolean;
}

interface ProductSummary {
  '规格': string;
  '销售额': number;
  '销量': number;
  '真实退款率': number;
}

// 模拟计算逻辑（从 dataProcessor.ts 和 CostInputPanel.tsx 提取）
function calculateProfitWithRefundRate(
  costItem: CostItem,
  product: ProductSummary
) {
  const 定价 = costItem['定价'];
  const 成本单价 = costItem['成本单价'];
  const 平台技术服务费 = 定价 * 0.006;
  
  const 可选成本总和 = 
    (costItem['商家承担优惠'] || 0) +
    (costItem['人工成本'] || 0) +
    (costItem['运营成本'] || 0) +
    (costItem['启用快递费'] ? (costItem['快递费'] || 0) : 0) +
    (costItem['启用包装耗材'] ? (costItem['包装耗材'] || 0) : 0) +
    (costItem['启用运费险'] ? (costItem['运费险'] || 0) : 0);
  
  const 单件总成本 = 成本单价 + 平台技术服务费 + 可选成本总和;
  
  // 关键逻辑：退款率开关
  // 启用 → 用户值；不启用 → 0（不计算退款）
  const effectiveRefundRate = costItem['启用退款率'] ? (costItem['退款率'] || 0) : 0;
  
  // 预估退款损失
  const 单件退款收入损失 = effectiveRefundRate > 0 ? 定价 * (effectiveRefundRate / 100) : 0;
  const 单件退回运费损失 = costItem['启用快递费'] && costItem['快递费'] 
    ? costItem['快递费'] * (effectiveRefundRate / 100) 
    : 0;
  const 预估退款损失 = 单件退款收入损失 + 单件退回运费损失;
  
  // 净利润
  const 净利润 = 定价 - 单件总成本 - 预估退款损失;
  const 利润率 = (净利润 / 定价) * 100;
  
  return {
    effectiveRefundRate,
    '单件退款收入损失': 单件退款收入损失,
    '单件退回运费损失': 单件退回运费损失,
    '预估退款损失': 预估退款损失,
    '净利润': 净利润,
    '利润率': 利润率,
  };
}

// 测试用例
const testCases = [
  {
    name: '关闭退款率开关 - 即使真实退款率很高，也不计算退款损失',
    costItem: {
      '成本单价': 50,
      '定价': 100,
      '商家承担优惠': 0,
      '人工成本': 0,
      '运营成本': 0,
      '快递费': 5,
      '包装耗材': 0,
      '运费险': 0,
      '退款率': 0,
      '启用快递费': true,
      '启用包装耗材': false,
      '启用运费险': false,
      '启用退款率': false,
    } as CostItem,
    product: {
      '规格': '测试规格 A',
      '销售额': 10000,
      '销量': 100,
      '真实退款率': 25,
    } as ProductSummary,
    expected: {
      effectiveRefundRate: 0,
      '预估退款损失': 0,
      '净利润': 44.4,
    },
  },
  {
    name: '启用退款率开关 - 使用用户输入的退款率',
    costItem: {
      '成本单价': 50,
      '定价': 100,
      '商家承担优惠': 0,
      '人工成本': 0,
      '运营成本': 0,
      '快递费': 5,
      '包装耗材': 0,
      '运费险': 0,
      '退款率': 10,
      '启用快递费': true,
      '启用包装耗材': false,
      '启用运费险': false,
      '启用退款率': true,
    } as CostItem,
    product: {
      '规格': '测试规格 B',
      '销售额': 10000,
      '销量': 100,
      '真实退款率': 25,
    } as ProductSummary,
    expected: {
      effectiveRefundRate: 10,
      '预估退款损失': 10.5,
      '净利润': 33.9,
    },
  },
  {
    name: '关闭退款率开关 - 真实退款率为 0 时利润应更高',
    costItem: {
      '成本单价': 80,
      '定价': 150,
      '商家承担优惠': 2,
      '人工成本': 3,
      '运营成本': 5,
      '快递费': 8,
      '包装耗材': 1,
      '运费险': 1,
      '退款率': 0,
      '启用快递费': true,
      '启用包装耗材': true,
      '启用运费险': true,
      '启用退款率': false,
    } as CostItem,
    product: {
      '规格': '测试规格 C',
      '销售额': 15000,
      '销量': 100,
      '真实退款率': 30,
    } as ProductSummary,
    expected: {
      effectiveRefundRate: 0,
      '预估退款损失': 0,
      '净利润': 49.1, // 150 - 80 - 0.9(平台费) - 2 - 3 - 5 - 8 - 1 - 1 = 49.1
    },
  },
  {
    name: '启用退款率开关 - 假设分析场景（如：如果退款率降到 5%）',
    costItem: {
      '成本单价': 50,
      '定价': 100,
      '商家承担优惠': 0,
      '人工成本': 0,
      '运营成本': 0,
      '快递费': 5,
      '包装耗材': 0,
      '运费险': 0,
      '退款率': 5,
      '启用快递费': true,
      '启用包装耗材': false,
      '启用运费险': false,
      '启用退款率': true,
    } as CostItem,
    product: {
      '规格': '测试规格 D',
      '销售额': 10000,
      '销量': 100,
      '真实退款率': 20,
    } as ProductSummary,
    expected: {
      effectiveRefundRate: 5,
      '预估退款损失': 5.25,
      '净利润': 39.15,
    },
  },
];

// 运行测试
console.log('='.repeat(80));
console.log('退款率开关测试用例');
console.log('='.repeat(80));
console.log();

let passCount = 0;
let failCount = 0;

testCases.forEach((testCase, index) => {
  console.log(`测试 ${index + 1}: ${testCase.name}`);
  console.log('-'.repeat(80));
  
  const result = calculateProfitWithRefundRate(testCase.costItem, testCase.product);
  
  const refundRateMatch = Math.abs(result.effectiveRefundRate - testCase.expected.effectiveRefundRate) < 0.01;
  const refundLossMatch = Math.abs(result['预估退款损失'] - testCase.expected['预估退款损失']) < 0.01;
  const profitMatch = Math.abs(result['净利润'] - testCase.expected['净利润']) < 0.01;
  
  console.log(`  输入:`);
  console.log(`    定价：¥${testCase.costItem['定价']}`);
  console.log(`    成本单价：¥${testCase.costItem['成本单价']}`);
  console.log(`    启用退款率：${testCase.costItem['启用退款率'] ? '✅ 启用' : '❌ 关闭'}`);
  console.log(`    用户输入退款率：${testCase.costItem['退款率']}%`);
  console.log(`    真实退款率：${testCase.product['真实退款率']}%`);
  console.log();
  console.log(`  计算结果:`);
  console.log(`    实际使用退款率：${result.effectiveRefundRate.toFixed(2)}% (期望：${testCase.expected.effectiveRefundRate}%) ${refundRateMatch ? '✅' : '❌'}`);
  console.log(`    预估退款损失：¥${result['预估退款损失'].toFixed(2)} (期望：¥${testCase.expected['预估退款损失']}) ${refundLossMatch ? '✅' : '❌'}`);
  console.log(`    净利润：¥${result['净利润'].toFixed(2)} (期望：¥${testCase.expected['净利润']}) ${profitMatch ? '✅' : '❌'}`);
  console.log(`    利润率：${result['利润率'].toFixed(2)}%`);
  console.log();
  
  if (refundRateMatch && refundLossMatch && profitMatch) {
    console.log(`  ✅ 测试通过`);
    passCount++;
  } else {
    console.log(`  ❌ 测试失败`);
    failCount++;
  }
  
  console.log();
});

console.log('='.repeat(80));
console.log(`测试总结：${passCount} 通过，${failCount} 失败`);
console.log('='.repeat(80));

if (failCount === 0) {
  console.log('✅ 所有测试通过！关闭退款率开关后，利润计算正确（不计算退款损失）。');
} else {
  console.log('❌ 存在测试失败，请检查代码逻辑。');
  process.exit(1);
}
