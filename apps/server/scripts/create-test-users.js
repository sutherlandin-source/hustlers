import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

(async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/hustlers');
    
    const userSchema = new mongoose.Schema({
      email: { type: String, unique: true },
      password: String,
      firstName: String,
      lastName: String,
      role: String,
      isActive: { type: Boolean, default: true }
    });
    
    const User = mongoose.model('User', userSchema);
    
    // Clear existing users
    await User.deleteMany({});
    
    // Create hustler
    const hustlerPassword = await bcrypt.hash('password123', 10);
    const hustler = new User({
      email: 'john@hustlers.com',
      password: hustlerPassword,
      firstName: 'John',
      lastName: 'Hustler',
      role: 'hustler'
    });
    await hustler.save();
    console.log('✓ Created hustler:', hustler.email);
    
    // Create manager
    const managerPassword = await bcrypt.hash('password123', 10);
    const manager = new User({
      email: 'manager@hustlers.com',
      password: managerPassword,
      firstName: 'Manager',
      lastName: 'One',
      role: 'manager'
    });
    await manager.save();
    console.log('✓ Created manager:', manager.email);
    
    console.log('✓ Test users created successfully');
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
