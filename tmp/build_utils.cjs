const esbuild = require('esbuild');
esbuild.build({
  entryPoints: ['src/pages/DashboardCommon/RobotMarkdown/utils.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'tmp/utils.bundle.cjs',
  logLevel: 'silent',
  plugins: [{
    name: 'stub-rightview',
    setup(build) {
      build.onResolve({ filter: /RightView\/RightView$/ }, () => ({
        path: require('path').resolve('tmp/rightview-stub.cjs'),
      }));
    },
  }],
}).then(() => console.log('BUILD OK'));
