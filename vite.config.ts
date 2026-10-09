import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { traeBadgePlugin } from 'vite-plugin-trae-solo-badge';
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// 开发环境模拟配置持久化 API（生产环境由 nginx dav 模块提供同接口）
// GET /api/config/:key    读取 JSON 配置（404 表示无配置）
// PUT /api/config/:key    写入 JSON 配置
// DELETE /api/config/:key 删除配置
function configStorePlugin(): Plugin {
  const dataDir = path.resolve(__dirname, '.data')
  return {
    name: 'dev-config-store',
    configureServer(server) {
      // 确保数据目录存在
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

      server.middlewares.use('/api/config', (req, res, next) => {
        // 解析 /api/config/<key> 中的 key（去掉 query 和首尾斜杠）
        const key = (req.url || '').split('?')[0].replace(/^\/+|\/+$/g, '')
        if (!key || !/^[\w.-]+$/.test(key)) {
          res.statusCode = 400
          res.end('invalid config key')
          return
        }
        const filePath = path.join(dataDir, `${key}.json`)

        // 简单 CORS
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }

        if (req.method === 'GET') {
          if (!fs.existsSync(filePath)) {
            res.statusCode = 404
            res.end()
            return
          }
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(fs.readFileSync(filePath, 'utf-8'))
          return
        }

        if (req.method === 'PUT') {
          const chunks: Buffer[] = []
          req.on('data', (chunk) => chunks.push(chunk))
          req.on('end', () => {
            try {
              const body = Buffer.concat(chunks).toString('utf-8')
              JSON.parse(body) // 校验必须是合法 JSON
              fs.writeFileSync(filePath, body, 'utf-8')
              res.statusCode = 201
              res.end('{"ok":true}')
            } catch {
              res.statusCode = 400
              res.end('invalid JSON')
            }
          })
          return
        }

        if (req.method === 'DELETE') {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
          res.statusCode = 200
          res.end('{"ok":true}')
          return
        }

        next()
      })
    },
  }
}

// 开发环境自启 MCP 服务器（与 .data 共享数据），并把 /mcp 代理过去
function mcpDevPlugin(): Plugin {
  return {
    name: 'dev-mcp-server',
    configureServer() {
      const child = spawn(process.execPath, ['server/mcp-server.mjs'], {
        cwd: path.resolve(__dirname),
        stdio: 'inherit',
        env: { ...process.env, MCP_PORT: '9100', MCP_DATA_DIR: path.resolve(__dirname, '.data') },
      })
      process.on('exit', () => child.kill())
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  build: {
    sourcemap: 'hidden',
  },
  server: {
    proxy: {
      // 本地开发走同一端口；生产环境由 nginx 转发到 mcp 容器
      '/mcp': {
        target: 'http://127.0.0.1:9100',
        changeOrigin: true,
      },
      // 部署地址上报（网页「mcp」按钮本机访问时读取）
      '/server-info': {
        target: 'http://127.0.0.1:9100',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    configStorePlugin(),
    mcpDevPlugin(),
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    traeBadgePlugin({
      variant: 'dark',
      position: 'bottom-right',
      prodOnly: true,
      clickable: true,
      clickUrl: 'https://www.trae.ai/solo?showJoin=1',
      autoTheme: true,
      autoThemeTarget: '#root'
    }),
    tsconfigPaths()
  ],
})
