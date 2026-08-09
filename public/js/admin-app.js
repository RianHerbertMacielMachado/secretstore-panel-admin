// ============================================================
// ADMIN APP - Lógica principal (API REST / PostgreSQL)
// ============================================================

let allClients = [];
let allLogs = [];

// ============================================================
// INICIALIZAÇÃO
// ============================================================

window.initAdminApp = function () {
    updateCurrentDate();
    loadDashboardData();
    loadClients();
    loadPendingResets();
    loadHelpItems();
    loadLogs();
};

// ============================================================
// NAVEGAÇÃO
// ============================================================

function navigateTo(section) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`section-${section}`);
    if (target) target.classList.add('active');

    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-section="${section}"]`);
    if (navItem) navItem.classList.add('active');

    const titles = {
        dashboard: 'Dashboard',
        clients: 'Clientes',
        resets: 'Resets de Senha',
        help: 'Configurações de Ajuda',
        logs: 'Logs de Atividade'
    };
    document.getElementById('page-title').textContent = titles[section] || 'Dashboard';

    document.getElementById('sidebar').classList.remove('mobile-open');
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
    sidebar.classList.toggle('mobile-open');
}

function updateCurrentDate() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('current-date').textContent = now.toLocaleDateString('pt-BR', options);
}

// ============================================================
// DASHBOARD
// ============================================================

async function loadDashboardData() {
    try {
        const response = await apiRequest('/api/admin/dashboard');
        const stats = await response.json();

        document.getElementById('stat-active-clients').textContent = stats.activeClients || 0;
        document.getElementById('stat-inactive-clients').textContent = stats.inactiveClients || 0;
        document.getElementById('stat-new-clients').textContent = stats.newClients || 0;
        document.getElementById('stat-pending-resets').textContent = stats.pendingResets || 0;
        document.getElementById('stat-devices').textContent = stats.devices || 0;
        document.getElementById('stat-logins-today').textContent = stats.loginsToday || 0;
        document.getElementById('stat-modules').textContent = stats.totalModules || 0;
        document.getElementById('stat-blocks').textContent = stats.blocks || 0;

        // Badge de resets
        const badge = document.getElementById('reset-badge');
        if (stats.pendingResets > 0) {
            badge.textContent = stats.pendingResets;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }

        // Acessos recentes
        renderRecentAccess(stats.recentAccess || []);

        // Uso de módulos
        renderModuleUsage(stats.moduleUsage || [], stats.totalUsers || 1);

    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
    }
}

function renderRecentAccess(accesses) {
    const list = document.getElementById('recent-access-list');

    if (accesses.length === 0) {
        list.innerHTML = '<li class="empty-state">Nenhum acesso recente</li>';
        return;
    }

    let html = '';
    accesses.forEach(access => {
        const time = formatRelativeTime(new Date(access.created_at));
        const email = access.user_email || 'Desconhecido';
        const initial = email.charAt(0).toUpperCase();

        html += `
            <li class="recent-item">
                <div class="recent-avatar">${initial}</div>
                <div class="recent-info">
                    <span class="recent-name">${email}</span>
                    <span class="recent-time">${time}</span>
                </div>
            </li>
        `;
    });

    list.innerHTML = html;
}

function renderModuleUsage(modules, totalUsers) {
    const container = document.getElementById('module-usage');

    if (modules.length === 0) {
        container.innerHTML = '<div class="empty-state">Nenhum dado disponível</div>';
        return;
    }

    const moduleNames = {
        mapas: 'Mapas',
        veiculos: 'Veículos',
        roupas: 'Roupas',
        peds: 'Peds',
        armas: 'Armas'
    };

    const colors = ['#667eea', '#4ecdc4', '#f093fb', '#ffeaa7', '#fd79a8', '#a29bfe'];
    let html = '';

    modules.forEach((mod, i) => {
        const percentage = Math.round((parseInt(mod.count) / totalUsers) * 100);
        const color = colors[i % colors.length];
        const name = moduleNames[mod.modulo] || mod.modulo;

        html += `
            <div class="module-bar">
                <div class="module-bar-header">
                    <span class="module-name">${name}</span>
                    <span class="module-count">${mod.count} usuários (${percentage}%)</span>
                </div>
                <div class="module-bar-track">
                    <div class="module-bar-fill" style="width:${percentage}%; background:${color};"></div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// ============================================================
// CLIENTES
// ============================================================

async function loadClients() {
    try {
        const response = await apiRequest('/api/clients');
        allClients = await response.json();
        renderClients(allClients);
        document.getElementById('clients-count').textContent = `${allClients.length} clientes`;
    } catch (error) {
        console.error('Erro ao carregar clientes:', error);
        document.getElementById('clients-tbody').innerHTML =
            '<tr><td colspan="6" class="empty-state">Erro ao carregar clientes</td></tr>';
    }
}

function renderClients(clients) {
    const tbody = document.getElementById('clients-tbody');

    if (clients.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Nenhum cliente encontrado</td></tr>';
        return;
    }

    let html = '';
    clients.forEach(client => {
        const statusClass = client.status === 'ativo' ? 'badge-success' :
            client.status === 'inativo' ? 'badge-warning' : 'badge-danger';
        const deviceStatus = client.device_registrado ? 'Vinculado' : 'Não vinculado';
        const lastAccess = client.data_ultimo_acesso ? formatDate(new Date(client.data_ultimo_acesso)) : 'Nunca';

        html += `
            <tr>
                <td><strong>${client.nome || '-'}</strong></td>
                <td>${client.email || '-'}</td>
                <td><span class="badge ${statusClass}">${client.status || '-'}</span></td>
                <td>${deviceStatus}</td>
                <td>${lastAccess}</td>
                <td class="actions-cell">
                    <button class="btn-icon" onclick="editClient(${client.id})" title="Editar">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="btn-icon" onclick="toggleClientStatus(${client.id})" title="Alternar Status">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
                            <line x1="12" y1="2" x2="12" y2="12"/>
                        </svg>
                    </button>
                    ${client.device_registrado ? `
                    <button class="btn-icon" onclick="releaseDevice(${client.id})" title="Liberar Dispositivo">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                            <line x1="8" y1="21" x2="16" y2="21"/>
                            <line x1="12" y1="17" x2="12" y2="21"/>
                        </svg>
                    </button>
                    ` : ''}
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function filterClients() {
    const search = document.getElementById('client-search').value.toLowerCase();
    const filtered = allClients.filter(c =>
        (c.nome && c.nome.toLowerCase().includes(search)) ||
        (c.email && c.email.toLowerCase().includes(search))
    );
    renderClients(filtered);
}

function openClientModal(clientId = null) {
    const modal = document.getElementById('client-modal');
    const title = document.getElementById('client-modal-title');
    const form = document.getElementById('client-form');
    const passwordHint = document.getElementById('password-hint');

    form.reset();
    document.getElementById('client-id').value = '';

    if (clientId) {
        title.textContent = 'Editar Cliente';
        passwordHint.style.display = 'block';
        const client = allClients.find(c => c.id === clientId);
        if (client) {
            document.getElementById('client-id').value = client.id;
            document.getElementById('client-name').value = client.nome || '';
            document.getElementById('client-email').value = client.email || '';
            document.getElementById('client-status').value = client.status || 'ativo';

            document.querySelectorAll('input[name="modulos"]').forEach(cb => {
                cb.checked = client.modulos_permitidos &&
                    client.modulos_permitidos.includes(cb.value);
            });
        }
    } else {
        title.textContent = 'Novo Cliente';
        passwordHint.style.display = 'none';
    }

    modal.style.display = 'flex';
}

function editClient(clientId) {
    openClientModal(clientId);
}

async function saveClient() {
    const clientId = document.getElementById('client-id').value;
    const nome = document.getElementById('client-name').value.trim();
    const email = document.getElementById('client-email').value.trim();
    const password = document.getElementById('client-password').value;
    const status = document.getElementById('client-status').value;

    const modulos = [];
    document.querySelectorAll('input[name="modulos"]:checked').forEach(cb => {
        modulos.push(cb.value);
    });

    if (!nome || !email) {
        showAlert('Erro', 'Preencha nome e email.');
        return;
    }

    try {
        let response;

        if (clientId) {
            response = await apiRequest(`/api/clients/${clientId}`, {
                method: 'PUT',
                body: JSON.stringify({ nome, email, password: password || undefined, status, modulos_permitidos: modulos })
            });
        } else {
            if (!password || password.length < 6) {
                showAlert('Erro', 'Senha é obrigatória para novos clientes (mínimo 6 caracteres).');
                return;
            }
            response = await apiRequest('/api/clients', {
                method: 'POST',
                body: JSON.stringify({ nome, email, password, status, modulos_permitidos: modulos })
            });
        }

        const data = await response.json();

        if (!response.ok) {
            showAlert('Erro', data.error || 'Falha ao salvar');
            return;
        }

        closeModal('client-modal');
        loadClients();
        loadDashboardData();
        showAlert('Sucesso', clientId ? 'Cliente atualizado!' : 'Cliente criado!');
    } catch (error) {
        showAlert('Erro', `Falha ao salvar: ${error.message}`);
    }
}

async function toggleClientStatus(clientId) {
    const client = allClients.find(c => c.id === clientId);
    if (!client) return;

    const newStatus = client.status === 'ativo' ? 'inativo' : 'ativo';
    const action = newStatus === 'ativo' ? 'ativar' : 'desativar';

    showConfirm(
        'Alterar Status',
        `Deseja ${action} o cliente "${client.nome}"?`,
        async () => {
            try {
                await apiRequest(`/api/clients/${clientId}/status`, {
                    method: 'PATCH',
                    body: JSON.stringify({ status: newStatus })
                });
                loadClients();
                loadDashboardData();
            } catch (error) {
                showAlert('Erro', `Falha ao alterar status: ${error.message}`);
            }
        }
    );
}

async function releaseDevice(clientId) {
    const client = allClients.find(c => c.id === clientId);
    if (!client) return;

    showConfirm(
        'Liberar Dispositivo',
        `Deseja desvincular o dispositivo do cliente "${client.nome}"?`,
        async () => {
            try {
                await apiRequest(`/api/clients/${clientId}/release-device`, {
                    method: 'PATCH'
                });
                loadClients();
                loadDashboardData();
            } catch (error) {
                showAlert('Erro', `Falha ao liberar dispositivo: ${error.message}`);
            }
        }
    );
}

// ============================================================
// RESETS DE SENHA
// ============================================================

async function loadPendingResets() {
    try {
        const response = await apiRequest('/api/clients');
        const clients = await response.json();

        const pending = clients.filter(c => c.reset_solicitado && !c.reset_aprovado);
        const tbody = document.getElementById('resets-tbody');

        if (pending.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhuma solicitação pendente</td></tr>';
        } else {
            let html = '';
            pending.forEach(client => {
                const date = client.reset_data_solicitacao ?
                    formatDate(new Date(client.reset_data_solicitacao)) : '-';

                html += `
                    <tr>
                        <td><strong>${client.nome || '-'}</strong></td>
                        <td>${client.email || '-'}</td>
                        <td>${date}</td>
                        <td><span class="badge badge-warning">Pendente</span></td>
                        <td class="actions-cell">
                            <button class="btn-success-sm" onclick="approveReset(${client.id})">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="20 6 9 17 4 12"/>
                                </svg>
                                Aprovar
                            </button>
                            <button class="btn-danger-sm" onclick="denyReset(${client.id}, '${client.email}')">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"/>
                                    <line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                                Negar
                            </button>
                        </td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        }

        document.getElementById('resets-count').textContent = `${pending.length} pendentes`;

        const badge = document.getElementById('reset-badge');
        if (pending.length > 0) {
            badge.textContent = pending.length;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    } catch (error) {
        console.error('Erro ao carregar resets:', error);
    }
}

async function approveReset(userId) {
    showConfirm(
        'Aprovar Reset',
        'Gerar senha temporária para este cliente?',
        async () => {
            try {
                const response = await apiRequest(`/api/admin/approve-reset/${userId}`, {
                    method: 'POST'
                });
                const data = await response.json();

                if (!response.ok) {
                    showAlert('Erro', data.error);
                    return;
                }

                showTempPasswordPopup(data.tempPassword, data.clientName, data.clientEmail);
                loadPendingResets();
                loadDashboardData();
            } catch (error) {
                showAlert('Erro', `Falha ao aprovar: ${error.message}`);
            }
        }
    );
}

async function denyReset(userId, email) {
    showConfirm(
        'Negar Reset',
        `Deseja negar a solicitação de reset de "${email}"?`,
        async () => {
            try {
                await apiRequest(`/api/admin/deny-reset/${userId}`, {
                    method: 'POST'
                });
                loadPendingResets();
                loadDashboardData();
            } catch (error) {
                showAlert('Erro', `Falha ao negar: ${error.message}`);
            }
        }
    );
}

// ============================================================
// AJUDA
// ============================================================

async function loadHelpItems() {
    try {
        const response = await apiRequest('/api/logs/help');
        const items = await response.json();
        const tbody = document.getElementById('help-tbody');

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Nenhum item de ajuda</td></tr>';
            return;
        }

        const typeLabels = { faq: 'FAQ', tutorial: 'Tutorial', contato: 'Contato' };
        let html = '';

        items.forEach(item => {
            html += `
                <tr>
                    <td><strong>${item.titulo || '-'}</strong></td>
                    <td><span class="badge badge-info">${typeLabels[item.tipo] || item.tipo}</span></td>
                    <td>${item.ordem || 0}</td>
                    <td class="actions-cell">
                        <button class="btn-icon" onclick="editHelpItem(${item.id})" title="Editar">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="btn-icon btn-icon-danger" onclick="deleteHelpItem(${item.id})" title="Excluir">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    } catch (error) {
        console.error('Erro ao carregar ajuda:', error);
    }
}

function openHelpModal(itemId = null) {
    const modal = document.getElementById('help-modal');
    const title = document.getElementById('help-modal-title');
    const form = document.getElementById('help-form');

    form.reset();
    document.getElementById('help-id').value = '';

    if (itemId) {
        title.textContent = 'Editar Item de Ajuda';
        loadHelpItemData(itemId);
    } else {
        title.textContent = 'Novo Item de Ajuda';
    }

    modal.style.display = 'flex';
}

async function loadHelpItemData(itemId) {
    try {
        const response = await apiRequest('/api/logs/help');
        const items = await response.json();
        const item = items.find(i => i.id === itemId);

        if (item) {
            document.getElementById('help-id').value = item.id;
            document.getElementById('help-title').value = item.titulo || '';
            document.getElementById('help-type').value = item.tipo || 'faq';
            document.getElementById('help-content').value = item.conteudo || '';
            document.getElementById('help-order').value = item.ordem || 0;
        }
    } catch (error) {
        console.error('Erro ao carregar item:', error);
    }
}

function editHelpItem(itemId) {
    openHelpModal(itemId);
}

async function saveHelpItem() {
    const itemId = document.getElementById('help-id').value;
    const titulo = document.getElementById('help-title').value.trim();
    const tipo = document.getElementById('help-type').value;
    const conteudo = document.getElementById('help-content').value.trim();
    const ordem = parseInt(document.getElementById('help-order').value) || 0;

    if (!titulo || !conteudo) {
        showAlert('Erro', 'Preencha título e conteúdo.');
        return;
    }

    try {
        let response;
        if (itemId) {
            response = await apiRequest(`/api/logs/help/${itemId}`, {
                method: 'PUT',
                body: JSON.stringify({ titulo, tipo, conteudo, ordem })
            });
        } else {
            response = await apiRequest('/api/logs/help', {
                method: 'POST',
                body: JSON.stringify({ titulo, tipo, conteudo, ordem })
            });
        }

        if (!response.ok) {
            const data = await response.json();
            showAlert('Erro', data.error || 'Falha ao salvar');
            return;
        }

        closeModal('help-modal');
        loadHelpItems();
        showAlert('Sucesso', 'Item de ajuda salvo!');
    } catch (error) {
        showAlert('Erro', `Falha ao salvar: ${error.message}`);
    }
}

async function deleteHelpItem(itemId) {
    showConfirm(
        'Excluir Item',
        'Tem certeza que deseja excluir este item de ajuda?',
        async () => {
            try {
                await apiRequest(`/api/logs/help/${itemId}`, { method: 'DELETE' });
                loadHelpItems();
            } catch (error) {
                showAlert('Erro', `Falha ao excluir: ${error.message}`);
            }
        }
    );
}

// ============================================================
// LOGS
// ============================================================

async function loadLogs() {
    try {
        const response = await apiRequest('/api/logs');
        allLogs = await response.json();
        renderLogs(allLogs);
    } catch (error) {
        console.error('Erro ao carregar logs:', error);
        document.getElementById('logs-tbody').innerHTML =
            '<tr><td colspan="5" class="empty-state">Erro ao carregar logs</td></tr>';
    }
}

function renderLogs(logs) {
    const tbody = document.getElementById('logs-tbody');

    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhum log encontrado</td></tr>';
        return;
    }

    let html = '';
    logs.forEach(log => {
        const time = log.created_at ? formatDate(new Date(log.created_at)) : '-';
        const typeClass = log.tipo === 'admin' ? 'badge-purple' : 'badge-info';
        const typeLabel = log.tipo === 'admin' ? 'Admin' : 'Usuário';

        html += `
            <tr>
                <td>${time}</td>
                <td><span class="badge ${typeClass}">${typeLabel}</span></td>
                <td>${log.action || '-'}</td>
                <td>${log.user_email || '-'}</td>
                <td class="log-details">${log.details || '-'}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function filterLogs() {
    const filter = document.getElementById('log-filter').value;
    if (filter === 'all') {
        renderLogs(allLogs);
    } else {
        renderLogs(allLogs.filter(l => l.tipo === filter));
    }
}

// ============================================================
// MODAIS
// ============================================================

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function showAlert(title, message) {
    document.getElementById('alert-modal-title').textContent = title;
    document.getElementById('alert-modal-message').textContent = message;
    document.getElementById('alert-modal').style.display = 'flex';
}

function showConfirm(title, message, onConfirm) {
    document.getElementById('confirm-modal-title').textContent = title;
    document.getElementById('confirm-modal-message').textContent = message;

    const btn = document.getElementById('confirm-modal-btn');
    btn.onclick = () => {
        closeModal('confirm-modal');
        onConfirm();
    };

    document.getElementById('confirm-modal').style.display = 'flex';
}

function showTempPasswordPopup(password, clientName, clientEmail) {
    document.getElementById('temp-password-value').textContent = password;
    document.getElementById('temp-password-client').textContent = clientName;
    document.getElementById('temp-password-email').textContent = clientEmail;
    document.getElementById('temp-password-modal').style.display = 'flex';
}

function copyTempPassword() {
    const password = document.getElementById('temp-password-value').textContent;
    navigator.clipboard.writeText(password).then(() => {
        const btn = document.querySelector('.btn-copy');
        const original = btn.innerHTML;
        btn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"/>
            </svg>
            Copiado!
        `;
        setTimeout(() => { btn.innerHTML = original; }, 2000);
    });
}

// Fechar modais
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.style.display = 'none';
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
    }
});

// ============================================================
// UTILITÁRIOS
// ============================================================

function formatDate(date) {
    if (!date) return '-';
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    }).format(date);
}

function formatRelativeTime(date) {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Agora';
    if (minutes < 60) return `${minutes}min atrás`;
    if (hours < 24) return `${hours}h atrás`;
    if (days < 7) return `${days}d atrás`;
    return formatDate(date);
}
