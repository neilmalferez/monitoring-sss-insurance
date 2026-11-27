/**
 * Legacy CSV / Raw-Sheet Importer (SSS 2025, SSS 2026, Insurance/Accident) and CSV Report Exporter.
 */

function parseCsv_(text) {
  var input = String(text || '').replace(/^\uFEFF/, '');
  var rows = [];
  var row = [];
  var field = '';
  var inQuotes = false;

  for (var i = 0; i < input.length; i++) {
    var ch = input.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < input.length && input.charAt(i + 1) === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\r') {
        if (i + 1 < input.length && input.charAt(i + 1) === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (ch === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function isMonthlyDividerRow_(row) {
  var c0 = String(row[0] || '').trim();
  var c1 = String(row[1] || '').trim();
  var c2 = String(row[2] || '').trim();
  var c3 = String(row[3] || '').trim();
  if (/^\d{4}-\d{2}-01$/.test(c1) && c1 === c2 && c2 === c3) return true;
  if (/^\d{4}-\d{2}-01$/.test(c0) && c0 === c1 && c1 === c2) return true;
  return false;
}

function isEmptyOrZeroFormulaRow_(row) {
  var nonEmpty = [];
  for (var i = 0; i < row.length; i++) {
    var cell = String(row[i] || '').trim();
    if (cell !== '') nonEmpty.push({ idx: i, val: cell });
  }
  if (nonEmpty.length === 0) return true;
  if (nonEmpty.length === 1 && nonEmpty[0].val === '0') return true;
  // Trailing empty numbered rows like "11,,,,,,,,,,0,,,,,,,,"
  if (nonEmpty.length <= 2 && /^\d+$/.test(nonEmpty[0].val) && (nonEmpty.length === 1 || nonEmpty[1].val === '0')) {
    return true;
  }
  return false;
}

function extractNameAndSequence_(rawName) {
  var s = normalizeEmployeeName_(rawName);
  var seq = '';
  var extraNote = '';

  var mExt = /\s*-\s*\(?\s*extension\s*\)?\s*$/i.exec(s);
  if (mExt) {
    seq = 'extension';
    s = s.slice(0, mExt.index).trim();
  } else {
    var mNum = /\s*-\s*(\d+)\s*$/.exec(s);
    if (mNum) {
      seq = mNum[1];
      s = s.slice(0, mNum.index).trim();
    } else {
      var mRcr = /\s*-\s*(?:by\s+)?rcr\s*$/i.exec(s);
      if (mRcr) {
        extraNote = mRcr[0].replace(/^\s*-\s*/, '').trim();
        s = s.slice(0, mRcr.index).trim();
      } else {
        var mMat = /\s*-\s*maternity\s*$/i.exec(s);
        if (mMat) {
          s = s.slice(0, mMat.index).trim();
        }
      }
    }
  }
  return { name: s, sequence: seq, note: extraNote };
}

function extractInsuranceRefAndRemarks_(rawRemarks) {
  var text = String(rawRemarks || '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return { refNo: '', remarks: '' };

  var m = /((?:SIIP-)?ANHDA-[A-Z0-9]+(?:\/(?:SIIP-)?ANHDA-[A-Z0-9]+)*)/i.exec(text);
  if (!m) {
    return { refNo: '', remarks: text };
  }
  var refNo = m[1].toUpperCase();
  var remainder = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length))
    .replace(/^[\s\-\/]+|[\s\-\/]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { refNo: refNo, remarks: remainder };
}

function detectHeaderKind_(row) {
  var joined = row.map(function(c) { return String(c || '').replace(/\s+/g, ' ').trim().toUpperCase(); }).join('|');
  if (joined.indexOf('CLAIM REF') !== -1 && joined.indexOf('SS NUMBER') !== -1) {
    if (joined.indexOf('CONFINEMENT DATE') !== -1) return 'SSS_2026';
    return 'SSS_2025';
  }
  if ((joined.indexOf('DATE OF ACCIDENT') !== -1 || joined.indexOf('ACCIDENT TYPE') !== -1) &&
      joined.indexOf('AMOUNT RELEASED') !== -1) {
    return 'INSURANCE';
  }
  return null;
}

function buildHeaderIndexMap_(row) {
  var map = {};
  for (var i = 0; i < row.length; i++) {
    var key = String(row[i] || '').replace(/\s+/g, ' ').trim().toUpperCase();
    if (key && map[key] === undefined) map[key] = i;
  }
  return map;
}

function getCellByAliases_(row, headerMap, aliases) {
  for (var i = 0; i < aliases.length; i++) {
    var idx = headerMap[aliases[i]];
    if (idx !== undefined && idx < row.length) {
      return String(row[idx] || '').trim();
    }
  }
  return '';
}

function previewLegacyImport_(session, opts) {
  if (session.role !== APP_CONFIG.ROLES.ADMIN && session.role !== APP_CONFIG.ROLES.HR) {
    throw new Error('Only HR Department or System Admin can import legacy data.');
  }
  ensureDatabaseReady_();
  opts = opts || {};
  var targetModule = String(opts.targetModule || 'SSS').trim().toUpperCase();
  if (targetModule !== 'SSS' && targetModule !== 'INSURANCE') {
    throw new Error('targetModule must be SSS or INSURANCE.');
  }

  var rawRows = [];
  if (opts.sheetName) {
    var ss = getSpreadsheet_();
    var sh = ss.getSheetByName(String(opts.sheetName));
    if (!sh) throw new Error('Sheet "' + opts.sheetName + '" not found.');
    var vals = sh.getDataRange().getValues();
    for (var r = 0; r < vals.length; r++) {
      var strRow = [];
      for (var c = 0; c < vals[r].length; c++) {
        var cell = vals[r][c];
        if (Object.prototype.toString.call(cell) === '[object Date]') {
          strRow.push(formatDateManila_(cell));
        } else {
          strRow.push(cell === null || cell === undefined ? '' : String(cell));
        }
      }
      rawRows.push(strRow);
    }
  } else {
    rawRows = parseCsv_(opts.csvText || '');
  }

  var existingRows = readSheetObjects_(
    targetModule === 'SSS' ? APP_CONFIG.SHEETS.SSS : APP_CONFIG.SHEETS.INSURANCE
  );
  var existingClaimRefs = {};
  for (var e = 0; e < existingRows.length; e++) {
    if (toBool_(existingRows[e].is_deleted)) continue;
    var refKey = String(existingRows[e].claim_ref_no || '').trim().toUpperCase();
    if (refKey) existingClaimRefs[refKey] = existingRows[e].employee_name;
  }
  var seenInBatchRefs = {};

  var currentLayout = null;
  var headerMap = null;
  var detectedLayouts = [];
  var skippedCount = 0;
  var previewRows = [];
  var anomalyCount = 0;
  var validCount = 0;

  for (var i = 0; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (isEmptyOrZeroFormulaRow_(row)) {
      skippedCount++;
      continue;
    }

    var detected = detectHeaderKind_(row);
    if (detected) {
      currentLayout = detected;
      headerMap = buildHeaderIndexMap_(row);
      if (detectedLayouts.indexOf(detected) === -1) detectedLayouts.push(detected);
      skippedCount++;
      continue;
    }

    if (!currentLayout) {
      skippedCount++;
      continue;
    }

    // Skip banner/divider/footer rows
    var firstColsText = row.slice(0, 6).join(' ').toUpperCase();
    if (isMonthlyDividerRow_(row) ||
        firstColsText.indexOf('END OF 2025') !== -1 ||
        firstColsText.indexOf('SSS SICKNESS AND MATERNITY') !== -1 ||
        firstColsText.indexOf('INSURANCE / ACCIDENT MONITORING') !== -1 ||
        firstColsText.indexOf('TO BE FILL UP BY') !== -1 ||
        String(row[0] || '').trim() === '' && String(row[1] || '').trim() === 'END OF 2025' ||
        row.join('').replace(/[`\s]/g, '') === '') {
      skippedCount++;
      continue;
    }

    if (targetModule === 'SSS' && (currentLayout === 'SSS_2026' || currentLayout === 'SSS_2025')) {
      var parsedSss = parseLegacySssRow_(row, headerMap, currentLayout, i + 1, existingClaimRefs, seenInBatchRefs);
      if (!parsedSss) {
        skippedCount++;
        continue;
      }
      if (parsedSss.anomalies.length > 0) anomalyCount++;
      else validCount++;
      previewRows.push(parsedSss);
    } else if (targetModule === 'INSURANCE' && currentLayout === 'INSURANCE') {
      var parsedIns = parseLegacyInsuranceRow_(row, headerMap, i + 1);
      if (!parsedIns) {
        skippedCount++;
        continue;
      }
      if (parsedIns.anomalies.length > 0) anomalyCount++;
      else validCount++;
      previewRows.push(parsedIns);
    } else {
      skippedCount++;
    }
  }

  return {
    targetModule: targetModule,
    detectedLayouts: detectedLayouts,
    totalRawRows: rawRows.length,
    skippedRows: skippedCount,
    parsedRowsCount: previewRows.length,
    validRows: validCount,
    anomalyRows: anomalyCount,
    previewRows: previewRows
  };
}

function parseLegacySssRow_(row, headerMap, layout, sourceLine, existingClaimRefs, seenInBatchRefs) {
  var rawName = getCellByAliases_(row, headerMap, ['NAME']);
  var rawClaimRef = getCellByAliases_(row, headerMap, ['CLAIM REF NO.', 'CLAIM REF NO']);
  if (!rawName && !rawClaimRef) return null;

  var anomalies = [];
  var nameParts = extractNameAndSequence_(rawName);

  var rawFiling = getCellByAliases_(row, headerMap, ['DATE']);
  var rawConfinement = layout === 'SSS_2026' ? getCellByAliases_(row, headerMap, ['CONFINEMENT DATE']) : '';
  var rawStart = getCellByAliases_(row, headerMap, ['SICKNESS START']);
  var rawEnd = getCellByAliases_(row, headerMap, ['SICKNESS END']);
  var rawCreditedDate = getCellByAliases_(row, headerMap, ['DATE CREDITED']);
  var rawCheckDate = getCellByAliases_(row, headerMap, ['DATE OF CHECK']);

  var dFiling = parseAndValidateDate_(rawFiling, 'Filing Date', true);
  var dConf = parseAndValidateDate_(rawConfinement, 'Confinement Date', true);
  var dStart = parseAndValidateDate_(rawStart, 'Sickness Start', true);
  var dEnd = parseAndValidateDate_(rawEnd, 'Sickness End', true);
  var dCred = parseAndValidateDate_(rawCreditedDate, 'Date Credited', true);
  var dChk = parseAndValidateDate_(rawCheckDate, 'Date of Check', true);

  [dFiling, dConf, dStart, dEnd, dCred, dChk].forEach(function(res) {
    if (!res.valid) anomalies.push({ code: 'DATE_TYPO', message: res.error });
  });

  if (dStart.valid && dEnd.valid && dStart.value && dEnd.value && dEnd.value < dStart.value) {
    anomalies.push({ code: 'REVERSED_DATE_RANGE', message: 'Sickness End (' + dEnd.value + ') is before Sickness Start (' + dStart.value + ')' });
  }

  var ssNo = normalizeSsNumber_(getCellByAliases_(row, headerMap, ['SS NUMBER']));
  if (!ssNo) anomalies.push({ code: 'MISSING_SS_NUMBER', message: 'SS Number is missing' });

  var rawRemarks = getCellByAliases_(row, headerMap, ['REMARKS']);
  var benefit = normalizeBenefitType_(rawRemarks);
  if (!benefit) {
    anomalies.push({ code: 'INVALID_BENEFIT_TYPE', message: 'Benefit Type invalid or missing ("' + rawRemarks + '")' });
    benefit = 'SB';
  }

  var amtRelease = parseMoney_(getCellByAliases_(row, headerMap, ['AMOUNT TO RELEASED', 'AMOUNT']));
  var amtCredited = parseMoney_(getCellByAliases_(row, headerMap, ['AMOUNT CREDITED']));
  var amtCheck = parseMoney_(getCellByAliases_(row, headerMap, ['AMOUNT', 'AMOUNT 2']));
  if (layout === 'SSS_2026') {
    // 2026 has AMOUNT TO RELEASED and AMOUNT (check amount)
    amtRelease = parseMoney_(getCellByAliases_(row, headerMap, ['AMOUNT TO RELEASED']));
    amtCheck = parseMoney_(getCellByAliases_(row, headerMap, ['AMOUNT']));
  } else {
    // 2025 has AMOUNT (release) and AMOUNT 2 (check amount)
    amtRelease = parseMoney_(getCellByAliases_(row, headerMap, ['AMOUNT']));
    amtCheck = parseMoney_(getCellByAliases_(row, headerMap, ['AMOUNT 2']));
  }

  var claimRef = rawClaimRef.trim().toUpperCase();
  if (claimRef) {
    if (existingClaimRefs[claimRef]) {
      anomalies.push({ code: 'DUPLICATE_CLAIM_REF', message: 'Already in DB (' + existingClaimRefs[claimRef] + ')' });
    } else if (seenInBatchRefs[claimRef]) {
      anomalies.push({ code: 'DUPLICATE_CLAIM_REF', message: 'Duplicate within import batch (line ' + seenInBatchRefs[claimRef] + ')' });
    } else {
      seenInBatchRefs[claimRef] = sourceLine;
    }
  }

  var relNum = (amtRelease === '' || isNaN(amtRelease)) ? '' : amtRelease;
  var credNum = (amtCredited === '' || isNaN(amtCredited)) ? '' : amtCredited;
  var chkNum = (amtCheck === '' || isNaN(amtCheck)) ? '' : amtCheck;

  if (relNum !== '' && credNum !== '' && Math.abs(relNum - credNum) > 0.009) {
    anomalies.push({ code: 'AMOUNT_VARIANCE', message: 'Bank variance: ₱' + round2_(relNum - credNum) });
  }
  if (relNum !== '' && chkNum !== '' && Math.abs(relNum - chkNum) > 0.009) {
    anomalies.push({ code: 'AMOUNT_VARIANCE', message: 'Check variance: ₱' + round2_(relNum - chkNum) });
  }

  var clientRaw = getCellByAliases_(row, headerMap, ['CLIENT', 'PROJECT']);
  var days = parseIntStrict_(getCellByAliases_(row, headerMap, ['DAYS APPROVED', '# OF DAY APPROVED']));

  var rec = computeSssDerivedFields_({
    filing_date: dFiling.valid ? dFiling.value : '',
    employer_erid: normalizeErid_(getCellByAliases_(row, headerMap, ['EMPLOYER ERID'])),
    claim_ref_no: claimRef,
    ss_number: ssNo,
    employee_name: nameParts.name,
    claim_sequence: nameParts.sequence,
    client_project: normalizeClient_(clientRaw),
    benefit_type: benefit,
    confinement_date: dConf.valid ? dConf.value : '',
    sickness_start: dStart.valid ? dStart.value : '',
    sickness_end: dEnd.valid ? dEnd.value : '',
    days_approved: isNaN(days) ? '' : days,
    amount_to_release: relNum,
    hr_remarks: nameParts.note ? ('Tag: ' + nameParts.note) : '',
    bank_status: normalizeBankStatus_(getCellByAliases_(row, headerMap, ['STATUS'])),
    date_credited: dCred.valid ? dCred.value : '',
    amount_credited: credNum,
    bank_notes: '',
    date_of_check: dChk.valid ? dChk.value : '',
    check_amount: chkNum,
    check_no: getCellByAliases_(row, headerMap, ['CHECK #']),
    variance_reason: '',
    check_notes: ''
  });

  return {
    sourceLine: sourceLine,
    sourceLayout: layout,
    anomalies: anomalies,
    skipImport: anomalies.some(function(a) { return a.code === 'DUPLICATE_CLAIM_REF'; }),
    record: rec
  };
}

function parseLegacyInsuranceRow_(row, headerMap, sourceLine) {
  var rawName = getCellByAliases_(row, headerMap, ['NAME']);
  var rawReleased = getCellByAliases_(row, headerMap, ['AMOUNT RELEASED']);
  if (!rawName && !rawReleased) return null;

  var anomalies = [];
  var dAccident = parseAndValidateDate_(getCellByAliases_(row, headerMap, ['DATE OF ACCIDENT']), 'Date of Accident', true);
  var dSubmit = parseAndValidateDate_(getCellByAliases_(row, headerMap, ['DATE OF SUBMISION', 'DATE OF SUBMISSION']), 'Date of Submission', true);
  var dReimb = parseAndValidateDate_(getCellByAliases_(row, headerMap, ['REIMBURSED DATE']), 'Reimbursed Date', true);
  var dCred = parseAndValidateDate_(getCellByAliases_(row, headerMap, ['DATE CREDITED']), 'Date Credited', true);
  var dChk = parseAndValidateDate_(getCellByAliases_(row, headerMap, ['DATE OF CHECK']), 'Date of Check', true);

  [dAccident, dSubmit, dReimb, dCred, dChk].forEach(function(res) {
    if (!res.valid) anomalies.push({ code: 'DATE_TYPO', message: res.error });
  });

  var amtReleased = parseMoney_(rawReleased);
  var amtReimb = parseMoney_(getCellByAliases_(row, headerMap, ['REIMBURSED']));
  var amtCred = parseMoney_(getCellByAliases_(row, headerMap, ['AMOUNT CREDITED']));
  var amtChk = parseMoney_(getCellByAliases_(row, headerMap, ['AMOUNT']));

  var relNum = (amtReleased === '' || isNaN(amtReleased)) ? '' : amtReleased;
  var reimbNum = (amtReimb === '' || isNaN(amtReimb)) ? '' : amtReimb;
  var credNum = (amtCred === '' || isNaN(amtCred)) ? '' : amtCred;
  var chkNum = (amtChk === '' || isNaN(amtChk)) ? '' : amtChk;

  if (relNum !== '' && reimbNum !== '' && Math.abs(relNum - reimbNum) > 0.009) {
    anomalies.push({ code: 'AMOUNT_VARIANCE', message: 'Disallowance/Variance: ₱' + round2_(relNum - reimbNum) });
  }

  // Column 15 in raw sheet is Expense Bearer
  var rawBearer = getCellByAliases_(row, headerMap, ['COLUMN 15', 'EXPENSE BEARER']);
  var refAndRem = extractInsuranceRefAndRemarks_(getCellByAliases_(row, headerMap, ['REMARKS']));

  var rec = computeInsuranceDerivedFields_({
    seq_no: getCellByAliases_(row, headerMap, ['NO.', 'NO']),
    employee_name: normalizeEmployeeName_(rawName),
    date_of_accident: dAccident.valid ? dAccident.value : '',
    accident_type: String(getCellByAliases_(row, headerMap, ['ACCIDENT TYPE']) || 'WORK-RELATED').toUpperCase(),
    expense_bearer: normalizeExpenseBearer_(rawBearer),
    client_assigned: normalizeClient_(getCellByAliases_(row, headerMap, ['CLIENT ASSIGNED'])),
    insurance_ref_no: refAndRem.refNo,
    amount_released: relNum,
    date_of_submission: dSubmit.valid ? dSubmit.value : '',
    reimbursed_date: dReimb.valid ? dReimb.value : '',
    amount_reimbursed: reimbNum,
    disallowance_reason: (relNum !== '' && reimbNum !== '' && Math.abs(relNum - reimbNum) > 0.009) ? refAndRem.remarks : '',
    hr_remarks: refAndRem.remarks,
    bank_status: normalizeBankStatus_(getCellByAliases_(row, headerMap, ['STATUS'])),
    date_credited: dCred.valid ? dCred.value : '',
    amount_credited: credNum,
    bank_notes: '',
    date_of_check: dChk.valid ? dChk.value : '',
    check_amount: chkNum,
    check_no: getCellByAliases_(row, headerMap, ['CHECK #']),
    final_status: String(getCellByAliases_(row, headerMap, ['STATUS_2']) || row[18] || '').trim().toUpperCase(),
    check_notes: ''
  });

  return {
    sourceLine: sourceLine,
    sourceLayout: 'INSURANCE',
    anomalies: anomalies,
    skipImport: false,
    record: rec
  };
}

function commitLegacyImport_(session, opts) {
  if (session.role !== APP_CONFIG.ROLES.ADMIN && session.role !== APP_CONFIG.ROLES.HR) {
    throw new Error('Only HR Department or System Admin can commit imports.');
  }
  ensureDatabaseReady_();
  opts = opts || {};
  var targetModule = String(opts.targetModule || 'SSS').trim().toUpperCase();
  var items = opts.rows || [];
  if (!items.length) throw new Error('No rows supplied for import.');

  return withScriptLock_(function() {
    var sheetName = targetModule === 'SSS' ? APP_CONFIG.SHEETS.SSS : APP_CONFIG.SHEETS.INSURANCE;
    var existingRows = readSheetObjects_(sheetName, true);
    var now = nowManilaIso_();
    var existingRefs = {};
    if (targetModule === 'SSS') {
      for (var e = 0; e < existingRows.length; e++) {
        if (toBool_(existingRows[e].is_deleted)) continue;
        var rk = String(existingRows[e].claim_ref_no || '').trim().toUpperCase();
        if (rk) existingRefs[rk] = true;
      }
    }

    var toInsert = [];
    var skippedDuplicates = 0;
    var combinedRows = existingRows.slice();

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.skipImport) {
        skippedDuplicates++;
        continue;
      }
      var rec = item.record ? Object.assign({}, item.record) : Object.assign({}, item);

      if (targetModule === 'SSS') {
        var refUp = String(rec.claim_ref_no || '').trim().toUpperCase();
        if (refUp && existingRefs[refUp]) {
          skippedDuplicates++;
          continue;
        }
        if (refUp) existingRefs[refUp] = true;

        rec = computeSssDerivedFields_(normalizeSssFields_(rec));
        rec.id = generateNextId_('SSS', combinedRows, rec.year || new Date().getFullYear());
      } else {
        rec = computeInsuranceDerivedFields_(normalizeInsuranceFields_(rec));
        rec.id = generateNextId_('INS', combinedRows, rec.year || new Date().getFullYear());
      }

      rec.created_by = session.username;
      rec.created_at = now;
      rec.updated_by = session.username;
      rec.updated_at = now;
      rec.is_deleted = false;

      toInsert.push(rec);
      combinedRows.push(rec);
    }

    appendRowObjectsBatch_(sheetName, toInsert);
    writeAuditLog_(
      session,
      targetModule,
      'BULK_IMPORT',
      'IMPORT',
      { importedCount: toInsert.length, skippedDuplicates: skippedDuplicates },
      'Imported ' + toInsert.length + ' ' + targetModule + ' records (skipped ' + skippedDuplicates + ' duplicates)'
    );

    return {
      importedCount: toInsert.length,
      skippedDuplicatesCount: skippedDuplicates
    };
  });
}

function csvEscape_(val) {
  var s = (val === null || val === undefined) ? '' : String(val);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function exportReportCsv_(session, opts) {
  opts = opts || {};
  var mod = String(opts.moduleName || 'SSS').trim().toUpperCase();
  var filters = Object.assign({}, opts.filters || {}, { all: true });
  var lines = [];

  if (mod === 'SSS') {
    var sssRes = listSssClaims_(session, filters);
    var headers = [
      'ID', 'Filing Date', 'Employer ERID', 'Claim Ref No.', 'SS Number',
      'Employee Name', 'Sequence', 'Confinement Date', 'Days Approved',
      'Amount to Release (PHP)', 'Sickness Start', 'Sickness End', 'Client/Project',
      'Benefit Type', 'Bank Status', 'Date Credited', 'Amount Credited (PHP)',
      'Bank Variance', 'Date of Check', 'Check Amount (PHP)', 'Check #',
      'Check Variance', 'Workflow Stage', 'Advanced'
    ];
    lines.push(headers.map(csvEscape_).join(','));
    for (var i = 0; i < sssRes.items.length; i++) {
      var r = sssRes.items[i];
      lines.push([
        r.id, r.filing_date, r.employer_erid, r.claim_ref_no, r.ss_number,
        r.employee_name, r.claim_sequence, r.confinement_date, r.days_approved,
        r.amount_to_release, r.sickness_start, r.sickness_end, r.client_project,
        r.benefit_type, r.bank_status, r.date_credited, r.amount_credited,
        r.bank_variance, r.date_of_check, r.check_amount, r.check_no,
        r.check_variance, r.workflow_stage, r.is_advanced ? 'YES' : 'NO'
      ].map(csvEscape_).join(','));
    }
    return {
      filename: 'SSS_Monitoring_Report_' + todayManilaYmd_() + '.csv',
      csvContent: lines.join('\r\n')
    };
  }

  var insRes = listInsuranceClaims_(session, filters);
  var insHeaders = [
    'ID', 'No.', 'Employee Name', 'Date of Accident', 'Accident Type',
    'Expense Bearer', 'Client Assigned', 'Insurance Ref No.', 'Amount Released (PHP)',
    'Date of Submission', 'Reimbursed Date', 'Amount Reimbursed (PHP)', 'Balance / Variance',
    'Disallowance / Remarks', 'Bank Status', 'Date Credited', 'Amount Credited (PHP)',
    'Check Required', 'Date of Check', 'Check Amount (PHP)', 'Check #', 'Final Status', 'Workflow Stage'
  ];
  lines.push(insHeaders.map(csvEscape_).join(','));
  for (var j = 0; j < insRes.items.length; j++) {
    var ir = insRes.items[j];
    lines.push([
      ir.id, ir.seq_no, ir.employee_name, ir.date_of_accident, ir.accident_type,
      ir.expense_bearer, ir.client_assigned, ir.insurance_ref_no, ir.amount_released,
      ir.date_of_submission, ir.reimbursed_date, ir.amount_reimbursed, ir.balance_variance,
      ir.disallowance_reason || ir.hr_remarks, ir.bank_status, ir.date_credited, ir.amount_credited,
      ir.check_required ? 'YES' : 'N/A', ir.date_of_check, ir.check_amount, ir.check_no,
      ir.final_status, ir.workflow_stage
    ].map(csvEscape_).join(','));
  }
  return {
    filename: 'Insurance_Monitoring_Report_' + todayManilaYmd_() + '.csv',
    csvContent: lines.join('\r\n')
  };
}
