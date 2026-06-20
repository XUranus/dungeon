/**
 * 知乎数据获取服务器
 *
 * 通过 Playwright 加载知乎页面, 拦截 API 响应, 返回结构化数据。
 * 浏览器自动处理 x-zse-96 签名。
 *
 * 用法: node zhihu_data_server.js
 * 端口: 17007
 *
 * 接口:
 *   GET /health               → {"ok": true}
 *   POST /crawl/answers       → {"url_token": "...", "max_pages": 50}
 *   POST /crawl/articles      → {"url_token": "...", "max_pages": 50}
 */

const http = require('http');
const { chromium } = require('playwright');

let browser = null;
let ctx = null;

async function initBrowser() {
    console.log('[zhihu-server] Launching Firefox...');
    const firefox = require('playwright').firefox;
    browser = await firefox.launch({
        headless: true,
    });
    ctx = await browser.newContext({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:151.0) Gecko/20100101 Firefox/151.0',
        viewport: { width: 1920, height: 1080 },
    });
    console.log('[zhihu-server] Firefox ready');
}

async function setCookies(cookieStr) {
    if (!ctx) return;
    const cparts = [];
    for (const part of cookieStr.split(';')) {
        const trimmed = part.trim();
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
            cparts.push({
                name: trimmed.slice(0, eqIdx).trim(),
                value: trimmed.slice(eqIdx + 1).trim(),
                domain: '.zhihu.com',
                path: '/',
            });
        }
    }
    await ctx.clearCookies();
    if (cparts.length) await ctx.addCookies(cparts);
}

async function crawlTab(urlToken, tab, maxPages = 50) {
    if (!ctx) throw new Error('Browser not initialized');

    // Limit max pages to prevent memory issues
    maxPages = Math.min(maxPages, 25);

    const allItems = [];
    let isEnd = false;
    let pageNum = 0;

    // Create a fresh page for each crawl
    let page;
    try {
        page = await ctx.newPage();
    } catch (e) {
        // Browser might have crashed, restart it
        console.log('[zhihu-server] Browser crashed, restarting...');
        await initBrowser();
        page = await ctx.newPage();
    }
    await page.addInitScript("Object.defineProperty(navigator, 'webdriver', {get: () => undefined});");

    // Capture API responses
    const responsePromise = (timeoutMs = 20000) => new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            page.removeListener('response', handler);
            reject(new Error('timeout'));
        }, timeoutMs);
        const handler = async (response) => {
            if (response.url().includes(`/${tab}`) && response.url().includes('/api/v4/members/')) {
                if (response.status() === 200) {
                    try {
                        const data = await response.json();
                        clearTimeout(timeout);
                        page.removeListener('response', handler);
                        resolve(data);
                    } catch (e) { /* ignore */ }
                }
            }
        };
        page.on('response', handler);
    });

    // First page
    console.log(`[zhihu-server] Loading ${urlToken}/${tab}...`);
    try {
        const respPromise = responsePromise(30000);
        await page.goto(`https://www.zhihu.com/people/${urlToken}/${tab}`, {
            waitUntil: 'commit', timeout: 30000,
        });
        const data = await respPromise;

        if (data.data) {
            allItems.push(...data.data);
            isEnd = data.paging?.is_end ?? false;
            pageNum = 1;
            const totals = data.paging?.totals ?? '?';
            console.log(`[zhihu-server] ${tab} page 1: ${data.data.length} items (totals=${totals})`);
        } else if (data.error) {
            console.log(`[zhihu-server] ${tab} API error: ${JSON.stringify(data.error)}`);
            await page.close().catch(() => {});
            return { items: [], error: data.error };
        }
    } catch (e) {
        console.log(`[zhihu-server] ${tab} first page failed: ${e.message}`);
        await page.close().catch(() => {});
        return { items: [], error: { message: e.message } };
    }

    // Scroll for more pages
    while (!isEnd && pageNum < maxPages) {
        try {
            const respPromise = responsePromise(15000);
            for (let i = 0; i < 5; i++) {
                await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
                await page.waitForTimeout(800);
            }
            const data = await respPromise;

            if (data.data) {
                allItems.push(...data.data);
                isEnd = data.paging?.is_end ?? false;
                pageNum++;
                console.log(`[zhihu-server] ${tab} page ${pageNum}: +${data.data.length} (total=${allItems.length})`);
            } else {
                break;
            }
        } catch (e) {
            console.log(`[zhihu-server] ${tab} page ${pageNum + 1} failed: ${e.message}`);
            break;
        }
    }

    // Close page to free memory
    await page.close().catch(() => {});
    console.log(`[zhihu-server] ${tab} done: ${allItems.length} items`);
    return { items: allItems, isEnd };
}

async function main() {
    await initBrowser();

    const server = http.createServer(async (req, res) => {
        const send = (code, data) => {
            res.writeHead(code, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
        };

        if (req.method === 'GET' && req.url === '/health') {
            send(200, { ok: !!browser });
        } else if (req.method === 'POST' && req.url === '/crawl/answers') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', async () => {
                try {
                    const { url_token, cookie, max_pages } = JSON.parse(body);
                    if (cookie) await setCookies(cookie);
                    const result = await crawlTab(url_token, 'answers', max_pages || 50);
                    send(200, result);
                } catch (e) {
                    send(500, { error: { message: e.message } });
                }
            });
        } else if (req.method === 'POST' && req.url === '/crawl/articles') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', async () => {
                try {
                    const { url_token, cookie, max_pages } = JSON.parse(body);
                    if (cookie) await setCookies(cookie);
                    const result = await crawlTab(url_token, 'articles', max_pages || 50);
                    send(200, result);
                } catch (e) {
                    send(500, { error: { message: e.message } });
                }
            });
        } else if (req.method === 'POST' && req.url === '/crawl/pins') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', async () => {
                try {
                    const { url_token, cookie, max_pages } = JSON.parse(body);
                    if (cookie) await setCookies(cookie);
                    const result = await crawlTab(url_token, 'pins', max_pages || 50);
                    send(200, result);
                } catch (e) {
                    send(500, { error: { message: e.message } });
                }
            });
        } else {
            send(404, { error: 'not found' });
        }
    });

    server.listen(17007, () => {
        console.log('[zhihu-server] Listening on :17007');
    });

    // Keep alive
    process.on('SIGTERM', async () => { if (browser) await browser.close(); process.exit(0); });
    process.on('SIGINT', async () => { if (browser) await browser.close(); process.exit(0); });
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
