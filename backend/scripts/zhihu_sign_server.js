/**
 * 知乎 x-zse-96 签名服务器
 *
 * 通过 Playwright 加载知乎页面, 从页面 JS 中提取 SM4 签名函数,
 * 然后提供 HTTP 签名接口给 Python 爬虫调用。
 *
 * 用法: node zhihu_sign_server.js
 * 端口: 17007
 * 接口: POST /sign  Body: {"urlPath": "/api/v4/..."}
 */

const http = require('http');
const { chromium } = require('playwright');

let signFn = null;
let browser = null;
let page = null;

async function initBrowser() {
    console.log('[sign-server] Launching browser...');
    browser = await chromium.launch({
        headless: true,
        args: ['--disable-blink-features=AutomationControlled'],
    });
    const ctx = await browser.newContext({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:151.0) Gecko/20100101 Firefox/151.0',
    });
    page = await ctx.newPage();
    await page.addInitScript("Object.defineProperty(navigator, 'webdriver', {get: () => undefined});");

    console.log('[sign-server] Loading zhihu page...');
    await page.goto('https://www.zhihu.com', { waitUntil: 'commit', timeout: 30000 });
    await page.waitForTimeout(5000);

    // Extract SM4 constants and build sign function
    const result = await page.evaluate(() => {
        if (!window.__ZH__ || !window.__ZH__.zse) return null;
        const { zk, zb } = window.__ZH__.zse;

        // Build SM4 encrypt function in page context
        window.__sign = function(urlPath, dc0) {
            const zse93 = '101_3_3.0';
            const source = [zse93, urlPath, dc0].filter(Boolean).join('+');

            // MD5
            function md5cycle(x, k) {
                var a=x[0],b=x[1],c=x[2],d=x[3];
                a=ff(a,b,c,d,k[0],7,-680876936);d=ff(d,a,b,c,k[1],12,-389564586);
                c=ff(c,d,a,b,k[2],17,606105819);b=ff(b,c,d,a,k[3],22,-1044525330);
                a=ff(a,b,c,d,k[4],7,-176418897);d=ff(d,a,b,c,k[5],12,1200080426);
                c=ff(c,d,a,b,k[6],17,-147323141);b=ff(b,c,d,a,k[7],22,-45705983);
                a=ff(a,b,c,d,k[8],7,1770035416);d=ff(d,a,b,c,k[9],12,-1958414417);
                c=ff(c,d,a,b,k[10],17,-42063);b=ff(b,c,d,a,k[11],22,-1990404162);
                a=ff(a,b,c,d,k[12],7,1804603682);d=ff(d,a,b,c,k[13],12,-40341101);
                c=ff(c,d,a,b,k[14],17,-1502002290);b=ff(b,c,d,a,k[15],22,1236535329);
                a=gg(a,b,c,d,k[1],5,-165796510);d=gg(d,a,b,c,k[6],9,-1069501632);
                c=gg(c,d,a,b,k[11],14,643717713);b=gg(b,c,d,a,k[0],20,-373897302);
                a=gg(a,b,c,d,k[5],5,-701558691);d=gg(d,a,b,c,k[10],9,38016083);
                c=gg(c,d,a,b,k[15],14,-660478335);b=gg(b,c,d,a,k[4],20,-405537848);
                a=gg(a,b,c,d,k[9],5,568446438);d=gg(d,a,b,c,k[14],9,-1019803690);
                c=gg(c,d,a,b,k[3],14,-187363961);b=gg(b,c,d,a,k[8],20,1163531501);
                a=gg(a,b,c,d,k[13],5,-1444681467);d=gg(d,a,b,c,k[2],9,-51403784);
                c=gg(c,d,a,b,k[7],14,1735328473);b=gg(b,c,d,a,k[12],20,-1926607734);
                a=hh(a,b,c,d,k[5],4,-378558);d=hh(d,a,b,c,k[8],11,-2022574463);
                c=hh(c,d,a,b,k[11],16,1839030562);b=hh(b,c,d,a,k[14],23,-35309556);
                a=hh(a,b,c,d,k[1],4,-1530992060);d=hh(d,a,b,c,k[4],11,1272893353);
                c=hh(c,d,a,b,k[7],16,-155497632);b=hh(b,c,d,a,k[10],23,-1094730640);
                a=hh(a,b,c,d,k[13],4,681279174);d=hh(d,a,b,c,k[0],11,-358537222);
                c=hh(c,d,a,b,k[3],16,-722521979);b=hh(b,c,d,a,k[6],23,76029189);
                a=hh(a,b,c,d,k[9],4,-640364487);d=hh(d,a,b,c,k[12],11,-421815835);
                c=hh(c,d,a,b,k[15],16,530742520);b=hh(b,c,d,a,k[2],23,-995338651);
                a=ii(a,b,c,d,k[0],6,-198630844);d=ii(d,a,b,c,k[7],10,1126891415);
                c=ii(c,d,a,b,k[14],15,-1416354905);b=ii(b,c,d,a,k[5],21,-57434055);
                a=ii(a,b,c,d,k[12],6,1700485571);d=ii(d,a,b,c,k[3],10,-1894986606);
                c=ii(c,d,a,b,k[10],15,-1051523);b=ii(b,c,d,a,k[1],21,-2054922799);
                a=ii(a,b,c,d,k[8],6,1873313359);d=ii(d,a,b,c,k[15],10,-30611744);
                c=ii(c,d,a,b,k[6],15,-1560198380);b=ii(b,c,d,a,k[13],21,1309151649);
                a=ii(a,b,c,d,k[4],6,-145523070);d=ii(d,a,b,c,k[11],10,-1120210379);
                c=ii(c,d,a,b,k[2],15,718787259);b=ii(b,c,d,a,k[9],21,-343485551);
                x[0]=add32(a,x[0]);x[1]=add32(b,x[1]);x[2]=add32(c,x[2]);x[3]=add32(d,x[3]);
            }
            function cmn(q,a,b,x,s,t){a=add32(add32(a,q),add32(x,t));return add32((a<<s)|(a>>>(32-s)),b)}
            function ff(a,b,c,d,x,s,t){return cmn((b&c)|((~b)&d),a,b,x,s,t)}
            function gg(a,b,c,d,x,s,t){return cmn((b&d)|(c&(~d)),a,b,x,s,t)}
            function hh(a,b,c,d,x,s,t){return cmn(b^c^d,a,b,x,s,t)}
            function ii(a,b,c,d,x,s,t){return cmn(c^(b|(~d)),a,b,x,s,t)}
            function md51(s){var n=s.length,state=[1732584193,-271733879,-1732584194,271733878],i;for(i=64;i<=n;i+=64)md5cycle(state,md5blk(s.substring(i-64,i)));s=s.substring(i-64);var tail=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];for(i=0;i<s.length;i++)tail[i>>2]|=s.charCodeAt(i)<<((i%4)<<3);tail[i>>2]|=0x80<<((i%4)<<3);if(i>55){md5cycle(state,tail);for(i=0;i<16;i++)tail[i]=0}tail[14]=n*8;md5cycle(state,tail);return state}
            function md5blk(s){var md5blks=[],i;for(i=0;i<64;i+=4)md5blks[i>>2]=s.charCodeAt(i)+(s.charCodeAt(i+1)<<8)+(s.charCodeAt(i+2)<<16)+(s.charCodeAt(i+3)<<24);return md5blks}
            var hex_chr='0123456789abcdef'.split('');
            function rhex(n){var s='',j=0;for(;j<4;j++)s+=hex_chr[(n>>(j*8+4))&0x0F]+hex_chr[(n>>(j*8))&0x0F];return s}
            function hex(x){for(var i=0;i<x.length;i++)x[i]=rhex(x[i]);return x.join('')}
            function add32(a,b){return(a+b)&0xFFFFFFFF}

            var md5Hex = hex(md51(source));

            // SM4 CBC encrypt
            function rotl32(x,n){return((x<<n)|(x>>>(32-n)))>>>0}
            function tau(A){return((zb[(A>>>24)&0xFF]<<24)|(zb[(A>>>16)&0xFF]<<16)|(zb[(A>>>8)&0xFF]<<8)|zb[A&0xFF])>>>0}
            function T(A){var b=tau(A);return(b^rotl32(b,2)^rotl32(b,10)^rotl32(b,18)^rotl32(b,24))>>>0}
            function sm4b(p){var X=new Array(36);X[0]=(p[0]<<24|p[1]<<16|p[2]<<8|p[3])>>>0;X[1]=(p[4]<<24|p[5]<<16|p[6]<<8|p[7])>>>0;X[2]=(p[8]<<24|p[9]<<16|p[10]<<8|p[11])>>>0;X[3]=(p[12]<<24|p[13]<<16|p[14]<<8|p[15])>>>0;for(var i=0;i<32;i++)X[i+4]=(X[i]^T(X[i+1]^X[i+2]^X[i+3]^zk[i]))>>>0;var o=new Uint8Array(16);[X[35],X[34],X[33],X[32]].forEach(function(v,i){o[i*4]=(v>>>24)&0xFF;o[i*4+1]=(v>>>16)&0xFF;o[i*4+2]=(v>>>8)&0xFF;o[i*4+3]=v&0xFF});return o}

            var encoded = encodeURIComponent(md5Hex);
            var data = new TextEncoder().encode(encoded);
            var padLen = 16 - (data.length % 16);
            var padded = new Uint8Array(data.length + padLen);
            padded.set(data);
            for(var i=data.length;i<padded.length;i++) padded[i]=padLen;

            var prev = new Uint8Array(16);
            var ct = [];
            for(var i=0;i<padded.length;i+=16){
                var block=new Uint8Array(16);
                for(var j=0;j<16;j++) block[j]=padded[i+j]^prev[j];
                var enc=sm4b(block);
                ct.push.apply(ct, enc);
                prev=enc;
            }

            var b64 = btoa(String.fromCharCode.apply(null, ct));
            return '2.0_' + b64;
        };

        return true;
    });

    if (result) {
        signFn = true;
        console.log('[sign-server] Sign function ready!');
        return true;
    }
    console.log('[sign-server] Failed to initialize');
    return false;
}

async function getSignature(urlPath, dc0) {
    if (!page) return null;
    try {
        return await page.evaluate(([urlPath, dc0]) => {
            return window.__sign(urlPath, dc0);
        }, [urlPath, dc0]);
    } catch(e) {
        console.error('[sign-server] Sign error:', e.message);
        return null;
    }
}

async function main() {
    const ok = await initBrowser();
    if (!ok) {
        console.error('Failed to initialize');
        process.exit(1);
    }

    const server = http.createServer(async (req, res) => {
        if (req.method === 'POST' && req.url === '/sign') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', async () => {
                try {
                    const { urlPath, dc0 } = JSON.parse(body);
                    const sig = await getSignature(urlPath, dc0);
                    if (sig) {
                        res.writeHead(200, {'Content-Type': 'application/json'});
                        res.end(JSON.stringify({ signature: sig }));
                    } else {
                        res.writeHead(500);
                        res.end(JSON.stringify({ error: 'sign failed' }));
                    }
                } catch(e) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        } else if (req.method === 'GET' && req.url === '/health') {
            res.writeHead(200);
            res.end(JSON.stringify({ ok: !!signFn }));
        } else {
            res.writeHead(404);
            res.end('Not found');
        }
    });

    server.listen(17007, () => {
        console.log('[sign-server] Listening on :17007');
    });
}

main().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
});
