import { DetailedCostConfig } from '../types';

/**
 * 成本配置统一存取层（聚水潭式云端资料库）
 *
 * - 读：优先服务器（/api/config/cost，由 nginx dav 或 vite 中间件提供），失败回退 localStorage
 * - 写：localStorage（离线保底）+ 服务器（跨设备持久化）双写
 * - 服务器读到数据后同步回 localStorage，保证离线可用
 */

const STORAGE_KEY = 'detailedCostConfig';
const API_URL = '/api/config/cost';

/** 从服务器或本地加载成本配置 */
export async function loadCostConfig(): Promise<DetailedCostConfig | null> {
  // 1. 优先服务器
  try {
    const res = await fetch(API_URL, { method: 'GET' });
    if (res.ok) {
      const config = (await res.json()) as DetailedCostConfig;
      if (config && typeof config === 'object') {
        // 同步到 localStorage 作为离线备份
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        return config;
      }
    }
  } catch {
    // 网络失败/接口不存在 → 回退本地
  }

  // 2. localStorage 回退（兼容旧 key）
  const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('costConfig');
  if (saved) {
    try {
      return JSON.parse(saved) as DetailedCostConfig;
    } catch (e) {
      console.error('解析本地成本配置失败:', e);
    }
  }
  return null;
}

/** 保存成本配置（localStorage + 服务器双写），返回服务器是否写入成功 */
export async function saveCostConfig(config: DetailedCostConfig): Promise<boolean> {
  // localStorage 始终写，保证离线/服务器不可用时仍可用
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  try {
    const res = await fetch(API_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    return res.ok || res.status === 201;
  } catch {
    return false;
  }
}

/** 清空成本配置（本地 + 服务器） */
export async function clearCostConfig(): Promise<void> {
  localStorage.removeItem(STORAGE_KEY);
  try {
    await fetch(API_URL, { method: 'DELETE' });
  } catch {
    // 服务器不可用时忽略（本地已清空）
  }
}
