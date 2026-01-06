// reset-admin-password.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Use MongoDB Atlas URI from .env
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set in .env');
  process.exit(1);
}

// Admin model
const adminSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: { type: String, enum: ['superadmin', 'admin', 'moderator'], default: 'admin' },
  permissions: [String],
  avatar: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  lastLogin: Date,
});

const Admin = mongoose.model('Admin', adminSchema);

// Function to reset password
async function resetAdminPassword(email, newPassword) {
  try {
    await mongoose.connect(MONGODB_URI); // ✅ just pass the URI
    console.log('✅ Connected to MongoDB Atlas');

    const admin = await Admin.findOne({ email });
    if (!admin) {
      console.log('❌ Admin not found');
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    admin.password = hashedPassword;
    await admin.save();

    console.log(`✅ Password updated successfully for admin: ${email}`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

// === USAGE ===
const adminEmail = 'admin@example.com';
const newPassword = '1234';

resetAdminPassword(adminEmail, newPassword);
