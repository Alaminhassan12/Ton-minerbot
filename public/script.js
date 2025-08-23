document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram.WebApp;
    tg.expand();

    const API_BASE_URL = ''; // Render-এ একই ডোমেইনে থাকবে
    const userId = tg.initDataUnsafe?.user?.id || '123456789'; // পরীক্ষার জন্য ফলব্যাক আইডি
    
    let userData = {}; // ব্যবহারকারীর ডেটা এখানে সংরক্ষণ করা হবে
    
    // --- UI আপডেট করার মূল ফাংশন ---
    function updateUI(data) {
        userData = data; // সর্বশেষ ডেটা সেভ করা

        // Top Bar
        document.getElementById('ton-balance-val').textContent = parseFloat(data.ton_balance).toFixed(6);
        document.getElementById('diamond-balance-val').textContent = data.diamonds;
        document.getElementById('mining-rate-val').textContent = `${data.total_mining_rate.toPrecision(1)}/S`;
        document.getElementById('user-level').textContent = data.level;
        document.getElementById('user-id').textContent = data.userId;

        // Floors
        const floorsContainer = document.getElementById('floors-container');
        floorsContainer.innerHTML = '';
        
        data.floors.forEach(floor => {
            const floorEl = document.createElement('div');
            floorEl.className = `floor ${floor.unlocked ? '' : 'locked'}`;
            floorEl.id = `floor-${floor.id}`;
            const coinContainer = document.createElement('div');
            coinContainer.className = 'coin-container';

            if (floor.unlocked) {
                floorEl.innerHTML = `
                    <div class="floor-control-panel">
                        <div class="info-tags-container">
                            <div class="info-tag">
                                <span class="icon">⏰</span>
                                <span class="text">${floor.timer}</span>
                            </div>
                            <div class="info-tag">
                                <span class="text">+${floor.rate.toPrecision(1)}/S</span>
                            </div>
                        </div>
                        <div class="receive-button-container" data-floor-id="${floor.id}">
                            <div class="balance-row">
                                <img src="https://i.postimg.cc/906sRRfW/ton.png" alt="ton">
                                <span class="text">${parseFloat(floor.earnings).toFixed(4)}</span>
                            </div>
                            <button class="main-receive-btn">Receive</button>
                        </div>
                    </div>
                    <div class="floor-label">${floor.id} floor</div>
                `;
                const coinCount = Math.min(Math.floor(floor.earnings / (floor.rate * 60)), 20); // প্রতি মিনিটের আয়ের জন্য একটি কয়েন
                for (let i = 0; i < coinCount; i++) coinContainer.appendChild(createCoin());

            } else {
                floorEl.innerHTML = `
                    <img src="https://i.ibb.co/k3y2V1Q/lock-icon.png" alt="Lock" class="lock-icon">
                    <div class="revenue-tag">Revenue +${floor.rate.toPrecision(1)}/S</div>
                    <button class="unlock-button" data-floor-id="${floor.id}" data-cost="${floor.unlock_cost}">
                        <img src="https://i.ibb.co/7jZ4z6B/diamond.png" alt="💎">
                        <span>Unlock (Cost: ${floor.unlock_cost})</span>
                    </button>
                    <div class="floor-label">${floor.id} floor</div>
                `;
            }
            floorEl.prepend(coinContainer);
            floorsContainer.appendChild(floorEl);
        });
        
        addReceiveListeners();
        addUnlockListeners();
    }
    
    // --- API কল ---
    async function fetchUserData() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/user-data/${userId}`);
            if (!response.ok) throw new Error('Failed to fetch user data');
            const data = await response.json();
            updateUI(data);
        } catch (error) {
            console.error(error);
            // এখানে একটি সুন্দর এরর মেসেজ দেখানো যেতে পারে
        }
    }
    
    // --- ইভেন্ট লিসেনার ---
    function addReceiveListeners() {
        document.querySelectorAll('.receive-button-container').forEach(button => {
            button.addEventListener('click', async (event) => {
                const floorId = event.currentTarget.dataset.floorId;
                const floorElement = document.getElementById(`floor-${floorId}`);
                
                // অ্যানিমেশন
                const coins = floorElement.querySelectorAll('.coin');
                coins.forEach(coin => coin.classList.add('collected'));
                
                // API কল
                try {
                    await fetch(`${API_BASE_URL}/api/collect`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId, floorId: parseInt(floorId) }),
                    });
                    // সফল হলে, ডেটা রিফ্রেশ করা
                    setTimeout(fetchUserData, 500); // অ্যানিমেশন শেষ হওয়ার পর
                } catch (error) {
                    console.error("Collection failed:", error);
                }
            });
        });
    }

    function addUnlockListeners() {
        document.querySelectorAll('.unlock-button').forEach(button => {
            button.addEventListener('click', async (event) => {
                const floorId = event.currentTarget.dataset.floorId;
                const cost = event.currentTarget.dataset.cost;

                if (userData.diamonds < cost) {
                    alert("Not enough diamonds!");
                    return;
                }
                
                try {
                    await fetch(`${API_BASE_URL}/api/unlock-floor`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId, floorId: parseInt(floorId) }),
                    });
                    fetchUserData(); // সফল হলে UI রিফ্রেশ
                } catch (error) {
                    console.error("Unlock failed:", error);
                }
            });
        });
    }
    
    // --- Helper ফাংশন ---
    function createCoin() {
        const coin = document.createElement('div');
        coin.className = 'coin';
        coin.style.left = `${5 + Math.random() * 90}%`;
        coin.style.top = `${10 + Math.random() * 80}%`;
        coin.style.animationDelay = `${Math.random() * 4}s`;
        return coin;
    }
    
    // --- অ্যাপ চালু করা ---
    function initializeApp() {
        fetchUserData(); // অ্যাপ লোড হলে সার্ভার থেকে ডেটা আনা
        // প্রতি ৩০ সেকেন্ডে ডেটা অটো-রিফ্রেশ করা
        setInterval(fetchUserData, 30000);
    }

    initializeApp();
});