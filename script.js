const container = document.getElementById('container');

const RSI_PERIOD = 30;
const BATCH_SIZE = 10;
const PAUSE_MS = 1500;

// Clés API à remplir
const COINAPI_KEY = 'TA_CLE_COINAPI_ICI';
const CMC_API_KEY = 'TA_CLE_CMC_ICI';
const BITGET_API_KEY = 'TA_CLE_BITGET_ICI';
const BYBIT_API_KEY = 'TA_CLE_BYBIT_ICI';
const GATE_API_KEY = 'TA_CLE_GATE_ICI';

// Exclusions de tokens non pertinents
const excludedCoins = new Set([
  'btc','eth','usdt','usdc','busd','dai','wbtc','weth','tusd','usdp','usdn','husd','gusd','pax',
  'usdk','usdx','usds','musd','fei','usde','bsc-usd','usds','cbbtc','usdt0','susde','jitosol',
  'buidl','susds','c1usd','pyusd','jlp','bnsol','usdf','reth','usdtb','rseth','bfusd','khype',
  'oseth','xaut','lseth','lbtc','ezeth'
]);

// ———————————————————————————————
// 1. Récupérer la liste des cryptos via CoinMarketCap
async function fetchTopCoins() {
  try {
    const res = await fetch('https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?limit=125', {
      headers: {
        'X-CMC_PRO_API_KEY': CMC_API_KEY
      }
    });
    const json = await res.json();
    if (!json.data) throw new Error('Réponse CMC invalide');
    return json.data
      .filter(c => {
        const sym = c.symbol.toLowerCase();
        if (excludedCoins.has(sym)) return false;
        if (sym.startsWith('w')) return false;
        return true;
      })
      .map(c => ({
        symbol: c.symbol.toLowerCase(),
        name: c.name,
        rank: c.cmc_rank
      }));
  } catch (e) {
    console.error('Erreur fetch CoinMarketCap:', e);
    return [];
  }
}

// ———————————————————————————————
// 2. Fonctions pour récupérer les cours hebdomadaires (closes) pour chaque exchange

// 2a. Bybit
async function fetchBybitWeeklyClose(symbol) {
  try {
    const pair = symbol.toUpperCase() + 'USDT';  // tu peux ajouter essai avec USDC si nécessaire
    const url = `https://api.bybit.com/v5/market/kline?symbol=${pair}&interval=W&limit=${RSI_PERIOD + 20}&category=spot`;
    const res = await fetch(url, {
      headers: {
        'X-API-KEY': BYBIT_API_KEY
      }
    });
    if (!res.ok) throw new Error(`Bybit HTTP ${res.status}`);
    const json = await res.json();
    // la réponse attendue : json.result.list avec des objets contenant `close`
    const list = json.result?.list || [];
    const closes = list.map(o => parseFloat(o.close)).filter(n => !isNaN(n));
    if (closes.length > RSI_PERIOD) {
      // l’ordre peut être du plus récent au plus ancien, vérifier si besoin inverser
      return closes.reverse();  // pour avoir le plus ancien d’abord
    }
  } catch (e) {
    console.warn(`Bybit échoué pour ${symbol}: ${e.message}`);
  }
  return null;
}

// 2b. Bitget
async function fetchBitgetWeeklyClose(symbol) {
  // Essayer d’abord pour les contrats “mix” (Bitget mix) qui supportent granularity 1W
  try {
    const pair = symbol.toUpperCase() + 'USDT';
    const urlMix = `https://api.bitget.com/api/v2/mix/market/history-candles?symbol=${pair}&granularity=1W&limit=${RSI_PERIOD + 20}`;
    const resMix = await fetch(urlMix, {
      headers: {
        'ACCESS-KEY': BITGET_API_KEY
      }
    });
    if (resMix.ok) {
      const json = await resMix.json();
      const data = json.data || [];
      const closes = data.map(arr => parseFloat(arr[4])).filter(n => !isNaN(n));
      if (closes.length > RSI_PERIOD) {
        return closes.reverse();
      }
    }
  } catch (e) {
    console.warn(`Bitget mix échoué ${symbol}: ${e.message}`);
  }

  // Ensuite essayer le spot history-candles avec granularity = “1week” (Bitget Spot) :contentReference[oaicite:4]{index=4}
  try {
    const pair = symbol.toUpperCase() + 'USDT';
    const urlSpot = `https://api.bitget.com/api/v2/spot/market/history-candles?symbol=${pair}&granularity=1week&limit=${RSI_PERIOD + 20}`;
    const resSpot = await fetch(urlSpot, {
      headers: {
        'ACCESS-KEY': BITGET_API_KEY
      }
    });
    if (resSpot.ok) {
      const json = await resSpot.json();
      const data = json.data || [];
      const closes = data.map(arr => parseFloat(arr[4])).filter(n => !isNaN(n));
      if (closes.length > RSI_PERIOD) {
        return closes.reverse();
      }
    }
  } catch (e) {
    console.warn(`Bitget spot échoué ${symbol}: ${e.message}`);
  }

  return null;
}

// 2c. Gate
async function fetchGateWeeklyClose(symbol) {
  try {
    const pair = symbol.toUpperCase() + 'USDT';  // tu peux aussi essayer USDC si tu veux
    const url = `https://api.gate.io/api/v4/spot/candlesticks?currency_pair=${pair}&interval=1w&limit=${RSI_PERIOD + 20}`;
    const res = await fetch(url, {
      headers: {
        'KEY': GATE_API_KEY
      }
    });
    if (!res.ok) throw new Error(`Gate HTTP ${res.status}`);
    const arr = await res.json();
    // arr est une liste de [ts, open, high, low, close, volume, …]
    const closes = arr.map(a => parseFloat(a[4])).filter(n => !isNaN(n));
    if (closes.length > RSI_PERIOD) {
      return closes.reverse();
    }
  } catch (e) {
    console.warn(`Gate échoué pour ${symbol}: ${e.message}`);
  }
  return null;
}

// 2d. CoinAPI (comme avant)
async function fetchCoinApiWeeklyClose(symbol) {
  try {
    const marketSymbol = `${symbol.toUpperCase()}/USD`;
    const url = `https://rest.coinapi.io/v1/ohlcv/${marketSymbol}/history?period_id=1WEEK&limit=${RSI_PERIOD + 20}`;
    const res = await fetch(url, {
      headers: { 'X-CoinAPI-Key': COINAPI_KEY }
    });
    if (!res.ok) throw new Error(`CoinAPI HTTP ${res.status}`);
    const data = await res.json();
    const closes = data.map(o => o.close).filter(n => typeof n === 'number');
    if (closes.length > RSI_PERIOD) {
      return closes;
    }
  } catch (e) {
    console.warn(`CoinAPI échoué pour ${symbol}: ${e.message}`);
  }
  return null;
}

// 2e. Binance fallback
async function fetchBinanceWeeklyClose(symbol) {
  const pairs = ['USDT', 'BUSD'];
  for (const quote of pairs) {
    const binanceSymbol = symbol.toUpperCase() + quote;
    try {
      const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1w&limit=${RSI_PERIOD + 20}`);
      if (!res.ok) continue;
      const data = await res.json();
      const closes = data.map(c => parseFloat(c[4])).filter(p => !isNaN(p));
      if (closes.length > RSI_PERIOD) {
        return closes;
      }
    } catch (e) {
      console.warn(`Binance échoué pour ${symbol}: ${e.message}`);
    }
  }
  return null;
}

// 2f. Wrapper de fallback dans l’ordre désiré
async function fetchWeeklyClose(symbol) {
  // 1. Bybit
  const by = await fetchBybitWeeklyClose(symbol);
  if (by) return by;

  // 2. Bitget
  const bg = await fetchBitgetWeeklyClose(symbol);
  if (bg) return bg;

  // 3. Gate
  const g = await fetchGateWeeklyClose(symbol);
  if (g) return g;

  // 4. CoinAPI
  const c = await fetchCoinApiWeeklyClose(symbol);
  if (c) return c;

  // 5. Binance
  const bn = await fetchBinanceWeeklyClose(symbol);
  if (bn) return bn;

  return null;
}

// ———————————————————————————————
// RSI (identique à ton code)
function calculateRSI(closes, period = RSI_PERIOD) {
  if (!closes || closes.length <= period) return null;

  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  gains /= period;
  losses /= period;
  if (losses === 0) return 100;

  let rs = gains / losses;
  let rsi = 100 - (100 / (1 + rs));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    gains = (gains * (period - 1) + gain) / period;
    losses = (losses * (period - 1) + loss) / period;
    rs = gains / losses;
    rsi = 100 - (100 / (1 + rs));
  }

  return rsi.toFixed(1);
}

// ———————————————————————————————
// Affichage HTML
function createCryptoBox({ symbol, name, rank, rsi }) {
  const div = document.createElement('div');
  div.className = 'crypto-box';
  div.textContent = `#${rank} ${symbol.toUpperCase()}\n${name}\nRSI: ${rsi !== null ? rsi : 'N/A'}`;

  if (rsi === null) {
    div.style.backgroundColor = 'grey';
  } else if (rsi >= 50) {
    div.style.backgroundColor = 'green';
  } else {
    div.style.backgroundColor = 'red';
  }

  return div;
}

// ———————————————————————————————
// Traitement par batch
async function processBatch(coins) {
  const results = await Promise.all(coins.map(async coin => {
    const closes = await fetchWeeklyClose(coin.symbol);
    const rsi = calculateRSI(closes);
    return { ...coin, rsi };
  }));

  results.forEach(coin => {
    const box = createCryptoBox(coin);
    container.appendChild(box);
  });
}

// ———————————————————————————————
// Fonction principale
async function main() {
  container.innerHTML = 'Chargement des cryptos…';
  const coins = await fetchTopCoins();
  container.innerHTML = '';

  for (let i = 0; i < coins.length; i += BATCH_SIZE) {
    const batch = coins.slice(i, i + BATCH_SIZE);
    await processBatch(batch);
    // pause entre chaque batch pour éviter de surcharger les APIs
    await new Promise(res => setTimeout(res, PAUSE_MS));
  }
}

// Lancement
main();
