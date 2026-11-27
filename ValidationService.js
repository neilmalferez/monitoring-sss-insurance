/**
 * Validation, normalization, and derived field computation for SSS & Insurance records.
 */

function pad2_(n) {
  return n < 10 ? '0' + n : String(n);
}

/**
 * Fast pure-JS Asia/Manila (UTC+8, fixed offset) date parts to avoid Utilities.formatDate RPC overhead in loops.
 */
function toManilaDateParts_(date) {
  var shifted = new Date(date.getTime() + 28800000); // +8 hours
  return {
    yyyy: shifted.getUTCFullYear(),
    mm: pad2_(shifted.getUTCMonth() + 1),
    dd: pad2_(shifted.getUTCDate()),
    hh: pad2_(shifted.getUTCHours()),
    mi: pad2_(shifted.getUTCMinutes()),
    ss: pad2_(shifted.getUTCSeconds())
  };
}

function nowManilaIso_() {
  var p = toManilaDateParts_(new Date());
  return p.yyyy + '-' + p.mm + '-' + p.dd + 'T' + p.hh + ':' + p.mi + ':' + p.ss + '+08:00';
}

function todayManilaYmd_() {
  var p = toManilaDateParts_(new Date());
  return p.yyyy + '-' + p.mm + '-' + p.dd;
}

function formatDateManila_(val) {
  if (val === null || val === undefined || val === '') return '';
  if (Object.prototype.toString.call(val) === '[object Date]') {
    if (isNaN(val.getTime())) return '';
    var p = toManilaDateParts_(val);
    return p.yyyy + '-' + p.mm + '-' + p.dd;
  }
  return String(val).trim();
}

function formatDateTimeManila_(val) {
  if (val === null || val === undefined || val === '') return '';
  if (Object.prototype.toString.call(val) === '[object Date]') {
    if (isNaN(val.getTime())) return '';
    var p = toManilaDateParts_(val);
    return p.yyyy + '-' + p.mm + '-' + p.dd + 'T' + p.hh + ':' + p.mi + ':' + p.ss + '+08:00';
  }
  return String(val).trim();
}

function round2_(num) {
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

function parseMoney_(raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  if (typeof raw === 'number') {
    return isFinite(raw) ? round2_(raw) : '';
  }
  var s = String(raw).trim();
  if (!s || /^n\/?a$/i.test(s) || s === '-') return '';
  s = s.replace(/[₱,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  var n = Number(s);
  return isFinite(n) ? round2_(n) : NaN;
}

function parseIntStrict_(raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  var s = String(raw).trim();
  if (!s) return '';
  if (!/^-?\d+(\.0+)?$/.test(s)) return NaN;
  return parseInt(s, 10);
}

/**
 * Parses and validates dates.
 * Strict mode accepts YYYY-MM-DD (or Date instances); legacy mode also accepts M.D.YY, M.D.YYYY, M/D/YYYY.
 * Rejects impossible years (< 2020 or > 2035), 5-digit years, missing slashes, and raw numeric amounts.
 */
function parseAndValidateDate_(raw, fieldLabel, allowLegacyFormats) {
  if (raw === null || raw === undefined || raw === '') {
    return { valid: true, value: '' };
  }
  if (Object.prototype.toString.call(raw) === '[object Date]') {
    if (isNaN(raw.getTime())) {
      return { valid: false, value: '', error: fieldLabel + ' is an invalid date.' };
    }
    var ymdObj = Utilities.formatDate(raw, APP_CONFIG.TIMEZONE, 'yyyy-MM-dd');
    return validateCalendarYmd_(ymdObj, fieldLabel);
  }

  var s = String(raw).trim();
  if (!s || /^n\/?a$/i.test(s) || s === '-') {
    return { valid: true, value: '' };
  }

  // Reject pure numbers (e.g. 1406, 1154 typed into Reimbursed Date)
  if (/^\d+(\.\d+)?$/.test(s)) {
    return { valid: false, value: s, error: fieldLabel + ' contains a number instead of a date (' + s + ').' };
  }

  var match;
  // Standard YYYY-MM-DD
  match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (match) {
    return validateCalendarParts_(parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10), fieldLabel, s);
  }

  if (allowLegacyFormats) {
    // M.D.YY or M.D.YYYY (e.g. 3.20.25, 05.12.25, 5.9.2025)
    match = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(s);
    if (match) {
      var yrDot = parseInt(match[3], 10);
      if (match[3].length === 2) yrDot += 2000;
      return validateCalendarParts_(yrDot, parseInt(match[1], 10), parseInt(match[2], 10), fieldLabel, s);
    }

    // M/D/YYYY or M/D/YY (e.g. 12/9/2025)
    match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
    if (match) {
      var yrSlash = parseInt(match[3], 10);
      if (match[3].length === 2) yrSlash += 2000;
      return validateCalendarParts_(yrSlash, parseInt(match[1], 10), parseInt(match[2], 10), fieldLabel, s);
    }
  }

  return { valid: false, value: s, error: fieldLabel + ' has unrecognized date format ("' + s + '"). Expected YYYY-MM-DD.' };
}

function validateCalendarYmd_(ymd, fieldLabel) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return { valid: false, value: ymd, error: fieldLabel + ' is invalid.' };
  return validateCalendarParts_(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10), fieldLabel, ymd);
}

function validateCalendarParts_(year, month, day, fieldLabel, originalText) {
  if (year < 2020 || year > 2035) {
    return { valid: false, value: originalText, error: fieldLabel + ' year out of valid range 2020-2035 ("' + originalText + '").' };
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { valid: false, value: originalText, error: fieldLabel + ' has invalid month/day ("' + originalText + '").' };
  }
  var dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== (month - 1) || dt.getUTCDate() !== day) {
    return { valid: false, value: originalText, error: fieldLabel + ' is not a valid calendar date ("' + originalText + '").' };
  }
  var mm = month < 10 ? '0' + month : String(month);
  var dd = day < 10 ? '0' + day : String(day);
  return { valid: true, value: year + '-' + mm + '-' + dd };
}

function normalizeErid_(raw) {
  var s = String(raw || '').trim();
  if (!s) return APP_CONFIG.DEFAULT_ERID;
  var digits = s.replace(/\D/g, '');
  if (digits.length === 13) {
    return digits.slice(0, 2) + '-' + digits.slice(2, 9) + '-' + digits.slice(9, 10) + '-' + digits.slice(10, 13);
  }
  return s;
}

function normalizeSsNumber_(raw) {
  var s = String(raw || '').trim();
  if (!s) return '';
  var digits = s.replace(/\D/g, '');
  if (digits.length === 10) {
    return digits.slice(0, 2) + '-' + digits.slice(2, 9) + '-' + digits.slice(9, 10);
  }
  return s;
}

function normalizeClient_(raw) {
  var s = String(raw || '').trim();
  if (!s) return '';
  var key = s.toUpperCase().replace(/\s+/g, ' ');
  var map = {
    'VMC': 'VMC',
    'URC': 'URC - La Carlota',
    'URC - LA CARLOTA': 'URC - La Carlota',
    'URC LA CARLOTA': 'URC - La Carlota',
    'LA CARLOTA': 'LA CARLOTA',
    'SARENCO': 'SARENCO',
    'MPI': 'MPI',
    'ECC': 'ECC',
    'PSV': 'PSV',
    'PSV OFFICE': 'PSV OFFICE',
    'EAUC': 'EAUC',
    'SCII': 'SCII',
    'SMC': 'SMC',
    'HISUMCO': 'HISUMCO',
    'SMYPC': 'SMYPC',
    'MPC': 'MPC',
    'GMC': 'GMC',
    'UPPC': 'UPPC',
    'HSPC': 'HSPC',
    'SAWO': 'SAWO',
    'PASSI': 'PASSI'
  };
  return map[key] || key;
}

function normalizeBankStatus_(raw) {
  var s = String(raw || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!s || s === 'N/A' || s === '-') return 'PENDING';
  if (s.indexOf('BDO') !== -1) return 'CREDITED TO BDO';
  if (s.indexOf('PNB') !== -1) return 'CREDITED TO PNB';
  if (s.indexOf('METRO') !== -1 || s === 'CREDIT TO MB' || s === 'CREDITED TO MB') return 'CREDITED TO METROBANK';
  if (s === 'PENDING') return 'PENDING';
  return s;
}

function normalizeBenefitType_(raw) {
  var s = String(raw || '').trim().toUpperCase();
  if (!s || s === '0') return '';
  if (s === 'SB' || s === 'SICKNESS' || s === 'SICKNESS BENEFIT') return 'SB';
  if (s === 'MAT' || s === 'MATERNITY') return 'MATERNITY';
  if (s === 'EC' || s === 'EMPLOYEE COMPENSATION') return 'EC';
  return s;
}

function normalizeExpenseBearer_(raw) {
  var s = String(raw || '').trim().toUpperCase();
  if (s.indexOf('EMPLOYEE') !== -1) return 'EMPLOYEE EXPENSE';
  if (s.indexOf('COMPANY') !== -1) return 'COMPANY EXPENSE';
  return s || 'COMPANY EXPENSE';
}

function normalizeEmployeeName_(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ');
}

function normalizeEmployeeKey_(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/-\s*(EXTENSION|\(EXTENSION\)|BY RCR|RCR|MATERNITY|\d+)\s*$/i, '')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toBool_(val) {
  if (typeof val === 'boolean') return val;
  var s = String(val || '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

/**
 * Computes bank_variance, check_variance, is_advanced, and workflow_stage for an SSS record.
 */
function computeSssDerivedFields_(rec) {
  var amtRelease = parseMoney_(rec.amount_to_release);
  var amtCredited = parseMoney_(rec.amount_credited);
  var checkAmt = parseMoney_(rec.check_amount);

  var hasRelease = (amtRelease !== '' && !isNaN(amtRelease));
  var hasCreditedAmt = (amtCredited !== '' && !isNaN(amtCredited));
  var hasCheckAmt = (checkAmt !== '' && !isNaN(checkAmt));

  var dateCredited = String(rec.date_credited || '').trim();
  var dateCheck = String(rec.date_of_check || '').trim();
  var checkNo = String(rec.check_no || '').trim();
  var bankStatus = String(rec.bank_status || 'PENDING').trim().toUpperCase();

  var hasCredited = hasCreditedAmt || Boolean(dateCredited) || (bankStatus !== '' && bankStatus !== 'PENDING');
  var hasCheck = hasCheckAmt || Boolean(dateCheck) || Boolean(checkNo);

  var bankVariance = (hasRelease && hasCreditedAmt) ? round2_(amtRelease - amtCredited) : '';
  var checkVariance = (hasRelease && hasCheckAmt) ? round2_(amtRelease - checkAmt) : '';

  var isAdvanced = false;
  if (hasCheck) {
    if (!dateCredited) {
      isAdvanced = true;
    } else if (dateCheck && dateCredited && dateCheck < dateCredited) {
      isAdvanced = true;
    }
  }

  var hasVariance = (bankVariance !== '' && Math.abs(bankVariance) > 0.009) ||
                    (checkVariance !== '' && Math.abs(checkVariance) > 0.009);

  var stage = 'FILED_HR';
  if (hasVariance) {
    stage = 'VARIANCE_FLAGGED';
  } else if (hasCredited && hasCheck) {
    stage = 'COMPLETED';
  } else if (hasCredited && !hasCheck) {
    stage = 'CREDITED_AWAITING_CHECK';
  } else if (!hasCredited && hasCheck) {
    stage = 'ADVANCED_AWAITING_SSS';
  }

  var yr = rec.year;
  if (!yr && rec.filing_date && /^\d{4}/.test(String(rec.filing_date))) {
    yr = parseInt(String(rec.filing_date).slice(0, 4), 10);
  }
  if (!yr && rec.sickness_start && /^\d{4}/.test(String(rec.sickness_start))) {
    yr = parseInt(String(rec.sickness_start).slice(0, 4), 10);
  }

  return Object.assign({}, rec, {
    year: yr || '',
    bank_status: bankStatus || 'PENDING',
    bank_variance: bankVariance,
    check_variance: checkVariance,
    is_advanced: isAdvanced,
    workflow_stage: stage
  });
}

/**
 * Computes balance_variance, check_required, and workflow_stage for an Insurance record.
 */
function computeInsuranceDerivedFields_(rec) {
  var bearer = normalizeExpenseBearer_(rec.expense_bearer);
  var checkRequired = (rec.check_required === '' || rec.check_required === undefined || rec.check_required === null)
    ? (bearer === 'EMPLOYEE EXPENSE')
    : toBool_(rec.check_required);

  var amtReleased = parseMoney_(rec.amount_released);
  var amtReimbursed = parseMoney_(rec.amount_reimbursed);
  var amtCredited = parseMoney_(rec.amount_credited);

  var hasReleased = (amtReleased !== '' && !isNaN(amtReleased));
  var hasReimbursed = (amtReimbursed !== '' && !isNaN(amtReimbursed));
  var hasCreditedAmt = (amtCredited !== '' && !isNaN(amtCredited));

  var balanceVariance = hasReleased
    ? round2_(amtReleased - (hasReimbursed ? amtReimbursed : 0))
    : '';

  var bankStatus = String(rec.bank_status || 'PENDING').trim().toUpperCase();
  var dateCredited = String(rec.date_credited || '').trim();
  var finalStatus = String(rec.final_status || '').trim().toUpperCase();
  var hrRemarks = String(rec.hr_remarks || '').trim();

  var hasBankCredited = hasCreditedAmt || Boolean(dateCredited) || (bankStatus !== '' && bankStatus !== 'PENDING');
  var hasDisallowed = hasReimbursed && balanceVariance !== '' && Math.abs(balanceVariance) > 0.009;

  var dateCheck = String(rec.date_of_check || '').trim();
  var checkNo = String(rec.check_no || '').trim();
  var checkAmt = parseMoney_(rec.check_amount);
  var hasCheckIssued = Boolean(dateCheck) || Boolean(checkNo) || (checkAmt !== '' && !isNaN(checkAmt));

  var stage = 'SUBMITTED';
  if (hasDisallowed && (hasBankCredited || finalStatus === 'DONE')) {
    stage = 'DISALLOWED_BALANCE';
  } else if (finalStatus === 'DONE' || (hasBankCredited && (!checkRequired || hasCheckIssued))) {
    stage = 'DONE';
  } else if (hasBankCredited) {
    stage = 'CREDITED';
  } else if (hasReimbursed || /waiting|approved|reflect|pick\s*up/i.test(hrRemarks)) {
    stage = 'PENDING_BANK';
  }

  var yr = rec.year;
  if (!yr) {
    var sourceDate = rec.date_of_submission || rec.date_of_accident || rec.date_credited || '';
    if (/^\d{4}/.test(String(sourceDate))) {
      yr = parseInt(String(sourceDate).slice(0, 4), 10);
    }
  }

  return Object.assign({}, rec, {
    year: yr || '',
    expense_bearer: bearer,
    check_required: checkRequired,
    bank_status: bankStatus || 'PENDING',
    final_status: finalStatus,
    balance_variance: balanceVariance,
    workflow_stage: stage
  });
}

function validateSssRecord_(rec, existingRows, currentId, opts) {
  opts = opts || {};
  var errors = [];
  var warnings = [];

  if (!String(rec.employee_name || '').trim()) errors.push('Employee Name is required.');
  if (!String(rec.claim_ref_no || '').trim()) errors.push('Claim Ref No. is required.');
  if (!String(rec.client_project || '').trim()) errors.push('Client / Project is required.');
  if (!String(rec.benefit_type || '').trim()) errors.push('Benefit Type (SB / MATERNITY / EC) is required.');

  if (!String(rec.ss_number || '').trim()) {
    if (opts.allowMissingSsAsWarning) {
      warnings.push('Missing SS Number.');
    } else {
      errors.push('SS Number is required.');
    }
  }

  var dateFields = [
    ['filing_date', 'Filing Date'],
    ['confinement_date', 'Confinement Date'],
    ['sickness_start', 'Sickness Start'],
    ['sickness_end', 'Sickness End'],
    ['date_credited', 'Date Credited'],
    ['date_of_check', 'Date of Check']
  ];
  for (var i = 0; i < dateFields.length; i++) {
    var f = dateFields[i][0];
    var lbl = dateFields[i][1];
    var res = parseAndValidateDate_(rec[f], lbl, Boolean(opts.allowLegacyDates));
    if (!res.valid) {
      errors.push(res.error);
    } else {
      rec[f] = res.value;
    }
  }

  if (rec.sickness_start && rec.sickness_end && rec.sickness_end < rec.sickness_start) {
    errors.push('Sickness End (' + rec.sickness_end + ') cannot be earlier than Sickness Start (' + rec.sickness_start + ').');
  }

  var amtRelease = parseMoney_(rec.amount_to_release);
  if (amtRelease === '' || isNaN(amtRelease) || amtRelease < 0) {
    errors.push('Amount to Release must be a valid non-negative PHP amount.');
  }

  var amtCredited = parseMoney_(rec.amount_credited);
  if (isNaN(amtCredited)) errors.push('Amount Credited must be numeric.');

  var checkAmt = parseMoney_(rec.check_amount);
  if (isNaN(checkAmt)) errors.push('Check Amount must be numeric.');

  var days = parseIntStrict_(rec.days_approved);
  if (days === '' || isNaN(days) || days < 0) {
    errors.push('Days Approved must be a non-negative whole number.');
  }

  // Unique Claim Ref No.
  var refNorm = String(rec.claim_ref_no || '').trim().toUpperCase();
  if (refNorm && existingRows) {
    for (var j = 0; j < existingRows.length; j++) {
      var row = existingRows[j];
      if (toBool_(row.is_deleted)) continue;
      if (currentId && row.id === currentId) continue;
      if (String(row.claim_ref_no || '').trim().toUpperCase() === refNorm) {
        errors.push('Duplicate Claim Ref No.: "' + rec.claim_ref_no + '" already exists (' + row.employee_name + ').');
        break;
      }
    }
  }

  if (!isNaN(amtRelease) && amtRelease !== '' && !isNaN(amtCredited) && amtCredited !== '' && Math.abs(amtRelease - amtCredited) > 0.009) {
    warnings.push('Bank Credited variance detected: ₱' + round2_(amtRelease - amtCredited).toFixed(2));
  }
  if (!isNaN(amtRelease) && amtRelease !== '' && !isNaN(checkAmt) && checkAmt !== '' && Math.abs(amtRelease - checkAmt) > 0.009) {
    warnings.push('Check Issuance variance detected: ₱' + round2_(amtRelease - checkAmt).toFixed(2));
  }

  return { valid: errors.length === 0, errors: errors, warnings: warnings };
}

function validateInsuranceRecord_(rec, existingRows, currentId, opts) {
  opts = opts || {};
  var errors = [];
  var warnings = [];

  if (!String(rec.employee_name || '').trim()) errors.push('Employee Name is required.');
  if (!String(rec.client_assigned || '').trim()) errors.push('Client Assigned is required.');

  var dateFields = [
    ['date_of_accident', 'Date of Accident'],
    ['date_of_submission', 'Date of Submission'],
    ['reimbursed_date', 'Reimbursed Date'],
    ['date_credited', 'Date Credited'],
    ['date_of_check', 'Date of Check']
  ];
  for (var i = 0; i < dateFields.length; i++) {
    var f = dateFields[i][0];
    var lbl = dateFields[i][1];
    var res = parseAndValidateDate_(rec[f], lbl, Boolean(opts.allowLegacyDates));
    if (!res.valid) {
      errors.push(res.error);
    } else {
      rec[f] = res.value;
    }
  }

  var amtReleased = parseMoney_(rec.amount_released);
  if (amtReleased === '' || isNaN(amtReleased) || amtReleased < 0) {
    errors.push('Amount Released must be a valid non-negative PHP amount.');
  }

  var amtReimb = parseMoney_(rec.amount_reimbursed);
  if (isNaN(amtReimb)) errors.push('Amount Reimbursed must be numeric.');

  var amtCred = parseMoney_(rec.amount_credited);
  if (isNaN(amtCred)) errors.push('Amount Credited must be numeric.');

  var chkAmt = parseMoney_(rec.check_amount);
  if (isNaN(chkAmt)) errors.push('Check Amount must be numeric.');

  if (!isNaN(amtReleased) && amtReleased !== '' && !isNaN(amtReimb) && amtReimb !== '' && Math.abs(amtReleased - amtReimb) > 0.009) {
    warnings.push('Insurance disallowance/variance: ₱' + round2_(amtReleased - amtReimb).toFixed(2));
  }

  return { valid: errors.length === 0, errors: errors, warnings: warnings };
}
