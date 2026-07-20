# Global AGENTS.md

## 项目概览

- 本仓库是 AI 安服平台全系统验证模型，包含 React 前端、FastAPI 后端、PostgreSQL、部署配置和文档。
- 本期目标是跑通真实的端到端黄金路径，不以商用发布、高并发、高可用或微服务为目标。
- 根规则适用于整个仓库；子目录 `AGENTS.md` 可补充更具体的规则，冲突时以更近的文件为准。

## 构建与测试命令

- `docker compose -f deploy/compose.yaml up --build`：启动完整验证环境。
- `npm --prefix apps/web run build`：检查并构建前端。
- `npm --prefix apps/web run test`：运行前端单元测试。
- `python -m ruff check apps/api`：检查后端代码。
- `python -m pytest apps/api/tests`：运行后端测试。

## 代码风格指南

- 先复用现有代码和平台原生能力；禁止为假设需求增加依赖、抽象层、微服务或通用框架。
- 前后端通过已确认的 API 契约协作；字段、状态或路由变化必须同步更新契约文档和测试。
- 数据库结构变化必须通过 Alembic 迁移，禁止仅手工修改本地数据库。
- 保留用户已有修改；不得重置、覆盖或顺手重构任务范围外的代码。

## 测试、安全与协作

- 非简单逻辑必须有最小可运行测试；合并前相关构建、Lint 和测试必须通过。
- 禁止提交密钥、Token、真实白盒信息或未授权目标；真实扫描必须使用明确授权的测试资产。
- Commit 使用 Conventional Commits，如 `feat(api): add engine task mapping`，一次提交只处理一个目的。
- PR 必须说明范围、验证命令、接口或迁移影响、截图及已知限制，禁止混入无关改动。
- 大数据、生产部署和基础设施扩展均不属于本期，确需增加时先更新确认文档并取得同意。
