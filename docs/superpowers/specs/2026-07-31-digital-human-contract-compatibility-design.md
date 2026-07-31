# 数字人对接契约兼容设计

## 目标

以工作区根目录的《数字人对接文档》为唯一外部接口契约。小易侧已经按该文档完成配置，只允许修改平台基础回传地址；字段、可选性、鉴权流程、响应结构和接口路径均由平台适配。

平台内部继续使用现有 FastAPI 模块化单体、UUID 业务主键、`XiaoyiPlanMapping` 数字计划映射和 `Task.external_task_id`，不增加微服务或第三方依赖。

## 外部契约范围

需要兼容以下既有路径：

- `POST /api/auth/login`
- `POST /api/ai/upload-vulnerability`
- `POST /api/ai/upload-report`
- `POST /api/ai/upload-log`
- `POST /api/ai/upload-asset`
- `POST /api/ai/create-test-plan`
- `POST /api/ai/start-test-plan`

JWT 获取和 Bearer 使用方式保持原文档不变。

## 兼容边界

采用同路径兼容适配层，不改变平台内部资源接口 `/api/v1/*`。

### 登录

- 接受明文 `username`、`password`。
- `org_id` 同时接受数字 ID、平台 UUID 或省略。
- 数字 `org_id` 作为数字人外部组织上下文；平台仍以登录账号所属组织作为实际数据边界。
- 成功响应补齐原文档的 `user`、`org`、`role`、`is_sys_admin` 顶层字段。
- 登录失败对该路径返回原文档格式 `{"success": false, "error": "..."}`。

### 回传身份解析

- `plan_id` 接受数字计划 ID、平台 UUID 或省略。
- 数字计划 ID 通过 `XiaoyiPlanMapping` 解析到平台计划。
- `task_id` 继续作为向后兼容扩展接受，但不要求小易配置。
- 提供 `task_id` 时优先按平台任务 UUID或小易外部任务 ID匹配。
- 只提供 `plan_id` 时，自动选择该计划的当前任务；优先非终态任务，否则选择最近任务。
- 未提供 `plan_id` 时，仅当登录组织中可以唯一确定当前非终态任务才自动归属。
- 无法唯一确定时返回明确错误，不猜测任务，防止跨任务污染。
- `org_id` 数字值允许回显；平台 UUID 若与登录组织不一致则拒绝。

### 上传漏洞

- `plan_id`、`org_id` 保持文档中的可选性。
- `data` 必须是对象并完整保存。
- `asset_key` 未提供时，从 `data.ip` 与 `data.port` 拼接。
- `severity` 从顶层、`data.severity` 或 `data.level` 依次推断，默认 `medium`。
- `title` 从顶层、`data.title` 或 `data.name` 依次推断。
- 将原文档列出的 URL、方法、Payload、请求包和响应包历史别名复制到标准字段，同时保留原字段。
- 成功响应使用文档顶层结构：`success`、`message`、`plan_id`、`org_id`。

### 上传报告

- `format` 接受安全的短格式标识，不局限于三个枚举值。
- 普通文件名时要求 `content`，并安全写入报告目录。
- `filename` 为 HTTP/HTTPS URL 时原样保存外链，不创建本地文件。
- 未提供文件名时生成 `ai_report_<timestamp>.<format>`。
- 成功响应补齐顶层 `report_path`、`plan_id`、`org_id`。
- URL 禁止携带用户名或密码。

### 上传日志

- 接受文档中的 `user_id`，但平台数据所有者始终使用已鉴权账号，避免伪造他人身份。
- 其余 `timestamp`、`level`、`type`、`agent_type`、`action`、`details`、`content` 按文档接收。
- 关键里程碑、警告和错误继续转为平台任务事件。
- 成功响应使用文档顶层结构。

### 上传资产

- 接受文档中的资产对象和自定义字段。
- 主机从 `ip`、`host`、`hostname`、`domain` 等文档字段推导。
- `asset_key` 未提供时按 `host:port` 生成。
- 数据库唯一性调整为组织、计划和资产键组合，使不同计划可以保存相同资产。
- 成功响应使用文档顶层结构。

### 创建和启动计划

- 创建计划接受文档中的数字 `org_id`、目标、模板、并发和时限字段。
- 对外返回数字 `plan_id`，该值来自 `XiaoyiPlanMapping`，内部计划仍使用 UUID。
- 创建响应补齐文档中的 `plan`、`task_count`、`plan_id`、`org_id` 和 `time_limit`。
- 启动接口接受数字 `plan_id` 并解析到平台计划。
- 启动响应使用文档中的 `success`、`message`、`plan_id`、`test_type`、`target_count`。

## 响应与错误

- `/api/auth/login` 和 `/api/ai/*` 对外使用原数字人文档格式。
- 成功字段放在顶层，不要求小易解析平台自定义的 `data` 包装。
- 失败统一至少返回 `{"success": false, "error": "错误说明"}`。
- HTTP 状态码继续表达 401、403、404、409、422 和 5xx，便于正确重试。
- `/api/v1/*` 保留平台现有响应，不受兼容层影响。
- 现有回传幂等机制保留；重复请求不重复落库。

## 文档交付

从原《数字人对接文档》生成新的交付版本：

- 基础地址替换为 `http://101.43.119.26:8000`。
- 登录示例替换为专用账号 `xiaoyi` 和密码 `Xiaoyi2026!`。
- 不添加要求小易改动的新字段或新调用步骤。
- 保留原接口路径、字段示例和调用顺序。
- 文档包含明文体验账密，仅保存在工作区交付目录，不提交公开仓库。

仓库内只提交不含密码的契约说明和自动化测试。

## 测试与验收

自动化契约测试逐项复现原文档请求：

- 数字 `org_id` 登录并校验文档响应字段。
- 不带自定义 `task_id` 的四类回传。
- 漏洞默认值、别名和 `asset_key` 推导。
- 普通报告、自动文件名和 URL 报告。
- 日志 `user_id` 兼容与任务事件归属。
- 同资产在不同计划中分别保存。
- 数字计划创建与启动响应。
- 文档格式错误响应。
- 重复回传幂等。
- 多个运行任务且缺少计划标识时拒绝归属。

通过后运行后端全量测试、前端测试、类型检查、Lint 和生产构建。部署后使用 `xiaoyi` 专用账号按原文档请求做线上冒烟验证，确认回传落到对应平台计划和任务。
