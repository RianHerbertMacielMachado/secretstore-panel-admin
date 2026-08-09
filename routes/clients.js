const express = require('express');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Listar todos os clientes
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, nome, email, status, modulos_permitidos, device_id, device_nome, device_registrado, reset_solicitado, reset_aprovado, reset_data_solicitacao, data_ultimo_acesso, created_at FROM usuarios ORDER BY created_at DESC'
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Erro ao listar clientes:', error);
        res.status(500).json({ error: 'Erro ao listar clientes' });
    }
});

// Criar novo cliente
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    const { nome, email, password, status, modulos_permitidos } = req.body;

    if (!nome || !email || !password) {
        return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
    }

    try {
        // Verificar se email já existe
        const existing = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Email já cadastrado' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const result = await pool.query(
            `INSERT INTO usuarios (nome, email, senha_hash, status, modulos_permitidos) 
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [nome, email, hashedPassword, status || 'ativo', modulos_permitidos || []]
        );

        // Log
        await pool.query(
            'INSERT INTO activity_logs (tipo, user_id, user_email, action, details) VALUES ($1, $2, $3, $4, $5)',
            ['admin', req.user.id, req.user.email, 'create_client', `Criou cliente: ${email}`]
        );

        res.status(201).json({ message: 'Cliente criado', id: result.rows[0].id });
    } catch (error) {
        console.error('Erro ao criar cliente:', error);
        res.status(500).json({ error: 'Erro ao criar cliente' });
    }
});

// Atualizar cliente
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { nome, email, password, status, modulos_permitidos } = req.body;

    try {
        let query = `UPDATE usuarios SET nome = $1, email = $2, status = $3, modulos_permitidos = $4, updated_at = NOW() WHERE id = $5`;
        let params = [nome, email, status, modulos_permitidos || [], id];

        // Se senha foi fornecida, atualizar também
        if (password && password.length >= 6) {
            const hashedPassword = await bcrypt.hash(password, 12);
            query = `UPDATE usuarios SET nome = $1, email = $2, status = $3, modulos_permitidos = $4, senha_hash = $5, updated_at = NOW() WHERE id = $6`;
            params = [nome, email, status, modulos_permitidos || [], hashedPassword, id];
        }

        await pool.query(query, params);

        // Log
        await pool.query(
            'INSERT INTO activity_logs (tipo, user_id, user_email, action, details) VALUES ($1, $2, $3, $4, $5)',
            ['admin', req.user.id, req.user.email, 'edit_client', `Editou cliente: ${email}`]
        );

        res.json({ message: 'Cliente atualizado' });
    } catch (error) {
        console.error('Erro ao atualizar cliente:', error);
        res.status(500).json({ error: 'Erro ao atualizar cliente' });
    }
});

// Alterar status
router.patch('/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    try {
        await pool.query(
            'UPDATE usuarios SET status = $1, updated_at = NOW() WHERE id = $2',
            [status, id]
        );

        const user = await pool.query('SELECT email FROM usuarios WHERE id = $1', [id]);

        const action = status === 'ativo' ? 'activate_client' : 'block_client';
        await pool.query(
            'INSERT INTO activity_logs (tipo, user_id, user_email, action, details) VALUES ($1, $2, $3, $4, $5)',
            ['admin', req.user.id, req.user.email, action, `Alterou status de ${user.rows[0].email} para ${status}`]
        );

        res.json({ message: 'Status atualizado' });
    } catch (error) {
        console.error('Erro ao alterar status:', error);
        res.status(500).json({ error: 'Erro ao alterar status' });
    }
});

// Liberar dispositivo
router.patch('/:id/release-device', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        await pool.query(
            'UPDATE usuarios SET device_id = NULL, device_nome = NULL, device_registrado = FALSE, updated_at = NOW() WHERE id = $1',
            [id]
        );

        const user = await pool.query('SELECT email FROM usuarios WHERE id = $1', [id]);

        await pool.query(
            'INSERT INTO activity_logs (tipo, user_id, user_email, action, details) VALUES ($1, $2, $3, $4, $5)',
            ['admin', req.user.id, req.user.email, 'release_device', `Liberou dispositivo de ${user.rows[0].email}`]
        );

        res.json({ message: 'Dispositivo liberado' });
    } catch (error) {
        console.error('Erro ao liberar dispositivo:', error);
        res.status(500).json({ error: 'Erro ao liberar dispositivo' });
    }
});

// Alterar senha do cliente
router.patch('/:id/change-password', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
    }

    try {
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await pool.query(
            'UPDATE usuarios SET senha_hash = $1, updated_at = NOW() WHERE id = $2',
            [hashedPassword, id]
        );

        const user = await pool.query('SELECT email FROM usuarios WHERE id = $1', [id]);

        await pool.query(
            'INSERT INTO activity_logs (tipo, user_id, user_email, action, details) VALUES ($1, $2, $3, $4, $5)',
            ['admin', req.user.id, req.user.email, 'change_password', `Alterou senha de ${user.rows[0].email}`]
        );

        res.json({ message: 'Senha alterada' });
    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        res.status(500).json({ error: 'Erro ao alterar senha' });
    }
});

module.exports = router;
