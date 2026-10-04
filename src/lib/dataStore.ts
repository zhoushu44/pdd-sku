import { OrderData, MarketingDataRow } from '../types';

/**
 * 上传数据统一存取层（销售订单 + 营销推广）
 *
 * 与 configStore 同一套模式：
 * - 读：优先服务器（/api/config/<key>，nginx dav / vite 中间件），失败回退 localStorage
 * - 写：localStorage（离线保底）+ 服务器（跨设备持久化）双写
 * - 服务器读到数据后同步回 localStorage，保证离线可用
 */

const SALES_KEY = 'pddSalesOrders';
const MARKETING_KEY = 'pddMarketingData';
const SALES_API = '/api/config/orders';
const MARKETING_API = '/api/config/marketing';

/** 通用：从服务器或 localStorage 加载 JSON 数组 */
async function loadArrayData<T>(apiUrl: string, storageKey: string): Promise<T[] | null> {
  // 1. 优先服务器
  try {
    const res = await fetch(apiUrl, { method: 'GET' });
    if (res.ok) {
      const data = (await res.json()) as unknown;
      if (Array.isArray(data)) {
        // 同步到 localStorage 作为离线备份
        try { localStorage.setItem(storageKey, JSON.stringify(data)); } catch { /* 超出容量时忽略 */ }
        return data as T[];
      }
    }
  } catch {
    // 网络失败/接口不存在 → 回退本地
  }

  // 2. localStorage 回退
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    try {
      const data = JSON.parse(saved) as unknown;
      if (Array.isArray(data)) return data as T[];
    } catch (e) {
      console.error('解析本地数据失败:', e);
    }
  }
  return null;
}

/** 通用：保存 JSON 数组（localStorage + 服务器双写），返回服务器是否写入成功 */
async function saveArrayData<T>(apiUrl: string, storageKey: string, data: T[]): Promise<boolean> {
  try {
    localStorage.setItem(storageKey, JSON.stringify(data));
  } catch {
    // localStorage 超出容量（大数据集常见）：不阻断，继续写服务器
  }
  try {
    const res = await fetch(apiUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.ok || res.status === 201;
  } catch {
    return false;
  }
}

// ============ 销售订单 ============

export async function loadSalesOrders(): Promise<OrderData[] | null> {
  return loadArrayData<OrderData>(SALES_API, SALES_KEY);
}

export async function saveSalesOrders(orders: OrderData[]): Promise<boolean> {
  return saveArrayData(SALES_API, SALES_KEY, orders);
}

/** 清空销售订单（写入空数组，区别于「从未上传」） */
export async function clearSalesOrders(): Promise<void> {
  await saveArrayData(SALES_API, SALES_KEY, []);
}

/** 清空营销数据（写入空数组，区别于「从未上传」） */
export async function clearMarketingData(): Promise<void> {
  await saveArrayData(MARKETING_API, MARKETING_KEY, []);
}

export async function loadMarketingData(): Promise<MarketingDataRow[] | null> {
  return loadArrayData<MarketingDataRow>(MARKETING_API, MARKETING_KEY);
}

export async function saveMarketingData(rows: MarketingDataRow[]): Promise<boolean> {
  return saveArrayData(MARKETING_API, MARKETING_KEY, rows);
}
