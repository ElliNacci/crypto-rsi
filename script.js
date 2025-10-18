// === Configuration principale ===
const PROXY = "https://crypto-proxy-gamma.vercel.app/fetch?url=";
const API_COINGECKO = "https://api.coingecko.com/api/v3";
const API_BINANCE = "https://api.binance.com/api/v3";
const RSI_PERIOD = 30;

// === Fonction RSI ===
function calculateRSI(prices, period = RSI_PERIOD) {
  if (prices.length < period) return null;
  let gains = 0, losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  gains /= period;
  losses /= period;

  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0)
      gains = (gains * (period - 1) + diff) / period;
    else
      losses = (losses * (period - 1) - diff) / period;
  }

  const rs = losses === 0 ? 100 : gains / losses;
  return 100 - 100 / (1 + rs);
}

// === Récupération du top 200 CoinGecko ===
async function fetchTopCoins() {
  const url = `${PROXY}${API_COINGECKO}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=210&page=1`;
  const res = await fetch(url);
  const data = await res.json();

  // Filtrer les coins inutiles
  return data
    .filter(c =>
      c.symbol.toLowerCase() !== "btc" &&
      c.symbol.toLowerCase() !== "eth" &&
      !c.symbol.toLowerCase().includes("usd") &&
      !c.symbol.toLowerCase().includes("busd") &&
      !c.name.toLowerCase().includes("wrapped")
    )
    .slice(0, 200);
}

// === Tentative via CoinGecko ===
async function tryCoinGeckoHistory(id) {
  try {
    const url = `${PROXY}${API_COINGECKO}/coins/${id}/market_chart?vs_currency=usd&days=1000`;
    const res = await fetch(url);
    const data = await res.json();
    return data.prices.map(p => p[1]);
  } catch (e) {
    return null;
  }
}

// === Tentative via Binance ===
async function tryBinanceKlinesForCoin(symbol) {
  const pairs = ["USDT", "USDC"];
  for (const pair of pairs) {
    try {
      const url = `${PROXY}${API_BINANCE}/klines?symbol=${symbol.toUpperCase()}${pair}&interval=1d&limit=1000`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data)) return data.map(k => parseFloat(k[4]));
    } catch (e) { }
  }
  return null;
}

// === Construction du carré ===
function createCoinSquare(coin, rsi, wasRedToGreen) {
  const div = document.createElement("div");
  div.className = "coin-square";
  div.style.width = "45px";
  div.style.height = "45px";
  div.style.display = "flex";
  div.style.flexDirection = "column";
  div.style.alignItems = "center";
  div.style.justifyContent = "center";
  div.style.borderRadius = "6px";
  div.style.margin = "3px";
  div.style.fontSize = "8px";
  div.style.color = "white";
  div.style.background = rsi > 50 ? "green" : "red";

  div.innerHTML = `
    <div>${coin.symbol.toUpperCase()}</div>
    <div style="font-size:9px;display:flex;align-items:center;gap:2px;">
      ${rsi ? rsi.toFixed(1) : "?"}
      ${wasRedToGreen ? "✚" : ""}
    </div>
  `;
  return div;
}

// === Mise à jour principale ===
async function updateRSIs() {
  const container = document.getElementById("coins-container");
  container.innerHTML = "Chargement...";
  const topCoins = await fetchTopCoins();

  container.innerHTML = "";
  const previousRSI = JSON.parse(localStorage.getItem("previousRSI") || "{}");
  const newRSI = {};

  for (const coin of topCoins) {
    let prices = await tryCoinGeckoHistory(coin.id);
    if (!prices || prices.length < RSI_PERIOD) {
      prices = await tryBinanceKlinesForCoin(coin.symbol);
    }

    if (!prices || prices.length < RSI_PERIOD) continue;

    const rsi = calculateRSI(prices);
    newRSI[coin.symbol] = rsi;

    const wasRedToGreen = previousRSI[coin.symbol] && previousRSI[coin.symbol] < 50 && rsi > 50;
    container.appendChild(createCoinSquare(coin, rsi, wasRedToGreen));
  }

  localStorage.setItem("previousRSI", JSON.stringify(newRSI));
}

// === Auto-update toutes les 12h ===
document.addEventListener("DOMContentLoaded", () => {
  updateRSIs();
  setInterval(updateRSIs, 12 * 60 * 60 * 1000);
});
