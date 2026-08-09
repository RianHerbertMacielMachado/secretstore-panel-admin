const express = require('express');
const { Pool } = require('pg');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Listar logs
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    const { tipo, limit } = req.query;

    try {
        let query = 'SELECT * FROM activity_logs';
        let params = [];

        if (tipo && tipo !== 'all') {
            query += ' WHERE tipo = $1';
            params.push(tipo);
        }

        query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
        params.push(parseInt(limit) || 100);

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Erro ao listar logs:', error);
        res.status(500).json({ error: 'Erro ao listar logs' });
    }
});

// Help items - listar
router.get('/help', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM help_items ORDER BY ordem ASC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao listar itens de ajuda' });
    }
});

// Help items - criar
router.post('/help', authenticateToken, requireAdmin, async (req, res) => {
    const { titulo, tipo, conteudo, ordem } = req.body;

    try {
        const result = await pool.query(
            'INSERT INTO help_items (titulo, tipo, conteudo, ordem) VALUES ($1, $2, $3, $4) RETURNING id',
            [titulo, tipo || 'faq', conteudo, ordem || 0]
        );
        res.status(201).json({ message: 'Item criado', id: result.rows[0].id });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao criar item' });
    }
});

// Help items - atualizar
router.put('/help/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { titulo, tipo, conteudo, ordem } = req.body;

    try {
        await pool.query(
            'UPDATE help_items SET titulo = $1, tipo = $2, conteudo = $3, ordem = $4, updated_at = NOW() WHERE id = $5',
            [titulo, tipo, conteudo, ordem, id]
        );
        res.json({ message: 'Item atualizado' });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao atualizar item' });
    }
});

// Help items - deletar
router.delete('/help/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        await pool.query('DELETE FROM help_items WHERE id = $1', [id]);
        res.json({ message: 'Item excluído' });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao excluir item' });
    }
});

// Help items - listar público (para o app Electron)
router.get('/help/public', async (req, res) => {
    try {
        const result = await pool.query('SELECT titulo, tipo, conteudo, ordem FROM help_items ORDER BY ordem ASC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao listar ajuda' });
    }
});

module.exports = router;
