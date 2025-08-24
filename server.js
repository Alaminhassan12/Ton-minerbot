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

// Check for required environment variables
if (!process.env.FIREBASE_CONFIG) {
    console.log('⚠️  FIREBASE_CONFIG not found. Please set this environment variable in Render.');
    console.log('📝 Create a base64 encoded Firebase service account JSON');
}

if (!process.env.BOT_TOKEN) {
    console.log('⚠️  BOT_TOKEN not found. Please set this environment variable in Render.');
    console.log('🤖 Get your bot token from @BotFather on Telegram');
}

if (!process.env.BASE_URL) {
    console.log('⚠️  BASE_URL not found. Please set this environment variable in Render.');
    console.log('🌐 Set this to your Render app URL: https://your-app-name.onrender.com');
}

// Firebase Admin SDK (only initialize if config exists)
let db;
if (process.env.FIREBASE_CONFIG) {
    try {
        const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_CONFIG, 'base64').toString('ascii'));
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        db = admin.firestore();
        console.log('✅ Firebase initialized successfully');
    } catch (error) {
        console.error('❌ Firebase initialization failed:', error.message);
    }
}

// Telegram Bot (only initialize if token exists)
let bot;
if (process.env.BOT_TOKEN && process.env.BOT_TOKEN !== 'test_token') {
    try {
        bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
        console.log('✅ Telegram Bot initialized successfully');
    } catch (error) {
        console.error('❌ Telegram Bot initialization failed:', error.message);
    }
}

const WEB_APP_URL = process.env.BASE_URL || 'http://localhost:3000';

// --- GAME CONFIGURATION ---
const floorsConfig = {
    1: { rate: 0.000005, unlock_cost: 0, capacity_hours: 4 },
    2: { rate: 0.00001,  unlock_cost: 5, capacity_hours: 4 },
    3: { rate: 0.00015, unlock_cost: 15, capacity_hours: 4 },
    4: { rate: 0.0005,  unlock_cost: 25, capacity_hours: 4 },
    5: { rate: 0.001,   unlock_cost: 50, capacity_hours: 4 },
    6: { rate: 0.0015,  unlock_cost: 200, capacity_hours: 4 },
};

const tasksConfig = [
    {
        id: 'play_vs_earn',
        title: '🎮 PLAY VS EARN 💰',
        description: 'Choose whatever you want! 🔥\nPlay hard, earn even harder! 🏆',
        reward: 10,
        url: 'https://example.com/game'
    },
    {
        id: 'join_gate_wallet',
        title: 'Join Gate.io Wallet Miniapp and get free 2U!',
        description: 'Join Miniapp Rewards: 2U Invite Rewards: 50GW MemeGala: Share 4500U',
        reward: 5,
        url: 'https://gate.io'
    },
    {
        id: 'earn_usdt',
        title: 'earning 100,000 USDT per month',
        description: 'Join the game as a promotional agent, and earning 100,000 USDT per month won\'t just be a dream.',
        reward: 15,
        url: 'https://example.com/agent'
    }
];

// --- TELEGRAM BOT LOGIC ---
if (bot) {
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
            username: msg.from.username || msg.from.first_name || `user${userId}`,
            ton_balance: 0,
            diamonds: 10, // Start with some diamonds
            unlocked_floors: 1,
            total_mining_rate: floorsConfig[1].rate,
            floor_data: initialFloorData,
            referrals: 0,
            referrer: referrerId || null,
            completed_tasks: [],
            friends: [],
            theft_records: [],
            invitation_records: [],
            joined: admin.firestore.FieldValue.serverTimestamp()
        });

        if (referrerId && referrerId !== userId) {
            const referrerRef = db.collection('users').doc(referrerId);
            const referrerDoc = await referrerRef.get();
            if (referrerDoc.exists) {
                await referrerRef.update({
                    diamonds: admin.firestore.FieldValue.increment(2),
                    referrals: admin.firestore.FieldValue.increment(1),
                    invitation_records: admin.firestore.FieldValue.arrayUnion({
                        userId: userId,
                        username: msg.from.username || msg.from.first_name || `user${userId}`,
                        timestamp: admin.firestore.FieldValue.serverTimestamp()
                    })
                });
                if (bot) bot.sendMessage(referrerId, `🎉 You have a new referral! You earned 2 diamonds.`);
            }
        }
    }

    if (bot) {
        bot.sendMessage(chatId, "Welcome to TON Miner! 🚀 Click the button below to start your mining adventure!", {
            reply_markup: {
                inline_keyboard: [[{ text: 'Open TON Miner 💎', web_app: { url: WEB_APP_URL } }]]
            }
        });
    }
    });
}

// --- API ENDPOINTS ---

// 1. Get User Data
app.get('/api/user-data/:userId', async (req, res) => {
    try {
        if (!db) {
            return res.status(500).json({ error: 'Database not initialized. Please check Firebase configuration.' });
        }
        
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
            level: Math.floor(userData.ton_balance / 1000) + 1,
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

// 4. Get Tasks
app.get('/api/tasks/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const userRef = db.collection('users').doc(userId);
        const doc = await userRef.get();

        if (!doc.exists) return res.status(404).send('User not found.');

        const userData = doc.data();
        const completedTasks = userData.completed_tasks || [];
        
        const availableTasks = tasksConfig.filter(task => !completedTasks.includes(task.id));
        
        res.status(200).json(availableTasks);
    } catch (error) {
        console.error("Error fetching tasks:", error);
        res.status(500).send('Server error');
    }
});

// 5. Complete Task
app.post('/api/complete-task', async (req, res) => {
    try {
        const { userId, taskId } = req.body;
        const userRef = db.collection('users').doc(userId);
        const doc = await userRef.get();

        if (!doc.exists) return res.status(404).send('User not found.');

        const userData = doc.data();
        const completedTasks = userData.completed_tasks || [];
        
        if (completedTasks.includes(taskId)) {
            return res.status(400).json({ message: 'Task already completed!' });
        }

        const task = tasksConfig.find(t => t.id === taskId);
        if (!task) {
            return res.status(404).json({ message: 'Task not found!' });
        }

        await userRef.update({
            diamonds: admin.firestore.FieldValue.increment(task.reward),
            completed_tasks: admin.firestore.FieldValue.arrayUnion(taskId)
        });

        res.status(200).json({ message: `Task completed! You earned ${task.reward} diamonds.` });
    } catch (error) {
        console.error("Error completing task:", error);
        res.status(500).send('Server error');
    }
});

// 6. Get Ranking
app.get('/api/ranking/:type', async (req, res) => {
    try {
        const type = req.params.type;
        let orderBy, fieldName;
        
        switch(type) {
            case 'level':
                orderBy = 'ton_balance';
                fieldName = 'ton_balance';
                break;
            case 'diamond':
                orderBy = 'diamonds';
                fieldName = 'diamonds';
                break;
            case 'invitation':
                orderBy = 'referrals';
                fieldName = 'referrals';
                break;
            case 'token':
                orderBy = 'ton_balance';
                fieldName = 'ton_balance';
                break;
            default:
                orderBy = 'ton_balance';
                fieldName = 'ton_balance';
        }

        const snapshot = await db.collection('users')
            .orderBy(orderBy, 'desc')
            .limit(20)
            .get();

        const ranking = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            ranking.push({
                userId: data.userId,
                username: data.username,
                value: data[fieldName] || 0
            });
        });

        res.status(200).json(ranking);
    } catch (error) {
        console.error("Error fetching ranking:", error);
        res.status(500).send('Server error');
    }
});

// 7. Get Friends
app.get('/api/friends/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const type = req.query.type || 'friends';
        
        if (type === 'friends') {
            // Get friends who joined via referral
            const snapshot = await db.collection('users')
                .where('referrer', '==', userId)
                .get();

            const friends = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                friends.push({
                    userId: data.userId,
                    username: data.username,
                    balance: data.ton_balance || 0
                });
            });

            res.status(200).json(friends);
        } else {
            // Get top users for stealing
            const snapshot = await db.collection('users')
                .orderBy('ton_balance', 'desc')
                .limit(20)
                .get();

            const users = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.userId !== userId) {
                    users.push({
                        userId: data.userId,
                        username: data.username,
                        balance: data.ton_balance || 0
                    });
                }
            });

            res.status(200).json(users);
        }
    } catch (error) {
        console.error("Error fetching friends:", error);
        res.status(500).send('Server error');
    }
});

// 8. Steal from Friend
app.post('/api/steal', async (req, res) => {
    try {
        const { userId, targetUserId } = req.body;
        
        const userRef = db.collection('users').doc(userId);
        const targetRef = db.collection('users').doc(targetUserId);
        
        const [userDoc, targetDoc] = await Promise.all([userRef.get(), targetRef.get()]);
        
        if (!userDoc.exists || !targetDoc.exists) {
            return res.status(404).json({ message: 'User not found!' });
        }

        const userData = userDoc.data();
        const targetData = targetDoc.data();
        
        // Calculate steal success (50% chance)
        const success = Math.random() < 0.5;
        let amount = 0;
        
        if (success && targetData.ton_balance > 0) {
            // Steal 1-5% of target's balance
            amount = Math.floor(targetData.ton_balance * (Math.random() * 0.05 + 0.01));
            amount = Math.min(amount, targetData.ton_balance);
            
            await Promise.all([
                userRef.update({
                    ton_balance: admin.firestore.FieldValue.increment(amount),
                    theft_records: admin.firestore.FieldValue.arrayUnion({
                        targetUserId: targetUserId,
                        username: targetData.username,
                        amount: amount,
                        success: true,
                        timestamp: admin.firestore.FieldValue.serverTimestamp()
                    })
                }),
                targetRef.update({
                    ton_balance: admin.firestore.FieldValue.increment(-amount),
                    theft_records: admin.firestore.FieldValue.arrayUnion({
                        attackerUserId: userId,
                        username: userData.username,
                        amount: -amount,
                        success: true,
                        timestamp: admin.firestore.FieldValue.serverTimestamp()
                    })
                })
            ]);
            
            res.status(200).json({ message: `Steal successful! You got ${amount.toFixed(4)} TON.` });
        } else {
            // Steal failed
            await userRef.update({
                theft_records: admin.firestore.FieldValue.arrayUnion({
                    targetUserId: targetUserId,
                    username: targetData.username,
                    amount: 0,
                    success: false,
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                })
            });
            
            res.status(200).json({ message: 'Steal failed! Better luck next time.' });
        }
    } catch (error) {
        console.error("Error stealing:", error);
        res.status(500).send('Server error');
    }
});

// 9. Get Theft Records
app.get('/api/theft-records/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const userRef = db.collection('users').doc(userId);
        const doc = await userRef.get();

        if (!doc.exists) return res.status(404).send('User not found.');

        const userData = doc.data();
        const records = userData.theft_records || [];
        
        // Sort by timestamp (most recent first)
        const sortedRecords = records
            .sort((a, b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0))
            .slice(0, 20);

        res.status(200).json(sortedRecords);
    } catch (error) {
        console.error("Error fetching theft records:", error);
        res.status(500).send('Server error');
    }
});

// 10. Get Invitation Records
app.get('/api/invitation-records/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const userRef = db.collection('users').doc(userId);
        const doc = await userRef.get();

        if (!doc.exists) return res.status(404).send('User not found.');

        const userData = doc.data();
        const records = userData.invitation_records || [];
        
        res.status(200).json(records);
    } catch (error) {
        console.error("Error fetching invitation records:", error);
        res.status(500).send('Server error');
    }
});

// 11. Create Luckbag
app.post('/api/create-luckbag', async (req, res) => {
    try {
        const { userId, amount } = req.body;
        const userRef = db.collection('users').doc(userId);
        const doc = await userRef.get();

        if (!doc.exists) return res.status(404).send('User not found.');

        const userData = doc.data();
        
        if (userData.ton_balance < amount) {
            return res.status(400).json({ message: 'Not enough TON balance!' });
        }

        // Deduct amount from user balance
        await userRef.update({
            ton_balance: admin.firestore.FieldValue.increment(-amount)
        });

        // In a real implementation, you would create a luckbag system
        // For now, just acknowledge the creation
        
        res.status(200).json({ message: `Luckbag created with ${amount} TON!` });
    } catch (error) {
        console.error("Error creating luckbag:", error);
        res.status(500).send('Server error');
    }
});

// 12. Withdraw
app.post('/api/withdraw', async (req, res) => {
    try {
        const { userId, amount, fee } = req.body;
        const userRef = db.collection('users').doc(userId);
        const doc = await userRef.get();

        if (!doc.exists) return res.status(404).send('User not found.');

        const userData = doc.data();
        
        if (userData.ton_balance < amount) {
            return res.status(400).json({ message: 'Not enough TON balance!' });
        }
        
        if (userData.diamonds < fee) {
            return res.status(400).json({ message: 'Not enough diamonds for withdrawal fee!' });
        }

        await userRef.update({
            ton_balance: admin.firestore.FieldValue.increment(-amount),
            diamonds: admin.firestore.FieldValue.increment(-fee)
        });

        res.status(200).json({ message: `Withdrawal successful! ${amount} TON has been sent.` });
    } catch (error) {
        console.error("Error processing withdrawal:", error);
        res.status(500).send('Server error');
    }
});

// --- START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 TON Miner Server is running on port ${PORT}`);
    console.log(`🤖 Bot is polling for messages...`);
});