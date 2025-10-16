/* rsi.js — RSI weekly 30 pour top 200 cryptos
   -------------------------------------------------
   - Utilise Binance en priorité, sinon CoinGecko
   - Stocke l'état RSI dans localStorage
   - Carrés verts/rouges, ✖ si passage rouge→vert
   - Rafraîchit auto toutes les 12h
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

let abortController = null;

BTN.addEventListener('click', () => runRefresh(true));
runRefresh(false);
setInterval(() => runRefresh(false), 12 * 60 * 60 * 1000); // 12h

function log(...args) {
  const s = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  console.log(s);
  LOGS.textContent = (new Date()).toISOString() + ' ' + s + '\n' + LOGS.textContent;
}

function loadPrevState() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
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
    const d = deltas[i];
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function toWeekKey(ts) {
  const d = new Date(ts);
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function weeklyClosesFromDailyPrices(prices) {
  const map = new Map();
  for (const [ts, p] of prices) {
    const key = toWeekKey(ts);
    map.set(key, { ts, p });
  }
  return Array.from(map.values()).map(v => v.p);
}

async function fetchTopMarkets() {
  const per_page = 250;
  const page1 = await fetch(`${COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${per_page}&page=1`).then(r => r.json());
  const page2 = await fetch(`${COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${per_page}&page=2`).then(r => r.json());
  return [...page1, ...page2];
}

function isExcludedCoin(coin) {
  const symbol = (coin.symbol || '').toLowerCase();
  const name = (coin.name || '').toLowerCase();
  const id = (coin.id || '').toLowerCase();
  if (id === 'bitcoin' || id === 'ethereum') return true;
  if (name.includes('wrapped') || id.startsWith('wrapped-') || symbol.startsWith('w')) return true;
  const usdStable = ['usdt', 'usdc', 'busd', 'tusd', 'gusd', 'usdp', 'dai', 'usn', 'usdx', 'terrausd', 'frax'];
  if (usdStable.includes(symbol)) return true;
  if (name.includes('usd') || id.includes('usd') || symbol.includes('usd')) return true;
  return false;
}

async function tryBinanceKlinesForCoin(coin) {
  const candidates = [
    `${coin.symbol.toUpperCase()}USDT`,
    `${coin.symbol.toUpperCase()}BUSD`,
    `${coin.symbol.toUpperCase()}USDC`
  ];
  for (const sym of candidates) {
    try {
      const url = `${BINANCE_API}/api/v3/klines?symbol=${sym}&interval=1d&limit=1000`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const prices = data.map(r => [r[0], parseFloat(r[4])]);
        return { source: 'binance', prices };
      }
    } catch {
      // continue
    }
  }
  return null;
}

async function fetchCoinGeckoDaily(coinId) {
  const url = `${COINGECKO_API}/coins/${coinId}/market_chart?vs_currency=usd&days=400&interval=daily`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('CoinGecko market_chart failed');
  const json = await res.json();
  return { source: 'coingecko', prices: json.prices };
}

async function fetchHistoricalFor(coin) {
  const b = await tryBinanceKlinesForCoin(coin);
  if (b) return b;
  const g = await fetchCoinGeckoDaily(coin.id);
  return g;
}

async function runRefresh(force = false) {
  if (abortController) abortController.abort();
  abortController = new AbortController();
  const signal = abortController.signal;

  STATUS.textContent = 'Chargement...';
  BTN.disabled = true;
  LOGS.textContent = '';

  try {
    log('Fetching top markets...');
    const markets = await fetchTopMarkets();
    const selected = [];
    for (const m of markets) {
      if (selected.length >= 200) break;
      if (!isExcludedCoin(m)) selected.push({ id: m.id, symbol: m.symbol, name: m.name });
    }
    log('Selected count', selected.length);

    const results = [];
    const batch = 6;

    for (let i = 0; i < selected.length; i += batch) {
      const slice = selected.slice(i, i + batch);
      log(`Batch ${i + 1}-${i + slice.length}`);
      const promises = slice.map(async (c) => {
        try {
          const hist = await fetchHistoricalFor(c);
          return { coin: c, hist };
        } catch (e) {
          return { coin: c, err: String(e) };
        }
      });
      const settled = await Promise.all(promises);
      for (const s of settled) {
        if (s.err) {
          results.push({ id: s.coin.id, symbol: s.coin.symbol, name: s.coin.name, rsi: null, error: s.err });
        } else {
          const weekly = weeklyClosesFromDailyPrices(s.hist.prices);
          const rsi = computeRSI(weekly, 30);
          results.push({ id: s.coin.id, symbol: s.coin.symbol, name: s.coin.name, rsi });
        }
      }
      await sleep(1100);
      if (signal.aborted) throw new Error('aborted');
    }

    const prev = loadPrevState();
    const now = Date.now();
    const newState = { ...(prev || {}) };
    const annotated = results.map(r => {
      const prevRsi = prev && prev[r.id] ? prev[r.id].rsi : null;
      const crossed = (prevRsi !== null && prevRsi <= 50 && r.rsi !== null && r.rsi > 50);
      newState[r.id] = { rsi: r.rsi, updatedAt: now };
      return { ...r, prevRsi, crossed };
    });

    savePrevState(newState);
    localStorage.setItem(LAST_FETCH_KEY, String(now));
    renderGrid(annotated);
    STATUS.textContent = 'Terminé';
    LAST.textContent = new Date(now).toLocaleString();
    LOGCOUNT.textContent = `Calculés: ${annotated.length}`;
    log('Done.');
  } catch (e) {
    log('Erreur globale:', e.message);
    STATUS.textContent = 'Erreur — voir logs';
  } finally {
    BTN.disabled = false;
  }
}

function renderGrid(list) {
  GRID.innerHTML = '';
  for (const c of list) {
    const div = document.createElement('div');
    div.className = 'cell';
    const rsiText = (typeof c.rsi === 'number') ? c.rsi.toFixed(1) : '—';
    const isGreen = (typeof c.rsi === 'number') && c.rsi > 50;
    div.style.background = isGreen ? '#b6f5b6' : '#f5b6b6';
    div.title = `${c.name} (${c.symbol.toUpperCase()}) — RSI ${rsiText}`;
    div.innerHTML = `
      <div class="sym">${c.symbol.toUpperCase()}</div>
      <div class="rsi">${rsiText}</div>
    `;
    if (c.crossed) {
      const cross = document.createElement('div');
      cross.className = 'cross';
      cross.textContent = '✖';
      div.appendChild(cross);
    }
    GRID.appendChild(div);
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// expose helpers
window.__rsi_tools = { computeRSI, weeklyClosesFromDailyPrices };
