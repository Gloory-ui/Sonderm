/* Telegram Ultimate - Express Server */

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Статические файлы из public
app.use(express.static(path.join(__dirname, 'public')));

// Статические файлы из src
app.use('/src', express.static(path.join(__dirname, 'src')));

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 - страница не найдена
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Telegram Ultimate server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
