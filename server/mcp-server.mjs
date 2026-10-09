#!/usr/bin/env node
/**
 * PDD-SKU 成本配置 MCP 服务器（Model Context Protocol）
 *
 * 传输：Streamable HTTP（POST /mcp + GET /mcp SSE），零依赖、单文件。
 * 数据：与前端共用同一份持久化 JSON（容器内 /data、本地 ./.data）
 *       —— /data/cost.json     成本配置（前端 /api/config/cost 同一文件）
 *       —— /data/orders.json   销售订单（用于派生 SKU 列表与退款率口径）
 *
 * 工具：
 *   list_skus    列出全部 SKU（规格/商品ID/当前成本配置/销售汇总）
 *   get_cost     查询单个或多个规格的成本配置
 *   update_cost  修改成本配置（支持绝对值与相对增减，口语字段别名归一化）
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
const FILES = { cost: 'cost.json', orders: 'orders.json', marketing: 'marketing.json' };

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
        serverInfo: { name: 'pdd-sku-cost-mcp', version: '1.0.0' },
        instructions: '拼多多 SKU 成本配置服务器。流程：list_skus 查看现状 → update_cost 修改成本/定价。网页端会自动同步你的修改。',
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
