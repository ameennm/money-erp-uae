import { Client, Databases } from 'node-appwrite';
import fs from 'fs';

const client = new Client()
    .setEndpoint('https://sgp.cloud.appwrite.io/v1')
    .setProject('6999fff50036fef7a425')
    .setKey('standard_656bd22fad34ed15a8d221411f9691d9bad8f17ec943753b7cc47fc0b4316077f3ce8f8460f5c783c5775e58957da1f48c6b0a09550386f23a1ed3efd62ab8241cd275de7872724b2552348350feed67e8584aad4a1f9638f20321af91eaa8ffed98742ab9ecc23d2559f625e9d02db2d2f5a48284b58d507f99a65beecc05fd');

const databases = new Databases(client);
const DB_ID = 'money_erp_db';

async function main() {
    console.log('Fetching collections...');
    const collectionsResp = await databases.listCollections(DB_ID);
    const collections = collectionsResp.collections;

    let schemaSql = '';
    let dataSql = '';

    for (const col of collections) {
        console.log(`Processing collection: ${col.name} (${col.$id})...`);
        const attrsResp = await databases.listAttributes(DB_ID, col.$id);
        const attributes = attrsResp.attributes;

        let createTable = `CREATE TABLE IF NOT EXISTS ${col.$id} (\n  id TEXT PRIMARY KEY,\n  createdAt TEXT,\n  updatedAt TEXT`;
        for (const attr of attributes) {
            let type = 'TEXT';
            if (attr.type === 'integer') type = 'INTEGER';
            if (attr.type === 'double') type = 'REAL';
            if (attr.type === 'boolean') type = 'INTEGER';
            createTable += `,\n  ${attr.key} ${type}`;
        }
        createTable += '\n);\n\n';
        schemaSql += createTable;

        console.log(`Fetching documents for ${col.$id}...`);
        const docs = await databases.listDocuments(DB_ID, col.$id);
        const allDocs = docs.documents;

        for (const doc of allDocs) {
            let cols = ['id', 'createdAt', 'updatedAt'];
            let vals = [`'${doc.$id}'`, `'${doc.$createdAt}'`, `'${doc.$updatedAt}'`];

            for (const attr of attributes) {
                let val = doc[attr.key];
                if (val !== undefined && val !== null) {
                    cols.push(attr.key);
                    if (typeof val === 'string') {
                        vals.push(`'${val.replace(/'/g, "''")}'`);
                    } else if (typeof val === 'boolean') {
                        vals.push(val ? 1 : 0);
                    } else if (Array.isArray(val)) {
                        vals.push(`'${JSON.stringify(val).replace(/'/g, "''")}'`);
                    } else {
                        vals.push(val);
                    }
                }
            }

            dataSql += `INSERT INTO ${col.$id} (${cols.join(', ')}) VALUES (${vals.join(', ')});\n`;
        }
    }

    fs.writeFileSync('schema.sql', schemaSql);
    fs.writeFileSync('data.sql', dataSql);
    console.log('Finished generating schema.sql and data.sql');
}

main().catch(console.error);
