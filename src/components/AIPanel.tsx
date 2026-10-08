import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, Eraser, Loader2, Send, Settings, Sparkles, X } from 'lucide-react';
import type { AIApplyPayload, AIModelConfig, DetailedCostConfig, ProductSummary } from '../types';

const MODEL_KEY = 'openaiCompatibleConfig';
const defaultModel: AIModelConfig = { apiUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' };

interface Props { allSummaries: ProductSummary[]; costConfig: DetailedCostConfig; onClose: () => void; onApply: (payload: AIApplyPayload) => void; }

function loadModel(): AIModelConfig { try { const saved = JSON.parse(localStorage.getItem(MODEL_KEY) || '{}'); return { ...defaultModel, ...saved, temperature: undefined as any }; } catch { return defaultModel; } }

// ============ AI 对话：变更预览 ============
interface ChatChangeField { key: string; label: string; from: number; to: number; }
interface ChatChange { spec: string; fields: ChatChangeField[]; reason: string; selected: boolean; values: Record<string, unknown>; }
interface ChatMessage { id: string; role: 'user' | 'assistant'; text: string; raw?: string; queryMeta?: Record<string, unknown>; }

// 可写入成本表的固定字段（键=成本表字段名，值=界面展示名）
const CHANGE_LABELS: Record<string, string> = {
  成本单价: '成本', 快递费: '运费', 包装耗材: '包装', 人工成本: '人工',
  运营成本: '运营', 商家承担优惠: '商家优惠', 运费险: '运费险', 退款率: '退款率', 定价: '定价',
};
const FIXED_FIELDS = Object.keys(CHANGE_LABELS);

// 口语/别名/英文键 → 固定字段（让多样化的说法统一落到成本表固定字段）
const FIELD_ALIASES: Record<string, string> = {
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

// 把 AI 返回的变更行归一化到固定字段（支持中文别名与英文键）
function normalizeChangeRow(row: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!row || typeof row !== 'object') return out;
  Object.keys(row).forEach(rawKey => {
    const key = rawKey.trim();
    if (FIXED_FIELDS.includes(key)) { out[key] = row[rawKey]; return; }
    const alias = FIELD_ALIASES[key] || FIELD_ALIASES[key.toLowerCase()];
    if (alias) out[alias] = row[rawKey];
  });
  return out;
}

// 稳健提取 JSON：兼容 ```json 代码块、前后多余文字
function extractJson(text: string): any {
  if (!text) throw new Error('模型没有返回内容');
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const candidates = [cleaned];
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) candidates.push(cleaned.slice(start, end + 1));
  for (const c of candidates) {
    try { return JSON.parse(c); } catch { /* 尝试下一种 */ }
  }
  throw new Error('模型返回内容不是合法 JSON');
}

// 若 SKU 不存在则补一条空汇总，保证明细表能显示该规格
function ensureSummary(summaries: any[], spec: string, name?: string) {
  if (summaries.some(s => s['规格'] === spec)) return;
  summaries.push({
    规格: spec, 商品ID: '', 商品名称: name || spec,
    销售额: 0, 销量: 0, 订单数: 0, 平均客单价: 0, 营销花费: 0,
    成本单价: 0, 总商品成本: 0, 人工成本: 0, 运营成本: 0,
    平台技术服务费: 0, 商家承担优惠: 0, 快递费: 0, 包装耗材: 0,
    运费险: 0, 退款金额: 0, 退款率: 0, 真实退款率: 0, 发货后退款率: 0,
    订单引流成本: 0, 总成本: 0, 预估退款损失: 0, 净利润: 0, 利润率: 0, SKU净利润: 0,
  });
}

const CHAT_SYSTEM_PROMPT = `你是电商成本与定价配置助手。用户会用自然语言（口语、简称、别名都可以）告诉你某个 SKU 的成本或定价（你来翻译成结构化配置变更），也会问你商品/SKU 的状态、数量等问题（需要你识别查询意图，系统会用真实数据执行查询后再回答你）。

用户消息中会附带【当前 SKU 与成本配置】的 JSON 列表，请严格基于该列表匹配规格。

字段只允许使用以下固定字段（不要自创字段名）：
成本单价、快递费、包装耗材、人工成本、运营成本、商家承担优惠、运费险、退款率、定价、目标利润率
常见口语对应：成本/进货价/采购价→成本单价；运费/邮费/物流费→快递费；包装/包材→包装耗材；人工/工时→人工成本；运营/推广→运营成本；优惠→商家承担优惠；运费险/保险→运费险；退款率/退货率→退款率；售价/卖价/价格→定价；利润率/毛利率/毛利→目标利润率。

规则：
1. 只返回合法 JSON，不要输出任何多余文字或代码块标记。
2. 输出结构：{"reply":"给用户的中文回复","changes":[{"spec":"规格名","成本单价":0,"快递费":0,"包装耗材":0,"人工成本":0,"运营成本":0,"商家承担优惠":0,"运费险":0,"退款率":0,"定价":0,"目标利润率":0,"reason":"变更依据"}],"query":{"type":"missingCost|getSkuCost","productId":"商品ID","spec":"规格名"}}
3. 你要么产出 changes（用户要求修改），要么产出 query（用户只是在问状态/数量），两者不会同时有实质内容；若只是提问：changes 返回 []，query 填上意图；若只是修改：query 不要出现。
4. changes 中只填写用户本次明确提到的字段，未提到的字段一律不要出现（不要用 0 占位）。
5. 所有成本/定价字段都是「变更后的绝对值」（单位元、数字），不是增减量。若用户说「涨/降/加/减 X 元」或「提高/降低 X%」，请结合【当前 SKU 与成本配置】里的现值自行换算成绝对值再填入。
6. 目标利润率是百分比数字（例如 30 表示 30%）。只有当用户没给具体定价、只给了利润率时才填目标利润率，系统会自动反推定价；若同时给了定价，填定价即可。
7. spec 必须来自【当前 SKU 与成本配置】的规格名且完全一致；用户用简称/编号时匹配到对应规格；用户说「全部规格/所有 SKU」时，为列表中每一个规格各输出一条 change。
8. 查询意图（query）：
   - type="missingCost"：用户问「某宝贝/商品有多少（个规格）没填成本 / 缺成本 / 成本为0」等 → productId 填【当前 SKU 与成本配置】里精确的商品ID（用户说「宝贝id xxx」就用 xxx）；用户没限定商品就问全部未填成本时 productId 填空字符串 ""。
   - type="getSkuCost"：用户问「某个规格的成本/详细配置是多少」→ spec 填精确规格名，productId 可留空。
   - 永远不要自己编造查询结果，数值由系统执行后给你，你只需在 reply 里先给出你对查询的理解（不要写具体数字，等系统结果）。
9. 若用户只是在提问、没有要求修改，changes 返回空数组 []。
10. reply 要自然、口语化。修改场景：复述你识别到的需求与将要做的改动（例如「好的，1 件装成本从 5 元调到 8 元，运费设为 3 元」）；查询场景：简要说明你准备查询什么（例如「好的，我查一下这个宝贝有哪些规格还没填成本」）。`;

const AIPanel: React.FC<Props> = ({ allSummaries, costConfig, onClose, onApply }) => {
  const [model, setModel] = useState(loadModel);
  const [showSettings, setShowSettings] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // 对话模式状态
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatChanges, setChatChanges] = useState<ChatChange[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [chatMessages, chatChanges, chatLoading]);

  const saveSettings = () => { localStorage.setItem(MODEL_KEY, JSON.stringify(model)); setShowSettings(false); setMessage('模型配置已保存'); };

  const requestAI = async (messages: { role: string; content: string }[]): Promise<string> => {
    if (!model.apiKey.trim()) throw new Error('请先点击右上角设置，填写 API Key');

    // 统一使用代理（开发和生产环境）
    const endpoint = '/api/ai/chat/completions';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${model.apiKey.trim()}`
        },
        body: JSON.stringify({
          model: model.model.trim(),
          response_format: { type: 'json_object' },
          messages
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`模型请求失败 (${response.status}): ${errorText || response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('模型没有返回内容');
      return content as string;
    } catch (error) {
      console.error('[AI Error]', error);
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('无法连接到 AI 服务，请检查：1) API Key 是否正确 2) 网络是否正常 3) 代理是否生效');
      }
      throw error;
    }
  };

  // 调用模型并强制解析为 JSON；解析失败时纠正一次重试，保证写入结构固定
  const callAIChat = async (messages: { role: string; content: string }[], attempt = 0): Promise<any> => {
    const content = await requestAI(messages);
    try {
      return extractJson(content);
    } catch (e) {
      if (attempt < 1) {
        return callAIChat([
          ...messages,
          { role: 'assistant', content },
          { role: 'user', content: '你上一次的输出不是合法 JSON。请严格按照约定结构，只输出一个合法的 JSON 对象，不要包含任何解释文字或代码块标记。' }
        ], attempt + 1);
      }
      throw e;
    }
  };

  // 供 AI 识别的当前 SKU 与成本配置（精简字段，控制 token）
  const buildSkuContext = () => allSummaries.map(s => {
    const c: any = costConfig[s['规格']] || {};
    return {
      规格: s['规格'],
      商品ID: s['商品ID'] || '',
      成本: c['成本单价'] || 0,
      运费: c['快递费'] || 0,
      包装: c['包装耗材'] || 0,
      人工: c['人工成本'] || 0,
      运营: c['运营成本'] || 0,
      优惠: c['商家承担优惠'] || 0,
      运费险: c['运费险'] || 0,
      退款率: c['退款率'] || 0,
      定价: c['定价'] || 0,
    };
  });

  // 把 AI 返回的变更解析为「预览变更」（含目标利润率反推定价）
  const buildChatChanges = (result: any): ChatChange[] => {
    const list = Array.isArray(result?.changes) ? result.changes : [];
    const out: ChatChange[] = [];
    const PLATFORM_RATE = 0.006;

    list.forEach((rawRow: any) => {
      const spec = String(rawRow?.spec || '').trim();
      if (!spec) return;

      const row = normalizeChangeRow(rawRow); // 归一化到固定字段
      const cur: any = costConfig[spec] || {};
      const next: any = { ...cur };

      // 1) 直填的数值字段（全部固定成本字段）
      (['成本单价', '快递费', '包装耗材', '人工成本', '运营成本', '商家承担优惠', '运费险', '退款率'] as const).forEach(k => {
        const raw = row[k];
        if (raw === undefined || raw === null || raw === '') return;
        const v = Number(raw);
        if (Number.isFinite(v)) next[k] = v;
      });

      // 2) 定价：优先用用户给的定价，其次用目标利润率反推
      const hasPrice = row['定价'] !== undefined && row['定价'] !== null && row['定价'] !== '' && Number.isFinite(Number(row['定价']));
      let priceReason = '';
      if (hasPrice) {
        next['定价'] = Number(row['定价']);
      } else {
        const rate = Number(row['目标利润率']);
        if (Number.isFinite(rate) && rate > -99 && rate < 100) {
          const summary = allSummaries.find(s => s['规格'] === spec);
          const fixedCost = (next['成本单价'] || 0) + (next['人工成本'] || 0) + (next['运营成本'] || 0)
            + (next['商家承担优惠'] || 0) + (next['快递费'] || 0) + (next['包装耗材'] || 0) + (next['运费险'] || 0);
          const returnShipping = (next['快递费'] || 0) * ((summary?.发货后退款率 || 0) / 100);
          const denominator = 1 - PLATFORM_RATE - rate / 100;
          if (denominator > 0 && fixedCost > 0) {
            next['定价'] = Math.round(((fixedCost + returnShipping) / denominator) * 100) / 100;
            priceReason = `按目标利润率 ${rate}% 反推定价`;
          }
        }
      }

      // 3) 计算差异
      const fields: ChatChangeField[] = [];
      Object.keys(CHANGE_LABELS).forEach(k => {
        const from = Number(cur[k] || 0);
        const to = Number(next[k] || 0);
        if (to !== from) fields.push({ key: k, label: CHANGE_LABELS[k], from, to });
      });
      if (!fields.length) return;

      const baseReason = String(rawRow?.reason || '').trim();
      out.push({
        spec,
        fields,
        reason: [baseReason, priceReason].filter(Boolean).join('；'),
        selected: true,
        values: next,
      });
    });

    return out;
  };

  // 执行 AI 的查询意图（基于本地真实数据，绝不编造）
  const executeQuery = (q: any): Record<string, unknown> => {
    const type = String(q?.type || '');
    if (type === 'missingCost') {
      const pid = String(q?.productId || '').trim();
      const rows = pid ? allSummaries.filter(s => String(s['商品ID']) === pid) : allSummaries;
      const missing = rows.filter(s => {
        const c: any = costConfig[s['规格']] || {};
        return !(Number(c['成本单价']) > 0);
      });
      return {
        type: 'missingCost',
        productId: pid || '(全部商品)',
        total: rows.length,
        missingCount: missing.length,
        missingSpecs: missing.map(s => s['规格']),
      };
    }
    if (type === 'getSkuCost') {
      const spec = String(q?.spec || '').trim();
      const c: any = costConfig[spec] || {};
      return {
        type: 'getSkuCost',
        spec: spec || '(未指定)',
        成本单价: c['成本单价'] || 0, 快递费: c['快递费'] || 0,
        包装耗材: c['包装耗材'] || 0, 人工成本: c['人工成本'] || 0,
        运营成本: c['运营成本'] || 0, 商家承担优惠: c['商家承担优惠'] || 0,
        运费险: c['运费险'] || 0, 退款率: c['退款率'] || 0, 定价: c['定价'] || 0,
      };
    }
    return { type: 'unknown', message: '无法识别的查询' };
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;

    const history = [...chatMessages];
    setChatMessages([...history, { id: `${Date.now()}-u`, role: 'user', text }]);
    setChatInput('');
    setError('');
    setChatLoading(true);

    try {
      const userContent = `【当前 SKU 与成本配置】\n${JSON.stringify(buildSkuContext())}\n\n【用户指令】\n${text}`;
      const messages = [
        { role: 'system', content: CHAT_SYSTEM_PROMPT },
        ...history.map(m => ({ role: m.role, content: m.role === 'assistant' ? (m.raw || m.text) : m.text })),
        { role: 'user', content: userContent },
      ] as { role: string; content: string }[];
      const result = await callAIChat(messages);

      // 查询意图：本地执行后用真实结果让 AI 生成最终回复
      let reply = String(result?.reply || '已处理');
      let queryMeta: Record<string, unknown> | null = null;
      if (result?.query) {
        queryMeta = executeQuery(result.query);
        const answer = await callAIChat([
          ...messages,
          { role: 'assistant', content: JSON.stringify(result) },
          { role: 'user', content: `【查询结果】\n${JSON.stringify(queryMeta)}\n\n请基于以上真实查询结果，用简短口语化的中文直接回答用户的问题，不要输出 JSON，只输出回答文字。` },
        ]);
        reply = String(answer?.reply || answer?.answer || reply);
      }

      const msg: ChatMessage = { id: `${Date.now()}-a`, role: 'assistant', text: reply, raw: JSON.stringify(result) };
      if (queryMeta) msg.queryMeta = queryMeta;
      setChatMessages(prev => [...prev, msg]);
      setChatChanges(buildChatChanges(result));
    } catch (e) {
      setError(e instanceof Error ? e.message : '对话失败');
    } finally {
      setChatLoading(false);
    }
  };

  // 应用对话中勾选的变更（写入成本配置）
  const applyChatChanges = () => {
    const selected = chatChanges.filter(c => c.selected);
    if (!selected.length) return;

    const config = { ...costConfig } as any;
    const summaries = [...allSummaries] as any[];

    selected.forEach(c => {
      const next: any = { ...(config[c.spec] || {}), ...c.values };
      if (!next['成本单价']) next['成本单价'] = 0;
      // 开关随数值同步，保证写入后成本表按预期生效
      next['启用快递费'] = (next['快递费'] || 0) > 0;
      next['启用包装耗材'] = (next['包装耗材'] || 0) > 0;
      next['启用运费险'] = (next['运费险'] || 0) > 0;
      next['启用退款率'] = (next['退款率'] || 0) > 0;
      config[c.spec] = next;
      ensureSummary(summaries, c.spec);
    });

    onApply({ config, summaries, bundles: [] });
    setChatChanges(prev => prev.filter(c => !c.selected));
    setMessage(`已应用 ${selected.length} 条成本变更`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
      <div className="w-full max-w-5xl max-h-[92vh] bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
        <header className="p-4 border-b border-slate-300 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Sparkles className="text-purple-600" />
            <div>
              <h3 className="text-slate-900 font-bold">一键 AI SKU 工作台</h3>
              <p className="text-[13px] text-slate-500">对话式配置成本与查询，改成本先预览再应用</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowSettings(true)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg" title="模型设置">
              <Settings className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>
        <main className="p-5 overflow-y-auto space-y-4 flex-1">
          <div className="space-y-3">
              {chatMessages.length === 0 && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-[13px] text-slate-500 space-y-1">
                  <div className="text-slate-700 font-medium">用对话方式直接配置成本或查询，例如：</div>
                  <div>· 1 件装成本 5 元，运费 3 元，包装 1 元，人工 2 元</div>
                  <div>· 3 件装的进货价改成 13 元，卖 39.9</div>
                  <div>· 全部规格运费统一 4 元，目标利润率 30%</div>
                  <div>· 宝贝id 123456 还有几个规格没填成本？</div>
                  <div>· 看看有哪些规格没填成本</div>
                  <div>· 1 件装现在的成本是多少？</div>
                  <div className="text-slate-400 pt-1">支持口语说法（进货价/邮费/包材/买价等）。改成本会先出预览，查状态直接给答案，确认后再一键应用。</div>
                </div>
              )}
              {chatMessages.map(m => (
                <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-lg text-[13px] whitespace-pre-wrap break-words ${m.role === 'user' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-800 border border-slate-200'}`}>
                    {m.text}
                    {m.queryMeta && (
                      <div className="mt-2 pt-2 border-t border-slate-200 bg-white/60 rounded-md px-2 py-1.5 text-[12px] text-slate-600 space-y-0.5">
                        {m.queryMeta.type === 'missingCost' && (
                          <>
                            <div>📊 查询「{String(m.queryMeta.productId)}」：共 <strong>{String(m.queryMeta.total)}</strong> 个规格，未填成本 <strong className="text-amber-600">{String(m.queryMeta.missingCount)}</strong> 个</div>
                            {Array.isArray(m.queryMeta.missingSpecs) && (m.queryMeta.missingSpecs as string[]).length > 0 && (
                              <div>缺成本规格：{(m.queryMeta.missingSpecs as string[]).join('、')}</div>
                            )}
                          </>
                        )}
                        {m.queryMeta.type === 'getSkuCost' && (
                          <div>📊 已读取规格「{String(m.queryMeta.spec)}」的成本配置</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="text-[13px] text-slate-500 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />AI 正在处理…
                </div>
              )}
              {chatChanges.length > 0 && (
                <div className="border border-amber-200 bg-amber-50 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 text-[13px] font-medium text-amber-700 flex items-center justify-between">
                    <span>识别到 {chatChanges.length} 条成本变更（勾选后点右下角「应用变更」）</span>
                    <button onClick={() => setChatChanges([])} className="text-amber-600 hover:text-amber-800">忽略</button>
                  </div>
                  <table className="w-full text-[13px] bg-white">
                    <thead className="bg-amber-100/60 text-slate-500">
                      <tr>
                        <th className="px-3 py-2">应用</th>
                        <th className="px-3 py-2 text-left">规格</th>
                        <th className="px-3 py-2 text-left">变更</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {chatChanges.map((c, i) => (
                        <tr key={`${c.spec}-${i}`}>
                          <td className="px-3 py-2 text-center">
                            <input type="checkbox" checked={c.selected} onChange={e => setChatChanges(prev => prev.map((x, j) => j === i ? { ...x, selected: e.target.checked } : x))} />
                          </td>
                          <td className="px-3 py-2 text-slate-900 align-top">
                            <div className="max-w-[280px] truncate" title={c.spec}>{c.spec}</div>
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {c.fields.map(f => (
                              <span key={f.key} className="inline-block mr-3">
                                {f.label} {f.from} → <strong className="text-emerald-600">{f.to}</strong>
                              </span>
                            ))}
                            {c.reason && <div className="text-[13px] text-slate-400 mt-0.5">{c.reason}</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-[13px] rounded-lg flex gap-2">
                  <AlertCircle className="w-4 h-4" />{error}
                </div>
              )}
              {message && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-600 text-[13px] rounded-lg flex gap-2">
                  <CheckCircle2 className="w-4 h-4" />{message}
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
        </main>
        <footer className="p-3 border-t border-slate-300">
          <div className="flex items-center gap-2">
              <button onClick={() => { setChatMessages([]); setChatChanges([]); setError(''); setMessage(''); }} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg" title="清空对话">
                <Eraser className="w-4 h-4" />
              </button>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                placeholder="例如：1 件装成本 5 元、运费 3 元；3 件装进货价 13 卖 39.9；全部运费设 4 元"
                className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
              <button onClick={applyChatChanges} disabled={!chatChanges.some(c => c.selected)} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg text-[13px] flex items-center gap-2">
                <Check className="w-4 h-4" />应用变更
              </button>
              <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()} className="px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white rounded-lg text-[13px] flex items-center gap-2">
                {chatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}发送
              </button>
            </div>
        </footer>
        {showSettings && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center">
            <div className="bg-white border border-slate-200 rounded-xl p-5 w-full max-w-md space-y-4">
              <div className="flex justify-between">
                <h3 className="text-slate-900 font-bold">OpenAI 兼容模型设置</h3>
                <button onClick={() => setShowSettings(false)}>
                  <X className="text-slate-500 w-5 h-5" />
                </button>
              </div>
              <label className="block text-[13px] text-slate-600">
                API 地址
                <input value={model.apiUrl} onChange={e => setModel({ ...model, apiUrl: e.target.value })} className="mt-1 w-full p-2 bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" placeholder="https://api.openai.com/v1" />
              </label>
              <label className="block text-[13px] text-slate-600">
                API Key
                <input type="password" value={model.apiKey} onChange={e => setModel({ ...model, apiKey: e.target.value })} className="mt-1 w-full p-2 bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
              </label>
              <label className="block text-[13px] text-slate-600">
                模型名称
                <input value={model.model} onChange={e => setModel({ ...model, model: e.target.value })} className="mt-1 w-full p-2 bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
              </label>
              <button onClick={async () => {
                setError('');
                setMessage('');
                try {
                  await callAIChat([
                    { role: 'system', content: '你是一个 AI 助手，请回复简单的确认消息。' },
                    { role: 'user', content: '测试连接，请只回复 JSON：{"ok":true}' },
                  ]);
                  setMessage('模型连接成功');
                } catch (e) {
                  setError(e instanceof Error ? e.message : '连接失败');
                }
              }} className="w-full px-4 py-2 text-[13px] bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg">测试连接</button>
              <button onClick={saveSettings} className="w-full px-4 py-2 text-[13px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">保存设置</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default AIPanel;
