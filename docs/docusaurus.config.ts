import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Dungeon Lord',
  tagline: '财经大V观点分析系统 — 爬虫 + RAG 问答',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://dungeon-lord.dev',
  baseUrl: '/',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'zh-Hans',
    locales: ['zh-Hans'],
  },

  themes: ['@docusaurus/theme-mermaid'],

  markdown: {
    mermaid: true,
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Dungeon Lord',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: '文档',
        },
        {
          href: 'https://github.com',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: '文档',
          items: [
            { label: '快速开始', to: '/intro' },
            { label: '架构设计', to: '/architecture' },
          ],
        },
        {
          title: '技术栈',
          items: [
            { label: 'FastAPI', href: 'https://fastapi.tiangolo.com/' },
            { label: 'React', href: 'https://react.dev/' },
            { label: 'Docusaurus', href: 'https://docusaurus.io/' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Dungeon Lord`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['python', 'typescript', 'json', 'bash'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
