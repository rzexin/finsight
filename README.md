# FinSight · 小白投资者智能投研驾驶舱

面向个人投资者的金融投资研究与辅助决策系统。以 **AI 研究助手**为核心入口，串联**全市场行情、个股深度分析、智能观察池与信号提醒、策略回测复盘、资讯聚合与 AI 解读**等模块，帮助个人投资者降低信息获取与研究门槛、系统化辅助决策、提升复盘效率。

> 覆盖 **A股 / 港股 / 美股 / 加密货币** 全市场，所有行情、财务、资讯数据均来自**真实公开接口，绝不使用模拟数据**。

## 核心特性

| 模块 | 说明 |
| --- | --- |
| 🤖 AI 研究助手 | 自然语言提问 → 自动多步调研（行情/K线/指标/财务/资讯/回测）→ 流式生成结构化研报，含数据引用与风险提示 |
| 📈 全市场行情看板 | 核心指数、涨跌/活跃榜、加密市值榜，实时刷新 |
| 🔍 个股深度分析 | 多周期 K 线 + 均线/MACD/RSI/KDJ/BOLL 指标、估值财务摘要、相关资讯、AI 一键深研 |
| 👁 智能观察池 + 信号 | 自选盯盘，按需评估异动/突破/放量/金叉死叉/RSI/回撤信号，AI 解读 |
| 🧪 策略回测 + 复盘 | 真实历史数据回测（均线交叉/RSI 反转/通道突破），净值曲线、最大回撤、胜率、夏普，AI 复盘 |
| 📰 资讯 + AI 情绪解读 | 7×24 快讯与主题资讯聚合，AI 情绪与事件速读 |
| 🌌 交互式市场星图 | 首页实时数据驱动的可交互 SVG 星图，节点映射涨跌与资金，点击下钻 |

## 技术栈

- **Next.js 16**（App Router）+ React 19 + TypeScript 5
- **Tailwind CSS v4** —— 浅色科幻（Glass-Tech）主题，Orbitron / Titillium Web 科幻字体
- **Route Handlers** 作为后端：统一代理真实数据接口、调用大模型（密钥仅存于服务端 env）
- **lightweight-charts** 绘制 K 线与净值曲线
- 大模型：**OpenAI 兼容接口**（function-calling 工具编排 + SSE 流式）

## 数据来源（真实 · 免费 · 无需 Key）

- **东方财富**（push2 / push2his / 搜索 / 快讯 / 资讯搜索）：A股/港股/美股 报价、K线、财务、榜单、指数、资讯
- **新浪财经**：行情容灾备份
- **Binance**：加密货币实时行情与 K 线
- **CoinGecko**：加密货币搜索与市值榜

所有外部请求经服务端**域名白名单**封装（防 SSRF）、带超时与重试；接口失败时显示明确错误态，**不以模拟数据填充**。

## 快速开始

1. 安装依赖：

   ```bash
   npm install
   ```

2. 配置大模型（OpenAI 兼容接口）。复制 `.env.example` 为 `.env.local` 并填写：

   ```bash
   cp .env.example .env.local
   ```

   ```env
   # 国内大模型均可（通义千问 / DeepSeek / 智谱 GLM / Kimi 等）
   OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
   OPENAI_API_KEY=sk-xxxxxxxx
   OPENAI_MODEL=qwen-plus
   ```

   > 行情/资讯等数据接口**无需任何 Key**；仅 AI 研究助手相关功能需要配置大模型。

3. 启动开发服务器：

   ```bash
   npm run dev
   ```

   打开 http://localhost:3000

4. 生产构建：

   ```bash
   npm run build && npm start
   ```

## API 一览（Route Handlers）

| 路由 | 说明 |
| --- | --- |
| `GET /api/search?q=` | 标的搜索（A股/港股/美股 + 加密） |
| `GET /api/quote?symbols=CN:600519,US:AAPL,CRYPTO:BTC` | 批量实时行情 |
| `GET /api/kline?market=&code=&period=&indicators=1` | K 线 + 技术指标 |
| `GET /api/financials?market=&code=` | 估值与基本面 |
| `GET /api/news?keyword=` | 资讯 / 7×24 快讯 |
| `GET /api/market/overview` | 指数、榜单、加密概览 |
| `GET /api/indicators?market=&code=` | 技术指标摘要 |
| `GET /api/backtest?market=&code=&strategy=` | 策略回测 |
| `POST /api/signals/evaluate` | 观察池信号评估 |
| `POST /api/assistant` | AI 研究助手（SSE 流式） |

## 免责声明

本项目数据来自公开第三方接口，仅供研究学习与参考，**不构成任何投资建议**。AI 生成内容可能存在偏差，请独立判断。市场有风险，投资需谨慎。
