# 氧气瓶转运放行判定器

转运前临时更换氧气瓶时，呼吸治疗师可用本工具快速判断瓶内余量能否覆盖计划转运时长。
纯前端实现（TypeScript + React + Vite），计算、校验与界面均在浏览器本地完成，**不调用任何业务后端或在线服务**。

## 计算说明

```
可用分钟数 = ⌊ 瓶常数 ×（当前压力 − 保留压力）÷ 流量 ⌋   （向下取整到整数分钟）
```

- **可用分钟数 ≥ 最低保障分钟数** → **放行**，并显示整数余量（可用 − 最低保障）；
- 否则 → **不放行**，并显示整数短缺（最低保障 − 可用）。

### 单位示例

| 参数 | 单位 | 示例值 |
| --- | --- | --- |
| 瓶常数 | 升/巴 | 10 |
| 当前压力 | 巴 | 150 |
| 保留压力 | 巴 | 50 |
| 流量 | 升/分钟 | 5 |
| 最低保障分钟数 | 分钟 | 120 |

代入：可用分钟数 = ⌊10 × (150 − 50) ÷ 5⌋ = **200 分钟** ≥ 120 分钟 → **放行，余量 80 分钟**。

若流量改为 3 升/分钟：⌊10 × 100 ÷ 3⌋ = ⌊333.33…⌋ = **333 分钟**；最低保障 334 分钟时 → **不放行，短缺 1 分钟**。

## 输入校验规则

- 所有字段必须为**有限的非负数字**（拒绝空值、非数字、负数、±Infinity、NaN）；
- **瓶常数**与**流量**必须大于 0；
- **保留压力不得高于当前压力**；
- **最低保障分钟数**须为非负整数（保证余量/短缺为整数分钟）；
- 任一输入非法：阻止计算、禁用计算按钮并清除旧结论；
- 合法结果生成后修改任意字段：旧结论立即隐藏，页面标记“参数已修改，待重新计算”，
  页面只呈现与当前参数对应的放行/不放行结果。

## 本地开发

```bash
npm install
npm run dev        # 开发服务器
npm run test       # Vitest 单元测试（计算与校验边界）
npm run build      # 类型检查 + 生产构建
npx playwright install chromium   # 首次运行端到端测试前
npm run test:e2e   # Playwright 端到端测试（自动启动 vite preview）
npm run verify     # 一次性验收：单元测试 + 构建 + 端到端测试
```

## Docker 运行

```bash
# 启动 web 服务，宿主端口由 WEB_PORT 覆盖（缺省 8080）
WEB_PORT=9000 docker compose up web
# 访问 http://localhost:9000

# 一次性验收服务：构建 web 镜像，跑完单元测试与端到端测试后退出，
# 退出码即验收结果
docker compose up --build --exit-code-from verify verify
```

`verify` 服务基于官方 Playwright 镜像（自带 Chromium），依次执行
`vitest run`、`tsc + vite build`，再以 `http://web` 为目标运行 Playwright 端到端测试。

## 目录结构

```
src/lib/calculator.ts        计算与校验纯函数（公式、取整、判定）
src/lib/calculator.test.ts   Vitest 边界测试
src/App.tsx                  表单、校验提示、放行/不放行与待重算状态
e2e/calculator.spec.ts       Playwright 输入与改值流程测试
Dockerfile                   web 静态站点镜像（nginx）
Dockerfile.verify            一次性验收镜像
docker-compose.yml           web（WEB_PORT 覆盖宿主端口）+ verify 服务
```
