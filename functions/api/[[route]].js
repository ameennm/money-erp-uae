import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'

const app = new Hono().basePath('/api')

const getNow = () => new Date().toISOString()
const genId = () => crypto.randomUUID()
let optionalSchemaReady = false

const textEncoder = new TextEncoder()

const toHex = (buffer) => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('')

const hashPassword = async (password, salt) => {
    const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(`${salt}:${password}`))
    return toHex(digest)
}

const normalizeValue = (value) => {
    if (value === undefined) return undefined
    if (typeof value === 'boolean') return value ? 1 : 0
    return value
}

const getActor = (c) => ({
    id: c.req.header('x-user-id') || 'system',
    name: c.req.header('x-user-name') || 'System',
    email: c.req.header('x-user-email') || '',
    role: c.req.header('x-user-role') || 'system',
})

const sanitizeRow = (table, row) => {
    if (!row) return row
    const mapped = { ...row, $id: row.id, $createdAt: row.createdAt, $updatedAt: row.updatedAt }
    if (table === 'employees') {
        delete mapped.password_hash
        delete mapped.password_salt
    }
    return mapped
}

const tableInfo = async (db, table) => {
    const { results } = await db.prepare(`PRAGMA table_info(${table})`).all()
    return new Set((results || []).map(col => col.name))
}

const ensureColumn = async (db, table, column, type) => {
    const cols = await tableInfo(db, table)
    if (cols.has(column)) return
    try {
        await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run()
    } catch (e) {
        if (!String(e.message || '').toLowerCase().includes('duplicate column')) throw e
    }
}

const ensureOptionalSchema = async (db) => {
    if (optionalSchemaReady) return

    await db.prepare(`
        CREATE TABLE IF NOT EXISTS activity_logs (
            id TEXT PRIMARY KEY,
            createdAt TEXT,
            updatedAt TEXT,
            actor_id TEXT,
            actor_name TEXT,
            actor_email TEXT,
            actor_role TEXT,
            action TEXT,
            entity_type TEXT,
            entity_id TEXT,
            entity_label TEXT,
            details TEXT
        )
    `).run()

    await ensureColumn(db, 'transactions', 'is_petty_cash', 'INTEGER DEFAULT 0')
    await ensureColumn(db, 'aed_conversions', 'sar_rate', 'REAL')
    await ensureColumn(db, 'aed_conversions', 'aed_rate', 'REAL')
    await ensureColumn(db, 'aed_conversions', 'source_currency', 'TEXT')
    await ensureColumn(db, 'aed_conversions', 'target_currency', 'TEXT')
    await ensureColumn(db, 'aed_conversions', 'receipt_expense_id', 'TEXT')
    await ensureColumn(db, 'employees', 'password_hash', 'TEXT')
    await ensureColumn(db, 'employees', 'password_salt', 'TEXT')

    optionalSchemaReady = true
}

const labelFor = (table, item = {}) => {
    if (table === 'transactions') return item.tx_id ? `Transaction #${item.tx_id}` : item.client_name || 'Transaction'
    if (table === 'agents') return item.name || 'Agent'
    if (table === 'employees') return item.name || item.email || 'Employee'
    if (table === 'expenses') return item.title || item.category || 'Income/Ops'
    if (table === 'credits') return item.from_person || 'Credit'
    if (table === 'aed_conversions') return item.conversion_agent_name || 'Conversion'
    if (table === 'ledger_entries') return item.description || 'Ledger Entry'
    if (table === 'settings') return 'Settings'
    return table
}

const redactDetails = (item = {}) => {
    const clone = { ...item }
    delete clone.password
    delete clone.password_hash
    delete clone.password_salt
    return clone
}

const recordActivity = async (c, { action, table, entityId, before = null, after = null }) => {
    if (table === 'activity_logs') return
    try {
        await ensureOptionalSchema(c.env.DB)
        const actor = getActor(c)
        const current = after || before || {}
        const id = genId()
        const now = getNow()
        const details = JSON.stringify({
            before: before ? redactDetails(before) : null,
            after: after ? redactDetails(after) : null,
        })

        await c.env.DB.prepare(`
            INSERT INTO activity_logs (
                id, createdAt, updatedAt, actor_id, actor_name, actor_email, actor_role,
                action, entity_type, entity_id, entity_label, details
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            id, now, now, actor.id, actor.name, actor.email, actor.role,
            action, table, entityId || current.id || current.$id || '', labelFor(table, current), details
        ).run()
    } catch (e) {
        console.warn('Activity log skipped:', e.message)
    }
}

app.post('/auth/login', async (c) => {
    await ensureOptionalSchema(c.env.DB)
    const { email, password } = await c.req.json()
    const cleanEmail = String(email || '').trim().toLowerCase()

    // Hardcoded Admin fallback since admin wasn't in employees
    if (cleanEmail.includes('admin')) {
        return c.json({ user: { $id: 'admin', email: cleanEmail, name: 'Administrator', role: 'admin' } })
    }

    // Simple auth based on email from employees table
    const { results } = await c.env.DB.prepare('SELECT * FROM employees WHERE LOWER(email) = ?').bind(cleanEmail).all()
    if (results.length > 0) {
        const user = results[0]
        if (user.password_hash && user.password_salt) {
            const candidate = await hashPassword(password || '', user.password_salt)
            if (candidate !== user.password_hash) {
                return c.json({ error: 'Invalid credentials' }, 401)
            }
        }
        return c.json({ user: sanitizeRow('employees', { ...user, name: user.name || 'Employee' }) })
    }
    return c.json({ error: 'Invalid credentials' }, 401)
})

app.get('/auth/me', async (c) => {
    // Just mock for now based on headers if tokens were implemented
    return c.json({ user: { $id: 'admin', email: 'admin@admin.com', name: 'Admin', role: 'admin' } })
})

const VALID_COLUMNS = {
    transactions: ['tx_id', 'creator_id', 'creator_name', 'status', 'client_name', 'inr_requested', 'collected_currency', 'collected_amount', 'collection_rate', 'sar_to_aed_rate', 'actual_aed', 'aed_to_inr_rate', 'actual_inr_distributed', 'profit_aed', 'notes', 'collection_agent_id', 'collection_agent_name', 'conversion_agent_id', 'conversion_agent_name', 'distributor_id', 'distributor_name', 'profit_inr', 'edit_pending_approval', 'is_petty_cash'],
    agents: ['name', 'phone', 'location', 'type', 'currency', 'notes', 'inr_balance', 'sar_balance', 'aed_balance'],
    employees: ['name', 'email', 'role', 'notes', 'password_hash', 'password_salt'],
    expenses: ['title', 'category', 'amount', 'currency', 'date', 'notes', 'type', 'distributor_id', 'distributor_name'],
    credits: ['from_person', 'reason', 'amount_sar', 'date', 'admin_approved'],
    aed_conversions: ['sar_amount', 'aed_amount', 'profit_inr', 'conversion_agent_id', 'conversion_agent_name', 'date', 'sar_rate', 'aed_rate', 'source_currency', 'target_currency', 'receipt_expense_id'],
    ledger_entries: ['agent_id', 'agent_name', 'agent_type', 'amount', 'currency', 'type', 'reference_type', 'reference_id', 'description', 'running_balance'],
    activity_logs: ['actor_id', 'actor_name', 'actor_email', 'actor_role', 'action', 'entity_type', 'entity_id', 'entity_label', 'details'],
};

const validColumnsFor = (table) => new Set(['id', 'createdAt', 'updatedAt', ...(VALID_COLUMNS[table] || [])])

const parseListQueries = (c) => {
    const raw = c.req.query('q')
    if (!raw) return []
    try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

const buildEqualCondition = (table, query) => {
    const validCols = validColumnsFor(table)
    if (!query || query.type !== 'equal' || !validCols.has(query.key)) return null
    if (query.val === null) return { sql: `${query.key} IS NULL`, values: [] }
    return { sql: `${query.key} = ?`, values: [normalizeValue(query.val)] }
}

const buildWhereClause = (table, queries) => {
    const clauses = []
    const values = []

    for (const query of queries) {
        if (query.type === 'equal') {
            const condition = buildEqualCondition(table, query)
            if (!condition) continue
            clauses.push(condition.sql)
            values.push(...condition.values)
        } else if (query.type === 'or' && Array.isArray(query.subQueries)) {
            const subConditions = query.subQueries
                .map(subQuery => buildEqualCondition(table, subQuery))
                .filter(Boolean)
            if (!subConditions.length) continue
            clauses.push(`(${subConditions.map(condition => condition.sql).join(' OR ')})`)
            subConditions.forEach(condition => values.push(...condition.values))
        }
    }

    return {
        sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '',
        values,
    }
}

const resolveOrderBy = (table, queries, fallback) => {
    const validCols = validColumnsFor(table)
    const requested = queries.find(query => query.type === 'orderDesc' || query.type === 'orderAsc')
    if (requested && validCols.has(requested.key)) {
        return `${requested.key} ${requested.type === 'orderDesc' ? 'DESC' : 'ASC'}`
    }
    return fallback
}

const resolveLimit = (c, queries) => {
    const queryLimit = queries.find(query => query.type === 'limit')?.val
    const requested = queryLimit ?? c.req.query('limit')
    if (requested === 'all') return 10000
    return Math.min(Math.max(parseInt(requested || '10000', 10) || 10000, 1), 10000)
}

const sanitizeInput = (table, body = {}) => {
    const validCols = VALID_COLUMNS[table] || []
    const safeBody = {}
    Object.keys(body).forEach(key => {
        if (validCols.includes(key)) safeBody[key] = normalizeValue(body[key])
    })
    return safeBody
}

const balanceFieldFor = (currency) => currency === 'INR' ? 'inr_balance' : (currency === 'SAR' ? 'sar_balance' : 'aed_balance')

const round2 = (value) => Math.round((parseFloat(value) || 0) * 100) / 100

const recordLedgerEntryFast = async (c, entryData) => {
    const targetId = entryData.agent_id
    if (!targetId) throw new Error('agent_id is required for ledger entry')

    const { results: agentRows } = await c.env.DB.prepare('SELECT * FROM agents WHERE id = ?').bind(targetId).all()
    const agent = agentRows[0]
    if (!agent) throw new Error(`Agent ${targetId} not found`)

    const currency = entryData.currency || 'SAR'
    const type = entryData.type || 'debit'
    const referenceType = entryData.reference_type || 'transaction'
    const referenceId = entryData.reference_id
    const amount = Math.abs(Number(entryData.amount) || 0)
    if (!referenceId || !amount) return null

    const { results: existingRows } = await c.env.DB.prepare(`
        SELECT * FROM ledger_entries
        WHERE reference_id = ? AND reference_type = ? AND agent_id = ? AND currency = ? AND type = ?
        LIMIT 5
    `).bind(referenceId, referenceType, targetId, currency, type).all()
    const existing = existingRows.find(row => Math.abs((Number(row.amount) || 0) - amount) < 0.001)
    if (existing) return { entry: sanitizeRow('ledger_entries', existing), agent: sanitizeRow('agents', agent) }

    const balField = balanceFieldFor(currency)
    const currentBalance = round2(agent[balField] || 0)
    const sign = type === 'debit' ? 1 : -1
    const newBalance = round2(currentBalance + amount * sign)
    const ledgerId = genId()
    const now = getNow()
    const ledgerRow = {
        id: ledgerId,
        createdAt: now,
        updatedAt: now,
        agent_id: targetId,
        agent_name: entryData.agent_name || agent.name,
        agent_type: entryData.agent_type || agent.type || 'collection',
        amount,
        currency,
        type,
        reference_type: referenceType,
        reference_id: referenceId,
        description: entryData.description || '',
        running_balance: newBalance,
    }

    await c.env.DB.prepare(`
        INSERT INTO ledger_entries (
            id, createdAt, updatedAt, agent_id, agent_name, agent_type, amount, currency,
            type, reference_type, reference_id, description, running_balance
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        ledgerRow.id, ledgerRow.createdAt, ledgerRow.updatedAt, ledgerRow.agent_id, ledgerRow.agent_name,
        ledgerRow.agent_type, ledgerRow.amount, ledgerRow.currency, ledgerRow.type, ledgerRow.reference_type,
        ledgerRow.reference_id, ledgerRow.description, ledgerRow.running_balance
    ).run()

    await c.env.DB.prepare(`UPDATE agents SET ${balField} = ?, updatedAt = ? WHERE id = ?`).bind(newBalance, now, targetId).run()

    const updatedAgent = { ...agent, [balField]: newBalance, updatedAt: now }
    await recordActivity(c, { action: 'created', table: 'ledger_entries', entityId: ledgerId, after: ledgerRow })
    await recordActivity(c, { action: 'updated', table: 'agents', entityId: targetId, before: agent, after: updatedAgent })

    return {
        entry: sanitizeRow('ledger_entries', ledgerRow),
        agent: sanitizeRow('agents', updatedAgent),
    }
}

app.post('/transactions/with-ledger', async (c) => {
    await ensureOptionalSchema(c.env.DB)
    const body = await c.req.json()
    const transactionBody = body.transaction || {}
    const rawLedgerEntries = Array.isArray(body.ledger_entries) ? body.ledger_entries : []
    const id = transactionBody.id || transactionBody.$id || genId()
    const createdAt = transactionBody.createdAt || transactionBody.$createdAt || getNow()
    const updatedAt = transactionBody.updatedAt || transactionBody.$updatedAt || createdAt

    const safeTransaction = sanitizeInput('transactions', transactionBody)
    const ledgerEntries = rawLedgerEntries
        .map(rawEntry => ({
            ...sanitizeInput('ledger_entries', rawEntry),
            reference_type: rawEntry.reference_type || 'transaction',
            reference_id: rawEntry.reference_id || id,
        }))
        .filter(entry => entry.agent_id && Number(entry.amount || 0) > 0)

    for (const entry of ledgerEntries) {
        const { results } = await c.env.DB.prepare('SELECT id FROM agents WHERE id = ?').bind(entry.agent_id).all()
        if (!results.length) {
            return c.json({ error: `Agent ${entry.agent_id} not found` }, 400)
        }
    }

    const txKeys = ['id', 'createdAt', 'updatedAt', ...Object.keys(safeTransaction)]
    const txValues = [id, createdAt, updatedAt, ...Object.values(safeTransaction)]

    await c.env.DB.prepare(`INSERT INTO transactions (${txKeys.join(',')}) VALUES (${txKeys.map(() => '?').join(',')})`)
        .bind(...txValues).run()

    const transaction = { id, createdAt, updatedAt, ...safeTransaction }
    await recordActivity(c, { action: 'created', table: 'transactions', entityId: id, after: transaction })

    const createdLedgerEntries = []
    const updatedAgents = []
    const seenAgents = new Set()
    for (const entry of ledgerEntries) {
        const result = await recordLedgerEntryFast(c, entry)
        if (!result) continue
        createdLedgerEntries.push(result.entry)
        if (!seenAgents.has(result.agent.$id)) {
            seenAgents.add(result.agent.$id)
            updatedAgents.push(result.agent)
        } else {
            const index = updatedAgents.findIndex(agent => agent.$id === result.agent.$id)
            if (index >= 0) updatedAgents[index] = result.agent
        }
    }

    return c.json({
        transaction: sanitizeRow('transactions', transaction),
        ledger_entries: createdLedgerEntries,
        updated_agents: updatedAgents,
    })
})

// REST wrapper
const crud = (path, table, getSort = 'createdAt DESC') => {
    app.get(`/${path}`, async (c) => {
        await ensureOptionalSchema(c.env.DB)
        const queries = parseListQueries(c)
        const where = buildWhereClause(table, queries)
        const orderBy = resolveOrderBy(table, queries, getSort)
        const limit = resolveLimit(c, queries)
        const { results } = await c.env.DB.prepare(`SELECT * FROM ${table}${where.sql} ORDER BY ${orderBy} LIMIT ?`).bind(...where.values, limit).all()
        // Map id to $id and createdAt to $createdAt for Appwrite compatibility
        const mapped = results.map(r => sanitizeRow(table, r))
        return c.json(mapped)
    })

    app.get(`/${path}/:id`, async (c) => {
        await ensureOptionalSchema(c.env.DB)
        const { results } = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(c.req.param('id')).all()
        if (results.length) {
            return c.json(sanitizeRow(table, results[0]))
        }
        return c.json({ error: 'Not found' }, 404)
    })

    app.post(`/${path}`, async (c) => {
        await ensureOptionalSchema(c.env.DB)
        const body = await c.req.json()
        const id = body.id || body.$id || genId()
        const createdAt = body.createdAt || body.$createdAt || getNow()
        const updatedAt = body.updatedAt || body.$updatedAt || createdAt

        // Remove Appwrite-specific internal props from body if any were sent
        delete body.id; delete body.createdAt; delete body.updatedAt;
        delete body.$id; delete body.$createdAt; delete body.$updatedAt;

        const validCols = VALID_COLUMNS[table] || [];
        const safeBody = {};
        Object.keys(body).forEach(key => {
            if (validCols.includes(key)) safeBody[key] = normalizeValue(body[key]);
        });

        if (table === 'employees' && body.password) {
            const salt = genId()
            safeBody.password_salt = salt
            safeBody.password_hash = await hashPassword(body.password, salt)
        }

        const keys = ['id', 'createdAt', 'updatedAt', ...Object.keys(safeBody)]
        const values = [id, createdAt, updatedAt, ...Object.values(safeBody)]

        const qMarks = keys.map(() => '?').join(',')

        await c.env.DB.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${qMarks})`)
            .bind(...values).run()

        const inserted = { id, createdAt, updatedAt, ...safeBody }
        await recordActivity(c, { action: 'created', table, entityId: id, after: inserted })
        return c.json(sanitizeRow(table, inserted))
    })



    app.put(`/${path}/:id`, async (c) => {
        await ensureOptionalSchema(c.env.DB)
        const id = c.req.param('id');
        let body = await c.req.json();
        const { results: beforeRows } = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).all()
        const before = beforeRows[0] || null
        const validCols = VALID_COLUMNS[table] || [];
        delete body.id; delete body.createdAt; delete body.$id; delete body.$createdAt; delete body.$updatedAt;

        const updatedAt = body.updatedAt || getNow()
        delete body.updatedAt

        const safeBody = {};
        Object.keys(body).forEach(key => {
            if (validCols.includes(key)) safeBody[key] = normalizeValue(body[key]);
        });

        if (table === 'employees' && body.password) {
            const salt = genId()
            safeBody.password_salt = salt
            safeBody.password_hash = await hashPassword(body.password, salt)
        }

        const updateKeys = Object.keys(safeBody)
        const updates = [...updateKeys.map(key => `${key} = ?`), 'updatedAt = ?'].join(', ');
        const values = [...updateKeys.map(key => safeBody[key]), updatedAt];

        await c.env.DB.prepare(`UPDATE ${table} SET ${updates} WHERE id = ?`).bind(...values, id).run();
        await recordActivity(c, { action: 'updated', table, entityId: id, before, after: { ...before, ...safeBody, updatedAt } })
        return c.json({ success: true });
    });

    app.delete(`/${path}/:id`, async (c) => {
        await ensureOptionalSchema(c.env.DB)
        const id = c.req.param('id')
        const { results: beforeRows } = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).all()
        await c.env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run()
        await recordActivity(c, { action: 'deleted', table, entityId: id, before: beforeRows[0] || { id } })
        return c.json({ success: true })
    })
}

crud('transactions', 'transactions')
crud('agents', 'agents')
crud('employees', 'employees')
crud('expenses', 'expenses')
crud('credits', 'credits')
crud('aed_conversions', 'aed_conversions')
crud('ledger_entries', 'ledger_entries', 'createdAt DESC')
crud('activity_logs', 'activity_logs', 'createdAt DESC')

app.get('/settings', async (c) => {
    await ensureOptionalSchema(c.env.DB)
    const { results } = await c.env.DB.prepare('SELECT * FROM settings WHERE id = ?').bind('global_settings').all()
    if (results.length > 0) return c.json(results[0])
    return c.json({ min_sar_rate: 0, min_aed_rate: 0 })
})

app.put('/settings', async (c) => {
    await ensureOptionalSchema(c.env.DB)
    const body = await c.req.json()
    const { results } = await c.env.DB.prepare('SELECT * FROM settings WHERE id = ?').bind('global_settings').all()
    if (results.length > 0) {
        await c.env.DB.prepare('UPDATE settings SET min_sar_rate = ?, min_aed_rate = ?, updatedAt = ? WHERE id = ?')
            .bind(body.min_sar_rate, body.min_aed_rate, getNow(), 'global_settings').run()
    } else {
        await c.env.DB.prepare('INSERT INTO settings (id, createdAt, updatedAt, min_sar_rate, min_aed_rate) VALUES (?, ?, ?, ?, ?)')
            .bind('global_settings', getNow(), getNow(), body.min_sar_rate, body.min_aed_rate).run()
    }
    await recordActivity(c, { action: 'updated', table: 'settings', entityId: 'global_settings', after: body })
    return c.json(true)
})

export const onRequest = handle(app)
