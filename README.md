# 穗秋MCP · suqiu-mcp

在 DSH（DeepSeek Harness）里管理多台 MCP 服务器：侧边栏一个页面，填表即新增，点卡片即编辑。

- 🧩 **多连接** —— 同时挂任意多台 MCP 服务器，各自独立启停、各自独立删除
- ✍️ **填表就提交** —— 没有「新建」按钮：表单常驻，保存即新增；点已有连接进编辑
- 🚦 **状态一目了然** —— 绿色「连接正常 · 57」、黄色「连接中…」、红色「未连接」、灰色「已停用」
- 🔌 **连接诊断** —— 保存前先真实握手，立刻看到延迟、服务名和它提供的工具
- 📋 **JSON 导入** —— 粘贴 `mcpServers` 配置，一次导入多条
- 🛡️ **工具风险审核** —— 提示哪些工具会删数据、执行命令、要凭据
- 🔑 **请求头** —— 支持 `Authorization: Bearer …` 之类的 header，按行填
- 🖥️ **两种接法** —— HTTP（streamable-http）或本地命令（stdio）
- 🪶 **不碰你的配置** —— 只读写自己标记的一段受管块（`# >>> suqiu-mcp:begin … end`），
  块外内容逐字节保留

## 安装

```bash
dsh plugin --profile web add suqiu-mcp
```

本地开发时可以直接指向目录：

```bash
dsh plugin --profile web add /path/to/suqiu-mcp
```

装完重启网关（或在 App 里重启引擎），侧边栏会出现「穗秋MCP」。

> 装完不要删除插件目录下的 `node_modules`：它需要 `@deepseek-ai/dsh-typert-protocol`、
> `yaml`、`zod` 三个包；缺了会导致插件停在不加载状态（侧边栏看不到入口）。

## 用法

1. 左栏点「穗秋MCP」
2. 填名称（工具前缀）、连接方式、地址或命令，需要鉴权就填请求头
3. 想先确认能不能连上，点「测试连接」——会真的握手一次，显示延迟和工具清单
4. 点「保存并重连」——列表里会多一条，工具以 `mcp__<名称>__<工具>` 出现在 AI 手里
5. 想再挂一台？直接在下面的表单继续填、继续保存，不会覆盖已有连接
6. 点列表里的某一条 → 表单载入它，改完保存即更新；右侧「删除」连点两次才删

### 导入 JSON

展开「导入 JSON」，粘贴如下格式后点导入：

```json
{
  "mcpServers": {
    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] },
    "remote": { "type": "sse", "url": "https://example.com/mcp" }
  }
}
```

`type` 写成 `sse` 或 `http` 都会按 streamable-http 接入；单条有错不影响其余条目。

### 风险审核

展开「工具风险审核」，选一条连接点审核。按工具名、描述与参数名给出低/中/高/严重四档：

- **严重** —— 会删除数据或执行命令
- **高** —— 会写入数据、涉及资金，或参数里要 token / password
- **中** —— 会发起外部请求、对外发送内容，或参数范围很宽

审核**只做提示，不会拦截调用**。

## 说明

- 名称只能用字母、数字、下划线、短横线，长度 1–32；它会成为工具名前缀
- 保存后的连接写在 profile 的 `cordis.patch.yml` 受管块里，由 DSH 的 Loader 热重载
- 连接不上时状态显示「未连接」，重新保存或点「刷新状态」可以再试
- 插件本身不联网：连接诊断由它发起的握手是唯一的外部请求，且只在点「测试连接」或审核时发生

## 文件结构

| 文件 | 作用 |
|---|---|
| `index.js` | Host 半：Typert 远程服务 `suqiuMcp`，管理 profile 补丁里的受管块 |
| `client.js` | Client 半：侧边栏入口与管理界面 |
| `lib/probe.js` | 连接诊断：只用 Node 内置能力实现 MCP 握手，不依赖 SDK |
| `lib/audit.js` | 工具风险审核规则 |
| `lib/import-json.js` | `mcpServers` 格式解析 |
| `cordis.patch.yml` | bundle 挂载声明 |
| `locale/*.json` | 插件市场中显示的名称与简介 |
| `icon.svg` | 侧边栏图标 |

## English

Manage several MCP servers from the DSH sidebar. Fill the always-visible form to add one,
click a row to edit it, toggle each connection independently. Test a connection with a real
handshake before saving, import `mcpServers` JSON, and audit tool risk. Status is colour-coded
(green connected / yellow connecting / red not connected / grey disabled). Tools appear as
`mcp__<name>__<tool>`.

## 版本

当前版本 **0.4.0**。历次变更见 [CHANGELOG.md](CHANGELOG.md)。

## License

MIT
