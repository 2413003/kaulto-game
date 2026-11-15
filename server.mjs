import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { BankingService, BankingError } from './lib/banking-service.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const STATIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.mjs', ['app.mjs', 'text/javascript; charset=utf-8']],
  ['/game-model.js', ['game-model.js', 'text/javascript; charset=utf-8']],
  ['/island-renderer.js', ['island-renderer.js', 'text/javascript; charset=utf-8']],
  ['/app.css', ['app.css', 'text/css; charset=utf-8']]
]);
const SECURITY = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};

function send(res, status, data, extraHeaders = {}) {
  res.writeHead(status, { ...SECURITY, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(JSON.stringify(data));
}

function body(req) {
  if (!/^application\/json(?:\s*;.*)?$/i.test(req.headers['content-type'] || '')) {
    throw new BankingError('Use an application/json request body.', 415);
  }
  if (Number(req.headers['content-length'] || 0) > 8192) {
    req.resume();
    throw new BankingError('Request body is too large.', 413);
  }
  return new Promise((resolveBody, reject) => {
    let bytes = 0;
    const parts = [];
    let finished = false;
    req.on('data', chunk => {
      if (finished) return;
      bytes += chunk.length;
      if (bytes > 8192) {
        finished = true;
        parts.length = 0;
        reject(new BankingError('Request body is too large.', 413));
      } else parts.push(chunk);
    });
    req.on('end', () => {
      if (finished) return;
      finished = true;
      try {
        const data = JSON.parse(Buffer.concat(parts).toString('utf8'));
        if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('Expected an object.');
        resolveBody(data);
      } catch { reject(new BankingError('Send a valid JSON object.')); }
    });
    req.on('error', reject);
  });
}

export function createAppHandler({ banking = new BankingService(), port = 3000 }) {
  return async (req, res) => {
    try {
      const actualPort = typeof port === 'function' ? port() : port;
      const authority = req.headers.host || '';
      const allowedHosts = [`127.0.0.1:${actualPort}`, `localhost:${actualPort}`, `[::1]:${actualPort}`];
      if (!allowedHosts.includes(authority)) return send(res, 403, { error: 'Use Holdfast from its local address.', code: 'INVALID_HOST' });
      if (!req.url?.startsWith('/') || req.url.startsWith('//')) return send(res, 400, { error: 'Use a local request path.' });
      const url = new URL(req.url, `http://${authority}`);
      if (!url.pathname.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
        const asset = STATIC_FILES.get(url.pathname);
        if (!asset) return send(res, 404, { error: 'Not found.' });
        let content;
        try { content = await readFile(join(ROOT, asset[0])); }
        catch (error) { if (error.code === 'ENOENT') return send(res, 404, { error: 'Not found.' }); throw error; }
        res.writeHead(200, { ...SECURITY, 'Content-Type': asset[1], 'Content-Length': content.length, 'Cache-Control': 'no-cache' });
        return res.end(req.method === 'HEAD' ? undefined : content);
      }
      const paymentMatch = url.pathname.match(/^\/api\/payments\/([^/]+)$/);
      const isRead = req.method === 'GET' && (url.pathname === '/api/wallet' || paymentMatch);
      if (!isRead && req.method !== 'POST') return send(res,405,{error:'Method not allowed.'});
      if (req.method === 'POST' && req.headers.origin !== `http://${authority}`) return send(res,403,{error:'This request must come from the local game.',code:'INVALID_ORIGIN'});
      if (['cross-site','same-site'].includes(req.headers['sec-fetch-site'])) return send(res,403,{error:'Cross-site requests are not allowed.',code:'INVALID_ORIGIN'});
      let wallet;
      if (isRead) wallet = paymentMatch ? await banking.getPayment(req,decodeURIComponent(paymentMatch[1])) : await banking.getWallet(req);
      else {
        const data=await body(req);
        if(url.pathname==='/api/deposit')wallet=await banking.requestDeposit(req,data);
        else if(url.pathname==='/api/withdraw')wallet=await banking.requestWithdrawal(req,data);
        else if(url.pathname==='/api/rewards/check')wallet=await banking.checkRewards(req,data);
        else if(url.pathname==='/api/payout/connect')wallet=await banking.connectAccount(req,data);
        else return send(res,404,{error:'Not found.'});
      }
      send(res,200,wallet);
    } catch (error) {
      if (error instanceof BankingError) send(res, error.status, { error: error.message, code: error.code });
      else {
        console.error('Banking request could not be confirmed.');
        send(res,502,{error:'The banking service could not confirm this request. Please try again.',code:'BANKING_UNAVAILABLE'});
      }
    }
  };
}

export async function loadBankingService({modulePath=process.env.BANKING_ADAPTER_MODULE}={}) {
  if (!modulePath) return new BankingService();
  const configured = await import(pathToFileURL(resolve(ROOT,modulePath)).href);
  if (!configured.default || typeof configured.default !== 'object') throw new TypeError('The banking module must export a default adapter object.');
  return new BankingService({adapter:configured.default,allowedActionOrigins:configured.allowedActionOrigins||[]});
}

export async function startServer({port=3000,banking}={}) {
  const service=banking||await loadBankingService();
  let actualPort;
  const server=createServer(createAppHandler({banking:service,port:()=>actualPort}));
  server.requestTimeout=15000;server.headersTimeout=10000;
  await new Promise((resolveListening,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolveListening)});
  actualPort=server.address().port;
  return {server,banking:service,url:`http://127.0.0.1:${actualPort}`,close:()=>new Promise((done,reject)=>server.close(error=>error?reject(error):done()))};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const port=Number(process.env.PORT||3000);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be a valid local port.');
  const {url}=await startServer({port});
  console.log(`Holdfast: ${url}`);
  if(!process.env.BANKING_ADAPTER_MODULE)console.log('Bank integration is pending. Financial actions require the configured banking adapter.');
}
