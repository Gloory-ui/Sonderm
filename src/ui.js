/* Telegram Ultimate - UI Module (100% Telegram Clone) */

const UI = {
    /**
     * Get element by ID
     */
    $(id) {
        return document.getElementById(id);
    },

    /**
     * Add CSS class
     */
    addClass(element, className) {
        if (typeof element === 'string') {
            element = this.$(element);
        }
        if (element) {
            element.classList.add(className);
        }
    },

    /**
     * Remove CSS class
     */
    removeClass(element, className) {
        if (typeof element === 'string') {
            element = this.$(element);
        }
        if (element) {
            element.classList.remove(className);
        }
    },

    /**
     * Toggle CSS class
     */
    toggleClass(element, className) {
        if (typeof element === 'string') {
            element = this.$(element);
        }
        if (element) {
            element.classList.toggle(className);
        }
    },

    /**
     * Check if has CSS class
     */
    hasClass(element, className) {
        if (typeof element === 'string') {
            element = this.$(element);
        }
        return element ? element.classList.contains(className) : false;
    },

    /**
     * Set text content
     */
    setText(element, text) {
        if (typeof element === 'string') {
            element = this.$(element);
        }
        if (element) {
            element.textContent = text;
        }
    },

    /**
     * Show element (remove hidden class)
     */
    show(element) {
        this.removeClass(element, 'hidden');
    },

    /**
     * Hide element (add hidden class)
     */
    hide(element) {
        this.addClass(element, 'hidden');
    },

    /**
     * Format timestamp to Telegram style
     */
    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        const oneDay = 24 * 60 * 60 * 1000;
        
        if (diff < oneDay && date.getDate() === now.getDate()) {
            // Today - show time
            return date.toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit',
                hour12: true 
            });
        } else if (diff < 7 * oneDay) {
            // Within a week - show day name
            return date.toLocaleDateString('en-US', { weekday: 'short' });
        } else {
            // Older - show date
            return date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric' 
            });
        }
    },

    /**
     * Format full date
     */
    formatFullDate(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    },

    /**
     * Get initials from name
     */
    getInitials(name) {
        if (!name) return '?';
        return name
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    },

    /**
     * Escape HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Debounce function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Check if mobile
     */
    isMobile() {
        return window.innerWidth <= 900;
    },

    /**
     * Auto-resize textarea
     */
    autoResizeTextarea(textarea) {
        if (!textarea) return;
        
        textarea.style.height = 'auto';
        const newHeight = Math.min(textarea.scrollHeight, 200);
        textarea.style.height = newHeight + 'px';
    },

    /**
     * Show notification toast
     */
    showNotification(message, duration = 3000) {
        // Remove existing notification
        const existing = document.querySelector('.notification');
        if (existing) {
            existing.remove();
        }

        // Create notification
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #323232;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 3000;
            animation: fadeIn 0.2s ease;
        `;

        document.body.appendChild(notification);

        // Remove after duration
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.3s';
            setTimeout(() => notification.remove(), 300);
        }, duration);
    },

    /**
     * Show modal
     */
    showModal(content, onClose) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay active';
        overlay.innerHTML = `
            <div class="modal-content">
                <div class="modal-close">&times;</div>
                ${content}
            </div>
        `;

        document.body.appendChild(overlay);

        // Close on click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.classList.contains('modal-close')) {
                overlay.remove();
                if (onClose) onClose();
            }
        });
    },

    /**
     * Render chat item HTML
     */
    renderChatItem(chat) {
        const isActive = Chat.currentChatId === chat.id;
        const hasUnread = chat.unread_count > 0;
        const lastMessage = chat.last_message || '';
        const time = chat.last_message_at ? this.formatTime(chat.last_message_at) : '';
        
        return `
            <div class="chat-item ${isActive ? 'active' : ''}" data-chat-id="${chat.id}">
                <div class="chat-avatar">
                    ${this.getInitials(chat.name || chat.username)}
                </div>
                <div class="chat-info">
                    <div class="chat-header-row">
                        <div class="chat-name">${this.escapeHtml(chat.name || chat.username || 'Unknown')}</div>
                        <div class="chat-time">${time}</div>
                    </div>
                    <div class="chat-message-row">
                        <div class="chat-message">${this.escapeHtml(lastMessage)}</div>
                        ${hasUnread ? `<div class="chat-unread">${chat.unread_count}</div>` : ''}
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Render message bubble HTML
     */
    renderMessage(message, isOwn) {
        const time = this.formatTime(message.created_at);
        const status = isOwn ? this.renderMessageStatus(message.status) : '';
        
        return `
            <div class="message ${isOwn ? 'own' : ''}" data-message-id="${message.id}">
                <div class="message-bubble">
                    <div class="message-text">${this.escapeHtml(message.content)}</div>
                    <div class="message-time">${time}</div>
                    ${status}
                </div>
            </div>
        `;
    },

    /**
     * Render message status icon
     */
    renderMessageStatus(status) {
        if (status === 'read') {
            return `<div class="message-status"><svg viewBox="0 0 24 24"><use href="#icon-check-double"/></svg></div>`;
        } else if (status === 'delivered') {
            return `<div class="message-status"><svg viewBox="0 0 24 24"><use href="#icon-check"/></svg></div>`;
        }
        return '';
    },

    /**
     * Update chat list
     */
    updateChatList(chats) {
        const chatList = this.$('chatList');
        if (!chatList) return;

        if (!chats || chats.length === 0) {
            chatList.innerHTML = '<div class="chat-item" style="justify-content: center; color: var(--text-secondary);">No chats yet</div>';
            return;
        }

        chatList.innerHTML = chats.map(chat => this.renderChatItem(chat)).join('');

        // Add click handlers
        chatList.querySelectorAll('.chat-item').forEach(item => {
            item.addEventListener('click', () => {
                const chatId = item.dataset.chatId;
                Chat.openChat(chatId);
            });
        });
    },

    /**
     * Update messages container
     */
    updateMessages(messages, currentUserId) {
        const container = this.$('messagesContainer');
        if (!container) return;

        if (!messages || messages.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px;">No messages yet</div>';
            return;
        }

        container.innerHTML = messages.map((msg, index) => {
            const isOwn = msg.sender_id === currentUserId;
            const isFirstInGroup = index === 0 || messages[index - 1].sender_id !== msg.sender_id;
            const isLastInGroup = index === messages.length - 1 || messages[index + 1].sender_id !== msg.sender_id;
            
            let html = this.renderMessage(msg, isOwn);
            if (isFirstInGroup) html = html.replace('class="message', 'class="message first-in-group');
            if (isLastInGroup) html = html.replace('class="message', 'class="message last-in-group');
            
            return html;
        }).join('');

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
    },

    /**
     * Update active chat header
     */
    updateChatHeader(chat) {
        this.setText('chatHeaderName', chat.name || chat.username || 'Unknown');
        this.setText('chatHeaderStatus', chat.is_online ? 'online' : 'last seen recently');
        
        const avatar = this.$('chatHeaderAvatar');
        if (avatar) {
            avatar.innerHTML = this.getInitials(chat.name || chat.username);
        }
    },

    /**
     * Show chat area
     */
    showChatArea() {
        this.hide('chatEmpty');
        this.show('chatActive');
        
        if (this.isMobile()) {
            this.addClass('app', 'is-chat-open');
        }
    },

    /**
     * Hide chat area (back to list on mobile)
     */
    hideChatArea() {
        if (this.isMobile()) {
            this.removeClass('app', 'is-chat-open');
        }
        
        this.show('chatEmpty');
        this.hide('chatActive');
    },

    /**
     * Clear message input
     */
    clearMessageInput() {
        const input = this.$('messageInput');
        if (input) {
            input.value = '';
            input.style.height = 'auto';
        }
    },

    /**
     * Focus message input
     */
    focusMessageInput() {
        const input = this.$('messageInput');
        if (input) {
            setTimeout(() => input.focus(), 100);
        }
    }
};

// Export
window.UI = UI;
