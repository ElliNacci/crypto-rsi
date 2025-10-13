// script.js — CoinGecko + Binance, exclut stablecoins + wrapped + "wrath"

// Liste de stablecoins courants à exclure
const STABLECOINS = [
  "usdt", "usdc", "dai", "busd", "tusd", "usdp", "usdn", "gusd", "husd", "pax", "usdx", "ust"
];

// Mots pour exclure les tokens "wrapped" ou similaires, et "wrath" si présent
const EXCLUDE_KEYWORDS = ['wrapped', 'wrap', 'wrath'];

// RSI
const RSI_PERIOD = 30;

// Fonction utilitaire : calcul RSI 30 périodes (Wilder smoothing approximatif)
function calculateRSI(closes, period = RSI_PERIOD) {
  if (!closes || closes.length < period + 1) return null;

  // Initial gains/losses
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Smoothing using the last values if array longer than period+1
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);
  return rsi;
}

// Convert CoinGecko ID en symbole Binance USDT (approximation simple)
// Remarque : mapping manuel pour cas spéciaux
function coingeckoIdToBinanceSymbol(id) {
  const mapSpecial = {
    "bitcoin-cash-sv": "BCHSVUSDT",
    "bitcoin-cash": "BCHUSDT",
    "binancecoin": "BNBUSDT",
    "terra-luna": "LUNAUSDT",
    "wrapped-bitcoin": "WBTCUSDT",
    "wrapped-ether": "WETHUSDT",
    "usd-coin": "USDCUSDT"
    // ajouter d'autres cas si besoin
  };
  if (mapSpecial[id]) return mapSpecial[id];

  // par défaut : retirer les tirets et ajouter USDT (majuscule)
  return (id.replace(/-/g, "") + "usdt").toUpperCase();
}

// Récupérer la liste top cryptos CoinGecko (sans stablecoins, sans wrapped, sans wrath)
async function getTopCoins() {
  const url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=150&page=1";
  const resp = await fetch(url);
  const data = await resp.json();

  // Filtrer stablecoins et tokens contenant mots interdits (wrapped, wrap, wrath)
  const filtered = data.filter(c => {
    const sym = (c.symbol || '').toLowerCase();
    const id =
