// 自包含 marketplace.json 校验器：零依赖、单文件，供注册表仓库直接 vendor
// （不 import 本仓库源码）。规则镜像 src/lib/common/server/market-sources.ts
// 的 parseMarketplaceConfig —— 两处需保持同步。CLI 场景比运行时更严：
// 条目级问题即失败（运行时是跳过 + warning），repo url 现场解析平台。
import { readFileSync } from 'node:fs';

const PLUGIN_NAME_RE = /^[a-z0-9-]+$/;
const REPO_PART_RE = /^[A-Za-z0-9_.-]+$/;
const SHA256_RE = /^[0-9a-f]{64}$/i;

function isHttpUrl(s) {
	try {
		const u = new URL(s);
		return u.protocol === 'http:' || u.protocol === 'https:';
	} catch {
		return false;
	}
}

function urlScheme(s) {
	const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(s);
	return m ? m[1].toLowerCase() : null;
}

function parseRepoUrl(spec) {
	const s = spec
		.trim()
		.replace(/^https?:\/\//i, '')
		.replace(/\/+$/, '')
		.replace(/\.git$/i, '');
	const parts = s.split('/').filter(Boolean);
	if (parts.length < 2) return null;
	let host = 'github.com';
	if (parts[0].includes('.')) {
		host = parts[0].toLowerCase().replace(/^www\./, '');
		parts.shift();
	}
	if (parts.length !== 2) return null;
	const platform = host === 'github.com' ? 'github' : host === 'gitee.com' ? 'gitee' : null;
	if (!platform) return null;
	const [owner, repo] = parts;
	if (!REPO_PART_RE.test(owner) || !REPO_PART_RE.test(repo)) return null;
	return { platform, owner, repo };
}

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const file = args.find((a) => !a.startsWith('--')) ?? 'marketplace.json';

let raw;
try {
	raw = readFileSync(file, 'utf8');
} catch (e) {
	console.error(`✗ Cannot read ${file}: ${e instanceof Error ? e.message : String(e)}`);
	process.exit(1);
}

let json;
try {
	json = JSON.parse(raw);
} catch (e) {
	console.error(`✗ ${file} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
	process.exit(1);
}

const problems = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);

if (typeof json !== 'object' || json === null || Array.isArray(json)) {
	console.error(`✗ ${file}: top level must be a JSON object`);
	process.exit(1);
}
if (!Array.isArray(json.plugins)) {
	console.error(`✗ ${file}: "plugins" must be an array`);
	process.exit(1);
}

let staticCount = 0;
let repoCount = 0;
const seen = new Set();

json.plugins.forEach((item, i) => {
	const where = `plugin item #${i}`;
	if (typeof item !== 'object' || item === null || Array.isArray(item)) {
		fail(where, 'not an object');
		return;
	}
	if (item.type === 'static') {
		const label = typeof item.name === 'string' && item.name ? item.name : where;
		if (typeof item.name !== 'string' || !PLUGIN_NAME_RE.test(item.name)) {
			fail(where, `invalid name (must match ${PLUGIN_NAME_RE.source})`);
		} else if (seen.has(item.name)) {
			fail(where, `duplicate entry for "${item.name}" (only the first one would be kept)`);
		} else {
			seen.add(item.name);
			staticCount++;
		}
		if (typeof item.version !== 'string' || !item.version.trim()) fail(label, 'missing version');
		if (typeof item.download !== 'string' || !item.download.trim()) {
			fail(label, 'missing download');
		} else {
			const scheme = urlScheme(item.download);
			if (remote && scheme !== 'https') fail(label, 'remote config download must be https://');
			else if (!remote && scheme !== null && scheme !== 'http' && scheme !== 'https') {
				fail(label, `unsupported download scheme "${scheme}:"`);
			}
		}
		if (typeof item.sha256 !== 'string' || !SHA256_RE.test(item.sha256)) {
			fail(label, 'sha256 must be a 64-char hex digest');
		}
		if (
			item.homepage !== undefined &&
			(typeof item.homepage !== 'string' || !isHttpUrl(item.homepage))
		) {
			fail(label, 'homepage must be an http(s) URL');
		}
		if (
			item.size !== undefined &&
			(typeof item.size !== 'number' || !Number.isFinite(item.size) || item.size < 0)
		) {
			fail(label, 'size must be a non-negative number');
		}
		return;
	}
	if (item.type === 'repo') {
		if (typeof item.url !== 'string' || !item.url.trim()) {
			fail(where, 'missing url');
			return;
		}
		const key = `repo:${item.url}`;
		if (seen.has(key)) {
			fail(where, `duplicate entry for "${key}" (only the first one would be kept)`);
			return;
		}
		const parsed = parseRepoUrl(item.url);
		if (!parsed) fail(where, `url does not resolve to a github.com/gitee.com repo: "${item.url}"`);
		else repoCount++;
		if (
			item.name !== undefined &&
			(typeof item.name !== 'string' || !PLUGIN_NAME_RE.test(item.name))
		) {
			fail(where, `name must match ${PLUGIN_NAME_RE.source}`);
		}
		if (
			item.limit !== undefined &&
			(typeof item.limit !== 'number' || !Number.isInteger(item.limit) || item.limit < 1)
		) {
			fail(where, 'limit must be a positive integer');
		}
		return;
	}
	fail(where, `unknown type "${String(item.type)}"`);
});

if (problems.length > 0) {
	console.error(`✗ ${file} — ${problems.length} problem(s):`);
	for (const p of problems) console.error(`  - ${p}`);
	process.exit(1);
}

console.log(
	`✓ ${file} — ${staticCount + repoCount} plugin(s) valid (static: ${staticCount}, repo: ${repoCount})`
);
