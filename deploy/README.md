# 单实例部署与恢复手册

本目录部署现有的 FastAPI/React 单体应用与 PostgreSQL，不增加其他长期运行服务。
生产环境需要 Docker Engine、Docker Compose v2、可写的数据卷，以及在应用入口之前完成
HTTPS 终止的反向代理或负载均衡器。

## 首次部署

1. 将 `.env.example` 复制为仅部署主机可读的 `.env`。
2. 替换所有口令占位符。`JWT_SECRET` 至少 32 个字符，且数据库、JWT、管理员口令不得以
   `replace-`、`change-` 或 `example-` 开头。
   正式发布时将 `API_IMAGE` 设置为镜像仓库中的不可变摘要（`仓库@sha256:...`）；本地
   `--build` 验证可保留 `ai-security-platform-api:local`。
3. 保持 `APP_ENVIRONMENT=production` 和 `COOKIE_SECURE=true`。只有本机 HTTP 验证才可在
   本地 `.env` 中同时设置 `APP_ENVIRONMENT=development` 和 `COOKIE_SECURE=false`，不要
   提交该文件。
4. 本地构建验证运行：

   ```powershell
   docker compose --env-file deploy/.env -f deploy/compose.yaml -p aisec up -d --build
   ./deploy/smoke.ps1 -BaseUrl https://security.example.com
   ```

   生产发布不使用 `--build`。先拉取 `.env` 中记录的同一不可变摘要，再启动：

   ```powershell
   docker pull registry.example.com/aisec/api@sha256:<64位摘要>
   docker compose --env-file deploy/.env -f deploy/compose.yaml -p aisec up -d --no-build
   ./deploy/smoke.ps1 -BaseUrl https://security.example.com
   ```

就绪探针只验证 PostgreSQL；小义引擎不可用不会让平台退出就绪状态，也不会触发真实扫描。
需要隔离引擎故障时，将 `ENGINE_MODE=mock` 后重建 API 容器。
Compose 启动命令会在容器内从 `DATABASE_PASSWORD` 生成仅供旧版本回滚镜像使用的编码
`DATABASE_URL`；口令不会写入 Compose 文件或构建上下文。

## 备份

备份目录必须位于仓库之外，且不能是磁盘根目录。脚本会短暂停止 API，待进行中的写操作退出后，
分别保存 PostgreSQL 自定义格式转储、报告目录和不含密钥的清单，最后自动重启 API：

```powershell
./deploy/backup.ps1 `
  -ComposeFile ./deploy/compose.yaml `
  -OutputDirectory D:/aisec-backups `
  -ProjectName aisec
```

可先运行 `-ValidateOnly` 验证路径而不访问 Docker。备份完成后，将整个时间戳目录复制到独立
存储并按组织的保留策略管理。

## 恢复演练

恢复会清理目标数据库对象并替换报告目录，必须显式传入 `-ConfirmRestore`。调用脚本前保持
PostgreSQL 和 API 正常运行；脚本负责停止 API，在单个数据库事务中恢复、替换报告并迁移，
并先核对备份与恢复镜像的 Alembic 版本；全部成功后才重建 API。失败时 API 保持停止，避免
暴露部分恢复的数据：

```powershell
./deploy/restore.ps1 `
  -BackupDirectory D:/aisec-backups/20260723T120000Z `
  -ComposeFile ./deploy/compose.yaml `
  -ProjectName aisec `
  -RestoreImage registry.example.com/aisec/api@sha256:<64位摘要> `
  -ConfirmRestore
./deploy/smoke.ps1 -BaseUrl https://security.example.com
```

正式恢复前先在隔离主机以相同镜像版本演练。恢复后核对清单中的迁移版本、登录、任务与漏洞
数量、报告下载，并确认 `/health/ready` 正常。

## 升级与回滚

升级前执行备份并记录当前不可变镜像摘要。随后拉取目标摘要、更新 `.env` 中的 `API_IMAGE`，
并运行 `docker compose ... up -d --no-build`；API 启动时执行 `alembic upgrade head`。
如迁移失败，保留日志，不要反复启动或手工
修改数据库；在维护窗口把升级前摘要作为 `-RestoreImage` 传给恢复脚本。脚本先验证或拉取该
镜像，恢复升级前备份，最后用这个旧镜像重建 API；不会用待回滚的新镜像执行迁移。
本次首次升级也可回滚到旧的 `DATABASE_URL` 配置版本，因为 Compose 会从同一个原始数据库
口令生成兼容 URL。

应用代码回滚但数据库迁移已成功时，也必须先确认旧代码兼容新模式；无法确认就恢复完整备份。
数据库转储与报告目录属于同一恢复点，不应只恢复其中一项。

## 故障检查

- `/health/live` 失败：检查 API 容器状态和最近三份轮转日志。
- `/health/ready` 失败：检查 PostgreSQL 健康状态、连接口令与迁移日志。
- 页面正常但引擎失败：确认 `XIAOYI_BASE_URL`/令牌和网络；需要保持平台可用时切回
  `ENGINE_MODE=mock`，且不要发起真实任务。
- 浏览器无法保持会话：确认外部访问全程 HTTPS、`COOKIE_SECURE=true`，并检查代理是否保留
  `Set-Cookie`。
