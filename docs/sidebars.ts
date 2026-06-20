import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'intro',
    {
      type: 'category',
      label: '快速开始',
      items: [
        'guides/installation',
        'guides/configuration',
        'guides/first-run',
      ],
    },
    {
      type: 'category',
      label: '架构设计',
      items: [
        'architecture/overview',
        'architecture/data-flow',
        'architecture/frontend',
        'architecture/backend',
      ],
    },
    {
      type: 'category',
      label: 'RAG 系统',
      items: [
        'rag/overview',
        'rag/embedding',
        'rag/hybrid-retrieval',
        'rag/prompt-engineering',
      ],
    },
    {
      type: 'category',
      label: 'API 参考',
      items: [
        'api/overview',
        'api/auth',
        'api/dashboard',
        'api/chat',
        'api/sources',
        'api/settings',
      ],
    },
    {
      type: 'category',
      label: '进阶',
      items: [
        'advanced/crawlers',
        'advanced/deployment',
        'advanced/optimization',
      ],
    },
  ],
};

export default sidebars;
