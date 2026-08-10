require('dotenv').config();

const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const clientRoutes = require('./routes/clients');
const logRoutes = require('./routes/logs');

const app = express();
const PORT = process.env.PORT || 3000;

// Segurança
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            connectSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false
}));

app.use(compression());
app.use(cors());
app.use(express.json());

// Rotas API
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/logs', logRoutes);

// Arquivos estáticos
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    etag: true
}));

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inicializar banco e servidor
async function start() {
    // Criar tabelas se não existirem
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway') 
            ? { rejectUnauthorized: false } 
            : false
    });

    try {
        await pool.query(`
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

            CREATE TABLE IF NOT EXISTS help_items (
                id SERIAL PRIMARY KEY,
                titulo VARCHAR(255) NOT NULL,
                tipo VARCHAR(50) DEFAULT 'faq',
                conteudo TEXT NOT NULL,
                ordem INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_usuarios_status ON usuarios(status);
            CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
            CREATE INDEX IF NOT EXISTS idx_usuarios_reset ON usuarios(reset_solicitado, reset_aprovado);
            CREATE INDEX IF NOT EXISTS idx_logs_tipo ON activity_logs(tipo);
            CREATE INDEX IF NOT EXISTS idx_logs_action ON activity_logs(action);
            CREATE INDEX IF NOT EXISTS idx_logs_created ON activity_logs(created_at DESC);
        `);

        console.log('[DB] Banco inicializado com sucesso');
        await pool.end();
    } catch (error) {
        console.error('[DB] Erro ao inicializar:', error.message);
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`[Server] Admin Panel rodando na porta ${PORT}`);
    });
}

start();
