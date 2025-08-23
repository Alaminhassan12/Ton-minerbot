require('dotenv').config();
const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');

// --- INITIALIZATION ---
const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// Firebase Admin SDK
const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_CONFIG, 'base64').toString('ascii'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// Telegram Bot
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const WEB_APP_URL = process.env.BASE_URL;

// --- GAME CONFIGURATION (The single source of truth for our game's economy) ---
const floorsConfig = {
    1: { rate: 0.000005, unlock_cost: 0, capacity_hours: 4 },
    2: { rate: 0.00001,  unlock_cost: 5, capacity_hours: 4 },
    3: { rate: 0.00015, unlock_cost: 15, capacity_hours: 4 },
    4: { rate: 0.0005,  unlock_cost: 25, capacity_hours: 4 },
    5: { rate: 0.001,   unlock_cost: 50, capacity_hours: 4 },
    6: { rate: 0.0015,  unlock_cost: 200, capacity_hours: 4 },
};

// --- TELEGRAM BOT LOGIC ---
bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const referrerId = match ? match[1] : null;

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
        // Create a new user
        const initialFloorData = {};
        initialFloorData['1'] = { last_collected: admin.firestore.FieldValue.serverTimestamp() };

        await userRef.set({
            userId: userId,
            username: msg.from.username || `user${userId}`,
            ton_balance: 0,
            diamonds: 0,
            unlocked_floors: 1,
            total_mining_rate: floorsConfig[1].rate,
            floor_data: initialFloorData,
            referrals: 0,
            referrer: referrerId || null,
            joined: admin.firestore.FieldValue.serverTimestamp()
        });

        if (referrerId) {
            const referrerRef = db.collection('users').doc(referrerId);
            await referrerRef.update({
                diamonds: admin.firestore.FieldValue.increment(2),
                referrals: admin.firestore.FieldValue.increment(1)
            });
            bot.sendMessage(referrerId, `🎉 You have a new referral! You earned 2 diamonds.`);
        }
    }

    bot.sendMessage(chatId, "Welcome to TON Miner! 🚀 Click the button below to start your mining adventure!", {
        reply_markup: {
            inline_keyboard: [[{ text: 'Open TON Miner 💎', web_app: { url: WEB_APP_URL } }]]
        }
    });
});

// --- API ENDPOINTS ---

// 1. Get User Data
app.get('/api/user-data/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const userRef = db.collection('users').doc(userId);
        const doc = await userRef.get();

        if (!doc.exists) {
            return res.status(404).send('User not found. Please start the bot first via /start command.');
        }

        const userData = doc.data();
        const now = new Date();
        
        let floors = [];
        for (const floorId in floorsConfig) {
            const config = floorsConfig[floorId];
            const isUnlocked = parseInt(floorId) <= userData.unlocked_floors;
            let floorData = {
                id: parseInt(floorId),
                name: `Floor ${floorId}`,
                rate: config.rate,
                unlocked: isUnlocked,
            };

            if (isUnlocked) {
                const lastCollectedDate = userData.floor_data[floorId].last_collected.toDate();
                const secondsPassed = Math.floor((now - lastCollectedDate) / 1000);
                const capacitySeconds = config.capacity_hours * 3600;
                const accumulatedSeconds = Math.min(secondsPassed, capacitySeconds);
                const earnings = accumulatedSeconds * config.rate;
                const remainingSeconds = capacitySeconds - accumulatedSeconds;

                floorData.earnings = earnings;
                floorData.timer = new Date(remainingSeconds * 1000).toISOString().substr(11, 8);
            } else {
                floorData.unlock_cost = config.unlock_cost;
            }
            floors.push(floorData);
        }

        res.status(200).json({
            level: 1, // Static for now
            userId: userData.userId,
            ton_balance: userData.ton_balance,
            diamonds: userData.diamonds,
            total_mining_rate: userData.total_mining_rate,
            floors: floors
        });

    } catch (error) {
        console.error("Error fetching user data:", error);
        res.status(500).send('Server error');
    }
});

// 2. Collect Earnings
app.post('/api/collect', async (req, res) => {
    const { userId, floorId } = req.body;
    const userRef = db.collection('users').doc(userId);
    const doc = await userRef.get();

    if (!doc.exists) return res.status(404).send('User not found.');
    
    const userData = doc.data();
    const config = floorsConfig[floorId];
    
    const lastCollectedDate = userData.floor_data[floorId].last_collected.toDate();
    const secondsPassed = Math.floor((new Date() - lastCollectedDate) / 1000);
    const capacitySeconds = config.capacity_hours * 3600;
    const accumulatedSeconds = Math.min(secondsPassed, capacitySeconds);
    const earnings = accumulatedSeconds * config.rate;

    if (earnings > 0) {
        const updatePath = `floor_data.${floorId}.last_collected`;
        await userRef.update({
            ton_balance: admin.firestore.FieldValue.increment(earnings),
            [updatePath]: admin.firestore.FieldValue.serverTimestamp()
        });
    }
    
    res.status(200).json({ message: 'Collected successfully!', collectedAmount: earnings });
});


// 3. Unlock Floor
app.post('/api/unlock-floor', async (req, res) => {
    const { userId, floorId } = req.body;
    const userRef = db.collection('users').doc(userId);
    const doc = await userRef.get();

    if (!doc.exists) return res.status(404).send('User not found.');

    const userData = doc.data();
    const nextFloorToUnlock = userData.unlocked_floors + 1;

    if (parseInt(floorId) !== nextFloorToUnlock) {
        return res.status(400).send('You must unlock floors sequentially.');
    }

    const config = floorsConfig[nextFloorToUnlock];
    if (userData.diamonds < config.unlock_cost) {
        return res.status(400).send('Not enough diamonds!');
    }
    
    const newFloorDataPath = `floor_data.${nextFloorToUnlock}`;
    await userRef.update({
        diamonds: admin.firestore.FieldValue.increment(-config.unlock_cost),
        unlocked_floors: nextFloorToUnlock,
        total_mining_rate: admin.firestore.FieldValue.increment(config.rate),
        [newFloorDataPath]: { last_collected: admin.firestore.FieldValue.serverTimestamp() }
    });

    res.status(200).json({ message: `Floor ${nextFloorToUnlock} unlocked successfully!` });
});

// --- START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}. Bot polling...`);
});