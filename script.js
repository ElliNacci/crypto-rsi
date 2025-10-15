  <script>
  // ————— Paramètres —————
  const RSI_PERIOD = 30;
  const UPDATE_INTERVAL_HOURS = 12;
  const BATCH_SIZE = 10;
  const PAUSE_MS = 1000;
  const CMC_API_KEY = 'TA_CLE_CMC_ICI';
  const BYBIT_API_KEY = 'TA_CLE_BYBIT_ICI';
  const BITGET_API_KEY = 'TA_CLE_BITGET_ICI';
  const GATE_API_KEY = 'TA_CLE_GATE_ICI';
  const COINAPI_KEY = 'TA_CLE_COINAPI_ICI';

  const excluded = new Set([
    'btc','eth','usdt','usdc','busd','dai','wbtc','weth','tusd','usdp','usdn','husd','gusd','pax',
    'usdk','usdx','usds','musd','fei','usde','bsc-usd','usds','cbbtc','usdt0','susde','jitosol',
    'buidl','susds','c1usd','pyusd','jlp','bnsol','usdf','reth','usdtb','rseth','bfusd','khype',
    'oseth','xaut','lseth','lbtc','ezeth'
  ]);

  const container = document.getElementById('container');
  let previousRSI = {};  // pour mémoriser l’état précédent

  // ————— 1. Récupérer top cryptos CMC —————
  async function fetchTopCMC(n = 200) {
    const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?limit=${n+50}`;
    const res = await fetch(url, {
      headers: { 'X-CMC_PRO_API_KEY': CMC_API_KEY }
    });
    const js = await res.json();
    if (!js.data) return [];
    const filtered = js.data.filter(c => {
      const sym = c.symbol.toLowerCase();
      if (excluded.has(sym)) return false;
      if (sym.startsWith('w')) return false;
      // Exclure les coins qui finissent par “usd”, “usdt”, “usdc”, etc.
      if (sym.endsWith('usd') || sym.endsWith('usdt') || sym.endsWith('usdc')) return false;
      return true;
    });
    return filtered.slice(0, n).map(c => ({
      symbol: c.symbol.toLowerCase(),
      name: c.name,
      rank: c.cmc_rank
    }));
  }

  // ————— 2. Fonctions pour fetch closes hebdo —————
  // Exemples (tu dois adapter selon API)
  async function fetchBybitWeekly(symbol) {
    try {
      const pair = symbol.toUpperCase() + 'USDT';
      const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${pair}&interval=W&limit=${RSI_PERIOD+20}`;
      const res = await fetch(url, {
        headers: { 'X-API-KEY': BYBIT_API_KEY }
      });
      if (!res.ok) throw new Error('Bybit non dispo');
      const js = await res.json();
      const arr = js.result?.list || [];
      const closes = arr.map(o => parseFloat(o[4])).filter(n => !isNaN(n));
      if (closes.length > RSI_PERIOD) return closes.reverse();
    } catch (e) {
      console.warn('Bybit err', symbol, e);
    }
    return null;
  }

  async function fetchBitgetWeekly(symbol) {
    try {
      const pair = symbol.toUpperCase() + 'USDT';
      const url = `https://api.bitget.com/api/v2/spot/market/history-candles?symbol=${pair}&granularity=1week&limit=${RSI_PERIOD+20}`;
      const res = await fetch(url, {
        headers: { 'ACCESS-KEY': BITGET_API_KEY }
      });
      if (!res.ok) throw new Error('Bitget non dispo');
      const js = await res.json();
      const arr = js.data || [];
      const closes = arr.map(o => parseFloat(o[4])).filter(n => !isNaN(n));
      if (closes.length > RSI_PERIOD) return closes.reverse();
    } catch (e) {
      console.warn('Bitget err', symbol, e);
    }
    return null;
  }

  async function fetchGateWeekly(symbol) {
    try {
      const pair = symbol.toUpperCase() + 'USDT';
      const url = `https://api.gate.io/api/v4/spot/candlesticks?currency_pair=${pair}&interval=1w&limit=${RSI_PERIOD+20}`;
      const res = await fetch(url, {
        headers: { 'KEY': GATE_API_KEY }
      });
      if (!res.ok) throw new Error('Gate non dispo');
      const arr = await res.json();
      const closes = arr.map(a => parseFloat(a[4])).filter(n => !isNaN(n));
      if (closes.length > RSI_PERIOD) return closes.reverse();
    } catch (e) {
      console.warn('Gate err', symbol, e);
    }
    return null;
  }

  async function fetchCoinApiWeekly(symbol) {
    try {
      const marketSym = symbol.toUpperCase() + '/USD';
      const url = `https://rest.coinapi.io/v1/ohlcv/${marketSym}/history?period_id=1WEEK&limit=${RSI_PERIOD+20}`;
      const res = await fetch(url, {
        headers: { 'X-CoinAPI-Key': COINAPI_KEY }
      });
      if (!res.ok) throw new Error('CoinAPI non dispo');
      const arr = await res.json();
      const closes = arr.map(o => o.close).filter(n => typeof n === 'number');
      if (closes.length > RSI_PERIOD) return closes;
    } catch (e) {
      console.warn('CoinAPI err', symbol, e);
    }
    return null;
  }

  async function fetchBinanceWeekly(symbol) {
    const pairs = ['USDT','BUSD'];
    for (const q of pairs) {
      try {
        const pair = symbol.toUpperCase() + q;
        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=1w&limit=${RSI_PERIOD+20}`);
        if (!res.ok) continue;
        const arr = await res.json();
        const closes = arr.map(o => parseFloat(o[4])).filter(n => !isNaN(n));
        if (closes.length > RSI_PERIOD) return closes.reverse();
      } catch (e) {
        console.warn('Binance err', symbol, e);
      }
    }
    return null;
  }

  // Fallback dans l’ordre de priorité
  async function fetchWeekly(symbol) {
    let v;
    v = await fetchBybitWeekly(symbol); if (v) return v;
    v = await fetchBitgetWeekly(symbol); if (v) return v;
    v = await fetchGateWeekly(symbol); if (v) return v;
    v = await fetchCoinApiWeekly(symbol); if (v) return v;
    v = await fetchBinanceWeekly(symbol); if (v) return v;
    return null;
  }

  // ————— 3. Calcul RSI —————
  function calculateRSI(closes, period = RSI_PERIOD) {
    if (!closes || closes.length <= period) return null;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const d = closes[i] - closes[i-1];
      if (d >= 0) gains += d;
      else losses -= d;
    }
    gains /= period;
    losses /= period;
    if (losses === 0) return 100;
    let rs = gains / losses;
    let rsi = 100 - (100 / (1 + rs));
    for (let i = period+1; i < closes.length; i++) {
      const d = closes[i] - closes[i-1];
      const g = d > 0 ? d : 0;
      const l = d < 0 ? -d : 0;
      gains = (gains * (period - 1) + g) / period;
      losses = (losses * (period - 1) + l) / period;
      rs = gains / losses;
      rsi = 100 - (100 / (1 + rs));
    }
    return parseFloat(rsi.toFixed(1));
  }

  // ————— 4. Créer les carrés HTML —————
  function createBox(coin, rsi) {
    const div = document.createElement('div');
    div.className = 'crypto-box';
    div.textContent = coin.symbol.toUpperCase();
    if (rsi !== null) {
      // color selon RSI
      div.style.backgroundColor = (rsi >= 50 ? 'green' : 'red');
    } else {
      div.style.backgroundColor = 'grey';
    }
    // si précédemment RSI <50 et maintenant >=50, on ajoute une croix
    const key = coin.symbol.toLowerCase();
    if (previousRSI[key] != null) {
      if (previousRSI[key] < 50 && rsi !== null && rsi >= 50) {
        const c = document.createElement('span');
        c.className = 'cross';
        c.textContent = '×';
        div.appendChild(c);
      }
    }
    // mémoriser
    previousRSI[key] = rsi;
    return div;
  }

  // ————— 5. Processus principal —————
  async function updateAll() {
  container.innerHTML = '';
  const list = await fetchTopCMC(200);

  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    const batch = list.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (coin) => {
      const closes = await fetchWeekly(coin.symbol);
      const rsi = calculateRSI(closes);
      const box = createBox(coin, rsi);
      container.appendChild(box);
    }));

    await new Promise(res => setTimeout(res, PAUSE_MS)); // pause entre les batchs
  }
}


  // Lancement initial + mise à jour périodique
  updateAll();
  setInterval(updateAll, UPDATE_INTERVAL_HOURS * 3600 * 1000);
  </script>
</body>
</html>
