-- Tabela de administradores
CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    status VARCHAR(50) DEFAULT 'ativo',
    permissoes TEXT[] DEFAULT '{"gerenciar_usuarios","aprovar_resets","gerenciar_ajuda","ver_logs"}',
    ultimo_acesso TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de usuários (clientes do programa)
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'ativo',
    modulos_permitidos TEXT[] DEFAULT '{}',
    device_id VARCHAR(255),
    device_nome VARCHAR(255),
    device_registrado BOOLEAN DEFAULT FALSE,
    reset_solicitado BOOLEAN DEFAULT FALSE,
    reset_data_solicitacao TIMESTAMP,
    reset_aprovado BOOLEAN DEFAULT FALSE,
    senha_temporaria VARCHAR(255),
    is_senha_temporaria BOOLEAN DEFAULT FALSE,
    max_dispositivos INTEGER DEFAULT 1,
    data_ultimo_acesso TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de logs de atividade
CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    tipo VARCHAR(50) NOT NULL,
    user_id INTEGER,
    user_email VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    details TEXT,
    ip VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de itens de ajuda
CREATE TABLE IF NOT EXISTS help_items (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL,
    tipo VARCHAR(50) DEFAULT 'faq',
    conteudo TEXT NOT NULL,
    ordem INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_usuarios_status ON usuarios(status);
CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_usuarios_reset ON usuarios(reset_solicitado, reset_aprovado);
CREATE INDEX idx_logs_tipo ON activity_logs(tipo);
CREATE INDEX idx_logs_action ON activity_logs(action);
CREATE INDEX idx_logs_created ON activity_logs(created_at DESC);
