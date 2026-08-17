import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(async ({ command }) => {
  const { sites } = await import('@openai/sites-vite-plugin');
  const plugins = [
    react({
      // antd 5.x 使用 less，无需 extra babel 插件
    }),
    sites(),
  ];

  if (command === 'build') {
    const { cloudflare } = await import('@cloudflare/vite-plugin');
    plugins.push(...cloudflare({
      viteEnvironment: {
        name: 'server',
      },
      config: {
        main: './worker/index.ts',
        compatibility_date: '2026-08-16',
        assets: {
          binding: 'ASSETS',
          not_found_handling: 'single-page-application',
        },
      },
    }));
  }

  return {
    plugins,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
    environments: {
      server: {
        build: {
          rolldownOptions: {
            output: {
              entryFileNames: 'index.js',
            },
          },
        },
      },
    },
  };
});
