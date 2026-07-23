# AI 安服平台稳定上线总计划

> **For agentic workers:** 每个阶段开始前必须拆成独立的可执行计划，并使用 TDD 逐项实施。本文件是全局路线图和发布门禁，不授权直接批量修改代码。

**目标：** 在不拆微服务、不增加未经确认的业务依赖的前提下，将当前验证模型推进为可在单实例环境稳定上线、可回滚、可审计的 AI 安服平台。

**架构：** 保持 React SPA + FastAPI 模块化单体 + PostgreSQL。生产构建将 SPA 静态产物与 FastAPI 打入同一应用镜像，避免引入额外 Web 服务；真实渗透计算继续由外部小易引擎承担，平台只保存授权、任务、结果和审计状态。

**技术栈：** React 18、TypeScript、TanStack Query、React Hook Form、Zod、FastAPI、Pydantic、SQLAlchemy、Alembic、PostgreSQL、Docker Compose、Vitest、Playwright、Pytest、Ruff。

---

## 1. 范围与约束

### 本计划包含

- 登录态、RBAC、组织隔离和 API 错误契约稳定化。
- 任务、资产、漏洞、报告的后端契约和前端实数接入。
- “创建计划 → 明确授权 → 预查 → 创建任务 → 实时监测 → 漏洞/报告回查”黄金路径。
- 单体容器化发布、迁移、健康检查、备份恢复、日志脱敏、上线与回滚手册。
- 自动化测试、CI、预发布验收和有限的真实小易授权验收。

### 明确不做

- 微服务拆分、Redis、Celery、MinIO、消息总线或 Kubernetes。
- 高并发、跨区域、高可用集群和无停机迁移。
- 浏览器直连小易、前端保存引擎凭据或聚合平台业务状态。
- 未经明确授权的真实扫描。
- 设置页 UI：等待切图完成后再单独设计和实施；本计划只保留现有后端设置接口的安全性。

### “稳定上线”的验收定义

1. 所有 CI 门禁通过，工作区无测试警告和未处理错误。
2. 生产模式不再读取业务 Mock；无数据时显示真实空状态。
3. Mock 引擎下黄金路径 Playwright 测试连续通过 10 次。
4. 应用和数据库重启后，进行中任务可恢复同步，历史数据不丢失。
5. PostgreSQL 备份与恢复演练成功；版本回滚手册在 30 分钟内可执行完成。
6. 预发布环境连续运行 24 小时，无未捕获异常、无敏感信息日志、无跨组织数据泄露。
7. 真实小易验收只使用书面确认的测试资产，完成一次受控黄金路径并保留审计证据。

## 2. 当前基线

- 分支：`codex/project-handoff`，当前工作区干净并跟踪同名远端分支。
- 后端已具备 JWT/RBAC、组织隔离、资产、计划、任务、漏洞、报告、数字人、小易适配、同步和审计。
- 前端已有页面和设计素材，但任务、资产、漏洞、报告及总览仍主要读取静态 Mock；登录页未调用 API。
- Compose 当前只启动 PostgreSQL 和 API；API 镜像启动时已执行 Alembic。
- 本机默认 Python 3.14 且未安装 Ruff，不能作为有效基线；正式执行必须使用项目要求的 Python 3.12 环境。

## 3. 目标数据流

1. 浏览器向同源 FastAPI 提交登录请求。
2. FastAPI 设置 HttpOnly 会话 Cookie；浏览器不把 Token 写入 localStorage 或日志。
3. SPA 通过 `/api/v1/*` 调用平台资源；TanStack Query 管理缓存、刷新、加载和错误状态。
4. 平台校验组织、角色和授权范围后写入 PostgreSQL，并记录关键审计事件。
5. FastAPI 适配器调用小易；同步器把外部状态映射为平台统一状态。
6. 页面只读取平台任务、资产、漏洞、报告和事件，不解释小易原始字段。

## 4. 阶段路线图

### 阶段 0：建立可重复基线

**涉及文件：**

- 修改：`README.md`
- 创建：`.github/workflows/ci.yml`
- 复核：`apps/web/package-lock.json`
- 复核：`apps/api/pyproject.toml`

**工作项：**

- [ ] 在 Python 3.12 环境安装 `apps/api[dev]`，运行并记录现有 Ruff/Pytest 基线。
- [ ] 使用 Node.js 20 和锁文件运行前端 build、lint、test 基线。
- [ ] 建立 CI，严格执行锁文件安装、前后端检查和测试，不引入新的代码依赖。
- [ ] 在 README 记录唯一支持的本地与 CI 工具链版本。
- [ ] 若基线失败，只修复阻塞后续工作的现有问题，并单独提交。

**验证命令：**

```powershell
npm --prefix apps/web ci
npm --prefix apps/web run build
npm --prefix apps/web run lint
npm --prefix apps/web run test
python -m pip install -e "apps/api[dev]"
python -m ruff check apps/api
python -m pytest apps/api/tests
```

**退出门禁：** 本地和 CI 使用相同版本与命令，全部通过后才能改契约。

### 阶段 1：稳定后端契约与安全边界

**涉及文件：**

- 修改：`apps/api/app/config.py`
- 修改：`apps/api/app/auth.py`
- 修改：`apps/api/app/schemas.py`
- 修改：`apps/api/app/main.py`
- 修改：`apps/api/tests/conftest.py`
- 修改：`apps/api/tests/test_api.py`
- 修改：`apps/api/tests/test_management.py`
- 修改：`apps/api/tests/test_results.py`
- 创建：`docs/api-contract.md`

**工作项：**

- [ ] 先用测试固定登录、`/auth/me`、401、403、404、409、422 的响应契约。
- [ ] 将 Cookie 的 `secure`、有效期和同源策略改为环境可控；生产默认安全，测试显式覆盖。
- [ ] 固定任务、资产、漏洞、报告列表的 `success/message/data` 结构。
- [ ] 为四类列表统一分页元数据；过滤字段只覆盖现有页面和黄金路径需要。
- [ ] 列表 DTO 提供稳定的关联摘要，如计划名、任务名、创建人和资产键；不向前端泄露 `raw_external`。
- [ ] 缺少真实来源的展示字段返回 `null` 或空集合，不伪造优先级、风险或趋势。
- [ ] 增加跨组织、越权、失效用户和数字人身份回归测试。
- [ ] 在 `docs/api-contract.md` 记录请求、响应、状态枚举和错误码。

**退出门禁：** 前端所需字段都有明确来源；契约测试通过；无数据库迁移则不得新增迁移。

### 阶段 2：接入前端登录态与最小 API 客户端

**涉及文件：**

- 创建：`apps/web/src/api/client.ts`
- 创建：`apps/web/src/api/schemas.ts`
- 创建：`apps/web/src/auth/AuthProvider.tsx`
- 创建：`apps/web/src/auth/ProtectedRoute.tsx`
- 创建：`apps/web/src/api/client.test.ts`
- 创建：`apps/web/src/auth/AuthProvider.test.tsx`
- 修改：`apps/web/src/main.tsx`
- 修改：`apps/web/src/App.tsx`
- 修改：`apps/web/src/pages/LoginPage.tsx`
- 修改：`apps/web/src/components/AppShell.tsx`

**工作项：**

- [ ] 用原生 `fetch` 实现单一 API 边界，启用同源 Cookie，不新增 Axios。
- [ ] 用 Zod 在 API 边界验证关键响应；错误统一转换为可展示的领域错误。
- [ ] AuthProvider 启动时调用 `/api/v1/auth/me`，区分加载、已登录和未登录。
- [ ] 保护业务路由，401 清理 Query 缓存并跳转登录页，保留原目标地址。
- [ ] 登录页调用真实接口，显示服务端错误；删除假验证码或将其明确标为未启用，不发送伪字段。
- [ ] AppShell 显示真实用户名和角色，并提供退出入口；若后端缺少退出接口，先在阶段 1 增加只清 Cookie 的同源端点。

**退出门禁：** 刷新页面可恢复登录态；Token 不进入 localStorage、sessionStorage、URL 或日志；登录相关单测通过。

### 阶段 3：任务、资产、漏洞、报告切换到真实数据

**涉及文件：**

- 创建：`apps/web/src/api/resources.ts`
- 创建：`apps/web/src/api/resources.test.ts`
- 修改：`apps/web/src/types.ts`
- 修改：`apps/web/src/pages/ListPages.tsx`
- 修改：`apps/web/src/pages/ManagementPages.tsx`
- 修改：`apps/web/src/pages/DashboardPage.tsx`
- 修改：`apps/web/src/pages/OverviewPages.tsx`
- 修改：`apps/web/src/pages/ManagementPages.test.tsx`
- 修改：`apps/web/src/App.test.tsx`
- 最终删除或限缩：`apps/web/src/data/mock.ts`

**工作项：**

- [ ] 为四类资源分别建立 TanStack Query 查询与最小 mutation。
- [ ] 先接列表与真实空状态，再接资产新增、漏洞状态更新、报告预览/下载等已有动作。
- [ ] 保持现有 DOM 结构、CSS 类、图标和设计素材，字段映射集中在 API 边界。
- [ ] 服务端分页驱动表格分页；搜索和筛选只调用后端已确认参数。
- [ ] 删除生产路径中的业务 Mock；测试通过 Mock Service Worker 以外的现有 Vitest 能力桩住 `fetch`，不增加依赖。
- [ ] 指标仅展示后端可计算的真实值；没有历史快照时不展示虚假趋势百分比。

**退出门禁：** 四类页面断开 API 时显示明确错误和重试；有数据、空数据、401、403、422 均有最小测试。

### 阶段 4：跑通完整黄金路径

**涉及文件：**

- 修改：`apps/web/src/pages/PentestPage.tsx`
- 创建或拆分：`apps/web/src/api/plans.ts`
- 创建或拆分：`apps/web/src/api/tasks.ts`
- 修改：`apps/web/e2e/golden-path.spec.ts`
- 修改：`apps/api/tests/test_api.py`
- 修改：`apps/api/tests/test_sync.py`
- 修改：`apps/api/app/main.py`（仅在现有接口无法满足契约时）

**工作项：**

- [ ] 计划创建必须保存目标、测试类型和描述，默认保持 `DRAFT`。
- [ ] 明确授权确认必须是独立操作，未确认计划不能创建任务。
- [ ] 预查仅通过平台 WebSocket；错误区分连接失败、参数拒绝、鉴权失败和格式错误。
- [ ] 创建任务使用稳定幂等键，重复提交不生成重复任务。
- [ ] 任务页轮询平台状态并显示阶段、进度、事件和可恢复错误；本期不引入消息队列。
- [ ] 成功后从平台接口回查漏洞和报告，停止或失败后保留完整历史。
- [ ] Playwright 使用 Mock 引擎验证整个流程，不在自动测试中触发真实扫描。

**退出门禁：** 黄金路径 E2E 连续运行 10 次无随机失败；重试、取消、API 重启恢复均有后端测试。

### 阶段 5：设置页等待与后续接入

**当前状态：** 阻塞于新切图，不在前四阶段内修改设置页 UI。

**允许的后端工作：**

- [ ] 保持 `/settings/organization` 和 `/settings/runtime` 只返回非敏感信息。
- [ ] 测试保证数据库 URL、JWT 密钥、小易 Token 和报告绝对路径不会下发。

**恢复条件：** 切图、字段清单和可编辑项经确认后，另建设置页设计与实施计划；未确认前不增加设置表、通用配置中心或新依赖。

### 阶段 6：单体发布与运行加固

**涉及文件：**

- 修改：`apps/api/Dockerfile`
- 修改：`apps/api/app/main.py`
- 修改：`apps/api/app/config.py`
- 修改：`deploy/compose.yaml`
- 修改：`deploy/.env.example`
- 创建：`deploy/README.md`
- 创建：`deploy/backup.ps1`
- 创建：`deploy/restore.ps1`

**工作项：**

- [ ] 使用多阶段 Docker 构建：Node 阶段生成 SPA，Python 阶段安装 API 并复制静态产物。
- [ ] FastAPI 同源托管 SPA 静态资源和路由回退，不新增 Nginx 或独立前端服务。
- [ ] 保留启动时 `alembic upgrade head`，增加迁移失败即停止的验证。
- [ ] 将 `/health` 拆分为存活和就绪检查；就绪检查验证数据库，避免执行外部真实扫描。
- [ ] Compose 为 API、PostgreSQL 增加健康检查、重启策略、资源边界和日志轮转。
- [ ] `.env.example` 只含占位值；启动前校验 JWT、管理员密码和生产 Cookie 配置。
- [ ] 编写仅针对 `postgres_data` 的备份/恢复脚本，执行前解析并校验目标；报告卷单独备份。
- [ ] 文档化升级、迁移、备份、恢复、回滚和小易降级到 Mock 的步骤。

**退出门禁：** 全新环境一条 Compose 命令启动；同一端口访问 SPA 与 API；备份恢复演练通过。

### 阶段 7：安全、可靠性和可观测性验收

**涉及文件：**

- 修改：`apps/api/tests/test_management.py`
- 修改：`apps/api/tests/test_results.py`
- 修改：`apps/api/tests/test_sync.py`
- 创建：`docs/security-checklist.md`
- 创建：`docs/operations-runbook.md`

**工作项：**

- [ ] 验证组织隔离、RBAC、Cookie、CORS、上传限制、路径穿越和报告 MIME 安全。
- [ ] 验证 Token、Cookie、密码、白盒数据和引擎原始凭据均被脱敏。
- [ ] 验证同步器异常隔离、有限重试、重启恢复和任务状态单调性。
- [ ] 使用结构化现有日志字段建立排障约定，不引入外部监控 SDK。
- [ ] 记录核心检查：API 就绪、同步器存活、失败任务数、数据库容量、报告卷容量。
- [ ] 进行 24 小时预发布浸泡，记录所有异常、重启和资源峰值。

**退出门禁：** 安全检查表无高危未关闭项；24 小时浸泡达到稳定上线定义。

### 阶段 8：受控上线与交接

**涉及文件：**

- 修改：`README.md`
- 创建：`CHANGELOG.md`
- 创建：`docs/release-checklist.md`
- 创建：`docs/handoff.md`

**工作项：**

- [ ] 冻结发布候选版本，记录镜像摘要、迁移版本、环境变量清单和已知限制。
- [ ] 在预发布环境执行全套自动测试与人工验收。
- [ ] 使用明确授权资产完成一次小易真实黄金路径；核对审计日志和结果回查。
- [ ] 上线前立即备份数据库和报告卷，确认回滚版本可拉取。
- [ ] 按清单上线并观察登录、任务创建、同步、漏洞、报告和错误率。
- [ ] 若触发回滚条件，停止新任务、保留审计证据、恢复兼容版本和数据。
- [ ] 完成交接文档：账号初始化、日常检查、故障分级、升级与恢复。

**退出门禁：** 业务方、安全负责人和运维方共同签字确认；设置页未完成项作为已知限制列出。

## 5. 提交与审查策略

- 每个阶段单独分支或独立提交序列，禁止把设计调整、契约变化和部署变化混在一个提交。
- 每个行为变化严格执行“失败测试 → 最小实现 → 全量回归”。
- 数据库变化必须有 Alembic 迁移、升级测试和回滚说明。
- API 契约变化先更新 `docs/api-contract.md` 和契约测试，再修改消费者。
- 每阶段结束提交审查材料：范围、变更文件、验证输出、截图、迁移影响、安全影响、已知限制。
- 阶段 6 之前不得宣称“可上线”；阶段 8 门禁通过后才可宣称“稳定上线”。

## 6. 推荐执行顺序与依赖

```text
阶段 0 基线
  → 阶段 1 后端契约
    → 阶段 2 登录态
      → 阶段 3 四类资源实数接入
        → 阶段 4 黄金路径
          → 阶段 6 单体发布
            → 阶段 7 稳定性验收
              → 阶段 8 受控上线

阶段 5 设置页：等待切图确认后独立并入，不阻塞其余稳定性工作。
```

## 7. 主要风险与控制

| 风险 | 控制措施 | 阻断上线条件 |
|---|---|---|
| 前端展示字段没有真实来源 | 契约返回 `null`，不从 Mock 填充 | 生产页面仍显示伪业务数据 |
| Cookie 在不同环境失效 | 同源发布，安全属性环境化并测试 | 刷新后登录态丢失或 Token 可被脚本读取 |
| 小易字段漂移 | 原始字段限制在适配器，平台状态契约测试 | 平台页面依赖小易原始字段 |
| 任务重启后丢失 | PostgreSQL 持久化、同步器恢复测试 | 活跃任务无法恢复或状态回退 |
| 迁移破坏现有数据 | 预发布副本升级、备份恢复和回滚演练 | 迁移无恢复路径 |
| 未授权真实扫描 | DRAFT/READY 双阶段确认和审计 | 自动测试或未授权环境触发真实引擎 |
| 设置页设计返工 | 当前冻结 UI，只保留安全后端接口 | 未确认切图前新增设置数据模型 |

## 8. 首个可执行子计划

本总计划获批后，先编写并提交“阶段 0：可重复基线”的详细 TDD/实施计划供审查。阶段 0 完成并确认后，再为阶段 1 编写独立计划；不一次性跨阶段实施。
