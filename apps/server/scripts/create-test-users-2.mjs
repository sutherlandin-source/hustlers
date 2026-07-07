#!/usr/bin/env node

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import models from src
const srcPath = join(__dirname, '..', 'src');
const userModelPath = join(srcPath, 'models', 'User.js');
const walletModelPath = join(srcPath, 'models', 'Wallet.js');

(async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect('mongodb://localhost:27017/hustlers');
    console.log('✓ Connected to MongoDB');

    // Import User model
    const userModule = await import('file:///' + userModelPath.replace(/\\/g, '/'));
    const User = userModule.User || mongoose.model('User');
    const Wallet = mongoose.model('Wallet') || await (await import('file:///' + walletModelPath.replace(/\\/g, '/'))).Wallet;

    // Clear existing users
    console.log('Clearing existing users...');
    await mongoose.connection.collection('users').deleteMany({});
    console.log('✓ Cleared users collection');

    // Create hustler
    console.log('Creating hustler user...');
    const hustler = new User({
      email: 'john@hustlers.com',
      password: 'password123', // Will be hashed by pre-save hook
      firstName: 'John',
      lastName: 'Hustler',
      role: 'hustler',
      isActive: true
    });
    await hustler.save();
    console.log('✓ Created hustler:', hustler.email);

    // Create manager
    console.log('Creating manager user...');
    const manager = new User({
      email: 'manager@hustlers.com',
      password: 'password123', // Will be hashed by pre-save hook
      firstName: 'Manager',
      lastName: 'One',
      role: 'manager',
      isActive: true
    });
    await manager.save();
    console.log('✓ Created manager:', manager.email);

    console.log('✓ Test users created successfully');
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
