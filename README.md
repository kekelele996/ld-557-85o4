# FinanceAPI 金融投资分析平台 API

```bash
docker compose up -d
```

本地开发：

```bash
cd backend
npm install
npm run start:dev
```

访问地址：
- API 健康检查：http://localhost:38505/api/health
- Swagger 文档：http://localhost:38505/api/docs

FinanceAPI 是面向个人投资者的纯后端 API 服务，覆盖投资组合、持仓、交易记录、市场行情与复盘日志。项目采用 NestJS + TypeORM 分层结构，保留 PostgreSQL/Redis/JWT/Docker Compose 部署配置，并提供可直接烟测的内存数据实现。

## 技术栈

| 分类 | 技术 |
|---|---|
| 框架 | NestJS |
| ORM | TypeORM |
| 数据库 | PostgreSQL 15 |
| 缓存 | Redis，行情 TTL 60 秒，历史数据 5 分钟，搜索 10 分钟 |
| 认证 | JWT + Passport |
| 校验 | class-validator + class-transformer |
| 文档 | Swagger `/api/docs` |
| 限流 | @nestjs/throttler |

## API 概览

| 模块 | 方法 | 路径 | 说明 |
|---|---|---|---|
| Auth | POST | `/api/auth/register` | 注册并返回 JWT |
| Auth | POST | `/api/auth/login` | 登录 |
| Auth | POST | `/api/auth/refresh` | 刷新 token |
| Auth | GET | `/api/auth/profile` | 当前用户 |
| Portfolio | GET/POST | `/api/portfolios` | 列表、创建 |
| Portfolio | GET/PUT/DELETE | `/api/portfolios/:id` | 详情、编辑、删除 |
| Portfolio | GET | `/api/portfolios/:id/performance` | 收益统计 |
| Holding | GET/POST | `/api/portfolios/:portfolioId/holdings` | 组合持仓 |
| Holding | GET/DELETE | `/api/holdings/:id` | 持仓详情、删除 |
| Transaction | GET/POST | `/api/holdings/:holdingId/transactions` | 持仓交易 |
| Transaction | GET | `/api/portfolios/:portfolioId/transactions` | 组合交易分页 |
| Transaction | POST | `/api/transactions/:id/cancel` | 撤销交易并重算持仓与市值 |
| Market | GET | `/api/market/quote/:symbol` | 单资产行情 |
| Market | GET | `/api/market/search?q=` | 搜索资产 |
| Market | GET | `/api/market/history/:symbol` | 历史 K 线 |
| Market | GET | `/api/market/trending` | 热门资产 |
| Review | GET/POST | `/api/portfolios/:portfolioId/reviews` | 复盘列表、创建 |
| Review | PUT/DELETE | `/api/reviews/:id` | 编辑、删除复盘 |

## 枚举使用位置清单

| 枚举 | 定义位置 | 使用位置 |
|---|---|---|
| PortfolioType | `backend/src/constants/enums.ts` | `modules/portfolios/entities/portfolio.entity.ts`、`modules/portfolios/dto/create-portfolio.dto.ts`、`modules/portfolios/portfolios.service.ts`、`database/migrations/1710000000000-init-financeapi.ts`、`database/seeds/seed.ts` |
| RiskLevel | `backend/src/constants/enums.ts` | `modules/portfolios/entities/portfolio.entity.ts`、`modules/portfolios/dto/create-portfolio.dto.ts`、`modules/portfolios/portfolios.service.ts`、`database/migrations/1710000000000-init-financeapi.ts`、`database/seeds/seed.ts` |
| TransactionType | `backend/src/constants/enums.ts` | `modules/transactions/entities/transaction.entity.ts`、`modules/transactions/dto/create-transaction.dto.ts`、`modules/transactions/transactions.service.ts`、`modules/holdings/holdings.service.ts`、`database/migrations/1710000000000-init-financeapi.ts`、`database/seeds/seed.ts` |
| TransactionStatus | `backend/src/constants/enums.ts` | `modules/transactions/entities/transaction.entity.ts`、`modules/transactions/transactions.service.ts`、`modules/transactions/transactions.controller.ts`、`database/migrations/1710000000000-init-financeapi.ts`、`database/seeds/seed.ts` |
| AssetStatus | `backend/src/constants/enums.ts` | `modules/market/entities/market-data.entity.ts`、`modules/market/market.service.ts`、`database/migrations/1710000000000-init-financeapi.ts` |
| UserRole | `backend/src/constants/enums.ts` | `modules/auth/entities/user.entity.ts`、`modules/auth/dto/register.dto.ts`、`modules/auth/strategies/jwt.strategy.ts`、`common/guards/roles.guard.ts`、`constants/permissions.ts`、`database/seeds/seed.ts` |

## RBAC 权限矩阵

| 角色 | 投资组合 | 持仓/交易 | 市场数据 | 系统管理 |
|---|---|---|---|---|
| USER | 仅本人 | 仅本人 | 读取 | 无 |
| PREMIUM | 仅本人，组合上限更高 | 仅本人 | 读取，高限流 | 无 |
| ADMIN | 全部 | 全部 | 读取/管理 | 全部 |

## 全局异常处理

`backend/src/common/filters/http-exception.filter.ts` 捕获业务 HTTP 异常，`all-exceptions.filter.ts` 捕获未处理异常。正常响应经 `transform.interceptor.ts` 统一包装为：

```json
{ "statusCode": 200, "message": "success", "data": {}, "timestamp": "...", "path": "/api/..." }
```

## 操作日志

`backend/src/common/interceptors/audit.interceptor.ts` 拦截 POST/PUT/PATCH/DELETE，记录用户、动作、目标路径、请求摘要、IP、UA。交易、删除组合、删除持仓等关键写操作都会进入审计服务。表结构见 `backend/src/modules/audit/entities/audit-log.entity.ts`。

## Redis 缓存策略

| 接口 | TTL |
|---|---|
| `/api/market/quote/:symbol` | 60 秒 |
| `/api/market/history/:symbol` | 300 秒 |
| `/api/market/search` | 600 秒 |

当前开发实现返回 `cacheTtlSeconds` 字段用于验证策略；Docker 配置提供 Redis 服务，生产可替换 `CacheHintInterceptor` 接入真实 Redis。

## API 测试示例

```bash
curl http://localhost:38505/api/health

TOKEN=$(curl -s -X POST http://localhost:38505/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"Passw0rd!","name":"用户"}' | jq -r '.data.accessToken')

curl -H "Authorization: Bearer $TOKEN" http://localhost:38505/api/portfolios

curl -X POST http://localhost:38505/api/portfolios \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"指数增强","type":"MIXED","riskLevel":"MODERATE"}'

curl -X POST http://localhost:38505/api/holdings/1/transactions \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"type":"BUY","quantity":2,"price":190,"fee":1}'

curl -H "Authorization: Bearer $TOKEN" http://localhost:38505/api/market/quote/AAPL
```

### 交易撤销

交易记录支持撤销（软删除），撤销后记录仍保留在账上并可通过状态区分：

- `POST /api/transactions/:id/cancel` 撤销任意一笔交易。系统按该持仓**剩余有效交易**（ACTIVE）从**初始持仓**（`initialQuantity` / `initialAvgCost`）开始，按 `executedAt` 时间顺序回放，重算数量、平均成本，并联动重算组合市值；分红交易不影响数量与成本。
- 重算途中若任一笔卖出的可卖数量不足，整次撤销被**拒绝**（`409 Conflict`，`insufficient sellable quantity to revert transaction`），交易状态、持仓数量/均价、组合市值全部保持原样，不会被部分修改。
- 对已撤销记录重复撤销返回 `409 Conflict`（`transaction already cancelled`）；撤销不存在的交易返回 `404`。
- 交易明细通过 `status`（`ACTIVE` / `CANCELLED`）和 `cancelledAt` 区分有效与已撤销记录：
  - `GET /api/portfolios/:portfolioId/transactions` 组合交易分页**默认不显示**已撤销交易，传 `?includeCancelled=true` 可查看全部。
  - `GET /api/holdings/:holdingId/transactions` 持仓交易历史默认返回含已撤销在内的完整历史，传 `?includeCancelled=false` 仅看有效记录。

```bash
# 撤销一笔交易（返回已撤销交易与重算后的持仓快照）
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:38505/api/transactions/3/cancel

# 组合列表默认不显示已撤销交易；需要时显式带上
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:38505/api/portfolios/1/transactions?includeCancelled=true"
```

## 目录结构

```text
backend/src/
├── modules/
│   ├── auth/
│   ├── portfolios/
│   ├── holdings/
│   ├── transactions/
│   ├── market/
│   ├── reviews/
│   └── audit/
├── common/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   ├── decorators/
│   └── pipes/
├── config/
├── constants/
├── database/
│   ├── migrations/
│   └── seeds/
├── types/
├── utils/
├── app.module.ts
└── main.ts
```

## 环境变量

| 变量 | 说明 |
|---|---|
| `COMPOSE_PROJECT_NAME` | Compose 项目前缀，默认 `ldapi` |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | PostgreSQL 配置 |
| `DATABASE_URL` | TypeORM 连接串 |
| `REDIS_URL` | Redis 连接串 |
| `JWT_SECRET` | JWT 签名密钥 |
| `BACKEND_PORT` | 暴露端口，默认 38505 |

## Docker 说明

`docker-compose.yml` 无 `version:` 字段，顶层 `name: ldapi`。服务包括 PostgreSQL、Redis、backend，数据库与 Redis 使用命名卷持久化，后端 healthcheck 检查 `/api/health`。

## License

MIT
