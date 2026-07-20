# Backend AGENTS.md

## 项目概览

- 本目录是 FastAPI 模块化单体，负责用户、资产、计划、任务、漏洞、报告、数字人接口和关键操作记录。
- PostgreSQL 保存平台业务状态；平台 ID 与小易 `external_task_id` 必须分离。
- 小易提供预查和扫描计算，数字人通过 JWT 向平台创建计划或回传结构化结果。

## 构建与测试命令

- `python -m pip install -e "apps/api[dev]"`：安装后端及开发依赖。
- `python -m uvicorn app.main:app --reload --app-dir apps/api`：启动开发 API。
- `python -m alembic -c apps/api/alembic.ini upgrade head`：执行数据库迁移。
- `python -m ruff check apps/api`：运行静态检查。
- `python -m pytest apps/api/tests`：运行后端测试。

## 代码风格指南

- 使用 Python 3.12、类型标注、Ruff 和清晰命名；禁止裸 `except`、无界重试和无理由 `Any`。
- 按业务领域组织模块；禁止单实现接口、无业务含义的 `utils` 堆积和提前拆分微服务。
- API 边界使用 Pydantic，持久化使用 SQLAlchemy；路由中不直接编写复杂业务和引擎映射。
- 平台统一任务状态和阶段；小易原始字段只能存在于适配器及受控原始响应中。
- 验证阶段使用单实例 `asyncio` 同步器；未经确认不得加入 Celery、Redis、MinIO 或消息总线。
## 测试、安全与集成

- 状态映射、权限、任务恢复和错误分类必须测试；小易在自动测试中使用契约 Mock。
- 校验扫描目标授权、上传大小和所有外部输入；密钥仅从环境读取，日志必须脱敏。
- 预查由平台代理小易 WebSocket；禁止向上游发送用户、组织、白盒信息或已废弃的 `scan_*`/`can_*`。
- 数字人使用独立 JWT 身份；上传资产、漏洞、报告和日志时必须校验有效 `plan_id` 及访问范围。
- 自动测试禁止触发真实扫描；引擎契约、数据库迁移或安全边界变化必须在 PR 中单独说明。
