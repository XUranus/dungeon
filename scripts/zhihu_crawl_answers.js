/**
 * 知乎回答爬取 - 通过 Puppeteer + Stealth 渲染页面提取
 *
 * 用法: node zhihu_crawl_answers.js <cookie> <url_token> [limit]
 * 输出: JSON 数组到 stdout
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function crawlAnswers(cookieStr, urlToken, limit = 20) {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();

    // 设置 Cookie
    const cookies = cookieStr.split(';').map(c => {
      const [name, ...rest] = c.trim().split('=');
      return { name: name.trim(), value: rest.join('='), domain: '.zhihu.com', path: '/' };
    });
    await page.setCookie(...cookies);

    // 拦截 API 响应
    const answers = [];
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/answers') && url.includes('/api/v4/')) {
        try {
          const data = await response.json();
          if (data.data) {
            for (const item of data.data) {
              const question = item.question || {};
              answers.push({
                id: String(item.id),
                title: question.title || '',
                content: item.excerpt || '',
                url: `https://www.zhihu.com/question/${question.id}/answer/${item.id}`,
                like_count: item.voteup_count || 0,
                comment_count: item.comment_count || 0,
                created_time: item.created_time,
              });
            }
          }
        } catch (e) {}
      }
    });

    await page.goto(`https://www.zhihu.com/people/${urlToken}/answers`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // 等待内容加载
    await page.waitForSelector('.List-item, .ContentItem', { timeout: 10000 }).catch(() => {});

    // 滚动加载
    let prevCount = 0;
    for (let i = 0; i < Math.ceil(limit / 5) + 2; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 2000));
      if (answers.length >= limit) break;
      if (answers.length === prevCount && i > 3) break;
      prevCount = answers.length;
    }

    // 从 DOM 提取 (兜底)
    if (answers.length === 0) {
      const domAnswers = await page.evaluate(() => {
        const items = document.querySelectorAll('.List-item, .ContentItem');
        return Array.from(items).map(item => {
          const titleEl = item.querySelector('h2 a, .ContentItem-title a');
          const contentEl = item.querySelector('.RichText, .RichContent-inner');
          return {
            id: item.dataset.zaExtraModule || String(Math.random()),
            title: titleEl ? titleEl.textContent.trim() : '',
            content: contentEl ? contentEl.textContent.trim().slice(0, 300) : '',
            url: titleEl ? titleEl.href : '',
            like_count: 0,
            comment_count: 0,
            created_time: null,
          };
        }).filter(a => a.title || a.content);
      });
      answers.push(...domAnswers);
    }

    return answers.slice(0, limit);
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  const [,, cookie, urlToken, limitStr] = process.argv;
  if (!cookie || !urlToken) {
    console.error('Usage: node zhihu_crawl_answers.js <cookie> <url_token> [limit]');
    process.exit(1);
  }
  crawlAnswers(cookie, urlToken, parseInt(limitStr) || 20)
    .then(data => console.log(JSON.stringify(data)))
    .catch(err => { console.error(err.message); process.exit(1); });
} else {
  module.exports = { crawlAnswers };
}
