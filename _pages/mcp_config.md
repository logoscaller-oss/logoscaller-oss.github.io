---
layout: page
title: MCP 配置
include_in_header: true
permalink: /mcp-config/
---

# SparkPool MCP Server 配置指南

SparkPool 提供官方 MCP (Model Context Protocol) Server，允许您的 AI Agent（如 **Cursor**、**Windsurf**、**Claude Desktop** 等）直接与 SparkPool 交互。您可以让 AI 直接发布 Idea、吐槽，或查询您的数据，实现真正的“无感记录”。

<div align="center">
  <img src="https://img.shields.io/badge/MCP-Enabled-blue?style=for-the-badge&logo=python" alt="MCP Enabled">
  <br>
</div>

---

## 1. 获取 API Token

在使用 MCP Server 之前，您需要获取您的专属 API Token。

1. 打开 **SparkPool App**。
2. 进入 **个人中心 (Profile)** 页面。
3. 点击 **MCP 设置 (MCP Settings)**。
4. 点击 **生成 Token** 按钮，并复制生成的 Token。

> [!IMPORTANT]
> 请妥善保管您的 Token，不要泄露给他人。如果您重新生成 Token，旧的 Token 将立即失效，您需要更新所有客户端的配置。

---

## 2. 安装与配置

SparkPool MCP Server 支持通过 `uvx` 直接运行（推荐），或通过 `pip` 安装。

### 核心配置参数

在配置任何客户端时，您都需要以下 JSON 配置：

```json
{
  "mcpServers": {
    "sparkpool_mcp": {
      "command": "uvx",
      "args": [
        "sparkpool-mcp"
      ],
      "env": {
        "SPARKPOOL_API_TOKEN": "<您的_API_TOKEN>",
        "SPARKPOOL_API_URL": "https://www.sparkpool.com.cn"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

请将 `<您的_API_TOKEN>` 替换为您在 App 中获取的真实 Token。

---

## 3. 客户端配置指南

### 🤖 Cursor / Windsurf

1. 打开 Cursor / Windsurf 设置。
2.这是定位到 **Features** > **MCP**。
3. 点击 **Add New MCP Server**。
4. 填写如下信息：
   - **Name**: `sparkpool_mcp`
   - **Type**: `stdio`
   - **Command**: `uvx` (确保您的系统已安装 `uv`)
   - **Args**: `sparkpool-mcp`
   - **Environment Variables**:
     - `SPARKPOOL_API_TOKEN`: `您的Token`
     - `SPARKPOOL_API_URL`: `https://www.sparkpool.com.cn`

### 🖥️ Claude Desktop (macOS)

1. 打开配置文件：
   ```bash
   code ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```
2. 将上述 JSON 配置添加到 `mcpServers` 节点中。
3. 重启 Claude Desktop。

---

## 4. 功能演示

配置成功后，您可以直接对 AI 说：

- **发布想法**：
  > “我有个新点子，关于通过 AI 自动整理相册的，帮我记录到 SparkPool。”
  
- **发布吐槽**：
  > “我要吐槽一下今天的咖啡太难喝了，帮我发个 Roast。”
  
- **查询数据**（即将上线）：
  > “帮我总结一下我最近发布的关于 AI 的想法。”

---

## 常见问题

**Q: 为什么连接失败？**
A: 请检查：
1. `uv` 是否已安装？(运行 `uv --version` 检查)
2. Token 是否正确？(尝试在 App 中重新生成)
3. 网络是否正常？

**Q: 是否支持 Windows?**
A: 支持。请确保已安装 Python 和 uv，并将 `uvx` 替换为完整的可执行路径（如果需要）。

---

<br>
*如有任何问题，欢迎在 App 内反馈或联系我们。*
