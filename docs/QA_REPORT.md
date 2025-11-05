# 后端接口调试记录（DeepSeek 实网联调）

- **调试时间**：2025-11-04 00:15–00:21（GMT+08）
- **环境变量**：`DEEPSEEK_API_KEY=sk-597ce1d1c7944a7f8673bf17e6e966ac`、`PORT=3100`
- **服务日志**：`logs/server-test.log`（包含 HTTP 访问、翻译/评估成功与错误记录）
- **手工验证记录**：`logs/manual-test.log`（按时间顺序追踪调用与响应）
- **导出样例**：`exports/history-export.json`

## 调用摘要
| 序号 | 接口 | 请求体关键字段 | 结果 | 备注 |
| --- | --- | --- | --- | --- |
| 1 | `GET /api/health` | - | ✅ 200 | 确认 DeepSeek API Key 已注入 |
| 2 | `POST /api/translate` | `model=deepseek-chat`<br>`sourceText="Hello..."` | ✅ 200 | 译文耗时 1.10s，Token 109 |
| 3 | `POST /api/evaluate` | `recordId=1123cdc3-...` | ✅ 200 | 深度评估耗时 4.64s，四项评分均 5 |
| 4 | `POST /api/translate` | `sourceText="We are preparing..."` | ✅ 200 | 译文耗时 1.60s，Token 114 |
| 5 | `POST /api/evaluate` | `recordId=c4392dbf-...` | ✅ 200 | 评估耗时 4.62s，建议 `accept` |
| 6 | `GET /api/history/export?format=json` | - | ✅ 200 | 导出落盘 `exports/history-export.json` |
| 7 | `POST /api/translate` | `glossaryId=mk-zh-ja`、附加自定义术语 | ✅ 200 | 术语库10条+自定义术语叠加；详见 `logs/server-test.log` 新增段 |
| 8 | `POST /api/evaluate` | 上述记录 `recordId=671461e2-...` | ✅ 200 | 评估耗时 13.7s，评分聚焦术语一致性 |
| 9 | `POST /api/annotations` | `recordId=...`、术语问题标注 | ✅ 201 | 返回标注详情并更新历史记录 `annotations` 字段 |
| 10 | `GET /api/annotations?recordId=...` | - | ✅ 200 | 核查最新标注列表，供前端加载 |
| 11 | `POST /api/tts` | `text="..." voiceId=zh-CN-xiaoyi` | ✅ 200 | 返回音频 URL（无凭证走 Mock），前端 `<audio>` 可播放 |
| 12 | `POST /api/webpage/fetch` | `url=https://example.com` | ✅ 200 | 抓取网页标题与正文片段，缓存命中时快速返回 |

> 首次尝试使用 `model=deepseek-translate` 触发 400 `Model Not Exist`，已在日志中保留，用于提醒模型名称需与 DeepSeek 控制台保持一致。

### 错误分析与修复
- **日志定位**：`logs/app.log` / `logs/server-test.log` 记录 `translation.error`，HTTP 500，DeepSeek 返回 `Model Not Exist`。
- **根因**：配置默认模型列表包含已下线的 `deepseek-translate`；前端下拉亦带出该选项。
- **修复**：
  1. 更新 `src/server/config.js` 模型枚举为 `deepseek-chat` / `deepseek-coder` / `deepseek-reasoner`；
  2. 后端默认回退改为 `deepseek-chat`；
  3. 重新启动服务并执行翻译 & 评估验证（见 16:43–16:44 日志段）。
- **复测结果**：最新一轮 `translation.success` / `evaluation.success` 均为 200，无新的 error 记录。

## 关键日志片段
- `logs/server-test.log` 中记录了每次 HTTP 访问的状态码、耗时以及翻译/评估元数据，例如：
  - `translation.success`：`durationMs: 1600`，`tokenUsage.total_tokens: 114`
  - `evaluation.success`：`durationMs: 4618`，`recommendation: accept`
- `logs/manual-test.log` 包含完整的 JSON 响应，可直接对比原文与译文、分数与建议。
- 附注：文件顶部的空条目对应初始 Express 通配符路由错误，已在日志注明，后续调用全部成功。

## 建议
1. 正式环境建议将 `DEEPSEEK_API_KEY` 通过密钥管理服务注入，并关闭 winston 控制台输出，仅保留文件/集中日志。
2. 若需要批量导出，可复用 `/api/history/export` 接口，结合 `format=csv` 与新增的历史筛选。
