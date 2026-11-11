const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./venue_booking.db');
module.exports = db;