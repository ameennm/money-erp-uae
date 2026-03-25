import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'

const app = new Hono().basePath('/api')

const getNow = () => new Date().toISOString()
const genId = () => crypto.randomUUID()

app.post('/auth/login', async (c) => {
    const { email, password } = await c.req.json()

    // Hardcoded Admin fallback since admin wasn't in employees
    if (email.includes('admin')) {
        return c.json({ user: { $id: 'admin', email, name: 'Administrator', role: 'admin' } })
    }

    // Simple auth based on email from employees table
    const { results } = await c.env.DB.prepare('SELECT * FROM employees WHERE email = ?').bind(email).all()
    if (results.length > 0) {
        // Appwrite frontend expects $id, so we alias id to $id
        const user = results[0];
        user.$id = user.id;
        user.name = user.name || 'Collector';
        return c.json({ user })
    }
    return c.json({ error: 'Invalid credentials' }, 401)
})

app.get('/auth/me', async (c) => {
    // Just mock for now based on headers if tokens were implemented
    return c.json({ user: { $id: 'admin', email: 'admin@admin.com', name: 'Admin', role: 'admin' } })
})

// REST wrapper
const crud = (path, table, getSort = 'createdAt DESC') => {
    app.get(`/${path}`, async (c) => {
        const { results } = await c.env.DB.prepare(`SELECT * FROM ${table} ORDER BY ${getSort} LIMIT 500`).all()
        // Map id to $id and createdAt to $createdAt for Appwrite compatibility
        const mapped = results.map(r => ({ ...r, $id: r.id, $createdAt: r.createdAt, $updatedAt: r.updatedAt }))
        return c.json(mapped)
    })

    app.get(`/${path}/:id`, async (c) => {
        const { results } = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(c.req.param('id')).all()
        if (results.length) {
            const r = results[0];
            return c.json({ ...r, $id: r.id, $createdAt: r.createdAt, $updatedAt: r.updatedAt })
        }
        return c.json({ error: 'Not found' }, 404)
    })

    app.post(`/${path}`, async (c) => {
        const body = await c.req.json()
        const id = genId()

        // Remove Appwrite-specific internal props from body if any were sent
        delete body.$id; delete body.$createdAt; delete body.$updatedAt;

        const keys = ['id', 'createdAt', 'updatedAt', ...Object.keys(body)]
        const values = [id, getNow(), getNow(), ...Object.values(body)]

        const qMarks = keys.map(() => '?').join(',')

        await c.env.DB.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${qMarks})`)
            .bind(...values).run()

        return c.json({ $id: id, $createdAt: getNow(), $updatedAt: getNow(), ...body })
    })

    const VALID_COLUMNS = {
        transactions: ['tx_id', 'creator_id', 'creator_name', 'status', 'client_name', 'inr_requested', 'collected_currency', 'collected_amount', 'collection_rate', 'sar_to_aed_rate', 'actual_aed', 'aed_to_inr_rate', 'actual_inr_distributed', 'profit_aed', 'notes', 'collection_agent_id', 'collection_agent_name', 'conversion_agent_id', 'conversion_agent_name', 'distributor_id', 'distributor_name', 'profit_inr', 'edit_pending_approval'],
        agents: ['name', 'phone', 'location', 'type', 'currency', 'notes', 'inr_balance', 'sar_balance', 'aed_balance'],
        employees: ['name', 'email', 'role', 'notes'],
        expenses: ['title', 'category', 'amount', 'currency', 'date', 'notes', 'type', 'distributor_id', 'distributor_name'],
        credits: ['from_person', 'reason', 'amount_sar', 'date', 'admin_approved'],
        aed_conversions: ['sar_amount', 'aed_amount', 'profit_inr', 'conversion_agent_id', 'conversion_agent_name', 'date'],
    };

    app.put(`/${path}/:id`, async (c) => {
        const id = c.req.param('id');
        let body = await c.req.json();
        const validCols = VALID_COLUMNS[table] || [];
        const updates = Object.keys(body)
            .filter(key => validCols.includes(key))
            .map(key => `${key} = ?`)
            .join(', ');

        if (!updates) return c.json({ success: true, message: 'No valid columns to update' });

        const values = Object.keys(body)
            .filter(key => validCols.includes(key))
            .map(key => body[key]);

        await c.env.DB.prepare(`UPDATE ${table} SET ${updates} WHERE id = ?`).bind(...values, id).run();
        return c.json({ success: true });
    });

    app.delete(`/${path}/:id`, async (c) => {
        const id = c.req.param('id')
        await c.env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run()
        return c.json({ success: true })
    })
}

crud('transactions', 'transactions')
crud('agents', 'agents')
crud('employees', 'employees')
crud('expenses', 'expenses')
crud('credits', 'credits')
crud('aed_conversions', 'aed_conversions')

app.get('/settings', async (c) => {
    const { results } = await c.env.DB.prepare('SELECT * FROM settings WHERE id = ?').bind('global_settings').all()
    if (results.length > 0) return c.json(results[0])
    return c.json({ min_sar_rate: 0, min_aed_rate: 0 })
})

app.put('/settings', async (c) => {
    const body = await c.req.json()
    const { results } = await c.env.DB.prepare('SELECT * FROM settings WHERE id = ?').bind('global_settings').all()
    if (results.length > 0) {
        await c.env.DB.prepare('UPDATE settings SET min_sar_rate = ?, min_aed_rate = ?, updatedAt = ? WHERE id = ?')
            .bind(body.min_sar_rate, body.min_aed_rate, getNow(), 'global_settings').run()
    } else {
        await c.env.DB.prepare('INSERT INTO settings (id, createdAt, updatedAt, min_sar_rate, min_aed_rate) VALUES (?, ?, ?, ?, ?)')
            .bind('global_settings', getNow(), getNow(), body.min_sar_rate, body.min_aed_rate).run()
    }
    return c.json(true)
})

export const onRequest = handle(app)
