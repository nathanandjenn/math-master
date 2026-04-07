const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Game Config (Shared with Backend)
const CONFIG = {
    minFactor: 2,
    maxFactor: 9,
};

// --- Deck Logic Moved to Backend ---
function createDeck() {
    let deck = [];
    for (let i = CONFIG.minFactor; i <= CONFIG.maxFactor; i++) {
        for (let j = CONFIG.minFactor; j <= CONFIG.maxFactor; j++) {
            deck.push({ a: i, b: j });
        }
    }
    // Add extra copy of 7s and 9s
    for (let i = CONFIG.minFactor; i <= CONFIG.maxFactor; i++) {
        for (let j = CONFIG.minFactor; j <= CONFIG.maxFactor; j++) {
            if (i === 7 || i === 9 || j === 7 || j === 9) {
                deck.push({ a: i, b: j });
            }
        }
    }
    return shuffle(deck);
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// API Endpoints
app.get('/api/deck', (req, res) => {
    const deck = createDeck();
    res.json({ deck });
});

app.post('/api/stats', (req, res) => {
    const stats = req.body;
    console.log('Received Game Stats:', stats);
    res.status(200).json({ status: 'received' });
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Root endpoint just to confirm it's running
app.get('/', (req, res) => {
    res.send('Math Master API is running.');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

