import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Intelligent Crawling',
    Svg: require('@site/static/img/undraw_docusaurus_mountain.svg').default,
    description: (
      <>
        Automatically extract content from Knowledge Planet (Zsxq) and Zhihu.
        Supports incremental crawling, rate limiting, and automatic retry with exponential backoff.
      </>
    ),
  },
  {
    title: 'Hybrid RAG Engine',
    Svg: require('@site/static/img/undraw_docusaurus_tree.svg').default,
    description: (
      <>
        Combine dense vector retrieval (BGE/OpenAI) with BM25 keyword search
        via RRF fusion ranking — achieving 97% accuracy on financial Q&A benchmarks.
      </>
    ),
  },
  {
    title: 'Real-time Tool Calling',
    Svg: require('@site/static/img/undraw_docusaurus_react.svg').default,
    description: (
      <>
        Extend RAG with live data: web search via Tavily, stock quotes via yfinance,
        and market overview — all orchestrated through OpenAI function calling.
      </>
    ),
  },
];

function Feature({title, Svg, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
