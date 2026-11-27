/**
 * Google Sheets data-access layer with LockService concurrency control,
 * non-destructive DB_* setup, plain-text column formatting, and audit logging.
 */

var EXEC_SS_CACHE_ = null;
var DB_READY_CACHE_KEY_ = 'db_ready:v3';
var SHEET_CACHE_TTL_SEC_ = 300;
var SHEET_CACHE_CHUNK_CHARS_ = 80000;
var SHEET_CACHE_MAX_CHUNKS_ = 10;

function extractSpreadsheetId_(raw) {
  var s = String(raw || '').trim();
  var m = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(s);
  return m ? m[1] : s;
}

function getSpreadsheet_() {
  if (EXEC_SS_CACHE_) return EXEC_SS_CACHE_;
  var ss = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    ss = null;
  }
  if (!ss) {
    var rawId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    var id = extractSpreadsheetId_(rawId);
    if (id) {
      ss = SpreadsheetApp.openById(id);
    }
  }
  if (!ss) {
    throw new Error(
      'No bound Google Spreadsheet found. Either bind this Apps Script to your Monitoring Google Sheet or call setSpreadsheetId(spreadsheetId) in Apps Script.'
    );
  }
  EXEC_SS_CACHE_ = ss;
  return ss;
}

/**
 * Helper for standalone deployments: stores the target Spreadsheet ID in Script Properties.
 */
function setSpreadsheetId(spreadsheetId) {
  var id = extractSpreadsheetId_(spreadsheetId);
  if (!id) throw new Error('spreadsheetId is required.');
  EXEC_SS_CACHE_ = null;
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', id);
  return setupDatabase();
}

/**
 * Adds a custom menu inside Google Sheets for one-click database initialization.
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('SSS & Insurance System')
      .addItem('Initialize / Verify Database (DB_* tabs)', 'setupDatabase')
      .addItem('Seed Default Department Users', 'seedDefaultDepartmentUsers')
      .addItem('Recompute Workflow Stages', 'recomputeAllWorkflowStages')
      .addToUi();
  } catch (e) {
    // Ignore when executed outside UI context
  }
}

function withScriptLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Idempotently creates and formats all DB_* sheets, seeds DB_Master_Lists,
 * and creates the initial admin user if DB_Users is empty.
 */
function setupDatabase() {
  var ss = getSpreadsheet_();
  var sheetNames = Object.keys(APP_CONFIG.COLUMNS);

  for (var i = 0; i < sheetNames.length; i++) {
    var name = sheetNames[i];
    var cols = APP_CONFIG.COLUMNS[name];
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }

    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, cols.length).setValues([cols]);
    } else {
      // Ensure any new schema columns are appended safely without erasing existing rows
      var existingLastCol = Math.max(sheet.getLastColumn(), 1);
      var existingHeaders = sheet.getRange(1, 1, 1, existingLastCol).getValues()[0];
      var missingCols = [];
      for (var c = 0; c < cols.length; c++) {
        if (existingHeaders.indexOf(cols[c]) === -1) {
          missingCols.push(cols[c]);
        }
      }
      if (missingCols.length > 0) {
        sheet.getRange(1, existingLastCol + 1, 1, missingCols.length).setValues([missingCols]);
      }
    }

    sheet.setFrozenRows(1);
    var headerRange = sheet.getRange(1, 1, 1, cols.length);
    headerRange.setFontWeight('bold').setBackground('#0F172A').setFontColor('#FFFFFF');

    applyColumnFormats_(sheet, name, cols);
  }

  seedMasterListsIfEmpty_(ss);
  seedDefaultUsersIfMissing_(ss);

  for (var s = 0; s < sheetNames.length; s++) {
    invalidateSheetCache_(sheetNames[s]);
  }
  try {
    CacheService.getScriptCache().put(DB_READY_CACHE_KEY_, '1', 3600);
  } catch (e) {}

  return {
    ok: true,
    spreadsheetName: ss.getName(),
    sheetsInitialized: sheetNames
  };
}

function applyColumnFormats_(sheet, sheetName, cols) {
  var maxRows = Math.max(sheet.getMaxRows() - 1, 1);
  var plainCols = APP_CONFIG.PLAIN_TEXT_COLUMNS[sheetName] || [];
  var currencyCols = APP_CONFIG.CURRENCY_COLUMNS[sheetName] || [];
  var dateCols = APP_CONFIG.DATE_COLUMNS[sheetName] || [];

  for (var i = 0; i < cols.length; i++) {
    var colName = cols[i];
    var colIdx = i + 1;
    if (plainCols.indexOf(colName) !== -1) {
      sheet.getRange(2, colIdx, maxRows, 1).setNumberFormat('@');
    } else if (currencyCols.indexOf(colName) !== -1) {
      sheet.getRange(2, colIdx, maxRows, 1).setNumberFormat('₱#,##0.00');
    } else if (dateCols.indexOf(colName) !== -1) {
      sheet.getRange(2, colIdx, maxRows, 1).setNumberFormat('yyyy-mm-dd');
    }
  }
}

var EXEC_SHEET_CACHE_ = {};

function invalidateSheetCache_(sheetName) {
  delete EXEC_SHEET_CACHE_[sheetName];
  try {
    var cache = CacheService.getScriptCache();
    var keys = ['tbl:' + sheetName + ':meta'];
    for (var c = 0; c < SHEET_CACHE_MAX_CHUNKS_; c++) {
      keys.push('tbl:' + sheetName + ':c' + c);
    }
    if (typeof cache.removeAll === 'function') {
      cache.removeAll(keys);
    } else {
      for (var i = 0; i < keys.length; i++) cache.remove(keys[i]);
    }
  } catch (e) {}
}

function ensureDatabaseReady_() {
  try {
    if (CacheService.getScriptCache().get(DB_READY_CACHE_KEY_) === '1') return;
  } catch (e) {}

  var ss = getSpreadsheet_();
  var required = [
    APP_CONFIG.SHEETS.SSS,
    APP_CONFIG.SHEETS.INSURANCE,
    APP_CONFIG.SHEETS.MASTERS,
    APP_CONFIG.SHEETS.USERS,
    APP_CONFIG.SHEETS.AUDIT
  ];
  for (var i = 0; i < required.length; i++) {
    var sheetName = required[i];
    var sh = ss.getSheetByName(sheetName);
    if (!sh || sh.getLastRow() === 0) {
      setupDatabase();
      return;
    }
    var expectedCols = APP_CONFIG.COLUMNS[sheetName];
    var lastCol = Math.max(sh.getLastColumn(), 1);
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    for (var c = 0; c < expectedCols.length; c++) {
      if (headers.indexOf(expectedCols[c]) === -1) {
        setupDatabase();
        return;
      }
    }
  }
  seedDefaultUsersIfMissing_(ss);
  try {
    CacheService.getScriptCache().put(DB_READY_CACHE_KEY_, '1', 3600);
  } catch (e) {}
}

function seedMasterListsIfEmpty_(ss) {
  var sheet = ss.getSheetByName(APP_CONFIG.SHEETS.MASTERS);
  if (sheet.getLastRow() > 1) return;

  var now = nowManilaIso_();
  var rows = [];
  for (var i = 0; i < APP_CONFIG.SEED_MASTERS.length; i++) {
    var m = APP_CONFIG.SEED_MASTERS[i];
    rows.push(['MST-' + String(i + 1).padStart(4, '0'), m.category, m.code, m.label, true, now]);
  }
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, APP_CONFIG.COLUMNS.DB_Master_Lists.length).setValues(rows);
  }
}

function seedDefaultUsersIfMissing_(ss) {
  var sheet = ss.getSheetByName(APP_CONFIG.SHEETS.USERS);
  var existingRows = readSheetObjects_(APP_CONFIG.SHEETS.USERS, true);
  var existingByUname = {};
  var maxUserNum = 0;

  for (var i = 0; i < existingRows.length; i++) {
    var uname = String(existingRows[i].username || '').trim().toLowerCase();
    if (uname) existingByUname[uname] = true;
    var m = /^USR-(\d+)$/.exec(String(existingRows[i].user_id || ''));
    if (m) maxUserNum = Math.max(maxUserNum, parseInt(m[1], 10));
  }

  var seeds = APP_CONFIG.SEED_USERS || [];
  var now = nowManilaIso_();
  var toAppend = [];

  for (var s = 0; s < seeds.length; s++) {
    var seed = seeds[s];
    var seedUname = String(seed.username || '').trim().toLowerCase();
    if (!seedUname || existingByUname[seedUname]) continue;

    maxUserNum++;
    var userId = 'USR-' + String(maxUserNum).padStart(4, '0');
    var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    var hash = hashPassword_(seed.initial_password, salt);
    toAppend.push([
      userId,
      seedUname,
      seed.full_name,
      '',
      seed.role,
      hash,
      salt,
      true,
      true,
      now,
      '',
      ''
    ]);
    existingByUname[seedUname] = true;
  }

  if (toAppend.length > 0) {
    var startRow = Math.max(sheet.getLastRow() + 1, 2);
    sheet.getRange(startRow, 1, toAppend.length, APP_CONFIG.COLUMNS.DB_Users.length).setValues(toAppend);
    invalidateSheetCache_(APP_CONFIG.SHEETS.USERS);
  }
  return { added: toAppend.length };
}

function seedDefaultDepartmentUsers() {
  ensureDatabaseReady_();
  return withScriptLock_(function() {
    return seedDefaultUsersIfMissing_(getSpreadsheet_());
  });
}

function readCachedSheet_(sheetName) {
  if (EXEC_SHEET_CACHE_[sheetName]) {
    return EXEC_SHEET_CACHE_[sheetName];
  }
  try {
    var cache = CacheService.getScriptCache();
    var metaRaw = cache.get('tbl:' + sheetName + ':meta');
    if (!metaRaw) return null;
    var meta = JSON.parse(metaRaw);
    var parts = [];
    for (var i = 0; i < meta.chunks; i++) {
      var part = cache.get('tbl:' + sheetName + ':c' + i);
      if (part === null || part === undefined) return null;
      parts.push(part);
    }
    var parsed = JSON.parse(parts.join(''));
    EXEC_SHEET_CACHE_[sheetName] = parsed;
    return parsed;
  } catch (e) {
    return null;
  }
}

function writeCachedSheet_(sheetName, rows) {
  EXEC_SHEET_CACHE_[sheetName] = rows;
  try {
    var json = JSON.stringify(rows);
    var totalChunks = Math.ceil(json.length / SHEET_CACHE_CHUNK_CHARS_);
    if (totalChunks > SHEET_CACHE_MAX_CHUNKS_) return;
    var cache = CacheService.getScriptCache();
    var payload = {};
    payload['tbl:' + sheetName + ':meta'] = JSON.stringify({ chunks: totalChunks });
    for (var i = 0; i < totalChunks; i++) {
      payload['tbl:' + sheetName + ':c' + i] = json.slice(i * SHEET_CACHE_CHUNK_CHARS_, (i + 1) * SHEET_CACHE_CHUNK_CHARS_);
    }
    if (typeof cache.putAll === 'function') {
      cache.putAll(payload, SHEET_CACHE_TTL_SEC_);
    } else {
      var keys = Object.keys(payload);
      for (var k = 0; k < keys.length; k++) {
        cache.put(keys[k], payload[keys[k]], SHEET_CACHE_TTL_SEC_);
      }
    }
  } catch (e) {}
}

function readSheetObjects_(sheetName, skipCache) {
  if (!skipCache) {
    var cached = readCachedSheet_(sheetName);
    if (cached !== null) return cached;
  }

  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() <= 1) return [];

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0];
  var dateCols = APP_CONFIG.DATE_COLUMNS[sheetName] || [];
  var plainCols = APP_CONFIG.PLAIN_TEXT_COLUMNS[sheetName] || [];
  var out = [];

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var obj = { _rowIndex: r + 1 };
    var hasAnyValue = false;
    for (var c = 0; c < headers.length; c++) {
      var key = String(headers[c] || '').trim();
      if (!key) continue;
      var val = row[c];
      if (val !== '' && val !== null && val !== undefined) hasAnyValue = true;

      if (Object.prototype.toString.call(val) === '[object Date]') {
        if (dateCols.indexOf(key) !== -1) {
          val = formatDateManila_(val);
        } else {
          val = formatDateTimeManila_(val);
        }
      } else if (plainCols.indexOf(key) !== -1 && val !== '' && val !== null && val !== undefined) {
        val = String(val);
      }
      obj[key] = (val === null || val === undefined) ? '' : val;
    }
    if (hasAnyValue) {
      out.push(obj);
    }
  }

  if (!skipCache) {
    writeCachedSheet_(sheetName, out);
  }
  return out;
}

function paginateArray_(items, page, pageSize, returnAll) {
  var totalItems = items.length;
  if (returnAll) {
    return {
      items: items,
      pagination: {
        page: 1,
        pageSize: totalItems || 1,
        totalItems: totalItems,
        totalPages: 1,
        startRow: totalItems ? 1 : 0,
        endRow: totalItems
      }
    };
  }
  var size = parseInt(pageSize, 10);
  if (isNaN(size) || size < 5) size = 25;
  if (size > 200) size = 200;
  var totalPages = Math.max(1, Math.ceil(totalItems / size));
  var pg = parseInt(page, 10);
  if (isNaN(pg) || pg < 1) pg = 1;
  if (pg > totalPages) pg = totalPages;

  var startIdx = (pg - 1) * size;
  var sliced = items.slice(startIdx, startIdx + size);
  return {
    items: sliced,
    pagination: {
      page: pg,
      pageSize: size,
      totalItems: totalItems,
      totalPages: totalPages,
      startRow: totalItems ? startIdx + 1 : 0,
      endRow: startIdx + sliced.length
    }
  };
}

function objectToOrderedRow_(sheetName, obj) {
  var cols = APP_CONFIG.COLUMNS[sheetName];
  var row = [];
  for (var i = 0; i < cols.length; i++) {
    var k = cols[i];
    var v = obj[k];
    row.push(v === undefined || v === null ? '' : v);
  }
  return row;
}

function appendRowObject_(sheetName, obj) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  var cols = APP_CONFIG.COLUMNS[sheetName];
  var nextRow = Math.max(sheet.getLastRow() + 1, 2);
  var row = objectToOrderedRow_(sheetName, obj);
  sheet.getRange(nextRow, 1, 1, cols.length).setValues([row]);
  invalidateSheetCache_(sheetName);
  return nextRow;
}

function appendRowObjectsBatch_(sheetName, objs) {
  if (!objs || objs.length === 0) return;
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  var cols = APP_CONFIG.COLUMNS[sheetName];
  var startRow = Math.max(sheet.getLastRow() + 1, 2);
  var rows = [];
  for (var i = 0; i < objs.length; i++) {
    rows.push(objectToOrderedRow_(sheetName, objs[i]));
  }
  sheet.getRange(startRow, 1, rows.length, cols.length).setValues(rows);
  invalidateSheetCache_(sheetName);
}

function updateRowObject_(sheetName, rowIndex, obj) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  var cols = APP_CONFIG.COLUMNS[sheetName];
  var row = objectToOrderedRow_(sheetName, obj);
  sheet.getRange(rowIndex, 1, 1, cols.length).setValues([row]);
  invalidateSheetCache_(sheetName);
}

function generateNextId_(prefix, existingRows, year) {
  var yr = year || new Date().getFullYear();
  var tag = prefix + '-' + yr + '-';
  var maxSeq = 0;
  for (var i = 0; i < existingRows.length; i++) {
    var idVal = String(existingRows[i].id || existingRows[i].user_id || existingRows[i].log_id || '');
    var m = new RegExp('^' + prefix + '-(?:' + yr + '-)?(\\d+)$').exec(idVal);
    if (m) {
      var n = parseInt(m[1], 10);
      if (n > maxSeq) maxSeq = n;
    }
  }
  return tag + String(maxSeq + 1).padStart(4, '0');
}

function computeFieldDiff_(beforeObj, afterObj, fieldsToInspect) {
  var diff = {};
  for (var i = 0; i < fieldsToInspect.length; i++) {
    var f = fieldsToInspect[i];
    var oldVal = beforeObj ? (beforeObj[f] === undefined || beforeObj[f] === null ? '' : String(beforeObj[f])) : '';
    var newVal = afterObj[f] === undefined || afterObj[f] === null ? '' : String(afterObj[f]);
    if (oldVal !== newVal) {
      diff[f] = { from: oldVal, to: newVal };
    }
  }
  return diff;
}

function writeAuditLog_(session, moduleName, recordId, action, diffObj, summary) {
  var logObj = {
    log_id: 'LOG-' + Utilities.getUuid().slice(0, 8).toUpperCase(),
    timestamp: nowManilaIso_(),
    actor_username: session ? session.username : 'system',
    actor_role: session ? session.role : 'SYSTEM',
    module: moduleName,
    record_id: recordId || '',
    action: action,
    changed_fields_json: JSON.stringify(diffObj || {}),
    summary: summary || ''
  };
  appendRowObject_(APP_CONFIG.SHEETS.AUDIT, logObj);
}

/**
 * Recomputes workflow stages and variances for all rows in DB_SSS_Claims and DB_Insurance_Claims.
 */
function recomputeAllWorkflowStages() {
  ensureDatabaseReady_();
  return withScriptLock_(function() {
    var sssRows = readSheetObjects_(APP_CONFIG.SHEETS.SSS, true);
    var sssCount = 0;
    for (var i = 0; i < sssRows.length; i++) {
      var updatedSss = computeSssDerivedFields_(sssRows[i]);
      updateRowObject_(APP_CONFIG.SHEETS.SSS, sssRows[i]._rowIndex, updatedSss);
      sssCount++;
    }

    var insRows = readSheetObjects_(APP_CONFIG.SHEETS.INSURANCE, true);
    var insCount = 0;
    for (var j = 0; j < insRows.length; j++) {
      var updatedIns = computeInsuranceDerivedFields_(insRows[j]);
      updateRowObject_(APP_CONFIG.SHEETS.INSURANCE, insRows[j]._rowIndex, updatedIns);
      insCount++;
    }
    return { sssUpdated: sssCount, insuranceUpdated: insCount };
  });
}
