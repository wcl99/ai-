# AI 安服平台验证模型

本仓库包含 React 前端、FastAPI 后端、PostgreSQL 部署配置，以及小易渗透引擎和数字人对接适配。当前目标是验证端到端黄金路径；真实渗透计算由外部小易引擎执行，平台负责授权、任务状态、资产、漏洞、报告和审计。

## 在另一台电脑继续

```powershell
git clone https://github.com/wcl99/ai-.git
cd ai-
# 若交接 PR 尚未合并：git switch codex/project-handoff
```

先阅读根目录及子目录的 `AGENTS.md`。推荐环境：Git、Docker Desktop、Node.js 20+、Python 3.12+。

## 支持的开发工具链

- Node.js 20.x 与 npm 锁文件安装；CI 使用 Node.js 20。
- Python 3.12；后端开发依赖通过 `python -m pip install -e "apps/api[dev]"` 安装。
- Docker Desktop 与 Docker Compose v2，用于 PostgreSQL 和完整验证环境。

本地命令和 CI 使用同一组构建、Lint 与测试入口。不要用其他 Python 版本生成或提交环境产物。

## 启动完整验证环境

```powershell
Copy-Item deploy/.env.example deploy/.env
# 修改 deploy/.env 中的 JWT_SECRET、BOOTSTRAP_ADMIN_PASSWORD 等占位值
docker compose -f deploy/compose.yaml up --build
```

- API 文档：`http://127.0.0.1:8000/docs`
- 前端开发：另开终端执行 `npm --prefix apps/web ci`，再执行 `npm --prefix apps/web run dev`
- 前端地址：`http://127.0.0.1:5173/overview`
- 默认 `ENGINE_MODE=mock`，不会触发真实扫描；接入小易时再配置 `ENGINE_MODE=xiaoyi`、`XIAOYI_BASE_URL` 和 `XIAOYI_TOKEN`。

## 当前完成情况

- 前端：总览、任务、资产、漏洞、报告、平台设置、登录和 AI 渗透工作台页面；已接入最新 Figma 图标素材并校准侧边栏。
- 后端：JWT/RBAC、用户与组织、资产、扫描计划确认、任务/子任务/事件/问答、漏洞、报告、数字人上传、审计日志、小易适配和后台同步。
- 数据：Alembic 迁移 `0001` 至 `0003`；Docker 使用 PostgreSQL，本地测试使用内存 SQLite。
- 素材：`新建文件夹 (2)` 保存最新参考页面、按钮、标签和图标；`apps/web/public/ui-icons` 是前端实际使用的整理后资源。

## 验证命令

```powershell
npm --prefix apps/web ci
npm --prefix apps/web run build
npm --prefix apps/web run lint
npm --prefix apps/web run test
python -m pip install -e "apps/api[dev]"
python -m ruff check apps/api
python -m pytest apps/api/tests
```

## 下一步优先级

1. 为前端增加最小 API 客户端和登录态，将任务、资产、漏洞、报告及设置页从静态 Mock 切换到 FastAPI。
2. 跑通“创建计划 → 明确授权 → 预查 → 创建任务 → 实时监测 → 漏洞/报告回查”的黄金路径。
3. 使用 Docker Compose 做一次完整集成测试，并更新 Playwright 黄金路径。

已知限制：前端业务数据目前仍以 Mock 为主；真实小易环境、凭据和授权目标不入库；本期不做高并发、微服务、Redis/Celery 或生产高可用。
