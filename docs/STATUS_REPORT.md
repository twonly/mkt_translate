# 项目状态报告（标注 & 术语增强）

## 功能完成情况
- 译文术语高亮：命中术语库的词语底色显示，鼠标悬浮展示原文术语与来源。
- 标注侧栏：提供问题定位、类型、严重级别、描述、建议译法等字段；新建标注后默认进入“待审核”，即时写入 `data/annotations.json` 并同步历史记录。
- 标注列表：支持状态筛选、状态下拉更新（草稿/待审核/已采纳/已驳回），统计总数与待处理条目。
- 译文交互：点击高亮术语或框选句段可自动带入标注表单“定位句段”。
- API：`GET /api/annotations`、`POST /api/annotations`、`PUT /api/annotations/:id`，用于前端加载与提交标注。
- 术语预览说明：提示高亮含义与术语叠加策略。

## 关键文件
- `public/app.js`：术语高亮、标注面板集成及前端交互。
- `public/components/AnnotationPanel.js`：标注侧栏组件。
- `src/server/index.js`：新增标注 API 路由。
- `src/server/annotationStore.js`：标注存储逻辑。
- `PRD.md`、`docs/TEST_PLAN.md`、`docs/QA_REPORT.md`：文档同步更新。

## 测试与验证
- 手动调用 `/api/translate`（含术语库）验证译文高亮与 `glossarySnapshot`。
- 提交 `POST /api/annotations`，确认返回 201 并在 `GET /api/annotations?recordId=` 中可查询。
- 前端页面实测：
  - 鼠标悬浮高亮术语显示 tooltip。
  - 标注表单填写并提交，列表即时更新，计数随之变化。
- 日志记录于 `logs/server-live.log`，包含翻译、标注接口调用记录。

## 待办优化（优先级从高到低）
1. 标注审核面板：添加审核意见输入、批量操作、版本比对提示。
2. 术语库审批流程及版本管理；标注同步术语库闭环。
3. 标注统计看板、导出审校报告、Webhook 通知。
4. 引入用户/权限体系，记录 `createdBy`。
5. 数据存储升级为数据库，支持并发与分页。

## 当前运行
- 服务监听：`http://localhost:3100`（PID 96967）。
- 日志文件：`logs/server-live.log`、`logs/app.log`。
- 如果需停止服务：`kill 96967`。
