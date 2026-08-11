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

// ═══════════════════════════════════════════════════
// ROTAS DE EMERGÊNCIA (acesso sem login)
// ═══════════════════════════════════════════════════
app.get('/api/emergency/unlock', async (req, res) => {
    const EMERGENCY_KEY = process.env.EMERGENCY_KEY || 'secretstore-emergency-2025';
    if (req.query.key !== EMERGENCY_KEY) {
        return res.status(404).json({ error: 'Not found' });
    }

    const emergencyPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false
    });

    try {
        await emergencyPool.query("UPDATE admins SET status = 'ativo'");
        const admins = await emergencyPool.query('SELECT id, email, status FROM admins');
        await emergencyPool.end();
        res.json({ success: true, message: 'Todos os admins desbloqueados', admins: admins.rows });
    } catch (error) {
        await emergencyPool.end();
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/emergency/reset-password', async (req, res) => {
    const EMERGENCY_KEY = process.env.EMERGENCY_KEY || 'secretstore-emergency-2025';
    if (req.query.key !== EMERGENCY_KEY) {
        return res.status(404).json({ error: 'Not found' });
    }

    const { email, newpass } = req.query;
    if (!email || !newpass) {
        return res.json({ uso: '/api/emergency/reset-password?key=CHAVE&email=EMAIL&newpass=NOVASENHA' });
    }

    const emergencyPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false
    });

    try {
        const hash = await bcrypt.hash(newpass, 12);
        const result = await emergencyPool.query(
            "UPDATE admins SET senha_hash = $1, status = 'ativo' WHERE email = $2 RETURNING id, email",
            [hash, email]
        );
        await emergencyPool.end();

        if (result.rowCount === 0) {
            return res.json({ error: 'Admin não encontrado com esse email' });
        }
        res.json({ success: true, message: `Senha do ${email} resetada com sucesso. Nova senha: ${newpass}` });
    } catch (error) {
        await emergencyPool.end();
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/emergency/status', async (req, res) => {
    const EMERGENCY_KEY = process.env.EMERGENCY_KEY || 'secretstore-emergency-2025';
    if (req.query.key !== EMERGENCY_KEY) {
        return res.status(404).json({ error: 'Not found' });
    }

    const emergencyPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false
    });

    try {
        const admins = await emergencyPool.query('SELECT id, nome, email, status, role, ultimo_acesso, created_at FROM admins');
        await emergencyPool.end();
        res.json({ success: true, admins: admins.rows });
    } catch (error) {
        await emergencyPool.end();
        res.status(500).json({ error: error.message });
    }
});

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
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
            ? { rejectUnauthorized: false }
            : false
    });

    try {
        // Criar tabelas
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

        // Criar índices
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_usuarios_status ON usuarios(status);
            CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
            CREATE INDEX IF NOT EXISTS idx_usuarios_reset ON usuarios(reset_solicitado, reset_aprovado);
            CREATE INDEX IF NOT EXISTS idx_logs_tipo ON activity_logs(tipo);
            CREATE INDEX IF NOT EXISTS idx_logs_action ON activity_logs(action);
            CREATE INDEX IF NOT EXISTS idx_logs_created ON activity_logs(created_at DESC);
        `);

        console.log('[DB] Tabelas e índices criados com sucesso');

        // ═══════════════════════════════════════════════════
        // SEED: Criar admin padrão se não existir
        // ═══════════════════════════════════════════════════
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@secretstore.com';
        const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@2025';
        const adminNome = process.env.ADMIN_NOME || 'Administrador';

        const existingAdmin = await pool.query(
            'SELECT id FROM admins WHERE email = $1',
            [adminEmail]
        );

        if (existingAdmin.rows.length === 0) {
            const senhaHash = await bcrypt.hash(adminPassword, 12);
            await pool.query(
                `INSERT INTO admins (nome, email, senha_hash, role, status) 
                 VALUES ($1, $2, $3, 'super_admin', 'ativo')`,
                [adminNome, adminEmail, senhaHash]
            );
            console.log(`[DB] ✅ Admin padrão criado: ${adminEmail}`);
        } else {
            console.log(`[DB] Admin já existe: ${adminEmail}`);
        }

        // Criar itens de ajuda padrão se tabela estiver vazia
        const helpCount = await pool.query('SELECT COUNT(*) FROM help_items');
        if (parseInt(helpCount.rows[0].count) === 0) {
            await pool.query(`
                INSERT INTO help_items (titulo, tipo, conteudo, ordem) VALUES
                ('Como fazer login', 'faq', 'Use o email e senha fornecidos pelo administrador. No primeiro acesso com senha temporária, você será solicitado a criar uma nova senha.', 1),
                ('Módulos disponíveis', 'faq', 'Os módulos disponíveis dependem da sua licença: Mapas, Carros, Roupas, Peds e Weapons. Consulte o administrador para liberar módulos adicionais.', 2),
                ('Problemas de conexão', 'faq', 'Verifique sua conexão com a internet. O programa funciona offline por até 30 dias após o último login online.', 3),
                ('Contato', 'contato', 'Para suporte, entre em contato pelo Discord ou email do administrador.', 4)
            `);
            console.log('[DB] ✅ Itens de ajuda padrão criados');
        }

        await pool.end();
        console.log('[DB] ✅ Banco inicializado com sucesso');

    } catch (error) {
        console.error('[DB] ❌ Erro ao inicializar banco:', error.message || error);
        console.error('[DB] Stack:', error.stack);
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`[Server] Admin Panel rodando na porta ${PORT}`);
    });
}

start();
