#!/usr/bin/env node
/**
 * PDD-SKU 成本配置 MCP 服务器（Model Context Protocol）
 *
 * 传输：Streamable HTTP（POST /mcp + GET /mcp SSE），零依赖、单文件。
 * 数据：与前端共用同一份持久化 JSON（容器内 /data、本地 ./.data）
 *       —— /data/cost        成本配置（前端 /api/config/cost 同一文件）
 *       —— /data/orders      销售订单（用于派生 SKU 列表与退款率口径）
 *       —— /data/marketing   营销推广数据（商品维度汇总与点击率/转化率）
 *       —— /data/expressBill 快递对账账单（快递公司维度汇总）
 *
 * 工具：
 *   list_skus         列出全部 SKU（规格/商品ID/当前成本配置/销售汇总）
 *   get_cost          查询单个或多个规格的成本配置
 *   update_cost       修改成本配置（支持绝对值与相对增减，口语字段别名归一化）
 *   delete_cost       删除成本配置（按规格名移除条目）
 *   list_marketing    营销推广数据汇总（整体均值 + 商品维度，点击率/转化率）
 *   list_express_bill 快递账单汇总（整体 + 快递公司维度）
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.MCP_DATA_DIR || path.resolve(__dirname, '../.data');
const PORT = Number(process.env.MCP_PORT || 9100);
const ENDPOINT = '/mcp';
const PROTOCOL_VERSION = '2025-03-26';

fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- 数据读写（与前端 /api/config/* 同一文件） ----------
const FILES = { cost: 'cost', orders: 'orders', marketing: 'marketing', expressBill: 'expressBill' };

function readJson(name) {
  const file = path.join(DATA_DIR, FILES[name]);
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; }
}
function writeJson(name, data) {
  const file = path.join(DATA_DIR, FILES[name]);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

// ---------- 部署地址上报（供网页「mcp」一键复制使用） ----------
// 优先读取 PUBLIC_HOST 环境变量，其次读取部署脚本写入的 data/server-info.json
function readServerHost() {
  const envHost = (process.env.PUBLIC_HOST || '').trim();
  if (envHost) return envHost;
  try {
    const info = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'server-info.json'), 'utf-8'));
    if (info && typeof info.host === 'string') return info.host.trim();
  } catch { /* 文件不存在时忽略 */ }
  return '';
}

// ---------- 订单 → SKU 销售汇总（口径与前端 groupBySpec 一致） ----------
function summarizeOrders(orders) {
  const map = new Map();
  for (const o of orders || []) {
    const spec = o['商品规格'] || '未知规格';
    const d = map.get(spec) || {
      商品ID: o['商品id'] || '', 样式ID: o['样式ID'] || '', 商品名称: o['商品'] || spec,
      销售额: 0, 销量: 0, 订单数: 0, 退款成功额: 0, 发货后退款额: 0, 总订单数: 0,
    };
    d.总订单数 += 1;
    if (!d.样式ID && o['样式ID']) d.样式ID = o['样式ID'];
    const refunded = String(o['售后状态'] || '').includes('退款成功');
    const validStatus = ['已收货', '已发货', '待收货'].some(s => String(o['订单状态'] || '').includes(s));
    if (!refunded && validStatus) {
      d.销售额 += Number(o['商家实收金额']) || 0;
      d.销量 += Number(o['商品数量']) || 0;
      d.订单数 += 1;
    }
    if (refunded) {
      d.退款成功额 += Number(o['商家实收金额']) || 0;
      if (String(o['发货时间'] || '').trim() !== '') d.发货后退款额 += Number(o['商家实收金额']) || 0;
    }
    map.set(spec, d);
  }
  const list = [];
  map.forEach((d, spec) => {
    const total = d.销售额 + d.退款成功额;
    list.push({
      spec,
      商品ID: d.商品ID, 样式ID: d.样式ID, 商品名称: d.商品名称,
      销售额: round2(d.销售额), 销量: d.销量, 订单数: d.订单数, 总订单数: d.总订单数,
      平均客单价: d.订单数 > 0 ? round2(d.销售额 / d.订单数) : 0,
      真实退款率: total > 0 ? round2((d.退款成功额 / total) * 100) : 0,
      发货后退款率: total > 0 ? round2((d.发货后退款额 / total) * 100) : 0,
    });
  });
  return list.sort((a, b) => b.销售额 - a.销售额);
}

// ---------- 字段归一化（口语/英文键 → 固定字段，与前端 aiMcp.ts 一致） ----------
const CHANGE_LABELS = {
  成本单价: '成本', 快递费: '运费', 包装耗材: '包装', 人工成本: '人工',
  运营成本: '运营', 商家承担优惠: '商家优惠', 运费险: '运费险', 退款率: '退款率', 定价: '定价',
};
const FIELD_ALIASES = {
  成本: '成本单价', 成本价: '成本单价', 进货价: '成本单价', 采购价: '成本单价', 商品成本: '成本单价', cost: '成本单价', costprice: '成本单价',
  运费: '快递费', 邮费: '快递费', 快递: '快递费', 物流费: '快递费', shipping: '快递费', shippingfee: '快递费',
  包装: '包装耗材', 包材: '包装耗材', 耗材: '包装耗材', 包装费: '包装耗材', packagingfee: '包装耗材',
  人工: '人工成本', 人工费: '人工成本', 工时: '人工成本', 工时费: '人工成本', labor: '人工成本', laborcost: '人工成本',
  运营: '运营成本', 运营费: '运营成本', 推广成本: '运营成本', operationcost: '运营成本',
  优惠: '商家承担优惠', 商家优惠: '商家承担优惠', 优惠金额: '商家承担优惠',
  保险: '运费险', 退货运费险: '运费险',
  退货率: '退款率',
  售价: '定价', 价格: '定价', 卖价: '定价', 标价: '定价', 商品定价: '定价', price: '定价',
  利润率: '目标利润率', 毛利率: '目标利润率', 毛利: '目标利润率', 目标利润: '目标利润率', 利润: '目标利润率', profitmargin: '目标利润率',
};
const NUMERIC_FIELDS = ['成本单价', '快递费', '包装耗材', '人工成本', '运营成本', '商家承担优惠', '运费险', '退款率', '定价', '目标利润率'];

function normalizeFieldKey(key) {
  const k = String(key).trim();
  if (NUMERIC_FIELDS.includes(k)) return k;
  return FIELD_ALIASES[k] || FIELD_ALIASES[k.toLowerCase()] || null;
}

function round2(n) { return Math.round(n * 100) / 100; }

// ---------- 成本配置读取（合并订单派生规格，保证新 SKU 也有条目） ----------
function loadCostConfig() {
  const config = readJson('cost') || {};
  if (config && typeof config === 'object' && !Array.isArray(config)) return config;
  return {};
}

/** 构建全部 SKU 视图：订单汇总 + 成本配置（精简字段） */
function buildSkuView() {
  const config = loadCostConfig();
  const summaries = summarizeOrders(readJson('orders'));
  const seen = new Set();
  const rows = [];
  for (const s of summaries) {
    seen.add(s.spec);
    rows.push({ ...s, ...(config[s.spec] ? { 成本配置: slimCost(config[s.spec]) } : {}) });
  }
  // 只在成本配置里、订单里没有的规格（例如手动加的）
  for (const spec of Object.keys(config)) {
    if (seen.has(spec)) continue;
    rows.push({ spec, 商品ID: '', 商品名称: spec, 成本配置: slimCost(config[spec]) });
  }
  return rows;
}

function slimCost(item) {
  const out = {};
  for (const k of NUMERIC_FIELDS) {
    const v = item?.[k];
    if (v !== undefined && v !== null && Number(v) !== 0) out[k] = Number(v);
  }
  return out;
}

// ---------- 通用数值工具 ----------
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function pct(a, b) { return b > 0 ? round2((a / b) * 100) : 0; }

// ---------- 营销推广汇总（口径与前端 MarketingAnalysis 一致） ----------
// 点击率 = 总点击 ÷ 总曝光；转化率 = 总成交 ÷ 总点击
function summarizeMarketing(rows, filter = {}) {
  const kw = String(filter['商品ID'] || '').trim();
  const from = String(filter.dateFrom || '').trim();
  const to = String(filter.dateTo || '').trim();
  const list = (Array.isArray(rows) ? rows : []).filter((r) => {
    if (kw && !String(r?.['商品ID'] || '').includes(kw)) return false;
    const d = String(r?.['日期'] || '');
    if (from && d && d < from) return false;
    if (to && d && d > to) return false;
    return true;
  });

  const total = { 总营销花费: 0, 交易额: 0, 净交易额: 0, 成交笔数: 0, 净成交笔数: 0, 曝光量: 0, 点击量: 0, 询单量: 0, 收藏量: 0 };
  const groups = new Map();
  for (const r of list) {
    for (const k of Object.keys(total)) total[k] += num(r?.[k]);
    const gid = String(r?.['商品ID'] || '未指定ID');
    const g = groups.get(gid) || { 商品ID: gid, 商品名称: '', 分组: '', 总营销花费: 0, 交易额: 0, 净交易额: 0, 成交笔数: 0, 曝光量: 0, 点击量: 0 };
    for (const k of ['总营销花费', '交易额', '净交易额', '成交笔数', '曝光量', '点击量']) g[k] += num(r?.[k]);
    if (!g.商品名称 && r?.['商品名称']) g.商品名称 = r['商品名称'];
    if (!g.分组 && r?.['分组']) g.分组 = r['分组'];
    groups.set(gid, g);
  }

  const summary = {
    记录数: list.length,
    总曝光量: total.曝光量,
    总点击量: total.点击量,
    总成交笔数: total.成交笔数,
    总净成交笔数: total.净成交笔数,
    总营销花费: round2(total.总营销花费),
    总交易额: round2(total.交易额),
    总净交易额: round2(total.净交易额),
    点击率: pct(total.点击量, total.曝光量),
    转化率: pct(total.成交笔数, total.点击量),
    投产比: total.总营销花费 > 0 ? round2(total.交易额 / total.总营销花费) : 0,
  };

  const groupRows = [...groups.values()].map((g) => {
    const ctr = pct(g.点击量, g.曝光量);
    const cvr = pct(g.成交笔数, g.点击量);
    const vsCtr = summary.点击率 > 0 ? round2((ctr / summary.点击率 - 1) * 100) : 0;
    const vsCvr = summary.转化率 > 0 ? round2((cvr / summary.转化率 - 1) * 100) : 0;
    let 诊断 = '达标';
    if (vsCtr < -20 && vsCvr < -20) 诊断 = '素材与承接页都弱';
    else if (vsCtr < -20) 诊断 = '点击率低·换素材/主图';
    else if (vsCvr < -20) 诊断 = '转化率低·优化详情/价格';
    else if (vsCtr > 20 && vsCvr > 20) 诊断 = '双优·可放量';
    return {
      商品ID: g.商品ID,
      商品名称: g.商品名称 || g.商品ID,
      分组: g.分组,
      交易额: round2(g.交易额),
      总营销花费: round2(g.总营销花费),
      净交易额: round2(g.净交易额),
      成交笔数: g.成交笔数,
      曝光量: g.曝光量,
      点击量: g.点击量,
      点击率: ctr,
      较均值_点击率: vsCtr,
      转化率: cvr,
      较均值_转化率: vsCvr,
      投产比: g.总营销花费 > 0 ? round2(g.交易额 / g.总营销花费) : 0,
      诊断,
    };
  }).sort((a, b) => b.曝光量 - a.曝光量);

  return { summary, groups: groupRows };
}

// ---------- 快递账单汇总（口径与前端 ExpressBillAnalysis 一致，默认应付口径） ----------
function summarizeExpressBill(records, filter = {}) {
  const kw = String(filter['快递公司'] || '').trim();
  const list = (Array.isArray(records) ? records : []).filter((r) => !kw || String(r?.['快递公司'] || '').includes(kw));

  const total = { 运单数: 0, 总金额: 0, 总预付: 0, 总应付: 0, 总计费重量: 0 };
  const groups = new Map();
  for (const r of list) {
    const amt = num(r?.['总金额']);
    const pre = num(r?.['预付']);
    const rawPay = r?.['应付'];
    const pay = rawPay === undefined || rawPay === null || rawPay === '' ? amt + pre : num(rawPay);
    const w = num(r?.['计费重量']);
    total.运单数 += 1; total.总金额 += amt; total.总预付 += pre; total.总应付 += pay; total.总计费重量 += w;
    const gid = String(r?.['快递公司'] || '未指定');
    const g = groups.get(gid) || { 快递公司: gid, 运单数: 0, 总金额: 0, 总预付: 0, 总应付: 0, 总计费重量: 0 };
    g.运单数 += 1; g.总金额 += amt; g.总预付 += pre; g.总应付 += pay; g.总计费重量 += w;
    groups.set(gid, g);
  }

  const summary = {
    总运单数: total.运单数,
    总金额: round2(total.总金额),
    总预付: round2(total.总预付),
    总应付: round2(total.总应付),
    总计费重量: round2(total.总计费重量),
    平均单件应付: total.运单数 > 0 ? round2(total.总应付 / total.运单数) : 0,
    平均单件面单: total.运单数 > 0 ? round2(total.总金额 / total.运单数) : 0,
  };

  const groupRows = [...groups.values()].map((g) => ({
    快递公司: g.快递公司,
    运单数: g.运单数,
    总金额: round2(g.总金额),
    总预付: round2(g.总预付),
    总应付: round2(g.总应付),
    总计费重量: round2(g.总计费重量),
    平均单件应付: g.运单数 > 0 ? round2(g.总应付 / g.运单数) : 0,
  })).sort((a, b) => b.运单数 - a.运单数);

  return { summary, groups: groupRows };
}

/** 分组结果按 limit 截断（limit<=0 或非数字表示全部） */
function limitGroups(result, limit) {
  const n = limit === undefined ? 50 : Number(limit);
  const total = result.groups.length;
  const groups = Number.isFinite(n) && n > 0 ? result.groups.slice(0, n) : result.groups;
  return { ...result, groups, groups_total: total };
}

// ---------- 工具实现 ----------
const TOOLS = [
  {
    name: 'list_skus',
    description: '列出全部 SKU：规格名、商品ID、当前成本配置（成本/运费/包装/人工/运营/优惠/运费险/退款率/定价）与近期销售汇总。每次修改成本前先调用它了解现状。',
    inputSchema: { type: 'object', properties: {} },
    handler: () => ({ skus: buildSkuView() }),
  },
  {
    name: 'get_cost',
    description: '查询单个或多个规格的成本配置。spec 为规格名（与 list_skus 返回的 spec 完全一致），多个用 specs 数组，不传则返回全部。',
    inputSchema: {
      type: 'object',
      properties: { spec: { type: 'string', description: '规格名' }, specs: { type: 'array', items: { type: 'string' }, description: '规格名列表' } },
    },
    handler: (args) => {
      const targets = args?.specs?.length ? args.specs : args?.spec ? [args.spec] : null;
      const config = loadCostConfig();
      const entries = targets
        ? targets.map(spec => ({ spec, ...(config[spec] ? slimCost(config[spec]) : {}) }))
        : Object.entries(config).map(([spec, item]) => ({ spec, ...slimCost(item) }));
      return { costs: entries };
    },
  },
  {
    name: 'update_cost',
    description: '修改成本配置。changes 每项含 spec（必须来自 list_skus）与要修改的字段：成本单价/快递费/包装耗材/人工成本/运营成本/商家承担优惠/运费险/退款率/定价/目标利润率（支持口语别名如 进货价/邮费/包材/售价）。数值默认为变更后的绝对值；用 delta 字段表示增减（如 {"快递费":{"delta":0.5}} 表示涨 5 角）。只给目标利润率不给定价时会按成本自动反推定价。写入后网页端会自动同步（约 5 秒内）。',
    inputSchema: {
      type: 'object',
      properties: {
        changes: {
          type: 'array',
          description: '变更列表',
          items: {
            type: 'object',
            properties: {
              spec: { type: 'string', description: '规格名' },
              reason: { type: 'string', description: '变更依据（可选）' },
            },
            additionalProperties: true,
          },
        },
      },
      required: ['changes'],
    },
    handler: (args) => {
      const changes = Array.isArray(args?.changes) ? args.changes : [];
      if (!changes.length) throw new Error('changes 不能为空');
      const config = loadCostConfig();
      const summaries = summarizeOrders(readJson('orders'));
      const summaryMap = new Map(summaries.map(s => [s.spec, s]));
      const applied = [];
      const skipped = [];

      for (const raw of changes) {
        const spec = String(raw?.spec || raw?.规格 || '').trim();
        if (!spec) { skipped.push({ spec, reason: '缺少 spec' }); continue; }

        const cur = config[spec] || {};
        const next = { ...cur };

        for (const [rawKey, rawVal] of Object.entries(raw)) {
          if (['spec', '规格', 'reason'].includes(rawKey)) continue;
          const key = normalizeFieldKey(rawKey);
          if (!key) { skipped.push({ spec, reason: `未知字段「${rawKey}」` }); continue; }

          let value;
          if (rawVal && typeof rawVal === 'object' && !Array.isArray(rawVal)) {
            // {delta: +0.5} / {delta: -1} 相对增减
            const d = Number(rawVal.delta);
            if (Number.isFinite(d)) {
              value = (Number(cur[key]) || 0) + d;
            } else if (rawVal.percent !== undefined) {
              // {percent: 10} 相对当前值 +10%
              const p = Number(rawVal.percent);
              if (Number.isFinite(p)) value = ((Number(cur[key]) || 0) * (1 + p / 100));
              else { skipped.push({ spec, reason: `字段「${rawKey}」percent 非数字` }); continue; }
            } else {
              skipped.push({ spec, reason: `字段「${rawKey}」的值格式不支持` });
              continue;
            }
          } else if (typeof rawVal === 'string' && /^[-+]?[()（]\s*¥?\s*\d/.test(rawVal)) {
            // 字符串 "(¥3.5)" 或 "+2" 风格：宽松解析
            const n = Number(String(rawVal).replace(/[^\d.+-]/g, ''));
            value = Number.isFinite(n) ? n : undefined;
          } else {
            const n = Number(rawVal);
            value = Number.isFinite(n) ? n : undefined;
          }

          if (value === undefined || !Number.isFinite(value)) {
            skipped.push({ spec, reason: `字段「${rawKey}」的值不是数字` });
            continue;
          }
          next[key] = round2(value);
        }

        // 目标利润率反推定价（未显式给定价时）
        if (next.目标利润率 !== undefined && (next.定价 === undefined || Number(next.定价) === 0)) {
          const rate = Number(next.目标利润率);
          if (Number.isFinite(rate)) {
            const s = summaryMap.get(spec);
            const fixedCost = (next.成本单价 || 0) + (next.人工成本 || 0) + (next.运营成本 || 0)
              + (next.商家承担优惠 || 0) + (next.快递费 || 0) + (next.包装耗材 || 0) + (next.运费险 || 0);
            const returnShipping = (next.快递费 || 0) * ((s?.发货后退款率 || 0) / 100);
            const denominator = 1 - 0.006 - rate / 100;
            if (denominator > 0 && fixedCost > 0) {
              next.定价 = round2((fixedCost + returnShipping) / denominator);
            }
          }
        }

        if (!next.成本单价) next.成本单价 = 0;
        // 开关随数值同步（与网页端回填逻辑一致）
        next.启用快递费 = (next.快递费 || 0) > 0;
        next.启用包装耗材 = (next.包装耗材 || 0) > 0;
        next.启用运费险 = (next.运费险 || 0) > 0;
        next.启用退款率 = (next.退款率 || 0) > 0;

        config[spec] = next;
        applied.push({ spec, ...slimCost(next), ...(raw.reason ? { reason: String(raw.reason) } : {}) });
      }

      if (!applied.length) throw new Error('没有可应用的变更（全部被跳过）');
      writeJson('cost', config);
      return {
        ok: true,
        applied_count: applied.length,
        applied,
        ...(skipped.length ? { skipped } : {}),
        note: '已写入，网页端约 5 秒内自动同步',
      };
    },
  },
  {
    name: 'delete_cost',
    description: '删除成本配置。specs 为要删除的规格名数组（与 list_skus 返回的 spec 完全一致）。仅移除成本配置条目，不改动订单/营销/快递数据。写入后网页端约 5 秒内自动同步。',
    inputSchema: {
      type: 'object',
      properties: { specs: { type: 'array', items: { type: 'string' }, description: '要删除的规格名列表' } },
      required: ['specs'],
    },
    handler: (args) => {
      const specs = Array.isArray(args?.specs) ? args.specs.map(s => String(s).trim()).filter(Boolean) : [];
      if (!specs.length) throw new Error('specs 不能为空');
      const config = loadCostConfig();
      const deleted = [];
      const notFound = [];
      for (const spec of specs) {
        if (Object.prototype.hasOwnProperty.call(config, spec)) { delete config[spec]; deleted.push(spec); }
        else notFound.push(spec);
      }
      if (!deleted.length) {
        return { ok: false, deleted_count: 0, deleted: [], not_found: notFound, note: '未找到匹配的成本配置，未做写入' };
      }
      writeJson('cost', config);
      return {
        ok: true,
        deleted_count: deleted.length,
        deleted,
        ...(notFound.length ? { not_found: notFound } : {}),
        note: '已删除，网页端约 5 秒内自动同步',
      };
    },
  },
  {
    name: 'list_marketing',
    description: '查询营销推广数据（只读）。返回整体汇总（总曝光/点击/成交、点击率=总点击÷总曝光、转化率=总成交÷总点击、投产比）与按商品ID分组明细（含较均值对比与诊断）。可用 商品ID 关键字、dateFrom/dateTo（YYYY-MM-DD）筛选；limit 限制分组条数（默认 50，0 表示全部）。',
    inputSchema: {
      type: 'object',
      properties: {
        商品ID: { type: 'string', description: '商品ID关键字（模糊匹配，可选）' },
        dateFrom: { type: 'string', description: '起始日期 YYYY-MM-DD（可选）' },
        dateTo: { type: 'string', description: '结束日期 YYYY-MM-DD（可选）' },
        limit: { type: 'number', description: '分组返回条数上限，默认 50，0 表示全部' },
      },
    },
    handler: (args) => {
      const rows = readJson('marketing');
      if (!Array.isArray(rows)) return { summary: null, groups: [], groups_total: 0, note: '暂无营销数据（未上传或为空）' };
      return limitGroups(summarizeMarketing(rows, args || {}), args?.limit);
    },
  },
  {
    name: 'list_express_bill',
    description: '查询快递对账账单（只读）。返回整体汇总（总运单数/总金额/总预付/总应付/平均单件）与按快递公司分组明细。可用 快递公司 关键字筛选；limit 限制分组条数（默认 50，0 表示全部）。',
    inputSchema: {
      type: 'object',
      properties: {
        快递公司: { type: 'string', description: '快递公司关键字（模糊匹配，可选）' },
        limit: { type: 'number', description: '分组返回条数上限，默认 50，0 表示全部' },
      },
    },
    handler: (args) => {
      const rows = readJson('expressBill');
      if (!Array.isArray(rows)) return { summary: null, groups: [], groups_total: 0, note: '暂无快递账单数据（未上传或为空）' };
      return limitGroups(summarizeExpressBill(rows, args || {}), args?.limit);
    },
  },
];

// ---------- MCP 协议（Streamable HTTP） ----------
const JSON_HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

function send(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { ...JSON_HEADERS, ...headers });
  res.end(payload);
}

function handleJsonRpc(body, sessionMeta) {
  const { id, method, params } = body;
  const reply = (result, isError = false) => ({ jsonrpc: '2.0', id, ...(isError ? { error: result } : { result }) });
  const rpcError = (code, message) => reply({ code, message }, true);

  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'pdd-sku-cost-mcp', version: '1.1.0' },
        instructions: '拼多多 SKU 成本配置与经营数据服务器。成本：list_skus 查看现状 → get_cost / update_cost / delete_cost 查询、修改、删除成本与定价。经营数据（只读）：list_marketing 营销推广（点击率/转化率），list_express_bill 快递账单。网页端会自动同步成本修改。',
      });
    case 'notifications/initialized':
      return null; // 通知无响应
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({
        tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      });
    case 'tools/call': {
      const tool = TOOLS.find(t => t.name === params?.name);
      if (!tool) return rpcError(-32602, `未知工具: ${params?.name}`);
      try {
        const result = tool.handler(params?.arguments || {});
        return reply({ content: [{ type: 'text', text: JSON.stringify(result) }] });
      } catch (e) {
        return reply({ isError: true, content: [{ type: 'text', text: e?.message || String(e) }] });
      }
    }
    default:
      return rpcError(-32601, `未知方法: ${method}`);
  }
}

const server = http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];

  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-session-id, mcp-protocol-version',
      'Access-Control-Expose-Headers': 'mcp-session-id',
      'Access-Control-Max-Age': '1728000',
    });
    return res.end();
  }

  // 部署地址上报（网页「mcp」按钮一键复制时读取，用于替换 localhost）
  if (req.method === 'GET' && url === '/server-info') {
    return send(res, 200, { host: readServerHost() });
  }

  // SSE 通知流（可选，保持连接即可）
  if (req.method === 'GET' && url === ENDPOINT) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(': keepalive\n\n');
    const timer = setInterval(() => res.write(': keepalive\n\n'), 25000);
    req.on('close', () => clearInterval(timer));
    return;
  }

  if (req.method === 'POST' && url === ENDPOINT) {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
      } catch {
        return send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      }
      const response = handleJsonRpc(body);
      if (response === null) return send(res, 202, {});
      const headers = {};
      if (body.method === 'initialize') headers['mcp-session-id'] = crypto.randomUUID();
      return send(res, 200, response, headers);
    });
    return;
  }

  send(res, 404, { error: 'not found', endpoint: ENDPOINT });
});

server.listen(PORT, () => {
  console.log(`[pdd-sku-cost-mcp] listening on http://0.0.0.0:${PORT}${ENDPOINT}`);
  console.log(`[pdd-sku-cost-mcp] data dir: ${DATA_DIR}`);
});
