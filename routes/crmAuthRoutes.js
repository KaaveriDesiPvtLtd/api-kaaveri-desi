const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { authenticateCRM, authorize, getPermissionsForRole } = require('../middleware/crmAuth');

const CRM_JWT_SECRET = process.env.CRM_JWT_SECRET || 'crm-fallback-secret-key';

// Helper to get AdminUser model (registered on adminDb connection)
const getAdminUser = () => {
  const mongoose = require('mongoose');
  const adminDb = mongoose.connection.useDb('crm_admin');
  if (!adminDb.models.AdminUser) {
    const adminUserSchema = require('../model/AdminUser');
    adminDb.model('AdminUser', adminUserSchema);
  }
  return adminDb.models.AdminUser;
};

/**
 * POST /api/crm/auth/login
 * Public — no auth required
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    const AdminUser = getAdminUser();
    const user = await AdminUser.findOne({ username: username.toLowerCase().trim() });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact the super admin.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      CRM_JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '8h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        permissions: getPermissionsForRole(user.role)
      }
    });
  } catch (error) {
    console.error('CRM Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

/**
 * GET /api/crm/auth/me
 * Returns current user profile + permissions
 */
router.get('/me', authenticateCRM, async (req, res) => {
  try {
    const AdminUser = getAdminUser();
    const user = await AdminUser.findById(req.crmUser.id).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        permissions: getPermissionsForRole(user.role)
      }
    });
  } catch (error) {
    console.error('CRM /me error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ========== SUPERADMIN USER MANAGEMENT ==========

/**
 * GET /api/crm/auth/users
 * List all admin users (superadmin only)
 */
router.get('/users', authenticateCRM, authorize('users', 'read'), async (req, res) => {
  try {
    const AdminUser = getAdminUser();
    const users = await AdminUser.find().select('-password').sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/**
 * POST /api/crm/auth/users
 * Create a new admin user (superadmin only)
 */
router.post('/users', authenticateCRM, authorize('users', 'write'), async (req, res) => {
  try {
    const { username, password, name, role } = req.body;

    if (!username || !password || !name || !role) {
      return res.status(400).json({ success: false, message: 'All fields are required: username, password, name, role.' });
    }

    if (!['admin', 'manager', 'viewer'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be admin, manager, or viewer.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const AdminUser = getAdminUser();
    const existing = await AdminUser.findOne({ username: username.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Username already exists.' });
    }

    const newUser = new AdminUser({
      username: username.toLowerCase().trim(),
      password,
      name: name.trim(),
      role
    });

    await newUser.save();
    res.status(201).json({ success: true, user: newUser.toJSON() });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/**
 * PUT /api/crm/auth/users/:id
 * Update admin user (superadmin only)
 */
router.put('/users/:id', authenticateCRM, authorize('users', 'write'), async (req, res) => {
  try {
    const AdminUser = getAdminUser();
    const user = await AdminUser.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Prevent modifying the superadmin's role or deactivating it
    if (user.role === 'superadmin') {
      return res.status(403).json({ success: false, message: 'Cannot modify the super admin user.' });
    }

    const { name, role, password, isActive } = req.body;

    if (name) user.name = name.trim();
    if (role && ['admin', 'manager', 'viewer'].includes(role)) user.role = role;
    if (password && password.length >= 6) user.password = password;
    if (isActive !== undefined) user.isActive = isActive;

    await user.save();
    res.json({ success: true, user: user.toJSON() });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/**
 * DELETE /api/crm/auth/users/:id
 * Deactivate admin user (superadmin only) — soft delete
 */
router.delete('/users/:id', authenticateCRM, authorize('users', 'write'), async (req, res) => {
  try {
    const AdminUser = getAdminUser();
    const user = await AdminUser.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (user.role === 'superadmin') {
      return res.status(403).json({ success: false, message: 'Cannot delete the super admin user.' });
    }

    user.isActive = false;
    await user.save();
    res.json({ success: true, message: 'User deactivated successfully.' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
