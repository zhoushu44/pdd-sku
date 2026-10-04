import React, { useEffect, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, Info, Loader2, Settings, Sparkles, X } from 'lucide-react';
import type { AIApplyPayload, AIModelConfig, BundleSuggestion, DetailedCostConfig, GeneratedAISKU, ProductSummary } from '../types';

const MODEL_KEY = 'openaiCompatibleConfig';
const BUNDLE_KEY = 'aiBundleSuggestions';
const defaultModel: AIModelConfig = { apiUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' };

interface Props { allSummaries: ProductSummary[]; costConfig: DetailedCostConfig; onClose: () => void; onApply: (payload: AIApplyPayload) => void; }

function loadModel(): AIModelConfig { try { const saved = JSON.parse(localStorage.getItem(MODEL_KEY) || '{}'); return { ...defaultModel, ...saved, temperature: undefined as any }; } catch { return defaultModel; } }
function number(value: unknown) { const n = Number(value); return Number.isFinite(n) ? n : 0; }

const AIPanel: React.FC<Props> = ({ allSummaries, costConfig, onClose, onApply }) => {
  const [tab, setTab] = useState<'price' | 'analysis'>('price');
  const [model, setModel] = useState(loadModel);
  const [showSettings, setShowSettings] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [reference, setReference] = useState('');
  const [rows, setRows] = useState<GeneratedAISKU[]>([]);
  const [generatedBundles, setGeneratedBundles] = useState<BundleSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem(BUNDLE_KEY) || '[]'); if (saved.length) setMessage(`已保存 ${saved.length} 个套餐方案`); } catch { /* ignore */ } }, []);

  const saveSettings = () => { localStorage.setItem(MODEL_KEY, JSON.stringify(model)); setShowSettings(false); setMessage('模型配置已保存'); };
  const callAI = async (system: string, user: string) => {
    if (!model.apiKey.trim()) throw new Error('请先点击右上角设置，填写 API Key');
    
    // 统一使用代理（开发和生产环境）
    const endpoint = '/api/ai/chat/completions';
    
    console.log('[AI Request]', {
      endpoint,
      model: model.model.trim(),
      apiUrl: model.apiUrl,
      apiKeyLength: model.apiKey.trim().length,
      systemLength: system.length,
      userLength: user.length
    });
    
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
          messages: [
            { role: 'system', content: system }, 
            { role: 'user', content: user }
          ] 
        }) 
      });
      
      console.log('[AI Response]', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`模型请求失败 (${response.status}): ${errorText || response.statusText}`);
      }
      
      const data = await response.json(); 
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('模型没有返回内容');
      return JSON.parse(content.replace(/^```json\s*|\s*```$/g, ''));
    } catch (error) {
      console.error('[AI Error]', error);
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('无法连接到 AI 服务，请检查：1) API Key 是否正确 2) 网络是否正常 3) 代理是否生效');
      }
      throw error;
    }
  };

  const generate = async (mode: 'price' | 'analysis') => {
    setLoading(true); setError(''); setMessage('');
    try {
      const base = allSummaries.map(s => {
        const item: any = {};
        item['规格'] = s['规格'];
        item['商品名称'] = s['商品名称'];
        item['商品 ID'] = s['商品 ID'];
        item['销量'] = s['销量'];
        item['销售额'] = s['销售额'];
        item['当前配置'] = costConfig[s['规格']] || null;
        return item;
      });
      const context = reference.trim() ? `\n\n同行参考数据：\n${reference}` : '';
      const instruction = mode === 'price'
        ? `根据用户输入的商品描述，识别商品名称、成本、运费、利润率要求，自动推荐合适的数量梯度并生成全部 SKU。输出 JSON：{"skus":[{"spec":"1 件装/3 件装等","name":"杯子","type":"标准款","costPrice":0,"shippingFee":0,"packagingFee":0,"laborCost":0,"price":0,"profitMargin":0,"reason":""}]}`
        : `根据用户输入和同行参考数据，分析并生成优化方案。包括：低价引流款、利润款、规格扩展、套餐组合、库存策略。输出 JSON：{"skus":[{"spec":"","name":"","type":"低价引流","costPrice":0,"shippingFee":0,"packagingFee":0,"laborCost":0,"price":0,"profitMargin":0,"reason":"","comboSpecs":[]}],"bundles":[{"productId":"","productName":"","comboSpecs":[],"singleTotalPrice":0,"bundlePrice":0,"discountRate":0,"estimatedProfitMargin":0,"reason":""}]}`;
      const userPrompt = `商品描述：${textInput}${context}\n\n当前已有 SKU：${JSON.stringify(base)}\n\n${instruction}`;
      const result = await callAI('你是电商 SKU 定价与商品组合专家。必须只返回合法 JSON，所有金额和利润率必须是数字。识别用户输入中的商品名称、成本、运费、利润率要求，自动推荐数量梯度（如 1 件、3 件、6 件、12 件装），并为每个规格生成完整定价。', userPrompt);
      const generated = (result.skus || []).map((r: any, i: number) => {
        const row: any = {};
        row['id'] = `${Date.now()}-${i}`;
        row['规格'] = String(r.spec || '');
        row['商品名称'] = String(r.name || r.spec || '');
        row['类型'] = r.type || '标准款';
        row['成本单价'] = number(r.costPrice);
        row['快递费'] = number(r.shippingFee);
        row['包装耗材'] = number(r.packagingFee);
        row['人工成本'] = number(r.laborCost);
        row['定价'] = number(r.price);
        row['利润率'] = number(r.profitMargin);
        row['建议理由'] = String(r.reason || '');
        row['selected'] = true;
        row['组合规格'] = r.comboSpecs || [];
        return row;
      });
      const resultBundles = (result.bundles || []) as BundleSuggestion[];
      setRows(generated); setGeneratedBundles(resultBundles); if (mode === 'analysis') localStorage.setItem(BUNDLE_KEY, JSON.stringify(resultBundles)); setMessage(`已生成 ${generated.length} 行 SKU 方案${resultBundles.length ? `，${resultBundles.length} 个套餐组合` : ''}，请检查后点击应用`);
    } catch (e) { setError(e instanceof Error ? e.message : '生成失败'); } finally { setLoading(false); }
  };

  const apply = () => {
    const selected = rows.filter(r => r.selected && r['规格']);
    const config = { ...costConfig } as any;
    const summaries = [...allSummaries] as any[];
    selected.forEach(r => {
      const spec = r['规格'];
      if (!config[spec]) config[spec] = { '成本单价': 0 };
      config[spec]['成本单价'] = r['成本单价'];
      config[spec]['快递费'] = r['快递费'];
      config[spec]['包装耗材'] = r['包装耗材'];
      config[spec]['人工成本'] = r['人工成本'];
      config[spec]['定价'] = r['定价'];
      config[spec]['启用快递费'] = r['快递费'] > 0;
      config[spec]['启用包装耗材'] = r['包装耗材'] > 0;
      
      if (!summaries.some((s: any) => s['规格'] === spec)) {
        const newSummary: any = {};
        newSummary['规格'] = spec;
        newSummary['商品 ID'] = '';
        newSummary['商品名称'] = r['商品名称'];
        newSummary['销售额'] = 0;
        newSummary['销量'] = 0;
        newSummary['订单数'] = 0;
        newSummary['平均客单价'] = 0;
        newSummary['营销花费'] = 0;
        newSummary['成本单价'] = r['成本单价'];
        newSummary['总商品成本'] = 0;
        newSummary['人工成本'] = 0;
        newSummary['运营成本'] = 0;
        newSummary['平台技术服务费'] = 0;
        newSummary['商家承担优惠'] = 0;
        newSummary['快递费'] = 0;
        newSummary['包装耗材'] = 0;
        newSummary['运费险'] = 0;
        newSummary['退款率'] = 0;
        newSummary['真实退款率'] = 0;
        newSummary['发货后退款率'] = 0;
        newSummary['订单引流成本'] = 0;
        newSummary['总成本'] = 0;
        newSummary['预估退款损失'] = 0;
        newSummary['净利润'] = 0;
        newSummary['利润率'] = 0;
        newSummary['SKU 净利润'] = 0;
        summaries.push(newSummary);
      }
    });
    onApply({ config, summaries, bundles: generatedBundles });
    setMessage(`已应用 ${selected.length} 个 SKU${generatedBundles.length ? `和 ${generatedBundles.length} 个套餐` : ''}`);
  };

  const placeholder = tab === 'price'
    ? `【AI 价格 - 快速生成 SKU】

示例 1（简单模式）：
杯子，成本 5 元，运费 3 元，包装 1 元，人工 2 元，要求利润率 30%
请帮我生成 1 件装、3 件装、6 件装、12 件装四种规格

示例 2（带目标定价）：
保温杯，成本 15 元，运费 5 元，包装 2 元，人工 3 元
目标定价：1 件装 39.9 元，3 件装 99 元，6 件装 189 元
请生成完整 SKU 方案

示例 3（自动推荐规格）：
收纳盒，成本 8 元，运费 4 元，包装 1.5 元，人工 2.5 元，利润率 35%
请根据商品特性自动推荐合适的数量梯度

💡 提示：AI 会自动识别商品名称、成本、运费、利润率要求，并生成完整定价方案`
    : `【AI 分析 - 深度优化方案】

示例 1（基础分析）：
杯子，成本 5 元，运费 3 元，包装 1 元，人工 2 元，要求利润率 30%
当前有 3 个规格：1 件装售价 9.9 元，3 件装售价 25 元，6 件装售价 45 元
请分析是否需要增加低价引流款和高配利润款，以及套餐组合建议

示例 2（含同行对比）：
保温杯，成本 15 元，运费 5 元，包装 2 元，人工 3 元，目标利润率 35%
当前 SKU: 1 件装 39.9 元，3 件装 99 元
同行参考数据：
  店铺 A: 1 件装 35.9 元，3 件装 89 元，6 件装 168 元
  店铺 B: 1 件装 39.9 元，3 件装 99 元，送杯刷
请生成优化方案

示例 3（套餐优化）：
文具套装，成本 12 元，运费 6 元，包装 3 元，人工 4 元
当前 SKU: 基础款 29.9 元，进阶款 49.9 元，旗舰款 79.9 元
请分析是否需要增加套餐组合，并生成套餐定价建议

💡 提示：AI 会分析利润率、竞品价格、销量分布，生成低价引流款、利润款、套餐组合等优化方案`;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
      <div className="w-full max-w-5xl max-h-[92vh] bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
        <header className="p-4 border-b border-slate-300 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Sparkles className="text-purple-600" />
            <div>
              <h3 className="text-slate-900 font-bold">一键 AI SKU 工作台</h3>
              <p className="text-[13px] text-slate-500">输入商品描述，AI 自动生成完整方案</p>
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
        <nav className="flex border-b border-slate-300">
          <button onClick={() => setTab('price')} className={`px-4 py-2 text-[13px] ${tab === 'price' ? 'text-purple-600 border-b-2 border-purple-400' : 'text-slate-500'}`}>AI 价格</button>
          <button onClick={() => setTab('analysis')} className={`px-4 py-2 text-[13px] ${tab === 'analysis' ? 'text-amber-600 border-b-2 border-amber-400' : 'text-slate-500'}`}>AI 分析</button>
        </nav>
        <main className="p-5 overflow-y-auto space-y-4">
          <div className="space-y-2">
            <label className="text-[13px] text-slate-600 font-medium">商品描述 <span className="text-slate-400">（必填）</span></label>
            <textarea value={textInput} onChange={e => setTextInput(e.target.value)} placeholder={placeholder} rows={6} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-[13px]" />
          </div>
          {tab === 'analysis' && (
            <div className="space-y-2">
              <label className="text-[13px] text-slate-600 font-medium">同行参考数据 <span className="text-slate-400">（可选，可粘贴竞品 SKU 表格）</span></label>
              <textarea value={reference} onChange={e => setReference(e.target.value)} placeholder="【同行参考数据 - 可选】

格式 1（简单列表）：
店铺 A: 1 件装 8.9 元，3 件装 23 元，6 件装 42 元
店铺 B: 1 件装 9.9 元，3 件装 26 元，送杯刷
店铺 C: 1 件装 7.9 元（引流款），3 件装 25 元，12 件装 89 元

格式 2（表格粘贴）：
店铺	1 件装	3 件装	6 件装	备注
A 店	8.9	23	42	包邮
B 店	9.9	26	48	送杯刷
C 店	7.9	25	85	限时特价

💡 提示：同行数据可以帮助 AI 生成更有竞争力的定价方案" rows={4} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-[13px]" />
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="text-[13px] text-slate-500">当前全部 SKU：{allSummaries.length} 个{model.apiKey ? ` · 模型：${model.model}` : ' · 未配置模型'}</div>
            <button onClick={() => generate(tab)} disabled={loading || !textInput.trim()} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white rounded-lg text-[13px]">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}生成全部 SKU
            </button>
          </div>
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
          {rows.length > 0 && (
            <div className="border border-slate-200 rounded-lg overflow-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-slate-100 text-[13px] font-medium text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5">应用</th>
                    <th className="px-3 py-2.5 text-left">SKU</th>
                    <th className="px-3 py-2.5">类型</th>
                    <th className="px-3 py-2.5">成本</th>
                    <th className="px-3 py-2.5">运费</th>
                    <th className="px-3 py-2.5">人工</th>
                    <th className="px-3 py-2.5">定价</th>
                    <th className="px-3 py-2.5">利润率</th>
                    <th className="px-3 py-2.5 text-left">理由</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r, i) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="p-2 text-center">
                        <input type="checkbox" checked={r.selected} onChange={e => setRows(prev => prev.map((x, j) => j === i ? { ...x, selected: e.target.checked } : x))} />
                      </td>
                      <td className="p-2 min-w-48">
                        <input value={r['规格']} onChange={e => setRows(prev => prev.map((x, j) => j === i ? { ...x, '规格': e.target.value } : x))} className="w-full bg-white border border-slate-300 rounded-md px-2 py-1 text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                      </td>
                      <td className="p-2 text-center text-amber-600">{r['类型']}</td>
                      {(['成本单价', '快递费', '人工成本', '定价', '利润率'] as const).map(k => (
                        <td key={k} className="p-2">
                          <input type="number" value={r[k as keyof GeneratedAISKU] as number} onChange={e => setRows(prev => prev.map((x, j) => j === i ? { ...x, [k]: number(e.target.value) } : x))} className="w-20 bg-white border border-slate-300 rounded-md px-1 py-1 text-right text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                        </td>
                      ))}
                      <td className="p-2 text-slate-500 min-w-64">{r['建议理由']}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
        <footer className="p-3 border-t border-slate-300 flex justify-between items-center">
          <span className="text-[13px] text-slate-400">
            <Info className="inline w-3 h-3 mr-1" />请检查生成结果后再应用
          </span>
          <button onClick={apply} disabled={!rows.some(r => r.selected)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg text-[13px] flex items-center gap-2">
            <Check className="w-4 h-4" />应用选中 SKU 并保存
          </button>
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
                  await callAI('你是一个 AI 助手，请回复简单的确认消息。', '测试连接，请只回复 JSON：{"ok":true}');
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
