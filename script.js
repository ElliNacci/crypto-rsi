const cryptos = [
    { id: 'bitcoin', name: 'Bitcoin' },
    { id: 'ethereum', name: 'Ethereum' },
    { id: 'binancecoin', name: 'BNB' },
    { id: 'solana', name: 'Solana' }
];

const RSI_PERIOD = 30; // 💡 Période weekly sur 30 semaines

const container = document.getElementById('cryptoContainer');

// 💡 Calcul RSI sur période donnée
function calculateRSI(closes, period = RSI_PERIOD) {
    if (closes.length < period + 1) return null;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
        const change = closes[i] - closes[i - 1];
        if (change >= 0) gains += change;
        else losses -= change;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    const lastChange = closes[closes.length - 1] - closes[closes.length - 2];
    if (lastChange >= 0) {
        avgGain = (avgGain * (period - 1) + lastChange) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
    } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) - lastChange) / period;
    }

    const RS = avgLoss === 0 ? 100 : avgGain / avgLoss;
    return +(100 - 100 / (1 + RS)).toFixed(2);
}

// 🧠 Convertit timestamp en Date JS
function timestampToDate(ts) {
    return new Date(ts);
}

// 💡 Extrait les clôtures du LUNDI (UTC) depuis les données journalières
function getWeeklyClosesFromDaily(prices, targetDay = 1 /* 1 = Lundi */) {
    const weeklyCloses = [];

    for (let i = 0; i < prices.length; i++) {
        const [timestamp, price] = prices[i];
        const date = timestampToDate(timestamp);
        if (date.getUTCDay() === targetDay) {
            weeklyCloses.push(price);
        }
    }

    return weeklyCloses.slice(-RSI_PERIOD - 1); // on garde les derniers nécessaires
}

// 📡 API CoinGecko + extraction du RSI weekly réel
async function fetchRSI(cryptoId) {
    const url = `https://api.coingecko.com/api/v3/coins/${cryptoId}/market_chart?vs_currency=usd&days=250&interval=daily`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        const prices = data.prices;

        const weeklyCloses = getWeeklyClosesFromDaily(prices, 1); // 1 = lundi
        if (weeklyCloses.length < RSI_PERIOD + 1) {
            console.warn(`Pas assez de données pour ${cryptoId}`);
            return null;
        }

        return calculateRSI(weeklyCloses);
    } catch (error) {
        console.error(`Erreur CoinGecko pour ${cryptoId} :`, error);
        return null;
    }
}

// 🟥🟩 Génère les carrés pour chaque crypto
async function displayCryptos() {
    for (const crypto of cryptos) {
        const rsi = await fetchRSI(crypto.id);

        const box = document.createElement('div');
        box.className = 'crypto-box';

        if (rsi === null) {
            box.style.backgroundColor = 'gray';
            box.innerText = `${crypto.name}\nRSI: N/A`;
        } else {
            box.style.backgroundColor = rsi > 50 ? 'green' : 'red';
            box.innerText = `${crypto.name}\nRSI: ${rsi}`;
        }

        container.appendChild(box);
    }
}

displayCryptos();


