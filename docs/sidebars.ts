import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'guides/installation',
        'guides/configuration',
        'guides/first-run',
      ],
    },
    {
      type: 'category',
      label: 'Architecture',
      items: [
        'architecture/overview',
        'architecture/data-flow',
        'architecture/frontend',
        'architecture/backend',
      ],
    },
    {
      type: 'category',
      label: 'Core Features',
      items: [
        'features/professor-index',
        'features/crawlers',
        'features/tools',
      ],
    },
    {
      type: 'category',
      label: 'RAG System',
      items: [
        'rag/overview',
        'rag/embedding',
        'rag/hybrid-retrieval',
        'rag/prompt-engineering',
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
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
      label: 'Plugin System',
      items: [
        'plugins/overview',
        'plugins/development',
        'plugins/api-reference',
      ],
    },
    {
      type: 'category',
      label: 'Advanced',
      items: [
        'advanced/deployment',
        'advanced/optimization',
      ],
    },
  ],
};

export default sidebars;
