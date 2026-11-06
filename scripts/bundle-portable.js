const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('[*] 正在构建 LocalAffectiveEngine 独立免安装绿色客户端...');
console.log('====================================================');

const projectRoot = path.join(__dirname, '..');
const electronDist = path.join(projectRoot, 'node_modules', 'electron', 'dist');
const outputDir = path.join(projectRoot, 'dist-desktop', 'win-unpacked');

if (!fs.existsSync(electronDist)) {
  console.error('[错误] 未找到 Electron 原生运行时目录，请先执行 npm install');
  process.exit(1);
}

// 递归复制目录辅助函数
function copyRecursive(src, dest, filterFn) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (filterFn && !filterFn(srcPath, entry.name)) {
      continue;
    }

    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath, filterFn);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 1. 准备输出目录
console.log('[1/4] 初始化客户端免安装目标目录: dist-desktop/win-unpacked');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 2. 复制官方 Electron 运行时（排除 default_app.asar）
console.log('[2/4] 复制 Electron 内置 Node.js / Chromium 原生运行时...');
copyRecursive(electronDist, outputDir, (_full, name) => {
  return name !== 'default_app.asar';
});

// 重命名 electron.exe 为 LocalAffectiveEngine.exe
const defaultExe = path.join(outputDir, 'electron.exe');
const targetExe = path.join(outputDir, 'LocalAffectiveEngine.exe');
if (fs.existsSync(defaultExe)) {
  if (fs.existsSync(targetExe)) {
    try { fs.unlinkSync(targetExe); } catch {}
  }
  fs.renameSync(defaultExe, targetExe);
}

// 3. 部署应用资源至 resources/app
console.log('[3/4] 部署伴生引擎后端与桌面界面至 resources/app...');
const appTarget = path.join(outputDir, 'resources', 'app');
if (!fs.existsSync(appTarget)) {
  fs.mkdirSync(appTarget, { recursive: true });
}

// 复制构建产物与配置
const appDirs = ['dist', 'dist-electron', 'public', 'electron'];
for (const dir of appDirs) {
  const s = path.join(projectRoot, dir);
  const d = path.join(appTarget, dir);
  if (fs.existsSync(s)) {
    copyRecursive(s, d);
  }
}

// 复制必要单文件
const appFiles = ['package.json', '.env.example'];
for (const file of appFiles) {
  const s = path.join(projectRoot, file);
  const d = path.join(appTarget, file);
  if (fs.existsSync(s)) {
    fs.copyFileSync(s, d);
  }
}

// 4. 复制生产运行时依赖 node_modules（排除 electron 和开发构建包）
console.log('[4/4] 注入原生驱动与依赖 (better-sqlite3, sqlite-vec, hono 等)...');
const srcNodeModules = path.join(projectRoot, 'node_modules');
const destNodeModules = path.join(appTarget, 'node_modules');

// 排除开发专属工具，极大缩减免安装包体积
const devOnlyModules = new Set([
  'electron',
  'electron-builder',
  'app-builder-bin',
  'typescript',
  'tsx',
  'esbuild',
  '@types',
  '7zip-bin',
]);

copyRecursive(srcNodeModules, destNodeModules, (_full, name) => {
  return !devOnlyModules.has(name);
});

console.log('====================================================');
console.log('[完成] 客户端免安装绿色包已就绪！');
console.log(`位置: ${outputDir}`);
console.log(`主程序: ${targetExe}`);
console.log('====================================================');
