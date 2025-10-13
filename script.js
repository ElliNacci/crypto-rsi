const container = document.getElementById('container');
const RSI_PERIOD = 30;
const BATCH_SIZE = 10;
const PAUSE_MS = 1500;  // pause entre batches

// Ta clé CoinAPI ici
const COINAPI_KEY = 'TA_CLE_COINAPI_ICI';

// Liste des symbols à exclure
const excludedCoins = new Set([
  'btc','eth','usdt','usdc','busd','dai','wbtc','weth','tusd','usdp','usdn','husd','gusd','pax',
  'usdk','usdx','usds','musd','fei','usde','bsc-usd','usds','cbbtc','usdt0','susde','jitosol',
  'buidl','susds','c1usd','pyusd','jlp','bnsol','usdf','reth','usdtb','rseth','bfusd','khype',
  'oseth','xaut','lseth','lbtc','ezeth'
]);

async function fetchTopCoins() {
  try {
    const resp = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=125&page=1');
    const data = await resp.json();
    const filtered = data.filter(c => {
      const sym = c.symbol.toLowerCase();
      if (excludedCoins.has(sym)) return false;
      if (sym.startsWith('w')) return false;
      return true;
    });
    return filtered;
  } catch (e) {
    console.error('Erreur fetch top coins', e);
    return [];
  }
}

async function fetchBinanceWeeklyClose(symbol) {
  const pairs = ['USDT', 'BUSD'];
  for (const quote of pairs) {
    const binSym = symbol.toUpperCase() + quote;
    try {
      const resp = await fetch(`https://api.binance.com/api/v3/klines?symbol=${binSym}&interval=1w&limit=${RSI_PERIOD + 20}`);
      if (!resp.ok) continue;
      const data = await resp.json();
      const closes = data.map(c => parseFloat(c[4])).filter(p => !isNaN(p));
      if (closes.length > RSI_PERIOD) return closes;
    } catch {
      continue;
    }
  }
  return null;
}

// Fallback : CoinAPI
async function fetchCoinApiWeeklyClose(symbol) {
  try {
    const symbolUpper = symbol.toUpperCase();
    const url = `https://rest.coinapi.io/v1/ohlcv/${symbolUpper}/USD/history?period_id=1W&limit=${RSI_PERIOD + 20}`;
    const resp = await fetch(url, {
      headers: {
        'X-CoinAPI-Key': COINAPI_KEY
      }
    });
    if (!resp.ok) throw new Error('Erreur CoinAPI');
    const ohlc = await resp.json();
    const closes = ohlc.map(o => o.close).filter(p => typeof p === 'number');
    if (closes.length > RSI_PERIOD) return closes;
  } catch (e) {
    console.error('Erreur CoinAPI pour', symbol, e);
  }
  return null;
}

// Combine Binance + fallback CoinAPI
async function fetchWeeklyCloseWithFallback(symbol) {
  const fromBinance = await fetchBinanceWeeklyClose(symbol);
  if (fromBinance) return fromBinance;
  const fromCoinApi = await fetchCoinApiWeeklyClose(symbol);
  return fromCoinApi;
}

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

function createCryptoBox(symbol, rsi) {
  const div = document.createElement('div');
  div.className = 'crypto-box';
  div.textContent = symbol.toUpperCase() + (rsi !== null ? `\n${rsi}` : '');
  if (rsi === null) {
    div.style.backgroundColor = 'grey';
  } else if (rsi >= 50) {
    div.style.backgroundColor = 'green';
  } else {
    div.style.backgroundColor = 'red';
  }
  return div;
}

async function processBatch(coins) {
  const results = await Promise.all(coins.map(async coin => {
    const closes = await fetchWeeklyCloseWithFallback(coin.symbol);
    const rsi = calculateRSI(closes);
    return { symbol: coin.symbol, rsi };
  }));
  results.forEach(({ symbol, rsi }) => {
    const box = createCryptoBox(symbol, rsi);
    container.appendChild(box);
  });
}

async function main() {
  container.innerHTML = 'Chargement des cryptos…';
  const coins = await fetchTopCoins();
  container.innerHTML = '';
  for (let i = 0; i < coins.length; i += BATCH_SIZE) {
    const batch = coins.slice(i, i + BATCH_SIZE);
    await processBatch(batch);
    await new Promise(res => setTimeout(res, PAUSE_MS));
  }
}

main();
