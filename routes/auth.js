const express = require('express');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const { authenticateToken, generateToken } = require('../middleware/auth');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Login do admin
router.post('/admin/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    try {
        const result = await pool.query(
            'SELECT * FROM admins WHERE email = $1 AND status = $2',
            [email, 'ativo']
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Email ou senha inválidos' });
        }

        const admin = result.rows[0];
        const validPassword = await bcrypt.compare(password, admin.senha_hash);

        if (!validPassword) {
            return res.status(401).json({ error: 'Email ou senha inválidos' });
        }

        // Atualizar último acesso
        await pool.query(
            'UPDATE admins SET ultimo_acesso = NOW() WHERE id = $1',
            [admin.id]
        );

        // Registrar log
        await pool.query(
            'INSERT INTO activity_logs (tipo, user_id, user_email, action, details) VALUES ($1, $2, $3, $4, $5)',
            ['admin', admin.id, admin.email, 'login', 'Admin fez login']
        );

        const token = generateToken({
            id: admin.id,
            email: admin.email,
            nome: admin.nome,
            role: 'admin'
        });

        res.json({
            token,
            admin: {
                id: admin.id,
                nome: admin.nome,
                email: admin.email,
                role: admin.role
            }
        });
    } catch (error) {
        console.error('Erro no login admin:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Login do cliente (usado pelo app Electron)
router.post('/client/login', async (req, res) => {
    const { email, password, device_id, device_nome } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    try {
        const result = await pool.query(
            'SELECT * FROM clientes WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Email ou senha inválidos' });
        }

        const user = result.rows[0];

        // Verificar status
        if (user.status !== 'ativo') {
            return res.status(403).json({ error: 'Conta desativada. Contate o administrador.' });
        }

        const validPassword = await bcrypt.compare(password, user.senha_hash);

        if (!validPassword) {
            return res.status(401).json({ error: 'Email ou senha inválidos' });
        }

        // Verificar dispositivo
        if (user.device_registrado && user.device_id && user.device_id !== device_id) {
            return res.status(403).json({
                error: 'Este programa já está vinculado a outro dispositivo.',
                code: 'DEVICE_MISMATCH'
            });
        }

        // Registrar dispositivo se ainda não tem
        if (!user.device_registrado && device_id) {
            await pool.query(
                'UPDATE clientes SET device_id = $1, device_nome = $2, device_registrado = TRUE WHERE id = $3',
                [device_id, device_nome || 'Desconhecido', user.id]
            );
        }

        // Atualizar último acesso
        await pool.query(
            'UPDATE clientes SET data_ultimo_acesso = NOW() WHERE id = $1',
            [user.id]
        );

        // Log de atividade
        await pool.query(
            'INSERT INTO activity_logs (tipo, user_id, user_email, action, details) VALUES ($1, $2, $3, $4, $5)',
            ['user', user.id, user.email, 'login', `Login de ${device_nome || 'dispositivo'}`]
        );

        const token = generateToken({
            id: user.id,
            email: user.email,
            nome: user.nome,
            role: 'client'
        }, '12h');

        res.json({
            token,
            user: {
                id: user.id,
                nome: user.nome,
                email: user.email,
                modulos_permitidos: user.modulos_permitidos,
                is_senha_temporaria: user.is_senha_temporaria
            }
        });
    } catch (error) {
        console.error('Erro no login cliente:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Solicitar reset de senha (não autenticado)
router.post('/client/request-reset', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email é obrigatório' });
    }

    try {
        const result = await pool.query(
            'SELECT id, nome FROM clientes WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            // Não revelar se email existe ou não
            return res.json({ message: 'Se o email estiver cadastrado, a solicitação foi registrada.' });
        }

        await pool.query(
            'UPDATE clientes SET reset_solicitado = TRUE, reset_data_solicitacao = NOW() WHERE email = $1',
            [email]
        );

        // Log
        await pool.query(
            'INSERT INTO activity_logs (tipo, user_email, action, details) VALUES ($1, $2, $3, $4)',
            ['user', email, 'reset_request', 'Solicitação de reset de senha']
        );

        res.json({ message: 'Se o email estiver cadastrado, a solicitação foi registrada.' });
    } catch (error) {
        console.error('Erro no reset:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Definir nova senha (cliente autenticado com senha temporária)
router.post('/client/set-password', authenticateToken, async (req, res) => {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'Nova senha deve ter pelo menos 6 caracteres' });
    }

    try {
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        await pool.query(
            `UPDATE clientes SET 
                senha_hash = $1, 
                is_senha_temporaria = FALSE, 
                senha_temporaria = NULL, 
                reset_solicitado = FALSE, 
                reset_aprovado = FALSE, 
                reset_data_solicitacao = NULL,
                updated_at = NOW()
            WHERE id = $2`,
            [hashedPassword, req.user.id]
        );

        // Log
        await pool.query(
            'INSERT INTO activity_logs (tipo, user_id, user_email, action, details) VALUES ($1, $2, $3, $4, $5)',
            ['user', req.user.id, req.user.email, 'password_change', 'Definiu nova senha após reset']
        );

        res.json({ message: 'Senha atualizada com sucesso' });
    } catch (error) {
        console.error('Erro ao definir senha:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Verificar token (validação de sessão)
router.get('/verify', authenticateToken, (req, res) => {
    res.json({ valid: true, user: req.user });
});

module.exports = router;
