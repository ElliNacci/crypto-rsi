const BINANCE_API = "https://api.binance.com";
const COINGECKO_API = "https://api.coingecko.com/api/v3";
// proxy uniquement pour Binance
const PROXY = "https://https://crypto-rsi-mu.vercel.app/fetch?url=";

// ---- Calcul RSI ----
function computeRSI(closes, period = 30) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function weeklyClosesFromDailyPrices(prices) {
  const weekMillis = 7 * 24 * 60 * 60 * 1000;
  const result = [];
  let lastWeek = 0;
  for (const [ts, price] of prices) {
    if (ts - lastWeek > weekMillis) {
      result.push(price);
      lastWeek = ts;
    }
  }
  return result;
}

// ---- CoinGecko direct (sans proxy) ----
async function tryCoinGeckoHistory(coin) {
  try {
    const url = `${COINGECKO_API}/coins/${coin.id}/market_chart?vs_currency=usd&days=1000`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.prices) return null;
    return { source: 'coingecko', prices: data.prices };
  } catch {
    return null;
  }
}

// ---- Binance fallback avec proxy ----
async function tryBinanceKlinesForCoin(coin) {
  const candidates = [`${coin.symbol.toUpperCase()}USDT`, `${coin.symbol.toUpperCase()}USDC`];
  for (const sym of candidates) {
    try {
      const url = `${BINANCE_API}/api/v3/klines?symbol=${sym}&interval=1d&limit=1000`;
      const proxied = `${PROXY}${encodeURIComponent(url)}`;
      const res = await fetch(proxied);
      if (!res.ok || res.status === 400) continue;
      const wrapper = await res.json();
      const data = JSON.parse(wrapper.contents || "[]");
      if (Array.isArray(data) && data.length > 0) {
        const prices = data.map(r => [r[0], parseFloat(r[4])]);
        return { source: 'binance', prices };
      }
    } catch {
      continue;
    }
  }
  return null;
}

// ---- Liste des coins ----
async function fetchTopCoins(limit = 210) {
  const url = `${COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1`;
  const res = await fetch(url);
  const data = await res.json();
  if (!Array.isArray(data)) {
    console.warn("Réponse inattendue CoinGecko:", data);
    return [];
  }
  return data
    .filter(c => !['bitcoin', 'ethereum'].includes(c.id))
    .filter(c => !c.id.includes('wrapped'))
    .filter(c => !c.symbol.toUpperCase().includes('USD'))
    .slice(0, 200);
}

// ---- UI ----
function createSquare(coin, rsi, changed) {
  const div = document.createElement('div');
  div.style.width = "45px";
  div.style.height = "45px";
  div.style.display = "flex";
  div.style.flexDirection = "column";
  div.style.alignItems = "center";
  div.style.justifyContent = "center";
  div.style.margin = "2px";
  div.style.borderRadius = "5px";
  div.style.fontFamily = "Arial, sans-serif";
  div.style.fontSize = "9px";
  div.style.background = rsi > 50 ? "#2ecc71" : "#e74c3c";
  div.style.color = "white";
  div.style.boxShadow = "0 1px 3px rgba(0,0,0,0.2)";
  div.title = `${coin.name} (${coin.symbol.toUpperCase()}) - RSI: ${rsi.toFixed(2)}`;

  const symbol = document.createElement('div');
  symbol.textContent = coin.symbol.toUpperCase();
  symbol.style.fontWeight = "bold";
  symbol.style.fontSize = "10px";

  const rsiDiv = document.createElement('div');
  rsiDiv.style.display = "flex";
  rsiDiv.style.alignItems = "center";
  rsiDiv.style.gap = "2px";
  rsiDiv.textContent = `${rsi.toFixed(0)}`;
  if (changed) {
    const cross = document.createElement('span');
    cross.textContent = "✖";
    cross.style.color = "white";
    rsiDiv.appendChild(cross);
  }

  div.appendChild(symbol);
  div.appendChild(rsiDiv);
  return div;
}

function renderGrid(coinsData) {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  grid.style.display = "flex";
  grid.style.flexWrap = "wrap";
  grid.style.width = "100%";
  grid.style.justifyContent = "center";
  grid.style.maxWidth = "1200px";
  grid.style.margin = "0 auto";
  for (const d of coinsData) grid.appendChild(createSquare(d.coin, d.rsi, d.changed));
}

// ---- Calcul principal ----
async function updateRSIs() {
  const coins = await fetchTopCoins();
  const results = [];
  const previous = JSON.parse(localStorage.getItem("rsi_data") || "{}");

  for (const coin of coins) {
    let data = await tryCoinGeckoHistory(coin);
    if (!data) data = await tryBinanceKlinesForCoin(coin);
    if (!data) continue;

    const closes = weeklyClosesFromDailyPrices(data.prices);
    const rsi = computeRSI(closes, 30);
    if (!rsi) continue;

    const prev = previous[coin.id];
    const changed = prev && prev.rsi < 50 && rsi > 50;

    results.push({ coin, rsi, changed });
    previous[coin.id] = { rsi };
  }

  localStorage.setItem("rsi_data", JSON.stringify(previous));
  renderGrid(results);
}

document.addEventListener("DOMContentLoaded", async () => {
  const btn = document.getElementById("refresh");
  btn.onclick = updateRSIs;
  updateRSIs();
  setInterval(updateRSIs, 12 * 60 * 60 * 1000);
});

