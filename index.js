// admin-server.js - Admin Backend for Tournament Arena

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');

dotenv.config();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('uploads'));

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });

// ===== SCHEMAS =====

// Admin Schema
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

// User Schema
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  phone: String,
  avatar: String,
  role: { type: String, enum: ['user', 'moderator'], default: 'user' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// Team Schema
const teamSchema = new mongoose.Schema({
  name: String,
  logo: String,
  description: String,
  city: String,
  coach: String,
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  draws: { type: Number, default: 0 },
  points: { type: Number, default: 0 },
  goalsFor: { type: Number, default: 0 },
  goalsAgainst: { type: Number, default: 0 },
  players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Player Schema
const playerSchema = new mongoose.Schema({
  name: String,
  position: { type: String, enum: ['GK', 'DEF', 'MID', 'FWD'], required: true },
  jerseyNumber: Number,
  photo: String,
  bio: String,
  age: Number,
  nationality: String,
  height: String,
  weight: String,
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  goals: { type: Number, default: 0 },
  assists: { type: Number, default: 0 },
  yellowCards: { type: Number, default: 0 },
  redCards: { type: Number, default: 0 },
  matchesPlayed: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Match Schema
const matchSchema = new mongoose.Schema({
  team1: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  team2: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  score1: { type: Number, default: null },
  score2: { type: Number, default: null },
  status: { type: String, enum: ['scheduled', 'live', 'completed'], default: 'scheduled' },
  startTime: Date,
  endTime: Date,
  location: String,
  venue: String,
  referee: String,
  progress: { type: Number, default: 0 },
  description: String,
  matchStats: {
    possession1: Number,
    possession2: Number,
    shots1: Number,
    shots2: Number,
    fouls1: Number,
    fouls2: Number,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
// Fan Schema
const fanSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  joinDate: { type: Date, default: Date.now },
  membershipLevel: { type: String, enum: ['regular', 'premium', 'vip'], default: 'regular' },
  interests: [String],
  bio: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Settings Schema
const settingsSchema = new mongoose.Schema({
  tournamentName: String,
  season: String,
  startDate: Date,
  endDate: Date,
  location: String,
  rules: String,
  maxTeams: Number,
  maxPlayersPerTeam: Number,
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  updatedAt: { type: Date, default: Date.now },
});

// Activity Log Schema
const activityLogSchema = new mongoose.Schema({
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  action: String,
  entity: String, // 'match', 'team', 'player', 'user', 'settings'
  entityId: mongoose.Schema.Types.ObjectId,
  changes: mongoose.Schema.Types.Mixed,
  timestamp: { type: Date, default: Date.now },
});

// Add indexes for better query performance
adminSchema.index({ email: 1 });
userSchema.index({ email: 1 });
teamSchema.index({ name: 1 });
playerSchema.index({ team: 1, position: 1 });
matchSchema.index({ status: 1, startTime: -1 });
activityLogSchema.index({ timestamp: -1 });

// Models
const Admin = mongoose.model('Admin', adminSchema);
const User = mongoose.model('User', userSchema);
const Team = mongoose.model('Team', teamSchema);
const Player = mongoose.model('Player', playerSchema);
const Match = mongoose.model('Match', matchSchema);
const Fan = mongoose.model('Fan', fanSchema);
const Settings = mongoose.model('Settings', settingsSchema);
const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

// ===== MIDDLEWARE =====

// Auth middleware
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'admin-secret-key');
    req.adminId = decoded.adminId;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Log activity helper
const logActivity = async (adminId, action, entity, entityId, changes) => {
  await ActivityLog.create({
    admin: adminId,
    action,
    entity,
    entityId,
    changes,
  });
};

// ===== ADMIN AUTHENTICATION =====

// Admin Register
app.post('/api/admin/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const adminExists = await Admin.findOne({ email });
    if (adminExists) {
      return res.status(400).json({ message: 'Admin already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = await Admin.create({
      name,
      email,
      password: hashedPassword,
      role: role || 'admin',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
    });

    const token = jwt.sign({ adminId: admin._id }, process.env.JWT_SECRET || 'admin-secret-key', {
      expiresIn: '7d',
    });

    res.status(201).json({
      message: 'Admin registered',
      token,
      admin: { _id: admin._id, name, email, role: admin.role },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin Login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(400).json({ message: 'Admin not found' });
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid password' });
    }

    admin.lastLogin = new Date();
    await admin.save();

    const token = jwt.sign({ adminId: admin._id }, process.env.JWT_SECRET || 'admin-secret-key', {
      expiresIn: '7d',
    });

    res.json({
      message: 'Login successful',
      token,
      admin: { _id: admin._id, name: admin.name, email, role: admin.role },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===== ADMIN DASHBOARD =====

// Get dashboard summary
app.get('/api/admin/dashboard', authMiddleware, async (req, res) => {
  try {
    const totalMatches = await Match.countDocuments();
    const liveMatches = await Match.countDocuments({ status: 'live' });
    const completedMatches = await Match.countDocuments({ status: 'completed' });
    const totalTeams = await Team.countDocuments();
    const totalPlayers = await Player.countDocuments();
    const totalUsers = await User.countDocuments();

    const recentActivity = await ActivityLog.find()
      .populate('admin', 'name email')
      .sort({ timestamp: -1 })
      .limit(10);

    const upcomingMatches = await Match.find({ status: 'scheduled' })
      .populate('team1', 'name logo')
      .populate('team2', 'name logo')
      .sort({ startTime: 1 })
      .limit(5);

    res.json({
      stats: {
        totalMatches,
        liveMatches,
        completedMatches,
        totalTeams,
        totalPlayers,
        totalUsers,
      },
      recentActivity,
      upcomingMatches,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===== FIXTURES & RESULTS MANAGEMENT =====

// Get all matches with filters
app.get('/api/admin/matches', authMiddleware, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const query = status ? { status } : {};
    const skip = (page - 1) * limit;

    const matches = await Match.find(query)
      .populate('team1', 'name logo')
      .populate('team2', 'name logo')
      .sort({ startTime: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Match.countDocuments(query);

    res.json({ matches, total, page, limit });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create match
app.post('/api/admin/matches', authMiddleware, async (req, res) => {
  try {
    const { team1, team2, startTime, location, venue, referee, description } = req.body;

    const match = await Match.create({
      team1,
      team2,
      startTime,
      location,
      venue,
      referee,
      description,
      status: 'scheduled',
    });

    const populatedMatch = await match.populate(['team1', 'team2']);

    await logActivity(req.adminId, 'CREATE', 'match', match._id, {
      team1,
      team2,
      startTime,
      location,
    });

    res.status(201).json(populatedMatch);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update match details
app.put('/api/admin/matches/:id', authMiddleware, async (req, res) => {
  try {
    const { startTime, location, venue, referee, description } = req.body;

    const match = await Match.findByIdAndUpdate(
      req.params.id,
      { startTime, location, venue, referee, description, updatedAt: new Date() },
      { new: true }
    ).populate(['team1', 'team2']);

    await logActivity(req.adminId, 'UPDATE', 'match', match._id, req.body);

    res.json(match);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update live match score
app.put('/api/admin/matches/:id/score', authMiddleware, async (req, res) => {
  try {
    const { score1, score2, progress, status, matchStats } = req.body;

    const match = await Match.findByIdAndUpdate(
      req.params.id,
      { score1, score2, progress, status, matchStats, updatedAt: new Date() },
      { new: true }
    ).populate(['team1', 'team2']);

    // Update team standings if match completed
    if (status === 'completed' && !match.endTime) {
      const team1 = await Team.findById(match.team1._id);
      const team2 = await Team.findById(match.team2._id);

      team1.goalsFor += score1;
      team1.goalsAgainst += score2;
      team2.goalsFor += score2;
      team2.goalsAgainst += score1;

      if (score1 > score2) {
        team1.wins += 1;
        team1.points += 3;
        team2.losses += 1;
      } else if (score2 > score1) {
        team2.wins += 1;
        team2.points += 3;
        team1.losses += 1;
      } else {
        team1.draws += 1;
        team1.points += 1;
        team2.draws += 1;
        team2.points += 1;
      }

      await team1.save();
      await team2.save();
      match.endTime = new Date();
      await match.save();
    }

    await logActivity(req.adminId, 'UPDATE_SCORE', 'match', match._id, { score1, score2, progress });

    res.json(match);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete match
app.delete('/api/admin/matches/:id', authMiddleware, async (req, res) => {
  try {
    await Match.findByIdAndDelete(req.params.id);
    await logActivity(req.adminId, 'DELETE', 'match', req.params.id, {});
    res.json({ message: 'Match deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===== TEAM MANAGEMENT =====

// Get all teams
app.get('/api/admin/teams', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const teams = await Team.find()
      .populate('players')
      .sort({ points: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Team.countDocuments();

    res.json({ teams, total, page, limit });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create team
app.post('/api/admin/teams', authMiddleware, upload.single('logo'), async (req, res) => {
  try {
    const { name, description, city, coach } = req.body;
    const logo = req.file ? `/uploads/${req.file.filename}` : null;

    const team = await Team.create({
      name,
      description,
      city,
      coach,
      logo,
    });

    await logActivity(req.adminId, 'CREATE', 'team', team._id, { name, city });

    res.status(201).json(team);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update team
app.put('/api/admin/teams/:id', authMiddleware, upload.single('logo'), async (req, res) => {
  try {
    const { name, description, city, coach } = req.body;
    const updateData = { name, description, city, coach, updatedAt: new Date() };

    if (req.file) {
      updateData.logo = `/uploads/${req.file.filename}`;
    }

    const team = await Team.findByIdAndUpdate(req.params.id, updateData, { new: true }).populate(
      'players'
    );

    await logActivity(req.adminId, 'UPDATE', 'team', team._id, req.body);

    res.json(team);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete team
app.delete('/api/admin/teams/:id', authMiddleware, async (req, res) => {
  try {
    await Team.findByIdAndDelete(req.params.id);
    await logActivity(req.adminId, 'DELETE', 'team', req.params.id, {});
    res.json({ message: 'Team deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
// Add this endpoint to your admin-server.js file
// Place it after the existing match endpoints (around line 420)

// Update match status (start/pause/complete match)
app.patch('/api/admin/matches/:id/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    
    // Validate status
    const validStatuses = ['scheduled', 'live', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Must be: scheduled, live, or completed' });
    }

    const updateData = { 
      status, 
      updatedAt: new Date() 
    };

    // If starting match (going live), set initial scores if not already set
    if (status === 'live') {
      const currentMatch = await Match.findById(req.params.id);
      if (currentMatch.score1 === null) updateData.score1 = 0;
      if (currentMatch.score2 === null) updateData.score2 = 0;
    }

    // If completing match, set endTime
    if (status === 'completed') {
      updateData.endTime = new Date();
    }

    const match = await Match.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate(['team1', 'team2']);

    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }

    await logActivity(req.adminId, 'UPDATE_STATUS', 'match', match._id, { 
      status,
      from: match.status,
      to: status 
    });

    res.json(match);
  } catch (error) {
    console.error('Error updating match status:', error);
    res.status(500).json({ message: error.message });
  }
});

// Alternative: Modify your existing score endpoint to handle status-only updates
// Replace your existing /api/admin/matches/:id/score endpoint with this:

app.put('/api/admin/matches/:id/score', authMiddleware, async (req, res) => {
  try {
    const { score1, score2, progress, status, matchStats } = req.body;

    const updateData = { updatedAt: new Date() };
    
    // Only update fields that are provided
    if (score1 !== undefined) updateData.score1 = score1;
    if (score2 !== undefined) updateData.score2 = score2;
    if (progress !== undefined) updateData.progress = progress;
    if (status !== undefined) updateData.status = status;
    if (matchStats !== undefined) updateData.matchStats = matchStats;

    const match = await Match.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate(['team1', 'team2']);

    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }

    // Update team standings if match completed
    if (status === 'completed' && !match.endTime) {
      const team1 = await Team.findById(match.team1._id);
      const team2 = await Team.findById(match.team2._id);

      team1.goalsFor += score1 || 0;
      team1.goalsAgainst += score2 || 0;
      team2.goalsFor += score2 || 0;
      team2.goalsAgainst += score1 || 0;

      if (score1 > score2) {
        team1.wins += 1;
        team1.points += 3;
        team2.losses += 1;
      } else if (score2 > score1) {
        team2.wins += 1;
        team2.points += 3;
        team1.losses += 1;
      } else {
        team1.draws += 1;
        team1.points += 1;
        team2.draws += 1;
        team2.points += 1;
      }

      await team1.save();
      await team2.save();
      match.endTime = new Date();
      await match.save();
    }

    await logActivity(req.adminId, 'UPDATE_SCORE', 'match', match._id, { 
      score1, 
      score2, 
      progress,
      status 
    });

    res.json(match);
  } catch (error) {
    console.error('Error updating match score:', error);
    res.status(500).json({ message: error.message });
  }
});
// ===== PLAYER MANAGEMENT =====

// Get all players
app.get('/api/admin/players', authMiddleware, async (req, res) => {
  try {
    const { team, position, page = 1, limit = 10 } = req.query;
    const query = {};
    if (team) query.team = team;
    if (position) query.position = position;

    const skip = (page - 1) * limit;

    const players = await Player.find(query)
      .populate('team', 'name')
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Player.countDocuments(query);

    res.json({ players, total, page, limit });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get player by ID
app.get('/api/admin/players/:id', authMiddleware, async (req, res) => {
  try {
    const player = await Player.findById(req.params.id).populate('team');
    if (!player) return res.status(404).json({ message: 'Player not found' });
    res.json(player);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create player
app.post('/api/admin/players', authMiddleware, upload.single('photo'), async (req, res) => {
  try {
    const { name, position, jerseyNumber, age, nationality, height, weight, bio, team } = req.body;
    const photo = req.file ? `/uploads/${req.file.filename}` : null;

    const player = await Player.create({
      name,
      position,
      jerseyNumber,
      age,
      nationality,
      height,
      weight,
      bio,
      photo,
      team,
    });

    // Add player to team
    if (team) {
      await Team.findByIdAndUpdate(team, { $push: { players: player._id } });
    }

    await logActivity(req.adminId, 'CREATE', 'player', player._id, { name, position, team });

    const populatedPlayer = await player.populate('team');
    res.status(201).json(populatedPlayer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update player
app.put('/api/admin/players/:id', authMiddleware, upload.single('photo'), async (req, res) => {
  try {
    const { name, position, jerseyNumber, age, nationality, height, weight, bio, team, goals, assists, yellowCards, redCards, matchesPlayed } = req.body;

    const updateData = {
      name,
      position,
      jerseyNumber,
      age,
      nationality,
      height,
      weight,
      bio,
      goals: parseInt(goals) || 0,
      assists: parseInt(assists) || 0,
      yellowCards: parseInt(yellowCards) || 0,
      redCards: parseInt(redCards) || 0,
      matchesPlayed: parseInt(matchesPlayed) || 0,
      updatedAt: new Date(),
    };

    if (req.file) {
      updateData.photo = `/uploads/${req.file.filename}`;
    }

    const player = await Player.findByIdAndUpdate(req.params.id, updateData, { new: true }).populate(
      'team'
    );

    await logActivity(req.adminId, 'UPDATE', 'player', player._id, req.body);

    res.json(player);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete player
app.delete('/api/admin/players/:id', authMiddleware, async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (player.team) {
      await Team.findByIdAndUpdate(player.team, { $pull: { players: player._id } });
    }
    await Player.findByIdAndDelete(req.params.id);
    await logActivity(req.adminId, 'DELETE', 'player', req.params.id, {});
    res.json({ message: 'Player deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===== USER MANAGEMENT =====

// Get all users
app.get('/api/admin/users', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const users = await User.find({}, '-password')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await User.countDocuments();

    res.json({ users, total, page, limit });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create user (by admin)
app.post('/api/admin/users', authMiddleware, async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      phone,
      role: role || 'user',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
    });

    await logActivity(req.adminId, 'CREATE', 'user', user._id, { name, email, role });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update user
app.put('/api/admin/users/:id', authMiddleware, async (req, res) => {
  try {
    const { name, phone, role, isActive } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, phone, role, isActive },
      { new: true }
    ).select('-password');

    await logActivity(req.adminId, 'UPDATE', 'user', user._id, req.body);

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete user
app.delete('/api/admin/users/:id', authMiddleware, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    await logActivity(req.adminId, 'DELETE', 'user', req.params.id, {});
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
// ===== FANS MANAGEMENT ROUTES =====

// Get all fans
app.get('/api/admin/fans', authMiddleware, async (req, res) => {
  try {
    const { team, page = 1, limit = 10 } = req.query;
    const query = team ? { team } : {};
    const skip = (page - 1) * limit;

    const fans = await Fan.find(query)
      .populate('team', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Fan.countDocuments(query);

    res.json({ fans, total, page, limit });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get fan by ID
app.get('/api/admin/fans/:id', authMiddleware, async (req, res) => {
  try {
    const fan = await Fan.findById(req.params.id).populate('team');
    if (!fan) return res.status(404).json({ message: 'Fan not found' });
    res.json(fan);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create fan
app.post('/api/admin/fans', authMiddleware, async (req, res) => {
  try {
    const { name, email, phone, team, joinDate, membershipLevel, interests, bio } = req.body;

    const fan = await Fan.create({
      name,
      email,
      phone,
      team,
      joinDate,
      membershipLevel,
      interests: interests || [],
      bio,
    });

    const populatedFan = await fan.populate('team', 'name');

    await logActivity(req.adminId, 'CREATE', 'fan', fan._id, { name, team, membershipLevel });

    res.status(201).json(populatedFan);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update fan
app.put('/api/admin/fans/:id', authMiddleware, async (req, res) => {
  try {
    const { name, email, phone, team, joinDate, membershipLevel, interests, bio } = req.body;

    const fan = await Fan.findByIdAndUpdate(
      req.params.id,
      {
        name,
        email,
        phone,
        team,
        joinDate,
        membershipLevel,
        interests: interests || [],
        bio,
        updatedAt: new Date(),
      },
      { new: true }
    ).populate('team', 'name');

    await logActivity(req.adminId, 'UPDATE', 'fan', fan._id, req.body);

    res.json(fan);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete fan
app.delete('/api/admin/fans/:id', authMiddleware, async (req, res) => {
  try {
    await Fan.findByIdAndDelete(req.params.id);
    await logActivity(req.adminId, 'DELETE', 'fan', req.params.id, {});
    res.json({ message: 'Fan deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get fans by team
app.get('/api/admin/teams/:teamId/fans', authMiddleware, async (req, res) => {
  try {
    const fans = await Fan.find({ team: req.params.teamId }).populate('team', 'name');
    const total = fans.length;
    res.json({ fans, total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get fan statistics
app.get('/api/admin/fans-stats', authMiddleware, async (req, res) => {
  try {
    const totalFans = await Fan.countDocuments();
    const regularFans = await Fan.countDocuments({ membershipLevel: 'regular' });
    const premiumFans = await Fan.countDocuments({ membershipLevel: 'premium' });
    const vipFans = await Fan.countDocuments({ membershipLevel: 'vip' });

    const fansByTeam = await Fan.aggregate([
      {
        $group: {
          _id: '$team',
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'teams',
          localField: '_id',
          foreignField: '_id',
          as: 'team',
        },
      },
    ]);

    res.json({
      totalFans,
      regularFans,
      premiumFans,
      vipFans,
      fansByTeam,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
// ===== SETTINGS MANAGEMENT =====

// Get settings
app.get('/api/admin/settings', authMiddleware, async (req, res) => {
  try {
    let settings = await Settings.findOne().populate('updatedBy', 'name email');
    if (!settings) {
      settings = await Settings.create({
        tournamentName: 'Keiyo South Tournament',
        season: '2024',
      });
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update settings
app.put('/api/admin/settings', authMiddleware, async (req, res) => {
  try {
    const { tournamentName, season, startDate, endDate, location, rules, maxTeams, maxPlayersPerTeam } = req.body;

    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({
        tournamentName,
        season,
        startDate,
        endDate,
        location,
        rules,
        maxTeams,
        maxPlayersPerTeam,
        updatedBy: req.adminId,
      });
    } else {
      settings = await Settings.findByIdAndUpdate(
        settings._id,
        {
          tournamentName,
          season,
          startDate,
          endDate,
          location,
          rules,
          maxTeams,
          maxPlayersPerTeam,
          updatedBy: req.adminId,
        },
        { new: true }
      ).populate('updatedBy', 'name email');
    }

    await logActivity(req.adminId, 'UPDATE', 'settings', settings._id, req.body);

    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===== ACTIVITY LOG =====

// Get activity logs
app.get('/api/admin/activity-logs', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const logs = await ActivityLog.find()
      .populate('admin', 'name email')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ActivityLog.countDocuments();

    res.json({ logs, total, page, limit });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===== ERROR HANDLING =====

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

// ===== MONGODB CONNECTION & SERVER START =====
// Get tournament settings/info
app.get('/api/public/tournament-info', async (req, res) => {
  try {
    const settings = await Settings.findOne();
    if (!settings) {
      return res.status(404).json({ message: 'Tournament settings not found' });
    }
    res.json({
      name: settings.tournamentName,
      season: settings.season,
      location: settings.location,
      startDate: settings.startDate,
      endDate: settings.endDate,
      rules: settings.rules,
      maxTeams: settings.maxTeams,
      maxPlayersPerTeam: settings.maxPlayersPerTeam
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all matches for public viewing
app.get('/api/public/matches', async (req, res) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : {};

    const matches = await Match.find(query)
      .populate('team1', 'name logo city')
      .populate('team2', 'name logo city')
      .sort({ startTime: -1 })
      .limit(50);

    res.json(matches);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single match details
app.get('/api/public/matches/:id', async (req, res) => {
  try {
    const match = await Match.findById(req.params.id)
      .populate('team1', 'name logo city coach')
      .populate('team2', 'name logo city coach');
    
    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }
    
    res.json(match);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get standings/league table
app.get('/api/public/standings', async (req, res) => {
  try {
    const teams = await Team.find()
      .select('name logo wins losses draws points goalsFor goalsAgainst city')
      .sort({ points: -1, goalsFor: -1 });

    // Calculate additional data
    const standings = teams.map((team, index) => ({
      position: index + 1,
      team: team.name,
      logo: team.logo,
      city: team.city,
      played: team.wins + team.losses + team.draws,
      won: team.wins,
      drawn: team.draws,
      lost: team.losses,
      gf: team.goalsFor,
      ga: team.goalsAgainst,
      gd: team.goalsFor - team.goalsAgainst,
      points: team.points,
      _id: team._id
    }));

    res.json(standings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all teams
app.get('/api/public/teams', async (req, res) => {
  try {
    const teams = await Team.find()
      .populate('players')
      .sort({ points: -1 });

    res.json(teams);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single team details
app.get('/api/public/teams/:id', async (req, res) => {
  try {
    const team = await Team.findById(req.params.id)
      .populate('players');
    
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    
    res.json(team);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all players
app.get('/api/public/players', async (req, res) => {
  try {
    const { team, position } = req.query;
    const query = {};
    
    if (team) query.team = team;
    if (position) query.position = position;

    const players = await Player.find(query)
      .populate('team', 'name logo')
      .sort({ goals: -1 });

    res.json(players);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single player details
app.get('/api/public/players/:id', async (req, res) => {
  try {
    const player = await Player.findById(req.params.id)
      .populate('team', 'name logo city');
    
    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }
    
    res.json(player);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get top scorers
app.get('/api/public/top-scorers', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const topScorers = await Player.find()
      .populate('team', 'name logo')
      .sort({ goals: -1, assists: -1 })
      .limit(limit);

    res.json(topScorers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get dashboard statistics
app.get('/api/public/stats', async (req, res) => {
  try {
    const totalTeams = await Team.countDocuments();
    const totalPlayers = await Player.countDocuments();
    const totalMatches = await Match.countDocuments();
    const completedMatches = await Match.countDocuments({ status: 'completed' });
    const liveMatches = await Match.countDocuments({ status: 'live' });
    const upcomingMatches = await Match.countDocuments({ status: 'scheduled' });

    // Calculate total goals
    const teams = await Team.find();
    const totalGoals = teams.reduce((sum, team) => sum + team.goalsFor, 0);

    res.json({
      totalTeams,
      totalPlayers,
      totalMatches,
      completedMatches,
      liveMatches,
      upcomingMatches,
      totalGoals
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get live matches
app.get('/api/public/live-matches', async (req, res) => {
  try {
    const liveMatches = await Match.find({ status: 'live' })
      .populate('team1', 'name logo')
      .populate('team2', 'name logo')
      .sort({ startTime: -1 });

    res.json(liveMatches);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get upcoming matches
app.get('/api/public/upcoming-matches', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    
    const upcomingMatches = await Match.find({ status: 'scheduled' })
      .populate('team1', 'name logo')
      .populate('team2', 'name logo')
      .sort({ startTime: 1 })
      .limit(limit);

    res.json(upcomingMatches);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get recent results
app.get('/api/public/recent-results', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    
    const recentResults = await Match.find({ status: 'completed' })
      .populate('team1', 'name logo')
      .populate('team2', 'name logo')
      .sort({ endTime: -1 })
      .limit(limit);

    res.json(recentResults);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get fans
app.get('/api/public/fans', async (req, res) => {
  try {
    const { team } = req.query;
    const query = team ? { team } : {};
    
    const fans = await Fan.find(query)
      .populate('team', 'name logo')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json(fans);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Fan registration (public endpoint)
app.post('/api/public/fans/register', async (req, res) => {
  try {
    const { name, email, phone, team, interests, bio } = req.body;

    // Check if fan already exists
    const existingFan = await Fan.findOne({ email });
    if (existingFan) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const fan = await Fan.create({
      name,
      email,
      phone,
      team,
      interests: interests || [],
      bio,
      membershipLevel: 'regular'
    });

    const populatedFan = await fan.populate('team', 'name logo');

    res.status(201).json({
      message: 'Registration successful',
      fan: populatedFan
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

console.log('✅ Public API routes loaded for user portal');
// Connect to MongoDB FIRST, then start server
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tournament-arena')
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    
    // Start server only after DB connection is established
    const PORT = process.env.PORT || 5001;
    app.listen(PORT, () => {
      console.log(`🚀 Admin server running on port ${PORT}`);
      console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1); // Exit if database connection fails
  });
  // Add these PUBLIC routes to your admin-server.js
// These routes do NOT require authentication and are accessible to all users

// ===== PUBLIC ROUTES FOR USER PORTAL =====

