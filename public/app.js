class SketchTimer {
    constructor() {
        this.userId = null;
        this.userName = null;
        this.timer = null;
        this.timeLeft = 25 * 60; // 25 minutes in seconds
        this.isRunning = false;
        this.stats = null;
        
        this.initializeTelegramWebApp();
        this.initializeElements();
        this.initializeEventListeners();
        this.loadUserStats();
    }
    
    initializeTelegramWebApp() {
        // Initialize Telegram WebApp
        if (window.Telegram && window.Telegram.WebApp) {
            const tg = window.Telegram.WebApp;
            tg.ready();
            
            // Get user data from Telegram
            if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
                this.userId = tg.initDataUnsafe.user.id;
                this.userName = tg.initDataUnsafe.user.first_name || tg.initDataUnsafe.user.username || 'Artist';
            }
            
            // Set main button
            tg.MainButton.setText('Mark Session Complete');
            tg.MainButton.onClick(() => this.markSessionComplete());
        } else {
            // Fallback for testing outside Telegram
            console.warn('Telegram WebApp not available, using fallback');
            this.userId = 12345; // Test user ID
            this.userName = 'Test Artist';
        }
        
        // Update UI with user info
        document.getElementById('user-name').textContent = `Hello, ${this.userName}! 👋`;
    }
    
    initializeElements() {
        this.timerDisplay = document.getElementById('timer-display');
        this.startBtn = document.getElementById('timer-start');
        this.pauseBtn = document.getElementById('timer-pause');
        this.resetBtn = document.getElementById('timer-reset');
        this.doneBtn = document.getElementById('done-btn');
        this.uploadBtn = document.getElementById('upload-btn');
        this.presetBtns = document.querySelectorAll('.preset-btn');
        this.currentStreakEl = document.getElementById('current-streak');
        this.longestStreakEl = document.getElementById('longest-streak');
        this.uploadStatusEl = document.getElementById('upload-status');
        this.statusIconEl = document.getElementById('status-icon');
        this.statusTextEl = document.getElementById('status-text');
        this.doneHelpEl = document.getElementById('done-help');
        this.uploadHelpEl = document.getElementById('upload-help');
        this.totalSketchesEl = document.getElementById('total-sketches');
        
        this.timerStartedToday = false;
        this.timerCompleted = false;
    }
    
    initializeEventListeners() {
        // Timer controls
        this.startBtn.addEventListener('click', () => this.startTimer());
        this.pauseBtn.addEventListener('click', () => this.pauseTimer());
        this.resetBtn.addEventListener('click', () => this.resetTimer());
        
        // Timer presets
        this.presetBtns.forEach(btn => {
            btn.addEventListener('click', () => this.setTimerPreset(parseInt(btn.dataset.minutes)));
        });
        
        // Done button
        this.doneBtn.addEventListener('click', () => this.markSessionComplete());
        
        // Upload button
        this.uploadBtn.addEventListener('click', () => this.openUploadDialog());
    }
    
    async loadUserStats() {
        if (!this.userId) {
            console.error('No user ID available');
            return;
        }
        
        try {
            const response = await fetch(`/stats/${this.userId}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            this.stats = await response.json();
            this.updateUI();
            
        } catch (error) {
            console.error('Error loading user stats:', error);
            this.showError('Failed to load your statistics. Please try refreshing the page.');
        }
    }
    
    updateUI() {
        if (!this.stats) return;
        
        // Update streak displays
        this.currentStreakEl.textContent = this.stats.currentStreak;
        this.longestStreakEl.textContent = this.stats.longestStreak;
        this.totalSketchesEl.textContent = this.stats.totalUploads;
        
        // Update upload status
        const hasUploadedToday = this.stats.hasUploadedToday;
        
        if (hasUploadedToday) {
            this.uploadStatusEl.classList.remove('not-uploaded');
            this.uploadStatusEl.classList.add('uploaded');
            this.statusIconEl.textContent = '✅';
            this.statusTextEl.textContent = 'Great! You\'ve uploaded a sketch today';
            this.doneBtn.disabled = false;
            this.doneHelpEl.textContent = 'Ready to mark your session complete!';
        } else {
            this.uploadStatusEl.classList.remove('uploaded');
            this.uploadStatusEl.classList.add('not-uploaded');
            this.statusIconEl.textContent = '📸';
            this.statusTextEl.textContent = 'No sketch uploaded today';
            this.doneBtn.disabled = true;
            this.doneHelpEl.textContent = 'Upload a sketch today to mark your session complete';
        }
        
        // Update upload button state
        this.updateUploadButtonState();
        
        // Calculate weekly and monthly stats
        this.updateWeeklyMonthlyStats();
    }
    
    updateWeeklyMonthlyStats() {
        if (!this.stats.recentHistory) return;
        
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        let weekCount = 0;
        let monthCount = 0;
        
        this.stats.recentHistory.forEach(day => {
            const dayDate = new Date(day.upload_date);
            if (dayDate >= weekAgo) {
                weekCount += day.sketches;
            }
            if (dayDate >= monthAgo) {
                monthCount += day.sketches;
            }
        });
        
        document.getElementById('week-count').textContent = weekCount;
        document.getElementById('month-count').textContent = monthCount;
    }
    
    updateUploadButtonState() {
        const hasUploadedToday = this.stats?.hasUploadedToday;
        
        if (hasUploadedToday) {
            // Already uploaded today - disable button
            this.uploadBtn.disabled = true;
            this.uploadBtn.innerHTML = '<span class="btn-icon">✅</span> Sketch Uploaded Today';
            this.uploadHelpEl.textContent = 'You\'ve already uploaded a sketch today!';
        } else if (this.timerStartedToday || this.timerCompleted) {
            // Timer started/completed today and no upload yet - enable button
            this.uploadBtn.disabled = false;
            this.uploadBtn.innerHTML = '<span class="btn-icon">📸</span> Upload Sketch';
            this.uploadHelpEl.textContent = 'Ready to upload your sketch!';
        } else {
            // Timer not started today - disable button
            this.uploadBtn.disabled = true;
            this.uploadBtn.innerHTML = '<span class="btn-icon">📸</span> Upload Sketch';
            this.uploadHelpEl.textContent = 'Start the timer to enable sketch upload';
        }
    }
    
    // Timer functionality
    updateTimerDisplay() {
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        this.timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    startTimer() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.timerStartedToday = true;
            this.startBtn.textContent = 'Running...';
            this.startBtn.disabled = true;
            document.querySelector('.timer-section').classList.add('timer-running');
            
            // Update upload button state when timer starts
            this.updateUploadButtonState();
            
            this.timer = setInterval(() => {
                this.timeLeft--;
                this.updateTimerDisplay();
                
                if (this.timeLeft <= 0) {
                    this.timerComplete();
                }
            }, 1000);
        }
    }
    
    pauseTimer() {
        if (this.isRunning) {
            this.isRunning = false;
            clearInterval(this.timer);
            this.startBtn.textContent = 'Resume';
            this.startBtn.disabled = false;
            document.querySelector('.timer-section').classList.remove('timer-running');
        }
    }
    
    resetTimer() {
        this.isRunning = false;
        clearInterval(this.timer);
        this.timeLeft = 25 * 60;
        this.updateTimerDisplay();
        this.startBtn.textContent = 'Start';
        this.startBtn.disabled = false;
        document.querySelector('.timer-section').classList.remove('timer-running');
    }
    
    setTimerPreset(minutes) {
        if (!this.isRunning) {
            this.timeLeft = minutes * 60;
            this.updateTimerDisplay();
            
            // Update active preset
            this.presetBtns.forEach(btn => btn.classList.remove('active'));
            document.querySelector(`[data-minutes="${minutes}"]`).classList.add('active');
        }
    }
    
    timerComplete() {
        this.pauseTimer();
        this.timerCompleted = true;
        this.showSuccess('🎉 Timer complete! Great work on your sketch session!');
        
        // Update upload button state when timer completes
        this.updateUploadButtonState();
        
        // Show notification if available
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Sketch Timer Complete!', {
                body: 'Great job! Your sketch session is complete.',
                icon: '/favicon.ico'
            });
        }
    }
    
    async markSessionComplete() {
        if (!this.userId) {
            this.showError('User authentication required');
            return;
        }
        
        this.doneBtn.disabled = true;
        this.doneBtn.innerHTML = '<span class="btn-icon">⏳</span> Processing...';
        
        try {
            const response = await fetch('/done', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: this.userId
                }),
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                this.showSuccess(data.message);
                // Reload stats to reflect changes
                await this.loadUserStats();
            } else {
                this.showError(data.error || 'Failed to mark session complete');
                this.doneBtn.disabled = false;
                this.doneBtn.innerHTML = '<span class="btn-icon">✓</span> Mark Session Complete';
            }
            
        } catch (error) {
            console.error('Error marking session complete:', error);
            this.showError('Network error. Please check your connection and try again.');
            this.doneBtn.disabled = false;
            this.doneBtn.innerHTML = '<span class="btn-icon">✓</span> Mark Session Complete';
        }
    }
    
    showSuccess(message) {
        const feedback = document.createElement('div');
        feedback.className = 'success-feedback';
        feedback.textContent = message;
        
        const container = document.querySelector('.action-section');
        container.appendChild(feedback);
        
        setTimeout(() => {
            feedback.remove();
        }, 5000);
    }
    
    openUploadDialog() {
        if (window.Telegram && window.Telegram.WebApp) {
            // Request camera access through Telegram
            const tg = window.Telegram.WebApp;
            tg.showAlert('Please upload your sketch through the bot chat by sending a photo!');
        } else {
            // Fallback for testing
            alert('Please upload your sketch through the Telegram bot by sending a photo!');
        }
    }
    
    showError(message) {
        const feedback = document.createElement('div');
        feedback.className = 'success-feedback';
        feedback.style.background = '#f8d7da';
        feedback.style.color = '#721c24';
        feedback.style.borderLeftColor = '#dc3545';
        feedback.textContent = message;
        
        const container = document.querySelector('.action-section');
        container.appendChild(feedback);
        
        setTimeout(() => {
            feedback.remove();
        }, 7000);
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    
    // Initialize the sketch timer app
    new SketchTimer();
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        // Reload stats when returning to the page
        window.location.reload();
    }
});
