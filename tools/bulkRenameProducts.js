require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Product = require('../models/product');

// Optional built-in mappings (edit as needed)
const BUILTIN_MAP = [
	{ oldName: 'Gentleman Jac', newName: 'Gentleman Jack' },
	{ oldName: 'K-Naia Verdejo', newName: 'K-Naia' },
	{ oldName: 'Juan Gil Comoloco DO Jumilla Organic', newName: 'Juan Gil Comoloco, DO Jumilla [Organic]' },
	{ oldName: 'Alasia Monferrato Nebbiolo', newName: 'Alasia red' },
	{ oldName: 'El Jimmador reposado', newName: 'El Jimmdor reposado' },
	{ oldName: 'El Jimmador blanco', newName: 'El Jimmdor blanco' }
];

function readCSV(filePath) {
	const raw = fs.readFileSync(filePath, 'utf8');
	const lines = raw.split(/\r?\n/).filter(Boolean);
	if (!lines.length) return [];
	// Expect headers: oldName,newName
	const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
	const iOld = headers.indexOf('oldname');
	const iNew = headers.indexOf('newname');
	if (iOld === -1 || iNew === -1) throw new Error('CSV must have headers: oldName,newName');
	const mappings = [];
	for (let i = 1; i < lines.length; i++) {
		const cols = lines[i].split(',');
		const oldName = (cols[iOld] || '').trim();
		const newName = (cols[iNew] || '').trim();
		if (oldName && newName) mappings.push({ oldName, newName });
	}
	return mappings;
}

async function run() {
	const input = process.argv[2]; // optional CSV path
	const dryRun = process.argv.includes('--dry');
	if (!process.env.MONGO_URI) {
		console.error('MONGO_URI missing in .env');
		process.exit(1);
	}
	let mappings = BUILTIN_MAP;
	if (input) {
		const abs = path.resolve(process.cwd(), input);
		if (!fs.existsSync(abs)) {
			console.error('File not found:', abs);
			process.exit(1);
		}
		mappings = readCSV(abs);
	}

	await mongoose.connect(process.env.MONGO_URI);
	let changed = 0;
	let misses = [];
	for (const { oldName, newName } of mappings) {
		const doc = await Product.findOne({ name: { $regex: `^${oldName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, $options: 'i' } });
		if (!doc) { misses.push(oldName); continue; }
		if (dryRun) {
			console.log(`[DRY] ${doc.name} => ${newName}`);
			continue;
		}
		doc.name = newName;
		await doc.save();
		changed++;
		console.log(`Renamed: ${oldName} => ${newName}`);
	}
	await mongoose.disconnect();
	console.log(`\nDone. Renamed ${changed}/${mappings.length}.`);
	if (misses.length) {
		console.log('Not found:');
		misses.forEach(n => console.log(' -', n));
	}
}

run().catch(e => { console.error(e); process.exit(1); });