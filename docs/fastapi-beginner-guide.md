# FastAPI 后端新手导读

这份导读不从框架术语开始，而是沿着本项目的一次真实请求阅读代码。平台是一个 FastAPI 单体应用：FastAPI 接收请求，Pydantic 检查数据，服务层执行规则，SQLAlchemy 保存状态；只有引擎适配层会接触 Mock 或小易。

> 学习和测试时保持 `ENGINE_MODE=mock`。Mock 只用内存数据模拟任务进度，不连接外部靶标，也不会发起扫描。

## 1. 先认清每个文件

| 文件 | 初学者可以把它理解成 | 主要责任 |
| --- | --- | --- |
| `apps/api/app/main.py` | 前台接待 | 创建 FastAPI 应用，声明 HTTP/WebSocket 路由，组装依赖和错误处理 |
| `apps/api/app/schemas.py` | 收件格式检查员 | 用 Pydantic 验证请求、整理响应；不负责写数据库 |
| `apps/api/app/auth.py` | 门禁 | 校验密码和 JWT，把当前用户、角色检查做成依赖 |
| `apps/api/app/config.py` | 配置入口 | 从环境变量读取配置，并检查生产环境的安全条件 |
| `apps/api/app/db.py` | 数据库连接管理 | 创建异步引擎和每次请求使用的数据库会话 |
| `apps/api/app/models.py` | 数据库表的 Python 映射 | 用 SQLAlchemy 定义持久化字段、约束和关联 ID |
| `apps/api/app/services.py` | 业务规则 | 处理计划、授权快照、任务幂等性和事务 |
| `apps/api/app/engine.py` | 翻译器 | 在统一接口后选择 Mock 或小易，并规范化外部数据和错误 |
| `apps/api/app/sync.py` | 后台跟单员 | 创建或轮询小易任务，把进度、子任务和报告写回平台 |
| `apps/api/app/errors.py` | 业务错误词典 | 定义带 HTTP 状态码、稳定错误码和消息的 `AppError` |

一个很重要的区别：`schemas.py` 描述“接口允许收什么、返回什么”，`models.py` 描述“数据库实际存什么”。例如请求里的 `TaskCreate` 是短暂的输入对象，而数据库里的 `Task` 会长期保存状态。

## 2. 应用如何启动

开发命令的核心是：

```powershell
python -m uvicorn app.main:app --reload --app-dir apps/api
```

可以从右往左读：

1. `--app-dir apps/api` 把 `apps/api` 放到 Python 的模块搜索路径中。
2. `app.main` 表示导入 `apps/api/app/main.py`。
3. 最后的 `:app` 表示取出该文件里的 `app = FastAPI(...)` 对象。
4. Uvicorn 是 ASGI 服务器，负责监听端口，再把请求交给 FastAPI。
5. `--reload` 只适合开发：文件变化后自动重启进程。

仅执行这条命令并不会自动准备数据库。仓库当前完整的启动方式是先正确配置 `deploy/.env`，再由 Compose 启动 PostgreSQL、执行 Alembic 迁移并启动 API：

```powershell
docker compose -f deploy/compose.yaml up --build
```

应用启动时，`lifespan()` 会验证运行配置、准备报告目录、按配置创建初始管理员，并启动一个任务同步循环。应用停止时，它会通知循环退出并等待清理完成。

## 3. 一次 HTTP 请求经过哪里

```text
HTTP 请求
  -> main.py 中匹配路由
  -> schemas.py 中的 Pydantic 输入校验
  -> Depends(...) 解析用户、角色、配置和数据库会话
  -> services.py 执行业务规则
  -> models.py + SQLAlchemy 读写数据库
  -> Pydantic response_model 序列化
  -> HTTP 响应
```

以这个函数形状为例：

```python
async def add_task(
    payload: TaskCreate,
    user: User = Depends(require_roles(...)),
    session: AsyncSession = Depends(get_session),
):
    ...
```

- `payload: TaskCreate` 告诉 FastAPI 用 Pydantic 读取并检查 JSON。
- `Depends(require_roles(...))` 先解析 JWT、读取用户，再检查角色。
- `Depends(get_session)` 为本次请求打开异步 SQLAlchemy 会话，请求结束后关闭。
- 任何依赖失败时，函数体根本不会开始执行。
- 路由上的 `response_model` 会再次整理输出，防止意外返回不属于接口的字段。

`async def` 表示处理数据库或网络等待时，可以把执行机会交还给服务器，从而继续服务其他请求。它不会自动让 CPU 计算变快。

## 4. 登录流程：从 JSON 到 JWT

入口是 `POST /api/v1/auth/login`，按以下顺序阅读：

1. FastAPI 找到 `main.py` 的 `login()`。
2. 请求 JSON 先变成 `schemas.py` 的 `LoginRequest`。缺字段、密码过短或类型错误时，FastAPI 在进入函数体前返回 `422`。
3. `Depends(get_session)` 打开数据库会话；`Depends(get_settings)` 提供已缓存的配置。
4. 路由将用户名规范化，并用 SQLAlchemy 查询启用的用户。
5. `pwdlib` 对输入密码和数据库里的哈希值做验证。数据库不保存明文密码。
6. `auth.py` 的 `create_token()` 把用户 ID、组织、角色、签发者和过期时间签成 JWT。
7. 同一个 JWT 放入响应 JSON，也写入 `HttpOnly` Cookie。`HttpOnly` 可以阻止前端 JavaScript 直接读取 Cookie，但浏览器仍会随请求发送它。
8. `UserRead` 从 ORM 用户对象生成安全的响应字段，密码哈希不会出现在响应中。

访问受保护路由时，`current_user()` 优先读取 `Authorization: Bearer ...`，没有时再读 Cookie。它验证签名、签发者和有效期，并重新查询“仍处于启用状态”的用户。因此，账号被停用后，即使旧 JWT 尚未过期，也不能继续访问。

## 5. 从授权计划到扫描任务

任务不是收到目标后立刻调用引擎。平台先建立一个可审计的授权边界：

```text
创建 DRAFT 计划
  -> 保存预查后的资产范围
  -> 管理员或安全专家确认
  -> 生成 authorization_confirmed 快照
  -> 创建幂等的平台 Task
  -> 后台同步器调用一次小易 Chat 创建外部任务
  -> 后续轮询状态、子任务和报告
```

### 5.1 创建草稿

`POST /api/v1/scan-plans` 接收 `ScanPlanCreate`。路由会强制把 `authorization_confirmed` 设为 `False`，所以普通创建一定得到 `DRAFT`，不能靠请求字段绕过确认。

`services.py` 的 `create_plan()` 同时保存常用字段和 `snapshot`。快照是将来交给引擎的完整输入记录，便于审计“任务启动时到底使用了什么”。

### 5.2 预查和资产范围

浏览器通过 `/api/v1/prechecks/ws` 发送域名或端口预查消息。预查结果确认后，前端用 `PATCH /api/v1/scan-plans/{plan_id}/assets` 保存规范化的 `asset_list`。只有 `DRAFT` 计划能修改资产范围。

### 5.3 确认授权

`POST /api/v1/scan-plans/{plan_id}/confirm` 只允许管理员或安全专家调用。它把计划状态改为 `READY`，并在快照中记录 `authorization_confirmed=True` 和确认人 ID。

### 5.4 创建平台任务

`POST /api/v1/tasks` 先取得本组织内的计划，再进入 `services.py` 的 `create_task()`。这里会检查：

- 计划必须是 `READY`。
- 快照不能包含已废弃的小易字段。
- 资产列表必须能够规范化。
- 同一个组织内，同一个 `request_id` 只能绑定一个任务。

最后一条叫“幂等”：客户端因超时重试相同请求时，平台返回原任务，而不是重复创建扫描。数据库唯一约束还能处理两个相同请求几乎同时到达的情况。

这一步只创建平台自己的 `Task.id`，状态是 `QUEUED`。`Task.id` 是平台 UUID；`external_task_id` 是小易返回的任务 ID，二者不能混用。

### 5.5 后台创建和同步外部任务

`sync.py` 只读取 `QUEUED`、`RUNNING`、`CANCELLING` 等活动任务：

- 没有 `external_task_id` 时，调用引擎适配器创建外部任务；小易模式对应一次 `/api/osCore/chat` 请求。
- 已有外部 ID 时，查询进度并同步子任务、报告和事件。
- 小易状态先由 `engine.py` 映射成平台稳定状态，再保存数据库。
- 单个任务失败会被单独记录，不会阻止本轮其他任务同步。
- 连接类错误只按配置有限重试，确定性错误不会盲目重试。

Mock 和小易实现同一组方法，所以路由和同步器不需要到处写 `if engine_mode == ...`。这是适配器边界的价值。

## 6. REST 和 WebSocket 有什么不同

REST 适合“一问一答”：客户端发送一个 HTTP 请求，服务器返回一个响应，连接的业务使命就结束了。登录、创建计划和读取任务都是这种形式。

WebSocket 适合一条连接上连续双向通信。预查流程中：

```text
浏览器 WebSocket
  -> 平台检查登录 Cookie 和角色
  -> Pydantic 验证每条消息
  -> 复用一个上游小易 WebSocket
  -> 把规范化结果发回浏览器
```

WebSocket 路由不会自动运行普通 HTTP 路由的 `Depends(current_user)`，所以 `websocket_user()` 会显式读取 Cookie 并验证用户。连接建立后，平台尽量复用同一个上游小易会话，避免每条预查消息都重新握手。Mock 没有长期上游连接，仍遵循相同消息格式。

## 7. 错误从哪里来

| 类别 | 常见状态 | 发生位置 | 含义 |
| --- | --- | --- | --- |
| 输入校验 | `422` | Pydantic / FastAPI | JSON 的字段、类型、长度或格式不符合 Schema |
| 未登录 | `401` | `current_user` 等认证依赖 | 没有令牌、令牌无效或用户已停用 |
| 无权限 | `403` | `require_roles` 或业务权限检查 | 已登录，但角色不能执行当前操作 |
| 业务冲突 | `409` 等 | `services.py` 的 `AppError` | 例如计划尚未确认或幂等键冲突 |
| 引擎失败 | `400` 或 `502` | `engine.py` | 小易拒绝请求、鉴权失败、不可用或响应格式异常 |

`main.py` 的异常处理器把这些来源转换为稳定 JSON，例如 `success`、`code`、`message` 和 `details`。前端应依赖稳定的 `code`，不要通过解析自然语言消息判断错误类型。

## 8. 安全的学习和调试方法

### 启动并观察接口

在仓库根目录按 `deploy/.env.example` 创建仅供本地使用的 `deploy/.env`，确保：

- `APP_ENVIRONMENT=development`
- `COOKIE_SECURE=false`（仅限本地 HTTP）
- `ENGINE_MODE=mock`
- 各密码和 `JWT_SECRET` 使用独立的本地值，不提交到 Git

然后启动：

```powershell
docker compose -f deploy/compose.yaml up --build
```

打开 `http://127.0.0.1:8000/docs`。这是 FastAPI 根据路由和 Pydantic Schema 自动生成的 Swagger UI，可以查看请求字段和响应格式。

### 代码检查和测试

```powershell
python -m ruff check apps/api
python -m pytest apps/api/tests -q
```

测试会使用隔离配置和 Mock，不应改成生产小易地址，也不要在测试中放有效凭据或外部靶标。

### 建议断点

按学习顺序设置断点：

1. `main.py` 的 `login()`：观察已经通过 Pydantic 的 `payload`。
2. `auth.py` 的 `current_user()`：观察依赖如何在路由前解析用户。
3. `main.py` 的 `add_task()`：观察路由只负责组装，不直接调用小易。
4. `services.py` 的 `create_task()`：观察业务条件和数据库事务。
5. `sync.py` 的 `sync_once()`：观察平台任务何时取得外部任务 ID。
6. `engine.py` 的 `MockEngineClient.get_task()`：观察外部状态如何被模拟和规范化。

不要在日志、截图、断点分享或提交内容中暴露 JWT、Cookie、数据库密码、API Key 或引擎 Token。

## 9. 三个不会触发真实扫描的练习

1. **读健康检查**：比较 `/health/live` 和 `/health/ready`。临时让数据库不可用，观察为什么前者仍可能是 `200`，后者会是 `503`。
2. **追踪一次登录**：从 `LoginRequest` 开始，依次找到 `get_session()`、密码验证、`create_token()` 和 `LoginResponse`，写下每一步的输入输出类型。
3. **追踪一个 Mock 任务**：在测试中创建 `READY` 计划和任务，逐次调用 `sync_once()`，记录 `QUEUED -> RUNNING -> SUCCEEDED` 期间 `phase`、`progress` 和 `external_task_id` 的变化。

做完后，你应该能回答四个问题：请求在哪里进入？谁检查输入？谁决定业务能不能做？谁负责把平台语言翻译成小易语言？如果答案分别是 `main.py`、`schemas.py`、`services.py` 和 `engine.py`，就已经抓住了这套 FastAPI 后端的主干。
