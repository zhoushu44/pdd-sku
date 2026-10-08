import React, { useMemo, useState } from 'react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip as RTooltip,
  Legend,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  ReferenceLine,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Radar as RadarIcon, TrendingDown, X } from 'lucide-react';
import type { ProductSummary, MarketingDataRow, SkuDetailDimension } from '../types';
import { formatAmount, formatNumber } from '../lib/utils';

interface ProfitFunnelDiagnosisProps {
  /** 当前维度下的汇总：sku 维度=逐SKU，product 维度=按商品ID聚合 */
  summaries: ProductSummary[];
  marketingData?: MarketingDataRow[];
  dimension: SkuDetailDimension;
}

/** 点级利润漏斗因子（sku 维度=每个规格一点；product 维度=每个商品一点） */
interface FunnelItem {
  id: string;
  名称: string;
  商品ID: string;
  规格: string;
  销售额: number;
  订单数: number;
  展现: number;
  点击: number;
  成交笔数: number;
  链路转化率: number;  // %：成交笔数 ÷ 曝光量（CTR×CVR 综合）
  点击率: number;      // %
  转化率: number;      // %：成交笔数 ÷ 点击
  客单价: number;
  退款率: number;      // %
  利润率: number;      // %
  净利润: number;
}

/** 四象限 key：转化效率（X，右=高）× 利润率（Y，上=高） */
type QuadrantKey = 'potential' | 'star' | 'tail' | 'volume';

const QUADRANT_META: Record<
  QuadrantKey,
  { name: string; sub: string; advice: string; color: string; fillOpacity: number }
> = {
  star: {
    name: '明星款',
    sub: '高利润 × 高转化',
    advice: '主推放量：加预算、保库存、抢资源位',
    color: '#10b981',
    fillOpacity: 0.45,
  },
  potential: {
    name: '潜力款',
    sub: '高利润 × 低转化',
    advice: '产品赚钱但流量弱：换主图/素材、提曝光',
    color: '#0ea5e9',
    fillOpacity: 0.45,
  },
  volume: {
    name: '走量款',
    sub: '低利润 × 高转化',
    advice: '流量强但盈利弱：降本/提价、优化关联搭配',
    color: '#f59e0b',
    fillOpacity: 0.45,
  },
  tail: {
    name: '尾部款',
    sub: '低利润 × 低转化',
    advice: '按最短板整改，仍无起色则清退',
    color: '#94a3b8',
    fillOpacity: 0.4,
  },
};

/** 六维雷达维度定义（均值归一化为 100） */
const DIMS = [
  { key: '展现', label: '展现规模' },
  { key: '点击率', label: '点击率' },
  { key: '转化率', label: '转化率' },
  { key: '客单价', label: '客单价' },
  { key: '低退款', label: '低退款' },
  { key: '利润率', label: '利润率' },
] as const;

/** 因子短板推荐动作 */
const ACTION_MAP: Record<string, string> = {
  展现: '展现低 · 提高出价/加词拉曝光',
  点击率: '点击率低 · 换主图/素材',
  转化率: '转化率低 · 优化详情页/价格',
  客单价: '客单价低 · 搭配销售/满减提客单',
  低退款: '退款率高 · 查质量/描述差异',
};

const ProfitFunnelDiagnosis: React.FC<ProfitFunnelDiagnosisProps> = ({ summaries, marketingData, dimension }) => {
  // 点击散点后展开对应点位的六维雷达
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const isSku = dimension === 'sku';

  // 营销指标按商品ID聚合（推广按商品投放，SKU 维度下各 SKU 继承所属商品的曝光/点击/成交）
  const marketingById = useMemo(() => {
    const map = new Map<string, { 曝光: number; 点击: number; 成交: number }>();
    (marketingData || []).forEach(r => {
      const key = r.商品ID || '未指定ID';
      if (!map.has(key)) map.set(key, { 曝光: 0, 点击: 0, 成交: 0 });
      const g = map.get(key)!;
      g.曝光 += r.曝光量 || 0;
      g.点击 += r.点击量 || 0;
      g.成交 += r.成交笔数 || 0;
    });
    return map;
  }, [marketingData]);

  // 点位：sku 维度每个规格一点；product 维度每个商品一点（summaries 已由上层按维度聚合）
  const items = useMemo<FunnelItem[]>(() => {
    return summaries
      .map(s => {
        const 商品ID = s.商品ID || s.商品名称 || s.规格;
        const m = marketingById.get(商品ID) || { 曝光: 0, 点击: 0, 成交: 0 };
        const 客单价 = s.订单数 > 0 ? s.销售额 / s.订单数 : 0;
        return {
          id: isSku ? `${商品ID}|${s.规格}` : 商品ID,
          名称: isSku ? `${s.商品名称} ${s.规格}` : (s.商品名称 || s.规格),
          商品ID,
          规格: s.规格,
          销售额: s.销售额,
          订单数: s.订单数,
          展现: m.曝光,
          点击: m.点击,
          成交笔数: m.成交,
          链路转化率: m.曝光 > 0 ? (m.成交 / m.曝光) * 100 : 0,
          点击率: m.曝光 > 0 ? (m.点击 / m.曝光) * 100 : 0,
          转化率: m.点击 > 0 ? (m.成交 / m.点击) * 100 : 0,
          客单价,
          退款率: s.销售额 > 0 ? (s.退款金额 / s.销售额) * 100 : 0,
          利润率: s.利润率 > 0 || s.利润率 <= 0 ? s.利润率 : (s.销售额 > 0 ? (s.净利润 / s.销售额) * 100 : 0),
          净利润: s.净利润,
        };
      })
      .filter(it => it.销售额 > 0 || it.展现 > 0)
      .sort((a, b) => b.销售额 - a.销售额);
  }, [summaries, marketingById, isSku]);

  // 全店均值（加总后算比率）
  const avg = useMemo(() => {
    if (items.length === 0) return null;
    const 合 = items.reduce(
      (a, it) => {
        a.销售额 += it.销售额; a.订单数 += it.订单数; a.展现 += it.展现; a.点击 += it.点击;
        a.成交笔数 += it.成交笔数; a.退款金额 += (it.退款率 / 100) * it.销售额; a.净利润 += it.净利润;
        return a;
      },
      { 销售额: 0, 订单数: 0, 展现: 0, 点击: 0, 成交笔数: 0, 退款金额: 0, 净利润: 0 }
    );
    return {
      展现: 合.展现 / items.length,
      点击率: 合.展现 > 0 ? (合.点击 / 合.展现) * 100 : 0,
      转化率: 合.点击 > 0 ? (合.成交笔数 / 合.点击) * 100 : 0,
      链路转化率: 合.展现 > 0 ? (合.成交笔数 / 合.展现) * 100 : 0,
      客单价: 合.订单数 > 0 ? 合.销售额 / 合.订单数 : 0,
      退款率: 合.销售额 > 0 ? (合.退款金额 / 合.销售额) * 100 : 0,
      利润率: 合.销售额 > 0 ? (合.净利润 / 合.销售额) * 100 : 0,
      总销售额: 合.销售额,
    };
  }, [items]);

  if (items.length === 0 || !avg) return null;

  const hasMarketing = items.some(it => it.展现 > 0);
  // 横轴：有推广数据用全链路转化率；否则降级用客单价
  const xKey: '链路转化率' | '客单价' = hasMarketing ? '链路转化率' : '客单价';
  const xLabel = hasMarketing ? '全链路转化率' : '客单价（无推广数据）';
  const avgX = xKey === '链路转化率' ? avg.链路转化率 : avg.客单价;

  // 六维相对均值百分比（均值=100）
  const dimScore = (it: FunnelItem): Record<string, number> => ({
    展现: avg.展现 > 0 ? (it.展现 / avg.展现) * 100 : 100,
    点击率: avg.点击率 > 0 ? (it.点击率 / avg.点击率) * 100 : 100,
    转化率: avg.转化率 > 0 ? (it.转化率 / avg.转化率) * 100 : 100,
    客单价: avg.客单价 > 0 ? (it.客单价 / avg.客单价) * 100 : 100,
    低退款: (() => {
      const 本品 = 1 - it.退款率 / 100;
      const 均值 = 1 - avg.退款率 / 100;
      return 均值 > 0 ? (本品 / 均值) * 100 : 100;
    })(),
    利润率: (() => {
      if (avg.利润率 > 0) return it.利润率 > 0 ? (it.利润率 / avg.利润率) * 100 : 0;
      return it.利润率 > 0 ? 150 : 50;
    })(),
  });

  // 象限归属：X（转化效率/客单价）与利润率分别以均值为界（利润率均值≤0 时以 0 为界）
  const quadrantOf = (it: FunnelItem): QuadrantKey => {
    const x高 = avgX > 0 && it[xKey] >= avgX;
    const 利润高 = it.利润率 >= Math.max(avg.利润率, 0);
    if (x高 && 利润高) return 'star';
    if (x高 && !利润高) return 'volume';
    if (!x高 && 利润高) return 'potential';
    return 'tail';
  };

  // 象限分组与散点数据（半径按销售额平方根计算，全店统一尺度 → 面积严格正比于销售额）
  const scatterByQuadrant = useMemo(() => {
    const max销售额 = Math.max(...items.map(it => it.销售额), 0);
    const MAX_R = 34; // 最大气泡半径（px）
    const radiusOf = (销售额: number) =>
      max销售额 > 0 ? Math.sqrt(销售额 / max销售额) * MAX_R : 4;
    const g: Record<QuadrantKey, Array<{ x: number; y: number; z: number; r: number; id: string; payload: FunnelItem }>> = {
      star: [], potential: [], volume: [], tail: [],
    };
    items.forEach(it => {
      const r = radiusOf(it.销售额);
      g[quadrantOf(it)].push({ x: it[xKey], y: it.利润率, z: it.销售额, r, id: it.id, payload: it });
    });
    return g;
  }, [items, avgX, xKey, avg.利润率]);

  const expandedItem = items.find(it => it.id === expandedId) || null;

  // 散点悬停 tooltip：突出显示商品ID
  const renderScatterTooltip = (props: unknown) => {
    const { active, payload } = props as { active?: boolean; payload?: ReadonlyArray<{ payload?: { payload?: FunnelItem } }> };
    if (!active || !payload?.length) return null;
    const it = payload[0]?.payload?.payload;
    if (!it) return null;
    const qk = quadrantOf(it);
    const meta = QUADRANT_META[qk];
    return (
      <div className="bg-white/95 backdrop-blur border border-slate-200 rounded-lg shadow-lg px-3 py-2.5 text-[13px] max-w-[280px]">
        <p className="font-semibold text-slate-900 mb-1">{it.名称}</p>
        <p className="font-mono text-slate-500 mb-1.5">商品ID: {it.商品ID}</p>
        <div className="space-y-0.5 text-slate-600">
          <p>销售额 <span className="font-mono font-semibold text-slate-900">{formatAmount(it.销售额)}</span></p>
          <p>净利润 <span className={`font-mono font-semibold ${it.净利润 >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{it.净利润 >= 0 ? '+' : ''}{formatAmount(it.净利润)}</span></p>
          <p>{xLabel} <span className="font-mono font-semibold text-slate-900">{xKey === '客单价' ? formatAmount(it.客单价) : `${it.链路转化率.toFixed(2)}%`}</span><span className="text-slate-400">（均 {xKey === '客单价' ? formatAmount(avg.客单价) : `${avg.链路转化率.toFixed(2)}%`}）</span></p>
          <p>利润率 <span className={`font-mono font-semibold ${it.利润率 >= avg.利润率 ? 'text-emerald-600' : 'text-red-600'}`}>{it.利润率.toFixed(1)}%</span><span className="text-slate-400">（均 {avg.利润率.toFixed(1)}%）</span></p>
        </div>
        <p className="mt-1.5">
          <span className="inline-block px-1.5 py-0.5 rounded font-medium" style={{ color: meta.color, backgroundColor: `${meta.color}1a` }}>{meta.name}</span>
          <span className="text-slate-400"> {meta.advice}</span>
        </p>
        <p className="text-slate-400 mt-1">点击查看六维雷达 →</p>
      </div>
    );
  };

  // 点击散点 → 展开六维雷达
  const handlePointClick = (data: unknown) => {
    const d = data as { payload?: { payload?: { id?: string }; id?: string } } | null;
    const id = d?.payload?.payload?.id ?? d?.payload?.id;
    if (!id) return;
    setExpandedId(prev => (prev === id ? null : id));
  };

  // 六维雷达与因子明细
  const renderDetail = (it: FunnelItem) => {
    const scores = dimScore(it);
    const fiveDims = ['展现', '点击率', '转化率', '客单价', '低退款'] as const;
    let weakest: (typeof fiveDims)[number] = fiveDims[0];
    fiveDims.forEach(d => {
      if (scores[d] < scores[weakest]) weakest = d;
    });
    const 达标 = scores[weakest] >= 80;

    return (
      <div className="border border-indigo-200 bg-indigo-50/40 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <p className="text-base font-semibold text-slate-900">{it.名称}</p>
            <p className="text-[13px] font-mono text-slate-500">商品ID: {it.商品ID} · {formatAmount(it.销售额)} · 净利润 {it.净利润 >= 0 ? '+' : ''}{formatAmount(it.净利润)}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium border ${
                达标 ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-red-600 bg-red-50 border-red-200'
              }`}
            >
              {!达标 && <TrendingDown className="w-3 h-3" />}
              {达标 ? '五因子均衡' : ACTION_MAP[weakest]}
            </span>
            <button
              onClick={() => setExpandedId(null)}
              className="p-1 rounded hover:bg-white/80 text-slate-400 hover:text-slate-600 transition-colors"
              title="收起"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <p className="text-[13px] font-medium text-slate-600 mb-2">六维雷达（均值=100，低于 80 即短板）</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={DIMS.map(d => ({ dim: d.label, 本品: Math.round(scores[d.key]), 均值: 100 }))}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="dim" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <PolarRadiusAxis domain={[0, 'auto']} tick={{ fontSize: 10, fill: '#94a3b8' }} angle={90} />
                  <Radar name="本品" dataKey="本品" stroke="#6366f1" fill="#6366f1" fillOpacity={0.35} />
                  <Radar name="全店均值" dataKey="均值" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.08} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <RTooltip
                    formatter={(v: number | string) => [`${v} 分`, undefined as unknown as string]}
                    contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#e2e8f0' }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[13px] font-medium text-slate-600 mb-1">因子明细（vs 全店均值）</p>
            {DIMS.map(d => {
              const s = scores[d.key];
              return (
                <div key={d.key} className="flex items-center justify-between text-[13px] px-3 py-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-slate-600">{d.label}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-slate-400 font-mono">
                      {d.key === '展现' && `${formatNumber(it.展现)}（均${formatNumber(Math.round(avg.展现))}）`}
                      {d.key === '点击率' && `${it.点击率.toFixed(2)}%（均${avg.点击率.toFixed(2)}%）`}
                      {d.key === '转化率' && `${it.转化率.toFixed(2)}%（均${avg.转化率.toFixed(2)}%）`}
                      {d.key === '客单价' && `${formatAmount(it.客单价)}（均${formatAmount(avg.客单价)}）`}
                      {d.key === '低退款' && `退款率 ${it.退款率.toFixed(1)}%（均${avg.退款率.toFixed(1)}%）`}
                      {d.key === '利润率' && `${it.利润率.toFixed(1)}%（均${avg.利润率.toFixed(1)}%）`}
                    </span>
                    <span className={`font-mono font-medium ${s < 80 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {s.toFixed(0)}分
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const 点数总计 = items.length;

  return (
    <div className="bg-white rounded-xl p-6 border border-slate-200">
      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <RadarIcon className="w-5 h-5 text-indigo-600" />
        <h3 className="text-base font-semibold text-slate-900">利润漏斗诊断</h3>
        <span className="text-[13px] text-slate-500">
          （利润 = 展现×点击率×转化率×客单价×(1-退款率) - 成本 - 推广）
        </span>
      </div>
      <p className="text-[13px] text-slate-400 mb-4">
        {isSku
          ? `SKU 维度：每个规格一个点（共 ${点数总计} 个）；点的展现/点击/转化继承所属商品（推广按商品投放）；悬停看商品ID，点击点展开六维雷达。`
          : `单品维度：每个商品一个点（共 ${点数总计} 个）；悬停看商品ID，点击点展开六维雷达。`}
        {' '}气泡大小 = 销售额。
        {!hasMarketing && ' 未检测到推广数据：横轴暂用客单价。'}
      </p>

      {/* 四象散点图 */}
      <div className="relative rounded-xl border border-slate-200 bg-slate-50/50 p-2">
        {/* 四角象限标签 */}
        <div className="pointer-events-none absolute inset-0 z-10">
          <span className="absolute top-3 left-4 text-[13px] font-semibold px-2 py-0.5 rounded" style={{ color: QUADRANT_META.potential.color, backgroundColor: `${QUADRANT_META.potential.color}14` }}>
            {QUADRANT_META.potential.name} · {QUADRANT_META.potential.sub}
          </span>
          <span className="absolute top-3 right-4 text-[13px] font-semibold px-2 py-0.5 rounded" style={{ color: QUADRANT_META.star.color, backgroundColor: `${QUADRANT_META.star.color}14` }}>
            {QUADRANT_META.star.name} · {QUADRANT_META.star.sub}
          </span>
          <span className="absolute bottom-3 left-4 text-[13px] font-semibold px-2 py-0.5 rounded" style={{ color: QUADRANT_META.tail.color, backgroundColor: `${QUADRANT_META.tail.color}14` }}>
            {QUADRANT_META.tail.name} · {QUADRANT_META.tail.sub}
          </span>
          <span className="absolute bottom-3 right-4 text-[13px] font-semibold px-2 py-0.5 rounded" style={{ color: QUADRANT_META.volume.color, backgroundColor: `${QUADRANT_META.volume.color}14` }}>
            {QUADRANT_META.volume.name} · {QUADRANT_META.volume.sub}
          </span>
        </div>
        <div className="h-[420px] mt-6">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 30, right: 30, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                type="number"
                dataKey="x"
                name={xLabel}
                domain={[0, (max: number) => (max > 0 ? max * 1.15 : 1)]}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={(v: number) => (xKey === '客单价' ? `¥${Math.round(v)}` : `${v.toFixed(2)}%`)}
                label={{ value: `${xLabel}（分界线=全店均 ${xKey === '客单价' ? formatAmount(avg.客单价) : `${avg.链路转化率.toFixed(2)}%`}，右=高）`, position: 'insideBottom', offset: -2, fontSize: 11, fill: '#94a3b8' }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="利润率"
                domain={[(min: number) => (min > 0 ? 0 : min * 1.15), (max: number) => (max > 0 ? max * 1.15 : 1)]}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                label={{ value: '利润率（上=高）', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#94a3b8' }}
              />
              <ZAxis type="number" dataKey="z" range={[60, 1000]} name="销售额" />
              <Tooltip content={renderScatterTooltip} cursor={{ strokeDasharray: '3 3', stroke: '#cbd5e1' }} />
              {/* 均值分界线：横轴均值 + 利润率均值（≤0 时用 0） */}
              <ReferenceLine x={avgX} stroke="#6366f1" strokeDasharray="6 4" label={{ value: '均值', fontSize: 10, fill: '#6366f1', position: 'top' }} />
              <ReferenceLine y={Math.max(avg.利润率, 0)} stroke="#6366f1" strokeDasharray="6 4" label={{ value: '利润率均值', fontSize: 10, fill: '#6366f1', position: 'right' }} />
              {(['star', 'potential', 'volume', 'tail'] as QuadrantKey[]).map(qk => {
                const meta = QUADRANT_META[qk];
                const data = scatterByQuadrant[qk];
                if (data.length === 0) return null;
                return (
                  <Scatter
                    key={qk}
                    name={meta.name}
                    data={data}
                    fill={meta.color}
                    fillOpacity={meta.fillOpacity}
                    stroke={meta.color}
                    // Recharts 无原生固定半径：用自定义 shape 按数据内 r 字段画圆，面积∝销售额
                    shape={(props: { cx?: number; cy?: number; r?: number; fill?: string; stroke?: string; fillOpacity?: number }) => {
                      const { cx, cy, r, fill, stroke, fillOpacity } = props;
                      if (cx == null || cy == null) return null;
                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={r || 4}
                          fill={fill}
                          stroke={stroke}
                          fillOpacity={fillOpacity}
                          strokeWidth={1.5}
                        />
                      );
                    }}
                    onClick={handlePointClick}
                    cursor="pointer"
                  />
                );
              })}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 象限图例与建议 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
        {(['star', 'potential', 'volume', 'tail'] as QuadrantKey[]).map(qk => {
          const meta = QUADRANT_META[qk];
          const list = scatterByQuadrant[qk];
          const 销售额合计 = list.reduce((a, d) => a + (d.payload?.销售额 || 0), 0);
          const 占比 = avg.总销售额 > 0 ? (销售额合计 / avg.总销售额) * 100 : 0;
          return (
            <div key={qk} className="rounded-lg border border-slate-200 px-3 py-2">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: meta.color }}>
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: meta.color }} />
                {meta.name}
                <span className="font-normal text-slate-500">{list.length} 个</span>
              </p>
              <p className="text-[13px] text-slate-500 mt-0.5">
                销售额占比 <span className="font-mono font-semibold text-slate-700">{占比.toFixed(1)}%</span>
              </p>
              <p className="text-[13px] text-slate-400 mt-0.5">{meta.advice}</p>
            </div>
          );
        })}
      </div>

      {/* 点击散点展开：六维雷达 */}
      {expandedItem && <div className="mt-4">{renderDetail(expandedItem)}</div>}
    </div>
  );
};

export default ProfitFunnelDiagnosis;
