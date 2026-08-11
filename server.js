require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 8080;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Database ─────────────────────────────────────────────────────────────────
const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.DATABASE_URL?.includes('railway');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isRailway ? { rejectUnauthorized: false } : false
});

// ─── Emergency Routes ─────────────────────────────────────────────────────────
app.get('/api/emergency/unlock', async (req, res) => {
    if (!process.env.EMERGENCY_KEY || req.query.key !== process.env.EMERGENCY_KEY) {
        return res.status(403).json({ error: 'Chave inválida' });
    }
    try {
        await pool.query("UPDATE admins SET status = 'ativo'");
        // Também desbloqueia clientes se necessário
        await pool.query("UPDATE clientes SET status = 'ativo'");
        res.json({ success: true, message: 'Todos os admins e clientes desbloqueados.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/emergency/reset-password', async (req, res) => {
    if (!process.env.EMERGENCY_KEY || req.query.key !== process.env.EMERGENCY_KEY) {
        return res.status(403).json({ error: 'Chave inválida' });
    }
    try {
        const { email, newpass } = req.query;
        if (!email || !newpass) return res.status(400).json({ error: 'email e newpass são obrigatórios' });
        const hash = await bcrypt.hash(newpass, 12);
        // Tenta atualizar em admins
        const r1 = await pool.query("UPDATE admins SET senha_hash = $1, status = 'ativo' WHERE email = $2", [hash, email]);
        // Tenta atualizar em clientes
        const r2 = await pool.query("UPDATE clientes SET senha_hash = $1, status = 'ativo', is_senha_temporaria = false WHERE email = $2", [hash, email]);
        res.json({
            success: true,
            message: `Senha resetada. Admins atualizados: ${r1.rowCount}, Clientes atualizados: ${r2.rowCount}`
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/emergency/status', async (req, res) => {
    if (!process.env.EMERGENCY_KEY || req.query.key !== process.env.EMERGENCY_KEY) {
        return res.status(403).json({ error: 'Chave inválida' });
    }
    try {
        const admins = await pool.query("SELECT id, nome, email, status, criado_em FROM admins");
        const clientes = await pool.query("SELECT id, nome, email, status, modulos_permitidos, device_id, ultimo_login, criado_em FROM clientes");
        res.json({ admins: admins.rows, clientes: clientes.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/logs/help', require('./routes/help'));
app.use('/api/logs', require('./routes/logs'));
// app.use('/api/help', require('./routes/help'));


// ─── Static Files (SPA) ──────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

// ─── Start Server ─────────────────────────────────────────────────────────────
async function start() {
    try {
        console.log('[DB] Conectando ao PostgreSQL...');

        // ══════════════════════════════════════════════════════════════
        // TABELAS — usa "clientes" (mesma tabela que a API do .exe)
        // ══════════════════════════════════════════════════════════════
        await pool.query(`
            CREATE TABLE IF NOT EXISTS admins (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                senha_hash VARCHAR(255) NOT NULL,
                role VARCHAR(20) DEFAULT 'super_admin',
                status VARCHAR(20) DEFAULT 'ativo',
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS clientes (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                senha_hash VARCHAR(255) NOT NULL,
                status VARCHAR(20) DEFAULT 'ativo',
                modulos_permitidos TEXT[] DEFAULT ARRAY['mapas', 'veiculos', 'roupas', 'peds', 'weapons'],
                is_senha_temporaria BOOLEAN DEFAULT FALSE,
                device_id VARCHAR(255),
                ultimo_login TIMESTAMP,
                reset_solicitado BOOLEAN DEFAULT FALSE,
                reset_aprovado BOOLEAN DEFAULT FALSE,
                notas TEXT,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS sessoes (
                id SERIAL PRIMARY KEY,
                cliente_id INTEGER REFERENCES clientes(id) ON DELETE CASCADE,
                token_hash VARCHAR(255) NOT NULL,
                device_id VARCHAR(255),
                ip_address VARCHAR(50),
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expira_em TIMESTAMP NOT NULL
            );

            CREATE TABLE IF NOT EXISTS logs_acesso (
                id SERIAL PRIMARY KEY,
                cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
                email VARCHAR(255),
                acao VARCHAR(50) NOT NULL,
                detalhes TEXT,
                ip_address VARCHAR(50),
                device_id VARCHAR(255),
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS help_info (
                id SERIAL PRIMARY KEY,
                titulo VARCHAR(200) NOT NULL,
                conteudo TEXT NOT NULL,
                ordem INTEGER DEFAULT 0,
                ativo BOOLEAN DEFAULT TRUE,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_clientes_email ON clientes(email);
            CREATE INDEX IF NOT EXISTS idx_clientes_status ON clientes(status);
            CREATE INDEX IF NOT EXISTS idx_sessoes_cliente_id ON sessoes(cliente_id);
            CREATE INDEX IF NOT EXISTS idx_logs_cliente_id ON logs_acesso(cliente_id);
            CREATE INDEX IF NOT EXISTS idx_logs_criado_em ON logs_acesso(criado_em);
        `);

        console.log('[DB] ✅ Tabelas e índices criados com sucesso');

        // ─── Seed Admin ──────────────────────────────────────────────
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@secretstore.com';
        const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@2025';
        const adminNome = process.env.ADMIN_NOME || 'Administrador';

        const adminExists = await pool.query('SELECT id FROM admins WHERE email = $1', [adminEmail]);
        if (adminExists.rows.length === 0) {
            const hash = await bcrypt.hash(adminPassword, 12);
            await pool.query(
                'INSERT INTO admins (nome, email, senha_hash, role, status) VALUES ($1, $2, $3, $4, $5)',
                [adminNome, adminEmail, hash, 'super_admin', 'ativo']
            );
            console.log(`[DB] ✅ Admin padrão criado: ${adminEmail}`);
        } else {
            console.log(`[DB] Admin já existe: ${adminEmail}`);
        }

        // ─── Seed Help Info ──────────────────────────────────────────
        const helpCount = await pool.query('SELECT COUNT(*) FROM help_info');
        if (parseInt(helpCount.rows[0].count) === 0) {
            await pool.query(`
                INSERT INTO help_info (titulo, conteudo, ordem) VALUES
                ('Como fazer login', 'Use o email e senha fornecidos pelo administrador. Na primeira vez, você será solicitado a alterar sua senha.', 1),
                ('Módulos', 'Você terá acesso apenas aos módulos habilitados pelo administrador: Mapas, Carros, Roupas, Peds e Weapons.', 2),
                ('Problemas de conexão', 'Verifique sua internet. Se o problema persistir, entre em contato com o suporte.', 3),
                ('Contato', 'Para suporte, entre em contato com a Secret Store através do painel administrativo.', 4)
            `);
            console.log('[DB] ✅ Itens de ajuda padrão criados');
        }

        // ─── Remover tabela "usuarios" se existir (legado) ───────────
        await pool.query('DROP TABLE IF EXISTS usuarios CASCADE');
        console.log('[DB] ✅ Tabela legada "usuarios" removida (se existia)');

        console.log('[DB] ✅ Banco inicializado com sucesso');

        // ─── Start Express ───────────────────────────────────────────
        app.listen(PORT, () => {
            console.log(`[Server] ✅ Admin Panel rodando na porta ${PORT}`);
        });

    } catch (error) {
        console.error('[DB] ❌ Erro ao inicializar:', error.message);
        console.error(error);
        process.exit(1);
    }
}

start();
