/* Telegram Ultimate - Chat Module (100% Telegram Clone) */

const Chat = {
    currentChatId: null,
    chats: [],
    messages: [],
    supabase: null,

    /**
     * Initialize chat module
     */
    async init() {
        this.supabase = SupabaseClient.getClient();
        
        // Load initial chats
        await this.loadChats();
        
        // Subscribe to realtime updates
        this.subscribeToUpdates();
    },

    /**
     * Load user's chats
     */
    async loadChats() {
        try {
            const user = Auth.getUser();
            if (!user) return;

            // Get chats with last message
            const { data, error } = await this.supabase
                .from('chat_participants')
                .select(`
                    chat_id,
                    chats:chat_id (
                        id,
                        name,
                        type,
                        created_at,
                        last_message,
                        last_message_at
                    ),
                    profiles:user_id (
                        id,
                        username,
                        full_name,
                        avatar_url
                    )
                `)
                .eq('user_id', user.id);

            if (error) throw error;

            // Format chats data
            this.chats = (data || []).map(item => ({
                id: item.chat_id,
                name: item.chats?.name || item.profiles?.full_name || item.profiles?.username,
                type: item.chats?.type || 'private',
                created_at: item.chats?.created_at,
                last_message: item.chats?.last_message,
                last_message_at: item.chats?.last_message_at,
                unread_count: 0 // TODO: Calculate unread
            }));

            // Sort by last message
            this.chats.sort((a, b) => {
                const aTime = new Date(a.last_message_at || 0);
                const bTime = new Date(b.last_message_at || 0);
                return bTime - aTime;
            });

            // Update UI
            UI.updateChatList(this.chats);

        } catch (error) {
            console.error('Error loading chats:', error);
        }
    },

    /**
     * Open a chat
     */
    async openChat(chatId) {
        if (!chatId || this.currentChatId === chatId) return;

        this.currentChatId = chatId;
        
        // Find chat data
        const chat = this.chats.find(c => c.id === chatId);
        if (!chat) return;

        // Update UI header
        UI.updateChatHeader(chat);
        
        // Show chat area
        UI.showChatArea();
        
        // Load messages
        await this.loadMessages(chatId);
        
        // Focus input
        UI.focusMessageInput();

        // Update active state in sidebar
        this.updateActiveChat();
    },

    /**
     * Load messages for a chat
     */
    async loadMessages(chatId) {
        try {
            const { data, error } = await this.supabase
                .from('messages')
                .select('*')
                .eq('chat_id', chatId)
                .order('created_at', { ascending: true });

            if (error) throw error;

            this.messages = data || [];
            
            // Update UI
            const currentUser = Auth.getUser();
            UI.updateMessages(this.messages, currentUser?.id);

        } catch (error) {
            console.error('Error loading messages:', error);
        }
    },

    /**
     * Send a message
     */
    async sendMessage(content) {
        if (!content || !this.currentChatId) return;

        const user = Auth.getUser();
        if (!user) {
            UI.showNotification('Please sign in first');
            return;
        }

        content = content.trim();
        if (!content) return;

        try {
            // Optimistic update
            const optimisticMessage = {
                id: 'temp-' + Date.now(),
                chat_id: this.currentChatId,
                sender_id: user.id,
                content: content,
                created_at: new Date().toISOString(),
                status: 'sending'
            };

            // Add to UI immediately
            this.messages.push(optimisticMessage);
            UI.updateMessages(this.messages, user.id);
            UI.clearMessageInput();

            // Send to server
            const { data, error } = await this.supabase
                .from('messages')
                .insert({
                    chat_id: this.currentChatId,
                    sender_id: user.id,
                    content: content,
                    type: 'text'
                })
                .select()
                .single();

            if (error) throw error;

            // Update message with real ID
            const index = this.messages.findIndex(m => m.id === optimisticMessage.id);
            if (index >= 0) {
                this.messages[index] = { ...data, status: 'sent' };
                UI.updateMessages(this.messages, user.id);
            }

            // Update last message in chat
            await this.updateChatLastMessage(this.currentChatId, content);

        } catch (error) {
            console.error('Error sending message:', error);
            
            // Mark as failed
            const index = this.messages.findIndex(m => m.id.startsWith('temp-'));
            if (index >= 0) {
                this.messages[index].status = 'failed';
                UI.updateMessages(this.messages, user.id);
            }
            
            UI.showNotification('Failed to send message');
        }
    },

    /**
     * Update chat's last message
     */
    async updateChatLastMessage(chatId, message) {
        try {
            await this.supabase
                .from('chats')
                .update({
                    last_message: message,
                    last_message_at: new Date().toISOString()
                })
                .eq('id', chatId);

            // Refresh chat list
            await this.loadChats();

        } catch (error) {
            console.error('Error updating last message:', error);
        }
    },

    /**
     * Update active chat in sidebar
     */
    updateActiveChat() {
        // Remove active from all
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.remove('active');
        });

        // Add active to current
        const currentItem = document.querySelector(`[data-chat-id="${this.currentChatId}"]`);
        if (currentItem) {
            currentItem.classList.add('active');
        }
    },

    /**
     * Subscribe to realtime updates
     */
    subscribeToUpdates() {
        // Subscribe to new messages
        this.supabase
            .channel('messages')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages'
            }, (payload) => {
                this.handleNewMessage(payload.new);
            })
            .subscribe();
    },

    /**
     * Handle new incoming message
     */
    handleNewMessage(message) {
        const user = Auth.getUser();
        
        // If message is for current chat
        if (message.chat_id === this.currentChatId) {
            // Check if already exists
            const exists = this.messages.find(m => m.id === message.id);
            if (!exists) {
                this.messages.push(message);
                UI.updateMessages(this.messages, user?.id);
            }
        }

        // Refresh chat list (for last message update)
        this.loadChats();
    },

    /**
     * Create new chat with user
     */
    async createChat(userId) {
        try {
            const user = Auth.getUser();
            if (!user) return;

            // Create chat
            const { data: chat, error: chatError } = await this.supabase
                .from('chats')
                .insert({ type: 'private' })
                .select()
                .single();

            if (chatError) throw chatError;

            // Add participants
            const participants = [
                { chat_id: chat.id, user_id: user.id },
                { chat_id: chat.id, user_id: userId }
            ];

            const { error: partError } = await this.supabase
                .from('chat_participants')
                .insert(participants);

            if (partError) throw partError;

            // Reload chats
            await this.loadChats();

            // Open the new chat
            this.openChat(chat.id);

            return chat;

        } catch (error) {
            console.error('Error creating chat:', error);
            UI.showNotification('Failed to create chat');
        }
    },

    /**
     * Go back to chat list (mobile)
     */
    backToChatList() {
        this.currentChatId = null;
        UI.hideChatArea();
    }
};

// Export
globalThis.Chat = Chat;
