# sveltecms-marketplace

[SvelteCMS](https://github.com/hongweifei/sveltecms-starter) 官方插件市场目录。
`marketplace.json` 是市场数据的单一事实源——每个 SvelteCMS 站点的后台
「插件市场」页从这里拉取最新插件列表。

## 站长：接入本市场

在站点 `cms.config.ts` 里加一行：

```ts
export default defineCMSConfig({
	// ...
	marketplace: 'https://raw.githubusercontent.com/hongweifei/sveltecms-marketplace/main/marketplace.json'
});
```

后台 `/admin/plugin-market` 即可浏览、搜索、一键安装市场里的插件。
目录数据带 60s 缓存，拉取失败自动回退上次成功的快照。

## 插件开发者：收录你的插件

### 前置：让仓库可安装

1. 插件仓库里至少有 `plugin.ts`（插件入口）与 `schema.ts`（数据表，可选）；
2. 发一个 GitHub Release，附上打包好的 `.zip` —— **zip 根目录必须直接是
   `plugin.ts`**（嵌套一层目录会安装失败）；
3. （推荐）给仓库打 topic 标签 **`sveltecms-plugin`**，方便被检索发现。

打包参考（在插件目录执行，zip 内容落在根目录）：

```bash
node -e "const AdmZip=require('adm-zip');const z=new AdmZip();z.addLocalFolder('.');z.writeZip('your-plugin.zip')"
```

### 收录：提一个 PR

编辑 [`marketplace.json`](./marketplace.json)，在 `plugins` 数组里加一条：

```json
{ "type": "repo", "url": "github.com/you/your-plugin" }
```

只需要仓库地址——版本号、下载地址都不用写。此后你每次发 Release
（非 draft、非 prerelease，含 `.zip` 资产），市场自动展示最新版。

PR 会由 CI 自动校验（`scripts/market-validate.mjs`），非法条目无法合并。
合并即上架。

### 可选：钉哈希条目（static）

默认的 `repo` 条目安装时依赖 HTTPS 传输完整性（卡片会标「未固定哈希」）。
若希望给出更强的完整性保证，可提交 `static` 条目——直接给全量信息并把
zip 的 SHA-256 钉死：

```json
{
	"type": "static",
	"name": "your-plugin",
	"version": "1.0.0",
	"download": "https://github.com/you/your-plugin/releases/download/v1.0.0/your-plugin.zip",
	"sha256": "<64 位十六进制>"
}
```

计算哈希：`node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('your-plugin.zip')).digest('hex'))"`

`static` 条目的版本不会随 Release 自动更新，每次发版需要提 PR 更新。

## 仓库结构

```
marketplace.json              市场数据（唯一需要编辑的文件）
scripts/market-validate.mjs   零依赖校验脚本（CI 与本地共用）
.github/workflows/validate.yml  PR / push 自动校验
```

本地校验：

```bash
node scripts/market-validate.mjs marketplace.json --remote
```

## 规划

- 按 topic `sveltecms-plugin` 自动搜集仓库（爬虫产出 repo 条目、CI 把关，
  待生态信号启动）。
