const express = require('express');
const { Pool } = require('pg');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Dashboard stats
router.get('/dashboard', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const stats = {};

        // Clientes ativos
        const active = await pool.query("SELECT COUNT(*) FROM clientes WHERE status = 'ativo'");
        stats.activeClients = parseInt(active.rows[0].count);

        // Clientes inativos
        const inactive = await pool.query("SELECT COUNT(*) FROM clientes WHERE status = 'inativo'");
        stats.inactiveClients = parseInt(inactive.rows[0].count);

        // Novos últimos 30 dias
        const newClients = await pool.query(
            "SELECT COUNT(*) FROM clientes WHERE criado_em >= NOW() - INTERVAL '30 days'"
        );
        stats.newClients = parseInt(newClients.rows[0].count);

        // Resets pendentes
        const resets = await pool.query(
            "SELECT COUNT(*) FROM clientes WHERE reset_solicitado = TRUE AND reset_aprovado = FALSE"
        );
        stats.pendingResets = parseInt(resets.rows[0].count);

        // Dispositivos vinculados
        const devices = await pool.query("SELECT COUNT(*) FROM clientes WHERE device_id IS NOT NULL");
        stats.devices = parseInt(devices.rows[0].count);

        // Logins hoje
        const loginsToday = await pool.query(
            "SELECT COUNT(*) FROM logs_acesso WHERE acao = 'login' AND criado_em >= CURRENT_DATE"
        );
        stats.loginsToday = parseInt(loginsToday.rows[0].count);

        // Total módulos atribuídos
        const modules = await pool.query(
            "SELECT COALESCE(SUM(array_length(modulos_permitidos, 1)), 0) as total FROM clientes"
        );
        stats.totalModules = parseInt(modules.rows[0].total);

        // Bloqueios últimas 24h
        const blocks = await pool.query(
            "SELECT COUNT(*) FROM logs_acesso WHERE acao = 'block_client' AND criado_em >= NOW() - INTERVAL '24 hours'"
        );
        stats.blocks = parseInt(blocks.rows[0].count);

        // Acessos recentes
        const recentAccess = await pool.query(
            "SELECT email, criado_em FROM logs_acesso WHERE acao = 'login' ORDER BY criado_em DESC LIMIT 8"
        );
        stats.recentAccess = recentAccess.rows;

        // Uso de módulos
        const moduleUsage = await pool.query(
            "SELECT unnest(modulos_permitidos) as modulo, COUNT(*) as count FROM clientes GROUP BY modulo ORDER BY count DESC"
        );
        stats.moduleUsage = moduleUsage.rows;
        stats.totalUsers = stats.activeClients + stats.inactiveClients;

        res.json(stats);
    } catch (error) {
        console.error('Erro no dashboard:', error);
        res.status(500).json({ error: 'Erro ao carregar dashboard' });
    }
});

// Aprovar reset de senha
router.post('/approve-reset/:userId', authenticateToken, requireAdmin, async (req, res) => {
    const { userId } = req.params;

    try {
        // Gerar senha temporária
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
        let tempPassword = '';
        for (let i = 0; i < 10; i++) {
            tempPassword += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        const hashedPassword = require('bcrypt').hashSync(tempPassword, 12);

        await pool.query(
            `UPDATE clientes SET 
                senha_hash = $1, 
                reset_aprovado = TRUE, 
                is_senha_temporaria = TRUE,
                atualizado_em = NOW()
            WHERE id = $2`,
            [hashedPassword, userId]
        );

        // Buscar dados do usuário para o log
        const user = await pool.query('SELECT email, nome FROM clientes WHERE id = $1', [userId]);

        // Log
        await pool.query(
            'INSERT INTO logs_acesso (email, acao, detalhes) VALUES ($1, $2, $3)',
            [req.user.email, 'approve_reset', `Aprovou reset para: ${user.rows[0].email}`]
        );

        res.json({
            message: 'Reset aprovado',
            tempPassword: tempPassword,
            clientName: user.rows[0].nome,
            clientEmail: user.rows[0].email
        });
    } catch (error) {
        console.error('Erro ao aprovar reset:', error);
        res.status(500).json({ error: 'Erro ao aprovar reset' });
    }
});

// Negar reset
router.post('/deny-reset/:userId', authenticateToken, requireAdmin, async (req, res) => {
    const { userId } = req.params;

    try {
        await pool.query(
            `UPDATE clientes SET 
                reset_solicitado = FALSE,
                atualizado_em = NOW()
            WHERE id = $1`,
            [userId]
        );

        const user = await pool.query('SELECT email FROM clientes WHERE id = $1', [userId]);

        await pool.query(
            'INSERT INTO logs_acesso (email, acao, detalhes) VALUES ($1, $2, $3)',
            [req.user.email, 'deny_reset', `Negou reset para: ${user.rows[0].email}`]
        );

        res.json({ message: 'Reset negado' });
    } catch (error) {
        console.error('Erro ao negar reset:', error);
        res.status(500).json({ error: 'Erro ao negar reset' });
    }
});

module.exports = router;
