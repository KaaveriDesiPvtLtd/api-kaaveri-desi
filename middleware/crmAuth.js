const jwt = require('jsonwebtoken');

const CRM_JWT_SECRET = process.env.CRM_JWT_SECRET || 'crm-fallback-secret-key';

// Permissions matrix: role -> resource -> allowed actions
const PERMISSIONS = {
  superadmin: {
    dashboard: ['read', 'write'],
    inventory: ['read', 'write', 'stock'],
    orders:    ['read', 'write'],
    reports:   ['read', 'write'],
    settings:  ['read', 'write'],
    users:     ['read', 'write']
  },
  admin: {
    dashboard: ['read', 'write'],
    inventory: ['read', 'write', 'stock'],
    orders:    ['read', 'write'],
    reports:   ['read', 'write'],
    settings:  ['read', 'write'],
    users:     []
  },
  manager: {
    dashboard: ['read'],
    inventory: ['read', 'stock'],
    orders:    ['read', 'write'],
    reports:   ['read'],
    settings:  [],
    users:     []
  },
  viewer: {
    dashboard: ['read'],
    inventory: ['read'],
    orders:    ['read'],
    reports:   ['read'],
    settings:  [],
    users:     []
  }
};

/**
 * Authenticate CRM user via JWT Bearer token
 */
const authenticateCRM = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false, 
      message: 'Authentication required. Please login.' 
    });
  }

  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, CRM_JWT_SECRET, { algorithms: ['HS256'] });
    req.crmUser = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expired. Please login again.' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

/**
 * Authorize based on resource and action
 * Usage: authorize('inventory', 'write')
 */
const authorize = (resource, action = 'read') => {
  return (req, res, next) => {
    const { role } = req.crmUser;
    const rolePerms = PERMISSIONS[role];

    if (!rolePerms || !rolePerms[resource] || !rolePerms[resource].includes(action)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Insufficient permissions.' 
      });
    }
    next();
  };
};

/**
 * Get the permissions object for a given role (used by /me endpoint)
 */
const getPermissionsForRole = (role) => {
  return PERMISSIONS[role] || {};
};

module.exports = { authenticateCRM, authorize, getPermissionsForRole, PERMISSIONS };
