// MongoDB initialization script for chat service
print('🚀 Starting MongoDB initialization for Chat Service...');

// Switch to admin database
db = db.getSiblingDB('admin');

// Create user for job-platform database
db.createUser({
  user: 'chat_user',
  pwd: 'chat_password',
  roles: [
    {
      role: 'readWrite',
      db: 'job-platform'
    }
  ]
});

print('✅ Chat user created successfully');

// Switch to job-platform database
db = db.getSiblingDB('job-platform');

// Create collections with proper indexes
db.createCollection('users');
db.createCollection('chatmessages');
db.createCollection('conversations');

// Create indexes for better performance
db.chatmessages.createIndex({ "senderId": 1, "receiverId": 1, "timestamp": -1 });
db.chatmessages.createIndex({ "receiverId": 1, "senderId": 1, "timestamp": -1 });
db.chatmessages.createIndex({ "timestamp": -1 });
db.chatmessages.createIndex({ "isRead": 1 });
db.chatmessages.createIndex({ "isDeleted": 1 });

db.conversations.createIndex({ "participants": 1 });
db.conversations.createIndex({ "lastMessageAt": -1 });
db.conversations.createIndex({ "isGroupChat": 1 });

db.users.createIndex({ "email": 1 }, { unique: true });
db.users.createIndex({ "verificationToken": 1 });

print('✅ Collections and indexes created successfully');

// Insert sample data for testing (optional)
if (db.users.countDocuments() === 0) {
  print('📝 Inserting sample users for testing...');
  
  db.users.insertMany([
    {
      name: 'Test User 1',
      email: 'test1@example.com',
      password: '$2a$10$example_hash_here', // This should be properly hashed
      role: 'user',
      isVerified: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      name: 'Test User 2',
      email: 'test2@example.com',
      password: '$2a$10$example_hash_here', // This should be properly hashed
      role: 'user',
      isVerified: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ]);
  
  print('✅ Sample users inserted');
}

print('🎉 MongoDB initialization completed successfully!');
print('📊 Database: job-platform');
print('👥 Collections: users, chatmessages, conversations');
print('🔑 Admin credentials: admin/admin123');
print('🔑 Chat user credentials: chat_user/chat_password');
