# Anthropic API Proxy

[中文文档](README_CN.md)

A local proxy that converts OpenAI-compatible API (Ollama, llama.cpp, LM Studio, LocalAI, NVIDIA NIM, etc.) to Anthropic API format, enabling Claude Code to use local inference servers.

## Features

- Convert OpenAI-compatible API to Anthropic API format
- Support Claude Code seamlessly with full tool-use capability
- Support various local inference servers
- Low-latency local inference

## Supported Backends

| Backend | Default URL | Notes |
|---------|-------------|-------|
| Ollama | http://localhost:11434 | Local Llama, Mistral, etc. |
| llama.cpp | http://localhost:8080 | Via llama-server |
| LM Studio | http://localhost:1234/v1 | Local models |
| LocalAI | http://localhost:8080 | Local models |
| NVIDIA NIM | https://integrate.api.nvidia.com/v1 | Remote GPU |
| OpenAI Compatible | https://api.openai.com/v1 | Any OpenAI-compatible API |

## Quick Start

### 1. Install Dependencies

```bash
cd nvidia-anthropic-proxy
npm install
```

### 2. Configure (Interactive Setup)

```bash
npm run setup
```

This will:
- Guide you through configuration with Chinese prompts
- Create `.env` file automatically
- Start the proxy service

Or manually edit `config.json`:

```json
{
  "host": "127.0.0.1",
  "port": 8080,
  "backendUrl": "http://localhost:8080",
  "apiKey": "",
  "authToken": ""
}
```

Edit `config.json`:

```json
{
  "host": "127.0.0.1",
  "port": 8080,
  "backendUrl": "http://localhost:11434",
  "apiKey": "",
  "authToken": ""
}
```

Or use environment variables (see `.env.example`):

```bash
cp .env.example .env
# Edit .env with your settings
```

### 3. Start Backend (if needed)

**Ollama:**
```bash
ollama serve
ollama pull llama3
```

**llama.cpp:**
```bash
./llama-server -m model.gguf --port 8080
```

**LM Studio:**
- Open LM Studio and start the local server

### 4. Start Proxy

```bash
npm run dev   # Development mode (with auto-reload)
npm start     # Production mode
```

### 5. Configure Claude Code

Edit `~/.claude/settings.json`:

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

### 6. Start Using Claude Code

```bash
claude
```

## Configuration

### config.json

| Option | Default | Description |
|--------|---------|-------------|
| host | 127.0.0.1 | Listen address |
| port | 8080 | Listen port |
| backendUrl | - | Backend server URL (required) |
| apiKey | - | Backend API key |
| authToken | - | Proxy auth token (optional) |

### Environment Variables

| Variable | Description |
|----------|-------------|
| PROXY_HOST | Listen address |
| PROXY_PORT | Listen port |
| BACKEND_URL | Backend server URL |
| BACKEND_API_KEY | Backend API key |
| AUTH_TOKEN | Proxy auth token |

Environment variables override config.json values.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| /v1/messages | POST | Chat messages (main endpoint) |
| /v1/models | GET | List models |
| /health | GET | Health check |
| / | GET | Root endpoint |

## How It Works

```
Claude Code (Anthropic format)
    ↓
This Proxy (Local Express)
    ↓
Format Conversion (Anthropic → OpenAI)
    ↓
Local Inference Server (Ollama/llama.cpp/LM Studio/...)
```

## License

MIT