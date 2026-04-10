# NVIDIA Anthropic Proxy 本地化改写方案

## 项目概述

将 Cloudflare Worker 版本的代理改写为本地 Node.js Express 服务，支持本地推理服务（如 Ollama、LM Studio、LocalAI 等），保留完整的 Anthropic API 格式转换功能。

## 现有代码分析

### 核心功能模块

| 模块 | 说明 |
|------|------|
| `/v1/messages` | 聊天消息接口（主要功能） |
| `/v1/models` | 模型列表接口 |
| `/health` | 健康检查 |

### API 格式转换逻辑

1. **请求转换 (Anthropic → OpenAI 格式)**
   - `system` 消息转换
   - 消息内容块转换（text, tool_use, tool_result, image）
   - `tools` 定义转换
   - `tool_choice` 转换
   - 参数映射（temperature, top_p, stop_sequences）

2. **响应转换 (OpenAI → Anthropic 格式)**
   - 非流式：直接转换 message 结构
   - 流式：SSE 格式转换，特别处理 thinking 块

3. **认证**
   - 支持 AUTH_TOKEN 验证（可选）
   - 后端 API Key 配置

---

## 实施步骤

### [x] 1. 创建项目结构

```
nvidia-anthropic-proxy/
├── src/
│   ├── index.js          # 主入口 - Express 服务器
│   ├── config.js         # 配置管理
│   ├── proxy.js          # API 格式转换核心逻辑
│   ├── routes/
│   │   ├── messages.js   # /v1/messages 处理
│   │   ├── models.js     # /v1/models 处理
│   │   └── health.js     # /health 处理
│   └── utils/
│       ├── converter.js  # 消息格式转换
│       └── stream.js     # 流式响应处理
├── config.json           # 配置文件
├── package.json          # 依赖配置
├── .env.example          # 环境变量示例
└── README.md             # 使用文档
```

### [x] 2. 更新 package.json

- 添加 express、cors、dotenv 依赖
- 更新 scripts（dev, start, test）

### [x] 3. 创建配置模块 (config.js)

- 支持从 `config.json` 读取配置
- 支持从环境变量覆盖
- 配置项：
  - `host` - 监听地址（默认 127.0.0.1）
  - `port` - 监听端口（默认 8080）
  - `backendUrl` - 后端推理服务地址（必填）
  - `apiKey` - 后端 API Key（必填）
  - `authToken` - 代理认证 Token（可选）

### [x] 4. 创建 Express 服务器 (src/index.js)

- 中间件：JSON 解析、CORS
- 路由挂载
- 错误处理
- 日志输出

### [x] 5. 迁移 API 格式转换逻辑

将 `index.js` 中的转换逻辑迁移到 `src/proxy.js`：
- `convertMessage()` - 消息转换
- `handleStream()` - 流式响应处理

### [x] 6. 创建配置文件

- `routes/messages.js` - 处理 /v1/messages
- `routes/models.js` - 处理 /v1/models
- `routes/health.js` - 处理 /health

### [x] 7. 集成 proxy.js 到主服务器

- `config.json` - 默认配置
- `.env.example` - 环境变量模板

### [x] 8. 更新文档

- 更新 README.md
- 创建 .gitignore

### [x] 9. 测试验证

- 启动服务测试
- 测试非流式请求
- 测试流式请求
- 测试工具调用

---

## 配置说明

### 配置文件 (config.json)

```json
{
  "host": "127.0.0.1",
  "port": 8080,
  "backendUrl": "http://localhost:11434",
  "apiKey": "",
  "authToken": ""
}
```

### 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `PROXY_HOST` | 监听地址 | 否 |
| `PROXY_PORT` | 监听端口 | 否 |
| `BACKEND_URL` | 后端服务地址 | 是 |
| `BACKEND_API_KEY` | 后端 API Key | 是 |
| `AUTH_TOKEN` | 代理认证 Token | 否 |

### 后端服务支持

| 服务 | 地址示例 | 说明 |
|------|----------|------|
| Ollama | http://localhost:11434 | 本地 Llama 等模型 |
| LM Studio | http://localhost:1234/v1 | 本地模型 |
| LocalAI | http://localhost:8080 | 本地模型 |
| NVIDIA NIM | https://integrate.api.nvidia.com/v1 | 远程服务 |
| OpenAI 兼容 | https://api.openai.com/v1 | 各类兼容服务 |

---

## 启动方式

```bash
# 安装依赖
npm install

# 编辑配置
cp config.json config.json.bak
# 修改 config.json 中的 backendUrl 和 apiKey

# 启动服务
npm run dev   # 开发模式（热重载）
npm start     # 生产模式
```

---

## Claude Code 配置

修改 `~/.claude/settings.json`：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:8080",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "llama3",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "llama3",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "llama3"
  }
}
```