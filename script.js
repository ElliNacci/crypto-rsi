const cryptos = [
    { id: 'bitcoin', name: 'Bitcoin' },
    { id: 'ethereum', name: 'Ethereum' },
    { id: 'binancecoin', name: 'BNB' },
    { id: 'solana', name: 'Solana' }
];

const container = document.getElementById('cryptoContainer');

// Fonction pour calculer le RSI
function calculateRSI(closes, period = 14) {
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

// Récupère les prix et calcule le RSI weekly
async function fetchRSI(cryptoId) {
    const url = `https://api.coingecko.com/api/v3/coins/${cryptoId}/market_chart?vs_currency=usd&days=100&interval=daily`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        const prices = data.prices.map(p => p[1]); // on prend juste les prix

        // Extraire un point tous les 7 jours (approximativement)
        const weeklyCloses = [];
        for (let i = 0; i < prices.length; i += 7) {
            weeklyCloses.push(prices[i]);
        }

        // Garder les 15 derniers points max
        const recentCloses = weeklyCloses.slice(-15);
        return calculateRSI(recentCloses);
    } catch (error) {
        console.error(`Erreur pour ${cryptoId} :`, error);
        return null;
    }
}

// Génère l'affichage pour chaque crypto
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

