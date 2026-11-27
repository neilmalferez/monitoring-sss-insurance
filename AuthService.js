/**
 * Authentication, session caching, salted SHA-256 hashing, and role-based field enforcement.
 */

function hashPassword_(password, salt) {
  var raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(salt) + ':' + String(password),
    Utilities.Charset.UTF_8
  );
  var hex = [];
  for (var i = 0; i < raw.length; i++) {
    var b = (raw[i] + 256) % 256;
    hex.push(('0' + b.toString(16)).slice(-2));
  }
  return hex.join('');
}

function sanitizeUser_(userRow) {
  return {
    user_id: userRow.user_id,
    username: userRow.username,
    full_name: userRow.full_name,
    email: userRow.email || '',
    role: userRow.role,
    role_label: APP_CONFIG.ROLE_LABELS[userRow.role] || userRow.role,
    must_change_password: toBool_(userRow.must_change_password),
    is_active: toBool_(userRow.is_active),
    created_at: userRow.created_at || '',
    last_login: userRow.last_login || '',
    photo_data: String(userRow.photo_data || '')
  };
}

function buildPermissionsForRole_(role) {
  var sssFields = APP_CONFIG.ROLE_WRITABLE_FIELDS.SSS[role] || [];
  var insFields = APP_CONFIG.ROLE_WRITABLE_FIELDS.INSURANCE[role] || [];
  return {
    role: role,
    role_label: APP_CONFIG.ROLE_LABELS[role] || role,
    canCreateSss: role === APP_CONFIG.ROLES.ADMIN || role === APP_CONFIG.ROLES.HR,
    canCreateInsurance: role === APP_CONFIG.ROLES.ADMIN || role === APP_CONFIG.ROLES.HR,
    canDelete: role === APP_CONFIG.ROLES.ADMIN,
    canImport: role === APP_CONFIG.ROLES.ADMIN || role === APP_CONFIG.ROLES.HR,
    canManageUsers: role === APP_CONFIG.ROLES.ADMIN,
    canManageMasters: role === APP_CONFIG.ROLES.ADMIN,
    sssWritableFields: sssFields,
    insuranceWritableFields: insFields
  };
}

function loginUser_(username, password) {
  ensureDatabaseReady_();
  var uname = String(username || '').trim().toLowerCase();
  var pwd = String(password || '');
  if (!uname || !pwd) {
    throw new Error('Username and password are required.');
  }

  var users = readSheetObjects_(APP_CONFIG.SHEETS.USERS, true);
  var match = null;
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].username || '').trim().toLowerCase() === uname) {
      match = users[i];
      break;
    }
  }
  if (!match) {
    throw new Error('Invalid username or password.');
  }
  if (!toBool_(match.is_active)) {
    throw new Error('Account is inactive. Please contact your System Administrator.');
  }

  var candidateHash = hashPassword_(pwd, match.salt);
  if (candidateHash !== match.password_hash) {
    throw new Error('Invalid username or password.');
  }

  var now = nowManilaIso_();
  withScriptLock_(function() {
    var updated = Object.assign({}, match, { last_login: now });
    updateRowObject_(APP_CONFIG.SHEETS.USERS, match._rowIndex, updated);
    writeAuditLog_(
      { username: match.username, role: match.role },
      'AUTH',
      match.user_id,
      'LOGIN',
      {},
      'User signed in'
    );
  });

  var token = Utilities.getUuid();
  var sessionObj = {
    token: token,
    user_id: match.user_id,
    username: match.username,
    full_name: match.full_name,
    role: match.role,
    must_change_password: toBool_(match.must_change_password),
    issued_at: now
  };
  CacheService.getScriptCache().put('sess:' + token, JSON.stringify(sessionObj), APP_CONFIG.SESSION_TTL_SECONDS);

  var masters = getMasterLists_(sessionObj);
  var rawSheets = [];
  try {
    rawSheets = listRawSheetNames_(sessionObj);
  } catch (e) {
    rawSheets = [];
  }

  return {
    token: token,
    user: sanitizeUser_(Object.assign({}, match, { last_login: now })),
    permissions: buildPermissionsForRole_(match.role),
    masters: masters,
    rawSheets: rawSheets,
    config: {
      appName: APP_CONFIG.APP_NAME,
      defaultErid: APP_CONFIG.DEFAULT_ERID,
      agingThresholds: APP_CONFIG.AGING_THRESHOLDS
    }
  };
}

function logoutUser_(token) {
  if (token) {
    CacheService.getScriptCache().remove('sess:' + token);
  }
  return { loggedOut: true };
}

function getSessionOrNull_(token) {
  if (!token) return null;
  var raw = CacheService.getScriptCache().get('sess:' + token);
  if (!raw) return null;
  try {
    var sess = JSON.parse(raw);
    // Refresh sliding TTL
    CacheService.getScriptCache().put('sess:' + token, raw, APP_CONFIG.SESSION_TTL_SECONDS);
    return sess;
  } catch (e) {
    return null;
  }
}

function requireSession_(token, allowedRoles) {
  var sess = getSessionOrNull_(token);
  if (!sess) {
    throw new Error('Session expired or not signed in. Please sign in again.');
  }
  if (allowedRoles && allowedRoles.length > 0 && allowedRoles.indexOf(sess.role) === -1) {
    throw new Error('Access denied: role "' + sess.role + '" is not authorized for this action.');
  }
  return sess;
}

/**
 * Strips any fields outside the role's writable allowlist for the given module.
 */
function filterPayloadByRole_(role, moduleName, payload, isCreate) {
  if (role === APP_CONFIG.ROLES.VIEWER) {
    throw new Error('Viewer accounts have read-only access and cannot modify records.');
  }
  if (isCreate && role !== APP_CONFIG.ROLES.ADMIN && role !== APP_CONFIG.ROLES.HR) {
    throw new Error('Only HR Department or System Admin can create new claims.');
  }

  var modMap = APP_CONFIG.ROLE_WRITABLE_FIELDS[moduleName];
  if (!modMap) throw new Error('Unknown module: ' + moduleName);
  var allowed = modMap[role] || [];
  if (allowed.length === 0) {
    throw new Error('Role "' + role + '" has no editable fields in ' + moduleName + '.');
  }

  var filtered = {};
  for (var i = 0; i < allowed.length; i++) {
    var field = allowed[i];
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      filtered[field] = payload[field];
    }
  }
  return filtered;
}

function changePassword_(session, currentPassword, newPassword) {
  var curr = String(currentPassword || '');
  var next = String(newPassword || '');
  if (!curr || next.length < 8) {
    throw new Error('New password must be at least 8 characters long.');
  }

  return withScriptLock_(function() {
    var users = readSheetObjects_(APP_CONFIG.SHEETS.USERS, true);
    var match = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].user_id === session.user_id) {
        match = users[i];
        break;
      }
    }
    if (!match) throw new Error('User record not found.');

    var currHash = hashPassword_(curr, match.salt);
    if (currHash !== match.password_hash) {
      throw new Error('Current password is incorrect.');
    }

    var newSalt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    var newHash = hashPassword_(next, newSalt);
    var updated = Object.assign({}, match, {
      password_hash: newHash,
      salt: newSalt,
      must_change_password: false
    });
    updateRowObject_(APP_CONFIG.SHEETS.USERS, match._rowIndex, updated);

    // Update cached session
    var updatedSess = Object.assign({}, session, { must_change_password: false });
    CacheService.getScriptCache().put('sess:' + session.token, JSON.stringify(updatedSess), APP_CONFIG.SESSION_TTL_SECONDS);

    writeAuditLog_(session, 'AUTH', match.user_id, 'CHANGE_PASSWORD', {}, 'User changed password');
    return { user: sanitizeUser_(updated) };
  });
}

function listUsers_(session) {
  requireSession_(session.token || session, [APP_CONFIG.ROLES.ADMIN]);
  var users = readSheetObjects_(APP_CONFIG.SHEETS.USERS);
  var out = [];
  for (var i = 0; i < users.length; i++) {
    out.push(sanitizeUser_(users[i]));
  }
  return out;
}

function saveUser_(session, payload) {
  if (session.role !== APP_CONFIG.ROLES.ADMIN) {
    throw new Error('Only System Admin can manage user accounts.');
  }
  var username = String(payload.username || '').trim().toLowerCase();
  var fullName = String(payload.full_name || '').trim();
  var email = String(payload.email || '').trim();
  var role = String(payload.role || '').trim().toUpperCase();
  var isActive = payload.is_active === undefined ? true : toBool_(payload.is_active);
  var newPassword = String(payload.password || '');

  if (!username || !fullName) throw new Error('Username and Full Name are required.');
  if (!APP_CONFIG.ROLES[role]) throw new Error('Invalid role: ' + role);

  return withScriptLock_(function() {
    var users = readSheetObjects_(APP_CONFIG.SHEETS.USERS, true);
    var existing = null;
    for (var i = 0; i < users.length; i++) {
      if (payload.user_id && users[i].user_id === payload.user_id) {
        existing = users[i];
      } else if (String(users[i].username || '').trim().toLowerCase() === username && users[i].user_id !== payload.user_id) {
        throw new Error('Username "' + username + '" is already taken.');
      }
    }

    var now = nowManilaIso_();
    if (!existing) {
      if (newPassword.length < 8) {
        throw new Error('Initial password for a new user must be at least 8 characters.');
      }
      var maxUserNum = 0;
      for (var u = 0; u < users.length; u++) {
        var m = /^USR-(\d+)$/.exec(String(users[u].user_id || ''));
        if (m) maxUserNum = Math.max(maxUserNum, parseInt(m[1], 10));
      }
      var userId = 'USR-' + String(maxUserNum + 1).padStart(4, '0');
      var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
      var newUser = {
        user_id: userId,
        username: username,
        full_name: fullName,
        email: email,
        role: role,
        password_hash: hashPassword_(newPassword, salt),
        salt: salt,
        must_change_password: true,
        is_active: isActive,
        created_at: now,
        last_login: '',
        photo_data: ''
      };
      appendRowObject_(APP_CONFIG.SHEETS.USERS, newUser);
      writeAuditLog_(session, 'USERS', userId, 'CREATE', { username: username, role: role }, 'Created user ' + username);
      return sanitizeUser_(newUser);
    }

    var updated = Object.assign({}, existing, {
      username: username,
      full_name: fullName,
      email: email,
      role: role,
      is_active: isActive
    });
    if (newPassword) {
      if (newPassword.length < 8) throw new Error('Reset password must be at least 8 characters.');
      var resetSalt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
      updated.salt = resetSalt;
      updated.password_hash = hashPassword_(newPassword, resetSalt);
      updated.must_change_password = true;
    }
    updateRowObject_(APP_CONFIG.SHEETS.USERS, existing._rowIndex, updated);
    writeAuditLog_(session, 'USERS', existing.user_id, 'UPDATE', { role: role, is_active: isActive }, 'Updated user ' + username);
    return sanitizeUser_(updated);
  });
}

function getMyProfile_(session) {
  ensureDatabaseReady_();
  var users = readSheetObjects_(APP_CONFIG.SHEETS.USERS);
  for (var i = 0; i < users.length; i++) {
    if (users[i].user_id === session.user_id) {
      return sanitizeUser_(users[i]);
    }
  }
  throw new Error('User record not found.');
}

function updateMyProfile_(session, payload) {
  ensureDatabaseReady_();
  payload = payload || {};
  var fullName = String(payload.full_name || '').trim();
  var email = String(payload.email || '').trim();
  if (!fullName) {
    throw new Error('Full Name is required.');
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Please enter a valid email address.');
  }

  return withScriptLock_(function() {
    var users = readSheetObjects_(APP_CONFIG.SHEETS.USERS, true);
    var match = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].user_id === session.user_id) {
        match = users[i];
        break;
      }
    }
    if (!match) throw new Error('User record not found.');

    var updated = Object.assign({}, match, {
      full_name: fullName,
      email: email
    });
    var diff = computeFieldDiff_(match, updated, ['full_name', 'email']);
    updateRowObject_(APP_CONFIG.SHEETS.USERS, match._rowIndex, updated);

    if (session.token) {
      var updatedSess = Object.assign({}, session, { full_name: fullName });
      CacheService.getScriptCache().put('sess:' + session.token, JSON.stringify(updatedSess), APP_CONFIG.SESSION_TTL_SECONDS);
    }

    writeAuditLog_(session, 'AUTH', match.user_id, 'UPDATE_PROFILE', diff, 'Updated own profile info');
    return { user: sanitizeUser_(updated) };
  });
}

function updateMyPhoto_(session, photoData) {
  ensureDatabaseReady_();
  var data = (photoData === null || photoData === undefined) ? '' : String(photoData).trim();
  if (data) {
    if (!/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data)) {
      throw new Error('Invalid image format. Please upload a JPEG, PNG, or WebP image.');
    }
    if (data.length > 45000) {
      throw new Error('Profile photo is too large (' + data.length + ' chars). Please use a smaller image.');
    }
  }

  return withScriptLock_(function() {
    var users = readSheetObjects_(APP_CONFIG.SHEETS.USERS, true);
    var match = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].user_id === session.user_id) {
        match = users[i];
        break;
      }
    }
    if (!match) throw new Error('User record not found.');

    var updated = Object.assign({}, match, { photo_data: data });
    updateRowObject_(APP_CONFIG.SHEETS.USERS, match._rowIndex, updated);
    writeAuditLog_(
      session,
      'AUTH',
      match.user_id,
      data ? 'UPDATE_PHOTO' : 'REMOVE_PHOTO',
      {},
      data ? 'Updated profile photo' : 'Removed profile photo'
    );
    return { user: sanitizeUser_(updated) };
  });
}
