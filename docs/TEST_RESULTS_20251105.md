# 测试报告（2025-11-05）

- 测试时间：2025-11-05 07:52–08:00 CST
- 测试环境：本地 `http://localhost:3100`（PID 96967）
- DeepSeek 模型：`deepseek-chat`
- 测试日志：`logs/test-session-20251105-075256.log`
- 服务器日志摘录：`logs/server-live-latest.log`

## 接口验证

| 序号 | 接口 | 请求要点 | 预期结果 | 实际结果 |
| --- | --- | --- | --- | --- |
| 1 | `GET /api/health` | 检查服务 & Key | 返回 `status: ok`，标记 API Key 已注入 | ✅ |
| 2 | `GET /api/config` | 读取默认配置 | 返回语言、模型、领域、默认 Prompt | ✅ |
| 3 | `GET /api/glossaries` | 获取术语库列表 | 返回营销/IT 4 个术语库 | ✅ |
| 4 | `GET /api/glossaries/mk-zh-ja` | 拉取术语明细 | 返回 10 条中文→日语词条 | ✅ |
| 5 | `POST /api/translate` | 选择 `mk-zh-ja` 术语库翻译 | 返回译文、`glossarySnapshot` 10 条 | ✅ （记录 `7a2b0bc0-...`） |
| 6 | `POST /api/evaluate` | 对记录 `7a2b0bc0-...` 评估 | 返回评分、耗时、建议 | ✅ |
| 7 | `POST /api/annotations` | 对译文术语提交标注 | 返回 201，标注写入 `annotations.json`/历史 | ✅ （标注 `1f9ae64b-...`） |
| 8 | `GET /api/annotations?recordId=...` | 加载刚创建的标注 | 返回列表包含标注 | ✅ |
| 9 | `PUT /api/annotations/:id` | 更新标注状态为 `approved` | 返回最新标注与历史记录 | ✅ |
| 10 | `POST /api/annotations`（缺失 recordId） | 验证参数校验 | 返回 400 `recordId is required` | ✅ |
| 11 | `GET /api/history/export?format=json` | 导出历史（采样前二十行） | 成功返回 JSON | ✅ |
| 12 | `POST /api/tts` | 朗读译文（voice=zh-CN-xiaoyi） | 返回音频 URL；无凭证时使用 Mock 音频 | ✅ |
| 13 | `POST /api/webpage/fetch` | `url=https://example.com` | 抓取页面并返回 3 个段落片段 | ✅ |

## 前端验证要点
- 翻译后译文中命中术语（如「ブランドトーン」）带底色，并显示 tooltip「原文：品牌调性」。
- 标注侧栏显示总数/待审核；填写问题类型、严重级别、描述、建议译法后提交成功，列表即时刷新。
- 点击译文高亮词，标注表单自动填充“术语：xxx”并聚焦描述输入框。

## 日志核对
`logs/server-live-latest.log` 包含测试期间的翻译、评估和标注接口调用记录；无错误级别日志。

## 结论
全部关键接口与前端功能按预期工作。当前仍需后续迭代的优化项已记录于 `docs/STATUS_REPORT.md`。
