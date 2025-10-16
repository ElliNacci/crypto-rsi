/* rsi.js
- Version cliente (navigateur)
- Utilise CoinGecko pour le top-market et pour fallback des historiques
- Utilise Binance klines quand le symbole USDT/BUSD existe
- Stocke l'état précédent dans localStorage pour marquer les passages rouge->vert
- Batch requests et délai entre batches pour réduire collisions/rate limits
*/


const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const BINANCE_API = 'https://api.binance.com';


const GRID = document.getElementById('grid');
const BTN = document.getElementById('btn-refresh');
const STATUS = document.getElementById('status');
const LOGS = document.getElementById('logs');
const LAST = document.getElementById('last-updated');
const LOGCOUNT = document.getElementById('logcount');


const LOCAL_KEY = 'rsi_states_v2';
const LAST_FETCH_KEY = 'rsi_last_fetch_v2';


let prevState = loadPrevState();
let abortController = null;


BTN.addEventListener('click', () => runRefresh(true));


// auto-run at load
runRefresh(false);
// auto refresh every 12 hours
setInterval(() => runRefresh(false), 12 * 60 * 60 * 1000);


function log(...args) {
const s = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
console.log(s);
LOGS.textContent = (new Date()).toISOString() + ' ' + s + '\n' + LOGS.textContent;
}


function loadPrevState() {
try {
const raw = localStorage.getItem(LOCAL_KEY);
return raw ? JSON.parse(raw) : {};
} catch (e) {
return {};
}
}


function savePrevState(obj) {
try {
localStorage.setItem(LOCAL_KEY, JSON.stringify(obj));
} catch (e) {
console.warn('Could not save state', e);
}
}


function computeRSI(values, period = 30) {
if (!values || values.length <= period) return null;
const deltas = [];
for (let i = 1; i < values.length; i++) deltas.push(values[i] - values[i - 1]);
let gains = 0, losses = 0;
for (let i = 0; i < period; i++) {
const d = deltas[i];
if (d >= 0) gains += d; else losses += -d;
}
let avgGain = gains / period;
let avgLoss = losses / period;
for (let i = period; i < deltas.length; i++) {
div.st