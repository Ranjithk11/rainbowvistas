const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/vending.db');
const db = new Database(dbPath);

console.log('Checking discount_value in vending_slots table...\n');

// Check if column exists
const columns = db.prepare('PRAGMA table_info(vending_slots)').all();
const hasDiscountValue = columns.some((c) => c.name === 'discount_value');
console.log('discount_value column exists:', hasDiscountValue);

if (hasDiscountValue) {
  // Count slots with discount
  const count = db.prepare('SELECT COUNT(*) as count FROM vending_slots WHERE discount_value IS NOT NULL AND discount_value != 0').get();
  console.log('Slots with discount_value > 0:', count.count);

  // Show first 10 slots with discount
  const slots = db.prepare('SELECT slot_id, product_name, discount_value FROM vending_slots WHERE discount_value IS NOT NULL AND discount_value != 0 LIMIT 10').all();
  console.log('\nFirst 10 slots with discount:');
  slots.forEach((slot) => {
    console.log(`  Slot ${slot.slot_id}: ${slot.product_name} - ${slot.discount_value}%`);
  });

  // Show all slots
  const allSlots = db.prepare('SELECT slot_id, product_name, discount_value FROM vending_slots ORDER BY slot_id').all();
  console.log('\nAll slots:');
  allSlots.forEach((slot) => {
    console.log(`  Slot ${slot.slot_id}: ${slot.product_name} - discount: ${slot.discount_value}`);
  });
} else {
  console.log('ERROR: discount_value column does not exist in vending_slots table');
}

db.close();
