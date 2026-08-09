// ============================================================
// ADMIN AUTH - Autenticação via API REST + JWT
// ============================================================

let currentAdmin = null;
let authToken = null;

const API_BASE = '';  // Mesmo domínio
const SESSION_TIMEOUT = 60 * 60 * 1000; // 1 hora
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutos

// Função auxiliar para requests autenticados
async function apiRequest(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers
    });

    if (response.status === 401 || response.status === 403) {
        // Token expirado ou inválido
        handleSessionExpired();
        throw new Error('Sessão expirada');
    }

    return response;
}

// Verificar sessão existente
async function checkExistingSession() {
    const savedToken = sessionStorage.getItem('admin_token');
    const savedAdmin = sessionStorage.getItem('admin_data');

    if (savedToken && savedAdmin) {
        authToken = savedToken;
        try {
            const response = await apiRequest('/api/auth/verify');
            if (response.ok) {
                currentAdmin = JSON.parse(savedAdmin);
                return true;
            }
        } catch (e) {
            // Token inválido
        }
        sessionStorage.removeItem('admin_token');
        sessionStorage.removeItem('admin_data');
        authToken = null;
    }
    return false;
}

// Login
async function handleLogin(email, password) {
    // Verificar lockout
    const lockoutUntil = localStorage.getItem('admin_lockout');
    if (lockoutUntil && Date.now() < parseInt(lockoutUntil)) {
        const remaining = Math.ceil((parseInt(lockoutUntil) - Date.now()) / 60000);
        showLoginError(`Conta bloqueada. Tente novamente em ${remaining} minutos.`);
        return false;
    }

    try {
        const response = await fetch(`${API_BASE}/api/auth/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            // Incrementar tentativas
            let attempts = parseInt(localStorage.getItem('admin_login_attempts') || '0');
            attempts++;
            localStorage.setItem('admin_login_attempts', attempts.toString());

            if (attempts >= MAX_LOGIN_ATTEMPTS) {
                const lockoutTime = Date.now() + LOCKOUT_DURATION;
                localStorage.setItem('admin_lockout', lockoutTime.toString());
                showLoginError('Muitas tentativas falhas. Conta bloqueada por 15 minutos.');
            } else {
                const remaining = MAX_LOGIN_ATTEMPTS - attempts;
                showLoginError(`${data.error || 'Erro no login'}. ${remaining} tentativa(s) restante(s).`);
            }
            return false;
        }

        // Sucesso
        authToken = data.token;
        currentAdmin = data.admin;

        sessionStorage.setItem('admin_token', authToken);
        sessionStorage.setItem('admin_data', JSON.stringify(currentAdmin));

        localStorage.removeItem('admin_login_attempts');
        localStorage.removeItem('admin_lockout');

        return true;
    } catch (error) {
        showLoginError('Erro de conexão com o servidor.');
        return false;
    }
}

// Logout
async function handleLogout() {
    authToken = null;
    currentAdmin = null;
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_data');
    clearSessionTimeout();
    showLogin();
}

// UI
function showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
    document.getElementById('app-loader').style.display = 'none';
}

function showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    document.getElementById('app-loader').style.display = 'none';
    updateAdminUI();
    startSessionTimeout();

    if (window.initAdminApp) {
        window.initAdminApp();
    }
}

function showLoginError(message) {
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    setTimeout(() => { errorEl.style.display = 'none'; }, 8000);
}

function updateAdminUI() {
    if (currentAdmin) {
        const nameEl = document.getElementById('admin-name');
        const avatarEl = document.querySelector('.admin-avatar');
        if (nameEl) nameEl.textContent = currentAdmin.nome || currentAdmin.email.split('@')[0];
        if (avatarEl) avatarEl.textContent = (currentAdmin.nome || currentAdmin.email).charAt(0).toUpperCase();
    }
}

function handleSessionExpired() {
    authToken = null;
    currentAdmin = null;
    sessionStorage.clear();
    showLogin();
    showLoginError('Sessão expirada. Faça login novamente.');
}

// Session timeout
let sessionTimer = null;

function startSessionTimeout() {
    clearSessionTimeout();
    sessionTimer = setTimeout(() => {
        handleSessionExpired();
    }, SESSION_TIMEOUT);
}

function clearSessionTimeout() {
    if (sessionTimer) {
        clearTimeout(sessionTimer);
        sessionTimer = null;
    }
}

document.addEventListener('click', () => { if (currentAdmin) startSessionTimeout(); });
document.addEventListener('keypress', () => { if (currentAdmin) startSessionTimeout(); });

// Toggle password
function togglePasswordVisibility() {
    const input = document.getElementById('login-password');
    input.type = input.type === 'password' ? 'text' : 'password';
}

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    const hasSession = await checkExistingSession();

    if (hasSession) {
        showApp();
    } else {
        showLogin();
    }

    // Form de login
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            const btnLoader = loginForm.querySelector('.btn-loader');
            const btnText = loginForm.querySelector('.btn-login span');

            btnText.style.display = 'none';
            btnLoader.style.display = 'inline-block';

            const success = await handleLogin(email, password);

            btnText.style.display = 'inline';
            btnLoader.style.display = 'none';

            if (success) {
                showApp();
            }
        });
    }
});
