const express = require('express');
const { Pool } = require('pg');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Listar itens de ajuda
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, titulo, conteudo, ordem, ativo, criado_em FROM help_info ORDER BY ordem ASC'
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Erro ao listar help:', error);
        res.status(500).json({ error: 'Erro ao listar itens de ajuda' });
    }
});

// Criar item
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    const { titulo, tipo, conteudo, ordem } = req.body;

    if (!titulo || !conteudo) {
        return res.status(400).json({ error: 'Título e conteúdo são obrigatórios' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO help_info (titulo, conteudo, ordem, ativo) VALUES ($1, $2, $3, true) RETURNING id',
            [titulo, conteudo, ordem || 0]
        );
        res.status(201).json({ message: 'Item criado', id: result.rows[0].id });
    } catch (error) {
        console.error('Erro ao criar help:', error);
        res.status(500).json({ error: 'Erro ao criar item' });
    }
});

// Atualizar item
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { titulo, tipo, conteudo, ordem } = req.body;

    try {
        await pool.query(
            'UPDATE help_info SET titulo = $1, conteudo = $2, ordem = $3 WHERE id = $4',
            [titulo, conteudo, ordem || 0, id]
        );
        res.json({ message: 'Item atualizado' });
    } catch (error) {
        console.error('Erro ao atualizar help:', error);
        res.status(500).json({ error: 'Erro ao atualizar item' });
    }
});

// Deletar item
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        await pool.query('DELETE FROM help_info WHERE id = $1', [id]);
        res.json({ message: 'Item removido' });
    } catch (error) {
        console.error('Erro ao deletar help:', error);
        res.status(500).json({ error: 'Erro ao remover item' });
    }
});

module.exports = router;
