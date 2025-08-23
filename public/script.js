document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram.WebApp;
    tg.expand();

    const API_BASE_URL = ''; // Render-এ হোস্ট করার পর এটি খালি থাকবে
    const userId = tg.initDataUnsafe?.user?.id || '123456789'; // পরীক্ষার জন্য ফলব্যাক আইডি
    const botUsername = 'Ton_coin_minerbot'; // আপনার বটের ইউজারনেম

    let userData = {}; // ব্যবহারকারীর ডেটা এখানে সংরক্ষণ করা হবে
    
    // --- MODAL CONTROL ---
    const modals = {};
    document.querySelectorAll('.modal').forEach(m => { modals[m.id] = m; });
    
    const allButtons = document.querySelectorAll('[data-modal]');
    allButtons.forEach(button => {
        button.addEventListener('click', () => {
            const modalId = button.dataset.modal;
            if (modals[modalId]) modals[modalId].classList.add('show');
        });
    });

    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', (event) => {
            event.target.closest('.modal').classList.remove('show');
        });
    });
    
    // --- COPY LINK BUTTON ---
    const copyLinkBtn = document.getElementById('copy-link-btn');
    if(copyLinkBtn) {
        copyLinkBtn.addEventListener('click', () => {
            const linkInput = document.getElementById('referral-link');
            linkInput.select();
            document.execCommand('copy');
            tg.showAlert('Referral link copied!');
        });
    }

    // --- UI আপডেট করার মূল ফাংশন ---
    function updateUI(data) {
        userData = data;

        // Top Bar
        document.getElementById('ton-balance-val').textContent = parseFloat(data.ton_balance).toFixed(6);
        document.getElementById('diamond-balance-val').textContent = data.diamonds;
        document.getElementById('mining-rate-val').textContent = `${parseFloat(data.total_mining_rate).toPrecision(2)}/S`;
        document.getElementById('user-level').textContent = data.level;
        document.getElementById('user-id').textContent = data.userId;
        
        // Modals
        document.getElementById('referral-link').value = `https://t.me/${botUsername}?start=${data.userId}`;
        document.getElementById('withdraw-balance-val').textContent = `${parseFloat(data.ton_balance).toFixed(6)} TON`;

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
                                <span class="text">+${parseFloat(floor.rate).toPrecision(1)}/S</span>
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
                const coinCount = Math.min(Math.floor(floor.earnings / (floor.rate * 300)), 20);
                for (let i = 0; i < coinCount; i++) coinContainer.appendChild(createCoin());

            } else {
                floorEl.innerHTML = `
                    <img src="https://i.ibb.co/k3y2V1Q/lock-icon.png" alt="Lock" class="lock-icon">
                    <div class="revenue-tag">Revenue +${parseFloat(floor.rate).toPrecision(1)}/S</div>
                    <button class="unlock-button" data-floor-id="${floor.id}" data-cost="${floor.unlock_cost}">
                        <img src="https://i.ibb.co/7jZ4z6B/diamond.png" alt="💎" style="width:16px; height:16px;">
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
            if (!response.ok) {
                const err = await response.text();
                throw new Error(err);
            }
            const data = await response.json();
            updateUI(data);
        } catch (error) {
            console.error(error);
            tg.showAlert(error.message);
        }
    }
    
    // --- ইভেন্ট লিসেনার ---
    function addReceiveListeners() {
        document.querySelectorAll('.receive-button-container').forEach(button => {
            button.addEventListener('click', async (event) => {
                const floorId = event.currentTarget.dataset.floorId;
                const floorElement = document.getElementById(`floor-${floorId}`);
                
                const coins = floorElement.querySelectorAll('.coin');
                coins.forEach(coin => coin.classList.add('collected'));
                
                try {
                    const response = await fetch(`${API_BASE_URL}/api/collect`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId, floorId: parseInt(floorId) }),
                    });
                    if (!response.ok) throw new Error('Collection failed');
                    setTimeout(fetchUserData, 500);
                } catch (error) {
                    console.error(error);
                }
            });
        });
    }

    function addUnlockListeners() {
        document.querySelectorAll('.unlock-button').forEach(button => {
            button.addEventListener('click', async (event) => {
                const floorId = event.currentTarget.dataset.floorId;
                const cost = parseInt(event.currentTarget.dataset.cost);

                if (userData.diamonds < cost) {
                    tg.showAlert("Not enough diamonds!");
                    return;
                }
                
                try {
                    const response = await fetch(`${API_BASE_URL}/api/unlock-floor`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId, floorId: parseInt(floorId) }),
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.message || 'Unlock failed');
                    
                    tg.showAlert(result.message);
                    fetchUserData();
                } catch (error) {
                    console.error(error);
                    tg.showAlert(error.message);
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
        setInterval(fetchUserData, 30000); // প্রতি ৩০ সেকেন্ডে ডেটা অটো-রিফ্রেশ
    }

    initializeApp();
});