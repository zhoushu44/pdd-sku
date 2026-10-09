/**
 * mcp · MCP 连接配置
 *
 * 点击「mcp」复制 MCP 服务器连接配置，粘贴到任意支持 MCP 的 AI 客户端
 * （Trae / Cherry Studio / Claude Desktop 等），AI 即可远程读写成本配置，
 * 修改结果直接写入服务器，网页端自动同步（无需粘贴回填）。
 */

// 复制文本到剪贴板（优先 Clipboard API，失败回退 execCommand）
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* 回退到 execCommand */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// 本机访问时（localhost/127.0.0.1）用这些主机名判断，需要向服务器查询真实部署地址
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];

/** 按主机名拼出 MCP 地址（自动适配 http/https 与端口） */
function buildMcpUrl(hostname: string): string {
  const { protocol, port } = window.location;
  // 开发环境（vite 代理）与生产环境（nginx 转发）都挂 /mcp 同源路径
  if (protocol === 'https:') {
    return `${protocol}//${hostname}${port ? `:${port}` : ''}/mcp`;
  }
  return `${protocol}//${hostname}:${port || '5173'}/mcp`;
}

let resolvedHostPromise: Promise<string> | null = null;

/** 解析实际要用的部署主机：非本机直接取当前域名；本机则向服务器查询上报的部署 IP */
function resolveHost(): Promise<string> {
  const { hostname } = window.location;
  if (!LOCAL_HOSTS.includes(hostname)) return Promise.resolve(hostname);
  if (!resolvedHostPromise) {
    resolvedHostPromise = fetch('/server-info', { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : null))
      .then(info => (info && typeof info.host === 'string' && info.host ? info.host : hostname))
      .catch(() => hostname);
  }
  return resolvedHostPromise;
}

/** 生成当前部署的 MCP 服务器地址（同步，基于浏览器地址；本机访问时会体现为 localhost） */
export function getMcpUrl(): string {
  return buildMcpUrl(window.location.hostname);
}

/** 生成 MCP 服务器地址（异步）：本机访问时自动替换为服务器上报的部署 IP */
export async function resolveMcpUrl(): Promise<string> {
  return buildMcpUrl(await resolveHost());
}

/**
 * 生成 MCP 连接配置（JSON 格式，多数客户端支持直接粘贴）
 * 例如 Cherry Studio / Trae 的「MCP 服务器 → 从 JSON 导入」
 */
export function buildMcpConfigJson(url: string = getMcpUrl()): string {
  return JSON.stringify(
    {
      mcpServers: {
        'pdd-sku-cost': {
          type: 'streamable-http',
          url,
        },
      },
    },
    null,
    2
  );
}

/** 人类可读的连接说明（复制成功的 toast/说明文案用） */
export function buildMcpHelpText(): string {
  return `MCP 地址：${getMcpUrl()}\n工具：list_skus（查 SKU 与成本）/ get_cost（查成本）/ update_cost（改成本）`;
}
