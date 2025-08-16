require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Product = require('../models/product');

function parseCSVLine(line) {
	const out = [];
	let cur = '';
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === '"') {
			// double quote inside quoted field => escape
			if (inQuotes && line[i + 1] === '"') {
				cur += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (ch === ',' && !inQuotes) {
			out.push(cur);
			cur = '';
		} else {
			cur += ch;
		}
	}
	out.push(cur);
	return out.map(s => s.trim());
}

function parseCSV(content) {
	const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
	if (lines.length === 0) return [];
	const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
	const nameIdx = headers.indexOf('name');
	const priceIdx = headers.indexOf('price') !== -1 ? headers.indexOf('price') : headers.indexOf('pricegbp');
	if (nameIdx === -1 || priceIdx === -1) {
		throw new Error('CSV must have headers: name,price (or priceGBP)');
	}
	const rows = [];
	for (let i = 1; i < lines.length; i++) {
		const cols = parseCSVLine(lines[i]);
		const rawName = cols[nameIdx] || '';
		const name = rawName.replace(/^"|"$/g, '').trim();
		const priceStr = (cols[priceIdx] || '').replace(/[^0-9.\-]/g, '');
		if (!name) continue;
		const price = Number(priceStr);
		if (!Number.isFinite(price)) continue;
		rows.push({ name, price });
	}
	return rows;
}

async function run() {
	const inputPath = process.argv[2];
	const dryRun = process.argv.includes('--dry');
	if (!inputPath) {
		console.error('Usage: node tools/bulkUpdatePrices.js <file.csv|file.json> [--dry]');
		process.exit(1);
	}
	if (!process.env.MONGO_URI) {
		console.error('MONGO_URI is not set in .env');
		process.exit(1);
	}

	const absPath = path.resolve(process.cwd(), inputPath);
	if (!fs.existsSync(absPath)) {
		console.error('File not found:', absPath);
		process.exit(1);
	}

	let updates = [];
	const raw = fs.readFileSync(absPath, 'utf8');
	if (absPath.toLowerCase().endsWith('.json')) {
		try {
			const parsed = JSON.parse(raw);
			updates = parsed.map(r => ({ name: String(r.name || '').trim(), price: Number(r.price) }))
				.filter(r => r.name && Number.isFinite(r.price));
		} catch (e) {
			console.error('Invalid JSON:', e.message);
			process.exit(1);
		}
	} else {
		updates = parseCSV(raw);
	}

	console.log(`Loaded ${updates.length} price rows`);

	await mongoose.connect(process.env.MONGO_URI);
	let updated = 0;
	let notFound = [];

	for (const { name, price } of updates) {
		const res = await Product.findOneAndUpdate(
			{ name: { $regex: `^${name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, $options: 'i' } },
			{ $set: { price } },
			{ new: true }
		);
		if (res) {
			updated++;
			if (dryRun) console.log(`[DRY] Would update: ${res.name} → £${price}`);
			else console.log(`Updated: ${res.name} → £${price}`);
		} else {
			notFound.push(name);
		}
	}

	await mongoose.disconnect();
	console.log(`\nDone. Updated ${updated}/${updates.length}.`);
	if (notFound.length) {
		console.log('Not found (check exact names):');
		notFound.forEach(n => console.log(' -', n));
	}
}

run().catch(err => {
	console.error(err);
	process.exit(1);
});