# 小易场景参数与启动成功日志设计

## 目标

按已确认的小易参数启动渗透任务，并通过平台现有任务日志接口查询到可审计的启动成功记录。

## 场景映射

| 页面场景 | 小易 `scan_mode` |
| --- | --- |
| 标准渗透 | `standard` |
| 两高一弱 | `two_high_one_weak` |
| 两清两固 | `two_high_one_weak` |
| 等保2.0 | `mlps_2_0` |

页面场景使用独立值，避免两个中文场景因共享小易参数而出现同时选中。平台计划保存并冻结实际发送给小易的 `scan_mode`。

## 日志

复用现有 `TaskEvent` 与 `GET /api/v1/tasks/{task_id}/events`，不新增日志表、服务或依赖。小易创建任务成功并返回外部任务号后写入：

- `event_type`: `xiaoyi_task_started`
- `message`: `小易任务启动成功`
- `data_json`: `external_task_id`、`scan_mode`、`status`、`phase`

日志只保存归一化成功信息，不保存凭据或小易原始响应。

## 验证

单元测试先验证映射与日志事件；部署后对授权靶场分别启动两高一弱、两清两固和等保2.0任务，通过任务日志接口确认成功事件，并通过小易任务详情确认其实际 `scanMode`。
