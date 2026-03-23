/* Telegram Ultimate - UI Helpers */

/**
 * Получить элемент по ID
 */
function $(id) {
    return document.getElementById(id);
}

/**
 * Создать элемент с классами и атрибутами
 */
function createElement(tag, classes = '', attributes = {}) {
    const el = document.createElement(tag);
    if (classes) el.className = classes;
    Object.entries(attributes).forEach(([key, value]) => {
        el.setAttribute(key, value);
    });
    return el;
}

/**
 * Форматировать время
 */
function formatTime(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Форматировать дату
 */
function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    
    if (d.toDateString() === now.toDateString()) {
        return formatTime(date);
    }
    
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
}

/**
 * Получить инициалы из имени
 */
function getInitials(name) {
    if (!name) return '?';
    return name
        .split(' ')
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

/**
 * Экранировать HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Показать/скрыть элемент
 */
function toggleElement(element, show) {
    if (typeof element === 'string') {
        element = $(element);
    }
    if (element) {
        element.style.display = show ? '' : 'none';
    }
}

/**
 * Добавить класс
 */
function addClass(element, className) {
    if (typeof element === 'string') {
        element = $(element);
    }
    if (element) {
        element.classList.add(className);
    }
}

/**
 * Удалить класс
 */
function removeClass(element, className) {
    if (typeof element === 'string') {
        element = $(element);
    }
    if (element) {
        element.classList.remove(className);
    }
}

/**
 * Проверить есть ли класс
 */
function hasClass(element, className) {
    if (typeof element === 'string') {
        element = $(element);
    }
    return element ? element.classList.contains(className) : false;
}

/**
 * Переключить класс
 */
function toggleClass(element, className) {
    if (typeof element === 'string') {
        element = $(element);
    }
    if (element) {
        element.classList.toggle(className);
    }
}

/**
 * Дебаунс функции
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Показать уведомление
 */
function showNotification(message, type = 'info') {
    const notification = createElement('div', `notification notification-${type}`);
    notification.textContent = message;
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 24px;
        background: ${type === 'error' ? '#ff4444' : '#0088cc'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

/**
 * Показать модальное окно
 */
function showModal(content) {
    const overlay = $('modalOverlay');
    overlay.innerHTML = content;
    addClass(overlay, 'active');
}

/**
 * Скрыть модальное окно
 */
function hideModal() {
    const overlay = $('modalOverlay');
    removeClass(overlay, 'active');
    overlay.innerHTML = '';
}

/**
 * Копировать в буфер обмена
 */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showNotification('Скопировано!');
    } catch (err) {
        showNotification('Не удалось скопировать', 'error');
    }
}

/**
 * Проверка на мобильное устройство
 */
function isMobile() {
    return window.innerWidth <= 768;
}

/**
 * Авто-резайз textarea
 */
function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
}

/**
 * Плавная прокрутка к элементу
 */
function scrollToElement(element, container) {
    element.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

/**
 * Показать загрузку
 */
function showLoading(element) {
    const loader = createElement('div', 'loading-spinner');
    loader.innerHTML = '<div class="spinner"></div>';
    loader.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
    `;
    
    if (typeof element === 'string') {
        element = $(element);
    }
    if (element) {
        element.style.position = 'relative';
        element.appendChild(loader);
    }
}

/**
 * Скрыть загрузку
 */
function hideLoading(element) {
    if (typeof element === 'string') {
        element = $(element);
    }
    if (element) {
        const loader = element.querySelector('.loading-spinner');
        if (loader) loader.remove();
    }
}

/**
 * Создать аватар с инициалами
 */
function createAvatar(name, url = null, size = 'normal') {
    const avatar = createElement('div', `avatar avatar-${size}`);
    
    if (url) {
        const img = createElement('img');
        img.src = url;
        img.alt = name || 'Avatar';
        avatar.appendChild(img);
    } else {
        avatar.textContent = getInitials(name);
    }
    
    return avatar;
}

/**
 * Форматировать размер файла
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Создать ripple эффект для кнопки
 */
function createRipple(event, element) {
    const circle = createElement('span', 'ripple');
    const diameter = Math.max(element.clientWidth, element.clientHeight);
    const radius = diameter / 2;
    
    circle.style.width = circle.style.height = diameter + 'px';
    circle.style.left = (event.clientX - element.getBoundingClientRect().left - radius) + 'px';
    circle.style.top = (event.clientY - element.getBoundingClientRect().top - radius) + 'px';
    
    const ripple = element.getElementsByClassName('ripple')[0];
    if (ripple) {
        ripple.remove();
    }
    
    element.appendChild(circle);
}

// Экспорт функций
globalThis.UI = {
    $,
    createElement,
    formatTime,
    formatDate,
    getInitials,
    escapeHtml,
    toggleElement,
    addClass,
    removeClass,
    hasClass,
    toggleClass,
    debounce,
    showNotification,
    showModal,
    hideModal,
    copyToClipboard,
    isMobile,
    autoResizeTextarea,
    scrollToElement,
    showLoading,
    hideLoading,
    createAvatar,
    formatFileSize,
    createRipple
};
