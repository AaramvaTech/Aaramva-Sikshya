const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch only the workspace packages + hoisted node_modules — NOT the whole
// monorepo root. Watching monorepoRoot pulls in tools/minio/data, whose
// .minio.sys/tmp churns ephemeral files; Metro's Windows fallback watcher
// crashes (ENOENT) trying to fs.watch a temp file MinIO already deleted.
config.watchFolders = [
  ...(config.watchFolders ?? []),
  path.resolve(monorepoRoot, 'packages'),
  path.resolve(monorepoRoot, 'node_modules'),
];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = withNativeWind(config, { input: './global.css' });
