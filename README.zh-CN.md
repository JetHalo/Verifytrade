# VerifyTrade

> 用 ZK-TLS 在链上证明你的 Binance 实盘盈亏 · 不暴露账户 · 不暴露策略 · 不暴露具体交易

[English](./README.md) · [中文](./README.zh-CN.md)

Mu Shang Hai zkVerify Workshop 的完整代码仓库 —— TLSNotary + Noir + UltraHonk + zkVerify Volta，端到端可跑通的 Verifiable PnL Platform。

---

## 这个项目在做什么

听众提交一笔自己的 Binance Futures 实盘 PnL，背后会跑完整套 ZK 流程：

1. **TLSNotary** 通过浏览器扩展抓 `binance.com` 的真实 response（MPC-TLS 模式，verifier 看不到明文）
2. **Noir + UltraHonk** 在浏览器内出 proof，证明三个指标（成交笔数 / 总成交量 / 实盘 PnL）来自那次 TLS session
3. **zkVerify Volta** 主链一次验证，返回 `aggregationId`
4. **公开排行榜**展示三个数字，每一行带 zkVerify 链上 attestation 链接

完整链路约 1-2 分钟跑完一遍。

---

## 仓库结构 · 两个 Repo 配合用

这个 Workshop 需要 **两个 Repo** 一起跑：

| Repo | 干什么 | 状态 |
|---|---|---|
| **`Verifytrade`**（当前仓库）| 前端 + 电路 + 浏览器插件 | 本地跑，需要自己 `pnpm install` 起来 |
| **[`zktls_sever`](https://github.com/JetHalo/zktls_sever)** | TLSNotary verifier server | 部署到 Railway（必须 Singapore region）|

**两者的关系**：当前仓库的 `frontend/lib/tlsn-provider.ts` 会通过 WebSocket 连接到 `zktls_sever` 部署的 verifier URL，做 MPC-TLS 握手。

---

## 快速开始

### 0 · 前置依赖

| 工具 | 版本 |
|---|---|
| **Node.js** | ≥ 20 |
| **pnpm** | ≥ 9 |
| **TLSNotary 浏览器扩展** | **必须 0.1.0.1500**（见 [Tips](#tips--常见坑)）|
| **Binance 账号** | 登录 `binance.com` 并开过期货账户 |

> 你不需要装 Noir、Barretenberg、Rust。电路产物（`vk` + `circuit.json`）和插件产物都已经在仓库里编译好了。

### 1 · Clone 仓库

```bash
git clone https://github.com/JetHalo/Verifytrade.git
cd Verifytrade
```

### 2 · 部署你自己的 TLSNotary verifier

去 **[JetHalo/zktls_sever](https://github.com/JetHalo/zktls_sever)** 这个 repo，按它的 README 部署到 Railway：

1. Fork `JetHalo/zktls_sever` 到你自己 GitHub
2. Railway 选 "Deploy from GitHub" → 选 fork 后的 repo
3. **Region 一定选 Singapore**（美区 IP 会被 Binance 451 拒掉）
4. 部署完拿到 URL，比如 `wss://your-verifier.up.railway.app`

### 3 · 配置环境变量

```bash
cd frontend
cp .env.example .env.local
```

打开 `.env.local`，**填两个变量**：

| 变量 | 必填 | 说明 | 怎么拿 |
|---|---|---|---|
| `ZKVERIFY_SEED` | ✅ | zkVerify Volta 测试网账号的 12 词助记词 | [docs.zkverify.io/network/testnet](https://docs.zkverify.io/network/testnet) 注册账号，导出 seed phrase |
| `NEXT_PUBLIC_DEFAULT_NOTARY_URL` | ✅ | step 2 拿到的 Railway verifier URL | `wss://your-verifier.up.railway.app` |

⚠ `.env.local` **永远不要 commit**（已在 `.gitignore` 里）。如果你的 `ZKVERIFY_SEED` 不小心 push 出去了，立刻去 Volta 换一个新账号。

### 4 · 装 TLSNotary 浏览器扩展

⚠ **必须装 0.1.0.1500 这个特定版本**。新版会跟 alpha.15 verifier 协议握手失败。

- Chrome Web Store: [TLSNotary Extension](https://chromewebstore.google.com/detail/tlsnotary/gnoglgpcamodhflknhmafmjdahcejcgg)
- 如果商店已经升级到新版，去 TLSNotary GitHub releases 下 0.1.0.1500 的 `.crx` 手动装

### 5 · 起前端

```bash
cd frontend
pnpm install
pnpm dev -p 3500
```

浏览器开 **http://localhost:3500**。

### 6 · 跑通一笔

1. 浏览器**先登录 binance.com**（用真实账号）
2. 回到 `localhost:3500/submit`，点开任意一个 round
3. 点 **Notarize** 按钮
4. TLSNotary 扩展弹窗，点 Approve
5. MPC-TLS 跑约 1 分钟，浏览器内生成 UltraHonk proof
6. Proof 自动提交到 zkVerify Volta，等约 30 秒拿到 `aggregationId`
7. Leaderboard 自动刷新，你的成绩出现在那一行
8. 点 attestation 链接跳到 zkVerify Volta explorer，看到链上验证记录

---

## 完整链路示意

```
浏览器扩展 (Notarize)
    ↓ MPC-TLS
TLSNotary Verifier (Railway Singapore) ← zktls_sever 部署的
    ↓ attestation
浏览器内 (Noir circuit + UltraHonk prover)
    ↓ proof + vk + publicInputs
zkVerify Volta 主链
    ↓ aggregationId
Next.js API (data/state.json 排行榜)
    ↓
http://localhost:3500/leaderboard/{roundId}
```

---

## Tips · 常见坑

### 1 · TLSNotary 扩展版本必须是 0.1.0.1500

新版（0.1.0.1501+）跟 alpha.15 verifier 协议握手失败。Chrome Web Store 如果已经升级了，从 [TLSNotary releases](https://github.com/tlsnotary/tlsn-extension/releases) 下 `tlsn-extension-0.1.0.1500.zip`，解压后 chrome://extensions 里 "Load unpacked"。

### 2 · Verifier 必须在亚洲 region

Binance 对部分美区 IP 直接返回 451。Railway 默认是 us-west2，要在 deploy 设置里手动改成 **asia-southeast1 (Singapore)**。`zktls_sever` 的 `railway.toml` 已经 pin 了。

### 3 · pnpm + Next.js 的 webpack 报错

如果起 frontend 时遇到 `__webpack_require__.U is not a constructor`：

```bash
# frontend 目录加 .npmrc 让 pnpm 摊平依赖
cd frontend
echo 'shamefully-hoist=true' > .npmrc
echo 'node-linker=hoisted' >> .npmrc

rm -rf node_modules .next pnpm-lock.yaml
pnpm install
pnpm dev -p 3500
```

---

## 项目结构

```
Verifytrade/
├── README.md
├── .gitignore
├── circuit/                Noir UltraHonk 电路
│   ├── src/main.nr         3 指标 + Poseidon commitment
│   ├── Nargo.toml
│   └── target/             ← 编译产物已 commit（vk + circuit.json）
├── plugin/                 TLSNotary 浏览器插件配置
│   ├── src/index.ts
│   ├── config.json         声明要拦截的 binance.com 接口
│   └── dist/               ← 编译产物已 commit
└── frontend/               Next.js 14 前端（主战场）
    ├── app/
    │   ├── submit/         提交一笔 PnL
    │   ├── rounds/         round 列表
    │   ├── leaderboard/    排行榜
    │   ├── admin/          管理员创建 round
    │   └── api/            JSON 文件存储 API
    ├── lib/
    │   ├── tlsn-provider.ts    跟 TLSNotary 扩展通信
    │   ├── prover-browser.ts   Noir + UltraHonk 浏览器内出 proof
    │   ├── zkverify-server.ts  zkverifyjs 推到 Volta
    │   └── storage.ts          JSON 文件 CRUD
    └── data/
        ├── state.json      所有 rounds + submissions（runtime · 已 gitignore）
        └── vk              UltraHonk verification key（自动从 circuit/ 同步）
```

---

## 进阶 · 自己改电路

如果想修改 `circuit/src/main.nr` 加新的约束，要装一下编译工具链：

```bash
# Noir
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup -v 1.0.0-beta.6

# Barretenberg
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/bbup/install | bash
bbup -v 0.84.0

# 编译 + 生成新 VK
cd circuit
nargo compile
bb write_vk --scheme ultra_honk --oracle_hash keccak \
  -b target/circuit.json -o target/proof_out/
```

⚠ **bb 必须 0.84.0**，zkVerify Volta 当前只支持 0.84.x。`--oracle_hash keccak` 也是必须 —— zkVerify 用 Keccak256 不是 Poseidon2。

`pnpm dev` 启动时 `predev` 钩子会把新产物同步到 `frontend/data/vk`。

---

## 相关链接

- **TLSNotary Verifier Server**：[JetHalo/zktls_sever](https://github.com/JetHalo/zktls_sever)
- **zkVerify 文档**：[docs.zkverify.io](https://docs.zkverify.io)
- **Noir 文档**：[noir-lang.org](https://noir-lang.org)
- **TLSNotary 文档**：[docs.tlsnotary.org](https://docs.tlsnotary.org)

---

## License

MIT
