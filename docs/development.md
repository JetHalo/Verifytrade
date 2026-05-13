# VerifyTrade · 开发文档

> zkVerify × TLSNotary 可验证交易项目
> Workshop demo + 可演化为产品

---

## 一、项目背景

### 1.1 项目目标

让用户通过 ZK-TLS（TLSNotary）证明自己在币安合约测试网（Binance Futures Testnet）某段时间的盈利情况，证明在 zkVerify 链上验证通过后，自动触发链上业务合约（排行榜、发奖等）。

### 1.2 项目定位

- **短期（workshop）**：上海线下活动现场让开发者动手起一套自己的 TLSNotary 基础设施，从生成证明到 zkVerify 验证全流程跑通
- **中期（PoC）**：作为 zkVerify 进入 ZK-TLS 市场的技术验证
- **长期（产品）**：可演化为公开的"可验证交易竞赛"市场活动

### 1.3 非目标（不做的事）

- ❌ 不做 zkPass / Primus 那种商业 ZK-TLS attestor 网络（那是几十人团队的工作量）
- ❌ 不做主网真实交易（合规风险 + 反作弊难度）
- ❌ 不做完整商业产品（这是 PoC / Workshop 教学材料）

---

## 二、整体架构

### 2.1 四层架构

```
[1] 数据获取层
    用户 → Prover CLI ↔ Notary Server (MPC) → Binance Futures Testnet (MPC-TLS)
    产出: TLSNotary Presentation

[2] 业务断言层
    TLSNotary Presentation → Noir 电路 (UltraHonk) → UltraHonk Proof
    断言: pnl > threshold && time ∈ [start, end] && commitment 绑定

[3] 验证层
    Presentation + UltraHonk Proof → zkVerify Chain
    产出: 跨链 attestation

[4] 业务结算层
    Attestation → Competition Contract (Solidity, Base/Arbitrum 测试网)
    动作: 更新 leaderboard + 发奖
```

### 2.2 模块清单

| 模块 | 技术栈 | 部署位置 | 职责 |
| --- | --- | --- | --- |
| `notary-server/` | TLSNotary Rust + Docker | Railway | MPC 签名服务 |
| `prover/` | Rust (基于 tlsn crates) | 用户本地 CLI | 抓 Binance 数据 + 生成 presentation |
| `circuit/` | Noir + UltraHonk | 本地编译 / 在线 prove | 业务断言电路 |
| `contracts/` | Solidity + Foundry | Base / Arbitrum 测试网 | 竞赛合约 |
| `scripts/` | TypeScript + zkverifyjs | 本地脚本 | zkVerify 提交、合约部署助手 |
| `frontend/` | Next.js 14 + wagmi + viem | Vercel | 用户界面 |

---

## 三、技术决策记录

### 3.1 ZK-TLS 选型：为什么 TLSNotary 而不是 zkPass

**结论：用 TLSNotary 自部署。**

**理由：**
1. **开源 + 自主可控** —— TLSNotary 是 PSE 维护的开源协议，无商业绑定
2. **战略契合 zkVerify** —— zkPass 已有自家链上 verifier，绕开 zkVerify；TLSNotary 没有部署 verifier，zkVerify 自然填空
3. **workshop 教学价值** —— "教大家起一套自己的 ZK-TLS"，TLSNotary 是唯一合适的选择
4. **后台靠山硬** —— PSE = Ethereum Foundation 直系，2025-09 重组后明确把 TLSNotary 列为 roadmap 核心项

**已知 caveat：**
- TLSNotary 单次 TLS 会话固定开销 ~20MB（MPC garbled circuit 开销，跟抓多少数据无关）
- 项目自我声明仍在 active development，有 breaking changes
- 性能上落后 zkPass（zkPass 用 VOLE-ZK 把开销砍到几十分之一）

### 3.2 交易数据源：Binance Futures Testnet

**结论：用合约（Futures）测试网，抓 `/fapi/v1/userTrades`。**

**为什么是合约而不是现货：**
- 合约的每笔交易有 `realizedPnl` 字段（Binance 替你算好的盈亏），电路只需求和
- 现货只有原始 buy/sell，要在电路里做 FIFO 配对，工程量爆炸

**为什么是测试网：**
- GitHub 一键登录，无 KYC，30 秒注册
- 自动赠送 10000 USDT + 1 BTC 测试代币
- 主网真实交易有合规风险（"交易竞赛"在某些司法管辖区敏感）

**目标 endpoint：** `testnet.binancefuture.com` 的 `/fapi/v1/userTrades`

### 3.3 时间周期参数化

**电路只编译一次，时间窗口作为 public input。**

- 同一个编译好的 Noir 电路支持无数场不同时间窗口的活动
- 合约里维护 `mapping(uint256 => Round)`，每场活动一个独立 ID + 独立参数
- 用户提交时必须传 `roundId`，合约校验 public input 等于该 round 的配置

### 3.4 反作弊设计（trust 闭环）

#### 3.4.1 两层证明的 commitment 绑定（最关键）

防止"作弊者随便填 pnl=9999 喂给电路"：

1. TLSNotary 在 presentation 里披露的不是原始字段，而是 `disclosed_commitment = poseidon(pnl, ts_start, ts_end, binance_uid)`
2. Noir 电路里加一行 assertion：`assert(poseidon(...) == disclosed_commitment)`
3. zkVerify 验证 presentation 时同时校验这个 commitment 在两边一致

#### 3.4.2 账号-钱包绑定

防止 A 拿 B 的交易记录冒充自己：

```
uid_binding_hash = poseidon(binance_uid, user_wallet_address)
```

电路里断言这个 hash 等于公开输入。同一币安账户只能绑定一个钱包提交。

#### 3.4.3 已知挡不住的攻击

- **多账户女巫**：testnet 注册成本接近 0，光靠链上绑定无解
  - 缓解：合约可加"账户年龄 ≥ N 月"判断（如果 schema 透出 createTime 字段）
  - 缓解：限制单钱包奖励上限
  - 真正解决要靠 KYC，超出 workshop 范围

---

## 四、数据流（端到端）

### 4.1 时序

```
T0: 活动方部署合约，开启 Round N（设定 periodStart, periodEnd, threshold）
T1: 用户在前端连钱包，填币安 UID
T2: 前端引导用户启动 Prover CLI
T3: CLI 连 Notary，引导用户登录 testnet.binancefuture.com，抓 /fapi/v1/userTrades 响应
T4: MPC 完成，CLI 输出 TLSNotary Presentation（含 disclosed_commitment）
T5: CLI 调用 Noir prover，生成 UltraHonk Proof
T6: 前端把 Presentation + Proof 一起调用 zkVerify 提交脚本
T7: zkVerify 验证通过，生成跨链 attestation 推送到目标链
T8: 用户在前端点 submitProof(roundId, attestationRef, publicInputs)
T9: 合约校验 public inputs 等于 Round 配置 → 验 attestation → 更新 leaderboard
T10: 活动结束后用户点 claimReward，合约按排名发奖
```

### 4.2 关键字段流转

| 字段 | 由谁产生 | 由谁验证 | 作用 |
| --- | --- | --- | --- |
| `disclosed_commitment` | TLSNotary prover（用 poseidon hash 私有字段）| zkVerify + Noir 电路 | 两层证明绑定 |
| `uid_binding_hash` | 前端（poseidon(uid, wallet)）| Noir 电路 + 合约 | 账号锁定 |
| `roundId` | 用户提交时指定 | 合约 | 区分多场活动 |
| `pnl, time` | Binance 响应里的字段 | Noir 电路 + commitment | 业务断言 |

---

## 五、开发环境准备

### 5.1 必装工具

```bash
# Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Noir
curl -L noirup.dev | bash
noirup

# Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Node.js >= 20
nvm install 20
nvm use 20

# pnpm（推荐，比 npm 快）
npm i -g pnpm

# Railway CLI（可选，用 web 界面也行）
npm i -g @railway/cli
```

### 5.2 仓库初始化（已完成）

```bash
git init
git add .
git commit -m "init veirfytrade scaffold"
```

### 5.3 各模块依赖安装

```bash
# circuit
cd circuit && nargo check

# prover
cd prover && cargo build --release

# contracts
cd contracts && forge install

# frontend
cd frontend && pnpm install

# scripts
cd scripts && pnpm install
```

---

## 六、模块开发指南

### 6.1 `notary-server/` — Notary 服务

**目标：** 用一键 Docker 部署到 Railway，参与者点 Deploy 按钮就能起自己的 Notary。

**关键文件：**
- `Dockerfile` —— 基于 tlsn 官方 notary-server 镜像
- `railway.toml` —— Railway 配置（端口、健康检查）
- `notary-config.yaml` —— Notary 服务配置
- `README.md` —— 含 Deploy to Railway 按钮

**部署步骤：**
1. Fork TLSNotary 官方 [tlsn](https://github.com/tlsnotary/tlsn) 仓库（或基于其 Docker 镜像）
2. 把本目录配置文件提交到自己的 fork
3. 在 Railway 用 "Deploy from GitHub" 选这个 fork
4. Railway 自动 build + 分配公网 HTTPS URL（形如 `xxxxx.up.railway.app`）

**配置注意：**
- Notary signing key 通过环境变量 `NOTARY_SIGNING_KEY_BASE64` 传入（避免提交到 repo）
- 端口默认 `7047`，需要在 `railway.toml` 里暴露
- WebSocket 需要 `wss://`（Railway 默认带 SSL）

### 6.2 `circuit/` — Noir 业务断言电路

**目标：** 验证用户提交的合约交易数据满足"时间窗口内总 PnL > threshold"，并和 TLSNotary commitment 绑定。

**关键文件：**
- `Nargo.toml` —— Noir 项目配置
- `src/main.nr` —— 主电路代码
- `Prover.toml` —— prover 测试输入（gitignore 真实数据）

**电路签名：**

```rust
fn main(
    // 私有输入（来自 TLSNotary 披露）
    trades_pnl:  [i64; 100],
    trades_time: [u64; 100],
    binance_uid: Field,

    // 公开输入（来自合约 Round 配置）
    threshold:           pub i64,
    period_start:        pub u64,
    period_end:          pub u64,
    user_wallet:         pub Field,
    uid_binding_hash:    pub Field,
    disclosed_commitment: pub Field,
)
```

**断言：**
1. `sum(trades_pnl where time ∈ [start, end]) > threshold`
2. `poseidon(binance_uid, user_wallet) == uid_binding_hash`
3. `poseidon(trades_pnl, trades_time, binance_uid) == disclosed_commitment`

**编译 & 测试：**
```bash
cd circuit
nargo check                  # 语法检查
nargo execute                # 用 Prover.toml 跑一遍
nargo prove                  # 生成 UltraHonk proof
nargo verify                 # 本地验证
```

### 6.3 `prover/` — Prover CLI

**目标：** Rust 二进制，引导用户登录 Binance、跑 MPC-TLS、生成 TLSNotary presentation，再调 Noir 生成 UltraHonk proof。

**关键文件：**
- `Cargo.toml` —— 依赖 tlsn-core, tlsn-prover 等
- `src/main.rs` —— CLI 入口
- `src/binance.rs` —— Binance endpoint 抓取逻辑
- `src/commitment.rs` —— Poseidon commitment 计算（要和电路里一致）
- `config.toml.example` —— 配置模板

**用户流程：**
```
$ ./veirfytrade-prover --notary https://my-notary.up.railway.app \
                       --round-id 0 \
                       --wallet 0xABC...
> 请在浏览器登录 testnet.binancefuture.com 并复制 cookie 字符串
> [paste cookie]
> 正在通过 MPC-TLS 抓取 /fapi/v1/userTrades ...
> 正在生成 TLSNotary presentation ...
> 正在生成 UltraHonk proof ...
> ✓ 完成。输出文件: ./output/proof-bundle.json
```

**输出 bundle 结构：**
```json
{
  "tlsnPresentation": "<base64>",
  "ultrahonkProof":   "<base64>",
  "publicInputs": {
    "threshold": "...",
    "periodStart": "...",
    "periodEnd": "...",
    "userWallet": "0xABC...",
    "uidBindingHash": "...",
    "disclosedCommitment": "..."
  },
  "roundId": 0
}
```

### 6.4 `contracts/` — Solidity 竞赛合约

**目标：** 多 Round 管理 + 提交验证 + 发奖。

**关键合约：**
- `Competition.sol` —— 主合约
- `IZkVerifyAttestor.sol` —— zkVerify 跨链 attestor 接口
- `MockZkVerify.sol` —— 本地测试用 mock

**核心接口：**

```solidity
function createRound(uint64 periodStart, uint64 periodEnd, int64 threshold, uint256 rewardPool)
    external onlyOwner returns (uint256 roundId);

function submitProof(
    uint256 roundId,
    bytes32 attestationId,         // zkVerify 验证后返回的 ID
    int64   publicThreshold,
    uint64  publicPeriodStart,
    uint64  publicPeriodEnd,
    bytes32 publicUidBindingHash,
    bytes32 publicDisclosedCommitment,
    int64   pnl                    // 用户声称的 PnL（用于排名）
) external;

function claimReward(uint256 roundId) external;
function getLeaderboard(uint256 roundId, uint256 topN) external view returns (...);
```

**部署目标：** Base Sepolia 测试网（gas 便宜，UX 好）

### 6.5 `scripts/` — zkVerify 集成 + 部署助手

**目标：** TypeScript 脚本封装 zkVerify SDK 调用 + 合约部署。

**关键脚本：**
- `submit-to-zkverify.ts` —— 把 prover 输出的 bundle 提交到 zkVerify
- `deploy-contract.ts` —— 部署 Competition 合约
- `create-round.ts` —— 管理员开 Round
- `mock-data-generator.ts` —— 生成测试用 trade 数据（workshop 演示用）

### 6.6 `frontend/` — Next.js Web App

**目标：** 用户参与活动的 UI。

**技术栈：**
- Next.js 14 (App Router)
- wagmi + viem（钱包连接 + 合约交互）
- RainbowKit（钱包 UI）
- TailwindCSS（样式）
- shadcn/ui（组件库）

**关键页面：**
- `app/page.tsx` —— 活动首页 + 当前 Round 状态
- `app/submit/page.tsx` —— 提交证明流程引导
- `app/leaderboard/[roundId]/page.tsx` —— 排行榜
- `app/profile/page.tsx` —— 用户中心

**关键交互：**
1. 连钱包（RainbowKit）
2. 选择 Round
3. 引导下载 Prover CLI
4. 上传 proof bundle JSON
5. 调用合约 `submitProof` 并签名交易
6. 显示提交状态 + leaderboard 排名

---

## 七、部署清单

### 7.1 一次性部署（活动方做）

```
□ 1. fork TLSNotary 主仓库（或本仓库的 notary-server 子目录）
□ 2. Notary signing key 生成并配置到 Railway 环境变量
□ 3. Notary server 部署到 Railway，记录公网 URL
□ 4. Circuit 编译 + verifier 注册到 zkVerify 测试网
□ 5. Competition 合约部署到 Base Sepolia
□ 6. 管理员调 createRound 开第一期活动
□ 7. Frontend 部署到 Vercel，配置环境变量（合约地址、Notary URL 等）
```

### 7.2 每个用户做（workshop 现场）

```
□ 1. 注册 testnet.binancefuture.com（GitHub 一键登录）
□ 2. 领测试 USDT，下几单合约交易
□ 3. 下载 Prover CLI 二进制
□ 4. 跑 CLI 生成 proof bundle
□ 5. 在 frontend 上传 bundle + 签名 submitProof
□ 6. 等活动结束 claim 奖励
```

---

## 八、Workshop 流程（90 分钟版）

| 时段 | 内容 | 产出 |
| --- | --- | --- |
| 0–10 min | 项目介绍 + 整体架构讲解 | 大家理解每个组件干嘛 |
| 10–25 min | 每人 fork 仓库 + Railway 一键部署自己的 Notary | 每人有自己的 notary URL |
| 25–50 min | 注册 Binance Futures Testnet + 跑 prover CLI | 每人有一份 proof bundle |
| 50–75 min | （讲师演示）Noir 电路 + zkVerify 提交流程 + 合约 submitProof | 每人在 leaderboard 上看到自己 |
| 75–90 min | Q&A + 进阶讨论（反作弊、性能优化、扩展场景）| —— |

**前置准备（参与者活动前要做）：**
- 准备一台笔记本（建议内存 ≥ 8GB）
- 提前装好 Docker、Rust、Node.js
- 注册 Railway 账号
- 准备一个 EVM 钱包（MetaMask）+ 领 Base Sepolia 测试 ETH

---

## 九、待解决问题（开放项）

### 9.1 技术开放项

- [ ] **zkVerify 对 TLSNotary 的 verifier 支持** —— 当前 zkVerify 原生支持的证明系统里没有 TLSNotary 的 garbled circuit + selective disclosure，需要：
  - 选项 A：推动 zkVerify 加 TLSNotary verifier pallet（产品决策）
  - 选项 B：在 Noir 电路里 wrap TLSNotary 验证（工程量大，电路里做 ECDSA + Merkle 都很贵）
  - 选项 C：先让 zkVerify 只验 Noir 的 UltraHonk proof，TLSNotary 验证外置（演示足够，trust 模型稍弱）
  - **当前 PoC 采用选项 C，长期推选项 A**

- [ ] **可变长度交易数组** —— 当前电路定长 100 条，需要 padding + valid flag

- [ ] **PnL 整数化** —— USDT 带小数，电路只支持整数，需要 ×1e8 转换

- [ ] **Poseidon 性能** —— 100 次 hash chain 让 prover 时间增加，长期可换 Merkle tree

### 9.2 产品/运营开放项

- [ ] **反女巫策略** —— testnet 账户无成本，需要设计 fallback（KYC？资历门槛？）
- [ ] **奖励池来源** —— 谁出钱？zkVerify 市场预算？合作方？
- [ ] **合规审查** —— "交易竞赛"在不同司法管辖区合规风险评估

---

## 十、参考资源

- [TLSNotary 官方文档](https://tlsnotary.github.io/docs-mdbook/)
- [TLSNotary GitHub](https://github.com/tlsnotary/tlsn)
- [PSE TLSNotary 项目页](https://pse.dev/projects/tlsn)
- [Noir 文档](https://noir-lang.org/)
- [zkVerify 文档](https://docs.zkverify.io/)
- [Binance Futures Testnet](https://testnet.binancefuture.com/)
- [Base Sepolia 测试网](https://docs.base.org/network-information)

---

## 附录 A：架构图

参见同目录下 `architecture.html`（用浏览器打开）。

## 附录 B：术语表

- **MPC-TLS**：用 MPC（多方计算）让两方（Prover + Notary）共同建立 TLS 连接
- **Garbled Circuit**：一种 MPC 原语，把布尔电路加密成查找表
- **Presentation**：TLSNotary 输出的"证明包"，包含签名、披露数据、内部 ZK proof
- **UltraHonk**：Aztec 团队的 SNARK 后端，浏览器友好
- **Poseidon**：ZK 友好的哈希函数（比 SHA-256 在电路里便宜得多）
- **Attestation**：经过验证的"声明"，可以跨链传递

---

*文档版本：v0.1 · 2026-05-13*
