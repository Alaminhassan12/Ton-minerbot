document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram.WebApp;
    tg.expand();

    const API_BASE_URL = ''; // Render-এ হোস্ট করার পর এটি খালি থাকবে
    const userId = tg.initDataUnsafe?.user?.id || '123456789'; // পরীক্ষার জন্য ফলব্যাক আইডি
    const botUsername = 'Ton_coin_minerbot'; // আপনার বটের ইউজারনেম

    let userData = {}; // ব্যবহারকারীর ডেটা এখানে সংরক্ষণ করা হবে
    
    // --- HEADER FUNCTIONALITY ---
    // Plus icon click handler - Redirect to refer page
    const referPlusBtn = document.getElementById('refer-plus-btn');
    if(referPlusBtn) {
        referPlusBtn.addEventListener('click', () => {
            // Open invite modal instead of redirect
            const inviteModal = document.getElementById('invite-modal');
            if (inviteModal) {
                inviteModal.classList.add('show');
                loadInvitationRecords();
            }
        });
    }

    // Language dropdown functionality
    const languageBtn = document.getElementById('language-btn');
    const langDropdown = document.getElementById('lang-dropdown');
    
    if(languageBtn && langDropdown) {
        languageBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            langDropdown.classList.toggle('show');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            langDropdown.classList.remove('show');
        });

        // Language option selection
        document.querySelectorAll('.lang-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const langCode = option.dataset.lang;
                const langText = option.textContent.split(' ')[1]; // Get just the language part
                languageBtn.textContent = langText;
                langDropdown.classList.remove('show');
                
                // Here you can add language switching logic
                console.log('Language changed to:', langCode);
                tg.showAlert(`Language changed to ${langText}`);
            });
        });
    }
    
    // --- MODAL CONTROL ---
    const modals = {};
    document.querySelectorAll('.modal').forEach(m => { modals[m.id] = m; });
    
    const allButtons = document.querySelectorAll('[data-modal]');
    allButtons.forEach(button => {
        button.addEventListener('click', () => {
            const modalId = button.dataset.modal;
            if (modals[modalId]) {
                modals[modalId].classList.add('show');
                loadModalContent(modalId);
            }
        });
    });

    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', (event) => {
            event.target.closest('.modal').classList.remove('show');
        });
    });
    
    // --- MODAL CONTENT LOADING ---
    function loadModalContent(modalId) {
        switch(modalId) {
            case 'tasks-modal':
                loadTasks();
                break;
            case 'ranking-modal':
                loadRanking('level');
                break;
            case 'friends-modal':
                loadFriends('friends');
                break;
            case 'theft-record-modal':
                loadTheftRecords();
                break;
            case 'invite-modal':
                loadInvitationRecords();
                break;
            case 'luckbag-modal':
                updateLuckbagBalance();
                break;
        }
    }

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

    // --- TASKS FUNCTIONALITY ---
    async function loadTasks() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/tasks/${userId}`);
            const tasks = await response.json();
            
            const tasksContainer = document.getElementById('tasks-list');
            tasksContainer.innerHTML = '';
            
            tasks.forEach(task => {
                const taskElement = document.createElement('div');
                taskElement.className = 'task-item';
                taskElement.innerHTML = `
                    <div class="task-info">
                        <h4>${task.title}</h4>
                        <p>${task.description}</p>
                    </div>
                    <button class="go-btn" onclick="completeTask('${task.id}')">go</button>
                `;
                tasksContainer.appendChild(taskElement);
            });
        } catch (error) {
            console.error('Error loading tasks:', error);
        }
    }

    window.completeTask = async function(taskId) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/complete-task`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, taskId })
            });
            const result = await response.json();
            tg.showAlert(result.message);
            loadTasks();
            fetchUserData();
        } catch (error) {
            console.error('Error completing task:', error);
        }
    }

    // --- RANKING FUNCTIONALITY ---
    document.querySelectorAll('.ranking-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.ranking-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            loadRanking(tab.dataset.type);
        });
    });

    async function loadRanking(type) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/ranking/${type}`);
            const ranking = await response.json();
            
            const rankingContainer = document.getElementById('ranking-list');
            rankingContainer.innerHTML = '';
            
            ranking.forEach((user, index) => {
                const rankingElement = document.createElement('div');
                rankingElement.className = 'ranking-item';
                rankingElement.innerHTML = `
                    <div class="ranking-number">${index + 1}</div>
                    <div class="ranking-user">
                        <img src="https://i.postimg.cc/906sRRfW/ton.png" alt="Avatar">
                        <span>${user.username}</span>
                    </div>
                    <div class="ranking-value">
                        <img src="${getRankingIcon(type)}" alt="Icon">
                        <span>${formatRankingValue(user.value, type)}</span>
                    </div>
                `;
                rankingContainer.appendChild(rankingElement);
            });
        } catch (error) {
            console.error('Error loading ranking:', error);
        }
    }

    function getRankingIcon(type) {
        switch(type) {
            case 'diamond': return 'https://i.postimg.cc/PJpTRVrK/diamond.png';
            case 'token': return 'https://i.postimg.cc/906sRRfW/ton.png';
            default: return 'https://i.postimg.cc/906sRRfW/ton.png';
        }
    }

    function formatRankingValue(value, type) {
        if (type === 'token') {
            return value >= 1000000 ? `${(value/1000000).toFixed(2)}M` : 
                   value >= 1000 ? `${(value/1000).toFixed(2)}K` : value.toString();
        }
        return value.toString();
    }

    // --- FRIENDS FUNCTIONALITY ---
    document.querySelectorAll('.friends-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.friends-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            loadFriends(tab.dataset.type);
        });
    });

    async function loadFriends(type) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/friends/${userId}?type=${type}`);
            const friends = await response.json();
            
            const friendsContainer = document.getElementById('friends-list');
            friendsContainer.innerHTML = '';
            
            friends.forEach((friend, index) => {
                const friendElement = document.createElement('div');
                friendElement.className = 'friends-item';
                friendElement.innerHTML = `
                    <div class="friend-info">
                        <div class="friend-number">${index + 1}</div>
                        <div class="friend-details">
                            <h4>${friend.username}</h4>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div class="friend-balance">
                            <img src="https://i.postimg.cc/906sRRfW/ton.png" alt="TON">
                            <span>${formatBalance(friend.balance)}</span>
                        </div>
                        <button class="steal-btn" onclick="stealFromFriend('${friend.userId}')">
                            <img src="https://i.postimg.cc/V658JZM1/theft-record.png" alt="Steal">
                        </button>
                    </div>
                `;
                friendsContainer.appendChild(friendElement);
            });
        } catch (error) {
            console.error('Error loading friends:', error);
        }
    }

    function formatBalance(balance) {
        return balance >= 1000 ? `${(balance/1000).toFixed(1)}K` : balance.toFixed(2);
    }

    window.stealFromFriend = async function(targetUserId) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/steal`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, targetUserId })
            });
            const result = await response.json();
            tg.showAlert(result.message);
            fetchUserData();
        } catch (error) {
            console.error('Error stealing:', error);
        }
    }

    // --- THEFT RECORDS FUNCTIONALITY ---
    async function loadTheftRecords() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/theft-records/${userId}`);
            const records = await response.json();
            
            const recordsContainer = document.getElementById('theft-records');
            recordsContainer.innerHTML = '';
            
            records.forEach(record => {
                const recordElement = document.createElement('div');
                recordElement.className = 'theft-record-item';
                recordElement.innerHTML = `
                    <div class="theft-user">
                        <img src="https://i.postimg.cc/906sRRfW/ton.png" alt="Avatar">
                        <span>${record.username}</span>
                    </div>
                    <div class="theft-status ${record.success ? 'success' : 'fail'}">
                        ${record.success ? 'steal success' : 'steal fail'}
                    </div>
                    <div class="theft-amount ${record.amount >= 0 ? 'positive' : 'negative'}">
                        <img src="https://i.postimg.cc/906sRRfW/ton.png" alt="TON">
                        <span>${record.amount >= 0 ? '+' : ''}${record.amount}</span>
                    </div>
                `;
                recordsContainer.appendChild(recordElement);
            });
        } catch (error) {
            console.error('Error loading theft records:', error);
        }
    }

    // --- INVITATION RECORDS ---
    async function loadInvitationRecords() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/invitation-records/${userId}`);
            const records = await response.json();
            
            const recordsContainer = document.getElementById('invitation-records');
            recordsContainer.innerHTML = '';
            
            records.forEach(record => {
                const recordElement = document.createElement('div');
                recordElement.className = 'invitation-record-item';
                recordElement.innerHTML = `
                    <div class="record-user">
                        <img src="https://i.postimg.cc/906sRRfW/ton.png" alt="Avatar">
                        <div class="record-user-info">
                            <h4>${record.username}</h4>
                            <p>Invitation Successful</p>
                        </div>
                    </div>
                    <div class="record-reward">
                        <img src="https://i.postimg.cc/PJpTRVrK/diamond.png" alt="Diamond">
                        <span>+2</span>
                    </div>
                `;
                recordsContainer.appendChild(recordElement);
            });
        } catch (error) {
            console.error('Error loading invitation records:', error);
        }
    }

    // --- LUCKBAG FUNCTIONALITY ---
    function updateLuckbagBalance() {
        document.getElementById('luckbag-balance-val').textContent = userData.ton_balance || 0;
    }

    document.getElementById('emit-luckbag-btn')?.addEventListener('click', async () => {
        const amount = parseInt(document.getElementById('luckbag-amount').value);
        if (!amount || amount <= 0) {
            tg.showAlert('Please enter a valid amount');
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/create-luckbag`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, amount })
            });
            const result = await response.json();
            tg.showAlert(result.message);
            fetchUserData();
        } catch (error) {
            console.error('Error creating luckbag:', error);
        }
    });

    // --- WITHDRAW FUNCTIONALITY ---
    document.querySelectorAll('.withdraw-btn').forEach(btn => {
        btn.addEventListener('click', async (event) => {
            const packageElement = event.target.closest('.withdraw-package');
            const amount = parseInt(packageElement.dataset.amount);
            const fee = parseInt(packageElement.dataset.fee);
            
            if (userData.diamonds < fee) {
                tg.showAlert('Not enough diamonds!');
                return;
            }
            
            if (userData.ton_balance < amount) {
                tg.showAlert('Not enough TON balance!');
                return;
            }
            
            try {
                const response = await fetch(`${API_BASE_URL}/api/withdraw`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, amount, fee })
                });
                const result = await response.json();
                tg.showAlert(result.message);
                fetchUserData();
            } catch (error) {
                console.error('Error withdrawing:', error);
            }
        });
    });

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