import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const sdk = fileURLToPath(new URL('../artifacts/live2d-readiness/sdk-r5/CubismSdkForWeb-5-r.5', import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL('./live2d-lab/sdk-preview', import.meta.url)),
  base: './', publicDir: false,
  resolve: { alias: { '@framework': path.join(sdk, 'Framework/src') } },
  plugins: [{ name: 'daymate-fixed-sdk-sample', enforce: 'pre',
    buildStart() {
      if (!fs.existsSync(path.join(sdk, 'Core/live2dcubismcore.js'))) throw Error('请先准备官方 Cubism SDK for Web R5，参见 docs/LIVE2D_LAB.md。');
    },
    closeBundle() {
      const output = fileURLToPath(new URL('../artifacts/live2d-lab', import.meta.url));
      fs.mkdirSync(path.join(output, 'sdk-preview/Core'), { recursive: true });
      fs.copyFileSync(path.join(sdk, 'Core/live2dcubismcore.js'), path.join(output, 'sdk-preview/Core/live2dcubismcore.js'));
      for (const relative of ['Resources/Haru', 'Resources/back_class_normal.png', 'Resources/icon_gear.png']) {
        const destination = path.join(output, 'sdk-assets', relative);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.cpSync(path.join(sdk, 'Samples', relative), destination, { recursive: true });
      }
      fs.cpSync(path.join(sdk, 'Framework/Shaders/WebGL'), path.join(output, 'sdk-assets/Framework/Shaders/WebGL'), { recursive: true });
      fs.copyFileSync(path.join(sdk, 'LICENSE.md'), path.join(output, 'SDK-LICENSE.md'));
    },
  }],
  build: { outDir: '../../../artifacts/live2d-lab/sdk-preview', emptyOutDir: false },
});
