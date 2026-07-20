# Frontend AGENTS.md

## 项目概览

- 本目录是 AI 安服平台验证模型的 React SPA，覆盖总览、资产、任务、漏洞、报告和 AI 渗透工作台。
- 本期优先跑通“录入目标→预查→创建任务→执行监控→结果回查”黄金路径，不按商用版本扩展。
- 浏览器只调用平台 REST/WebSocket；禁止直连小易、保存引擎凭据或在前端聚合后端业务状态。

## 构建与测试命令

- `npm install`：安装锁文件声明的依赖。
- `npm run dev`：启动 Vite 开发服务器。
- `npm run build`：执行 TypeScript 检查并生成生产构建。
- `npm run lint`：运行 ESLint；提交前必须通过。
- `npm run test`：运行 Vitest 单元测试。
- `npm run test:e2e`：运行 Playwright 黄金路径测试。

## 代码风格指南

- 使用 TypeScript strict、ESLint 和 Prettier；2 空格缩进，禁止 `any`、未使用代码和无理由断言。
- 组件和类型使用 PascalCase，函数/变量使用 camelCase，自定义 Hook 以 `use` 开头。
- 优先复用 Ant Design、CSS Variables 和现有组件；保持组件小而直接，不为假设需求抽象。
- 服务端状态使用 TanStack Query，表单使用 React Hook Form + Zod；默认不用 Axios、Zustand 或重复请求封装。

## 测试、安全与协作

- 新增分支逻辑需有最小 Vitest；核心流程变更需更新 Playwright；`build`、`lint`、`test` 必须通过。
- 所有 API 数据均不可信并在边界校验；禁止提交密钥、记录 Token、持久化敏感白盒信息或绕过平台鉴权。
- Commit 使用 Conventional Commits，如 `feat(web): add task progress view`，一次提交只处理一个清晰目的。
- PR 必须说明范围、验证命令、界面截图和已知限制；不得混入无关重构或自行修改平台 API 契约。
