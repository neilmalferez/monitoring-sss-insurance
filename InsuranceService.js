/**
 * Insurance / Accident Claim CRUD and filtering.
 */

function listInsuranceClaims_(session, filters) {
  ensureDatabaseReady_();
  filters = filters || {};
  var rows = readSheetObjects_(APP_CONFIG.SHEETS.INSURANCE);
  var items = [];

  var fYear = filters.year ? String(filters.year).trim() : '';
  var fClient = filters.client ? normalizeClient_(filters.client) : '';
  var fBearer = filters.expenseBearer ? String(filters.expenseBearer).trim().toUpperCase() : '';
  var fBank = filters.bankStatus ? String(filters.bankStatus).trim().toUpperCase() : '';
  var fStage = filters.stage ? String(filters.stage).trim().toUpperCase() : '';
  var fOpenBalanceOnly = toBool_(filters.openBalanceOnly);
  var q = filters.search ? String(filters.search).trim().toLowerCase() : '';

  var totals = {
    count: 0,
    amount_released: 0,
    amount_reimbursed: 0,
    amount_credited: 0,
    open_balance_amount: 0,
    company_expense_count: 0,
    employee_expense_count: 0
  };

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (toBool_(r.is_deleted)) continue;

    if (fYear && String(r.year) !== fYear) continue;
    if (fClient && normalizeClient_(r.client_assigned) !== fClient) continue;
    if (fBearer && String(r.expense_bearer || '').toUpperCase() !== fBearer) continue;
    if (fBank && String(r.bank_status || 'PENDING').toUpperCase() !== fBank) continue;
    if (fStage && String(r.workflow_stage || '').toUpperCase() !== fStage) continue;

    var clean = sanitizeInsuranceRow_(r);
    var bal = clean.balance_variance === '' ? 0 : Number(clean.balance_variance);
    if (fOpenBalanceOnly && Math.abs(bal) <= 0.009) continue;

    if (q) {
      var hay = [
        clean.id, clean.seq_no, clean.employee_name, clean.insurance_ref_no,
        clean.client_assigned, clean.hr_remarks, clean.disallowance_reason,
        clean.bank_reference_no, clean.check_no, clean.voucher_no
      ].join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) continue;
    }

    items.push(clean);

    totals.count++;
    totals.amount_released = round2_(totals.amount_released + (Number(clean.amount_released) || 0));
    totals.amount_reimbursed = round2_(totals.amount_reimbursed + (Number(clean.amount_reimbursed) || 0));
    totals.amount_credited = round2_(totals.amount_credited + (Number(clean.amount_credited) || 0));
    totals.open_balance_amount = round2_(totals.open_balance_amount + bal);
    if (clean.expense_bearer === 'COMPANY EXPENSE') totals.company_expense_count++;
    else totals.employee_expense_count++;
  }

  items.sort(function(a, b) {
    var na = parseInt(a.seq_no, 10);
    var nb = parseInt(b.seq_no, 10);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return nb - na;
    return String(b.date_of_submission || b.created_at || '').localeCompare(String(a.date_of_submission || a.created_at || ''));
  });

  var paged = paginateArray_(items, filters.page, filters.pageSize, toBool_(filters.all));
  return { items: paged.items, totals: totals, pagination: paged.pagination };
}

function getInsuranceClaimById_(session, id) {
  ensureDatabaseReady_();
  var targetId = String(id || '').trim();
  if (!targetId) throw new Error('Insurance claim id is required.');
  var rows = readSheetObjects_(APP_CONFIG.SHEETS.INSURANCE);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === targetId && !toBool_(rows[i].is_deleted)) {
      return sanitizeInsuranceRow_(rows[i]);
    }
  }
  throw new Error('Insurance claim "' + targetId + '" not found.');
}

function sanitizeInsuranceRow_(r) {
  return {
    id: String(r.id || ''),
    seq_no: String(r.seq_no || ''),
    year: r.year === '' ? '' : Number(r.year),
    employee_name: String(r.employee_name || ''),
    date_of_accident: formatDateManila_(r.date_of_accident),
    accident_type: String(r.accident_type || 'WORK-RELATED'),
    expense_bearer: String(r.expense_bearer || 'COMPANY EXPENSE'),
    client_assigned: String(r.client_assigned || ''),
    insurance_ref_no: String(r.insurance_ref_no || ''),
    amount_released: r.amount_released === '' ? '' : round2_(r.amount_released),
    date_of_submission: formatDateManila_(r.date_of_submission),
    reimbursed_date: formatDateManila_(r.reimbursed_date),
    amount_reimbursed: r.amount_reimbursed === '' ? '' : round2_(r.amount_reimbursed),
    balance_variance: r.balance_variance === '' ? '' : round2_(r.balance_variance),
    disallowance_reason: String(r.disallowance_reason || ''),
    hr_remarks: String(r.hr_remarks || ''),
    bank_status: String(r.bank_status || 'PENDING'),
    date_credited: formatDateManila_(r.date_credited),
    amount_credited: r.amount_credited === '' ? '' : round2_(r.amount_credited),
    bank_notes: String(r.bank_notes || ''),
    check_required: toBool_(r.check_required),
    date_of_check: formatDateManila_(r.date_of_check),
    check_amount: r.check_amount === '' ? '' : round2_(r.check_amount),
    check_no: String(r.check_no || ''),
    final_status: String(r.final_status || ''),
    check_notes: String(r.check_notes || ''),
    workflow_stage: String(r.workflow_stage || 'SUBMITTED'),
    created_by: String(r.created_by || ''),
    created_at: String(r.created_at || ''),
    updated_by: String(r.updated_by || ''),
    updated_at: String(r.updated_at || ''),
    attachment_name: String(r.attachment_name || ''),
    attachment_url: String(r.attachment_url || ''),
    reimbursement_attachment_name: String(r.reimbursement_attachment_name || ''),
    reimbursement_attachment_url: String(r.reimbursement_attachment_url || ''),
    bank_reference_no: String(r.bank_reference_no || ''),
    bank_attachment_name: String(r.bank_attachment_name || ''),
    bank_attachment_url: String(r.bank_attachment_url || ''),
    voucher_no: String(r.voucher_no || '')
  };
}

function normalizeInsuranceFields_(rec) {
  var out = Object.assign({}, rec);
  if (out.employee_name !== undefined) out.employee_name = normalizeEmployeeName_(out.employee_name);
  if (out.accident_type !== undefined) out.accident_type = String(out.accident_type || 'WORK-RELATED').trim().toUpperCase();
  if (out.expense_bearer !== undefined) out.expense_bearer = normalizeExpenseBearer_(out.expense_bearer);
  if (out.client_assigned !== undefined) out.client_assigned = normalizeClient_(out.client_assigned);
  if (out.insurance_ref_no !== undefined) out.insurance_ref_no = String(out.insurance_ref_no || '').trim().toUpperCase();
  if (out.bank_status !== undefined) out.bank_status = normalizeBankStatus_(out.bank_status);
  if (out.bank_reference_no !== undefined) out.bank_reference_no = String(out.bank_reference_no || '').trim();
  if (out.check_no !== undefined) out.check_no = String(out.check_no || '').trim();
  if (out.voucher_no !== undefined) out.voucher_no = String(out.voucher_no || '').trim();
  if (out.final_status !== undefined) out.final_status = String(out.final_status || '').trim().toUpperCase();
  if (out.attachment_name !== undefined) out.attachment_name = String(out.attachment_name || '').trim();
  if (out.attachment_url !== undefined) out.attachment_url = String(out.attachment_url || '').trim();
  if (out.reimbursement_attachment_name !== undefined) out.reimbursement_attachment_name = String(out.reimbursement_attachment_name || '').trim();
  if (out.reimbursement_attachment_url !== undefined) out.reimbursement_attachment_url = String(out.reimbursement_attachment_url || '').trim();
  if (out.bank_attachment_name !== undefined) out.bank_attachment_name = String(out.bank_attachment_name || '').trim();
  if (out.bank_attachment_url !== undefined) out.bank_attachment_url = String(out.bank_attachment_url || '').trim();
  if (out.amount_released !== undefined && out.amount_released !== '') out.amount_released = parseMoney_(out.amount_released);
  if (out.amount_reimbursed !== undefined && out.amount_reimbursed !== '') out.amount_reimbursed = parseMoney_(out.amount_reimbursed);
  if (out.amount_credited !== undefined && out.amount_credited !== '') out.amount_credited = parseMoney_(out.amount_credited);
  if (out.check_amount !== undefined && out.check_amount !== '') out.check_amount = parseMoney_(out.check_amount);
  return out;
}

function saveInsuranceClaim_(session, payload) {
  ensureDatabaseReady_();
  payload = payload || {};
  var isCreate = !payload.id;
  var filtered = filterPayloadByRole_(session.role, 'INSURANCE', payload, isCreate);

  return withScriptLock_(function() {
    var rows = readSheetObjects_(APP_CONFIG.SHEETS.INSURANCE, true);
    var now = nowManilaIso_();
    var existing = null;

    if (!isCreate) {
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].id === payload.id && !toBool_(rows[i].is_deleted)) {
          existing = rows[i];
          break;
        }
      }
      if (!existing) throw new Error('Insurance claim "' + payload.id + '" not found.');
    }

    var nextSeq = 1;
    if (isCreate) {
      for (var s = 0; s < rows.length; s++) {
        var sq = parseInt(rows[s].seq_no, 10);
        if (!isNaN(sq) && sq >= nextSeq) nextSeq = sq + 1;
      }
    }

    var base = existing ? Object.assign({}, existing) : {
      id: '',
      seq_no: String(nextSeq),
      year: new Date().getFullYear(),
      employee_name: '',
      date_of_accident: '',
      accident_type: 'WORK-RELATED',
      expense_bearer: 'COMPANY EXPENSE',
      client_assigned: '',
      insurance_ref_no: '',
      amount_released: '',
      date_of_submission: todayManilaYmd_(),
      reimbursed_date: '',
      amount_reimbursed: '',
      balance_variance: '',
      disallowance_reason: '',
      hr_remarks: '',
      bank_status: 'PENDING',
      date_credited: '',
      amount_credited: '',
      bank_notes: '',
      check_required: '',
      date_of_check: '',
      check_amount: '',
      check_no: '',
      final_status: '',
      check_notes: '',
      workflow_stage: 'SUBMITTED',
      created_by: session.username,
      created_at: now,
      updated_by: session.username,
      updated_at: now,
      is_deleted: false,
      attachment_name: '',
      attachment_url: '',
      reimbursement_attachment_name: '',
      reimbursement_attachment_url: '',
      bank_reference_no: '',
      bank_attachment_name: '',
      bank_attachment_url: '',
      voucher_no: ''
    };

    var normPatch = normalizeInsuranceFields_(filtered);
    // If HR changes expense_bearer and check_required wasn't explicitly locked, re-sync check_required default
    var merged = Object.assign({}, base, normPatch);
    if (normPatch.expense_bearer !== undefined && normPatch.check_required === undefined) {
      merged.check_required = (normPatch.expense_bearer === 'EMPLOYEE EXPENSE');
    }

    merged.updated_by = session.username;
    merged.updated_at = now;
    merged.is_deleted = false;

    var yrSrc = merged.date_of_submission || merged.date_of_accident || merged.date_credited || '';
    if (yrSrc && /^\d{4}/.test(String(yrSrc))) {
      merged.year = parseInt(String(yrSrc).slice(0, 4), 10);
    }

    var validation = validateInsuranceRecord_(merged, rows, existing ? existing.id : null, { allowLegacyDates: false });
    if (!validation.valid) {
      throw new Error(validation.errors.join(' '));
    }

    merged = computeInsuranceDerivedFields_(merged);

    if (isCreate) {
      merged.id = generateNextId_('INS', rows, merged.year || new Date().getFullYear());
      appendRowObject_(APP_CONFIG.SHEETS.INSURANCE, merged);
      writeAuditLog_(
        session,
        'INSURANCE',
        merged.id,
        'CREATE',
        { employee_name: merged.employee_name, amount_released: merged.amount_released, insurance_ref_no: merged.insurance_ref_no },
        'Created Insurance claim for ' + merged.employee_name
      );
    } else {
      var diffFields = APP_CONFIG.ROLE_WRITABLE_FIELDS.INSURANCE.ADMIN.concat(['workflow_stage', 'balance_variance']);
      var diff = computeFieldDiff_(existing, merged, diffFields);
      updateRowObject_(APP_CONFIG.SHEETS.INSURANCE, existing._rowIndex, merged);
      writeAuditLog_(
        session,
        'INSURANCE',
        merged.id,
        'UPDATE',
        diff,
        'Updated Insurance claim ' + merged.id + ' (' + Object.keys(diff).length + ' fields)'
      );
    }

    return {
      record: sanitizeInsuranceRow_(merged),
      warnings: validation.warnings
    };
  });
}

function deleteInsuranceClaim_(session, id) {
  if (session.role !== APP_CONFIG.ROLES.ADMIN) {
    throw new Error('Only System Admin can delete Insurance claims.');
  }
  return withScriptLock_(function() {
    var rows = readSheetObjects_(APP_CONFIG.SHEETS.INSURANCE, true);
    var target = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === id && !toBool_(rows[i].is_deleted)) {
        target = rows[i];
        break;
      }
    }
    if (!target) throw new Error('Insurance claim not found.');

    var updated = Object.assign({}, target, {
      is_deleted: true,
      updated_by: session.username,
      updated_at: nowManilaIso_()
    });
    updateRowObject_(APP_CONFIG.SHEETS.INSURANCE, target._rowIndex, updated);
    writeAuditLog_(session, 'INSURANCE', id, 'DELETE', { is_deleted: { from: 'false', to: 'true' } }, 'Soft-deleted Insurance claim ' + target.employee_name);
    return { deleted: true, id: id };
  });
}

function uploadInsuranceAttachment_(session, payload) {
  payload = payload || {};
  var rawKind = String(payload.attachmentKind || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
  if (rawKind === 'BANK') {
    if (session.role !== APP_CONFIG.ROLES.ADMIN &&
        session.role !== APP_CONFIG.ROLES.BANK_ACCOUNTING &&
        session.role !== APP_CONFIG.ROLES.ACCOUNTING) {
      throw new Error('Only Bank Accounting, Accounting, or System Admin can upload bank attachments.');
    }
  } else {
    if (session.role !== APP_CONFIG.ROLES.ADMIN && session.role !== APP_CONFIG.ROLES.HR) {
      throw new Error('Only HR Department or System Admin can upload HR insurance attachments.');
    }
  }
  var fileName = String(payload.fileName || 'attachment').trim().replace(/[\\/:*?"<>|]/g, '_');
  var mimeType = String(payload.mimeType || 'application/octet-stream').trim();
  var base64Data = String(payload.base64Data || '').trim();
  var claimId = String(payload.claimId || 'NEW').trim();

  if (!base64Data) {
    throw new Error('Attachment file data is empty.');
  }
  if (base64Data.length > 14000000) {
    throw new Error('File is too large. Please keep attachments under 10 MB.');
  }
  var allowedMimes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  if (allowedMimes.indexOf(mimeType.toLowerCase()) === -1) {
    throw new Error('Unsupported file type (' + mimeType + '). Allowed: PDF, JPG, PNG, WebP, Word, Excel.');
  }

  try {
    var folder = getOrCreateAttachmentsFolder_();
    var bytes = Utilities.base64Decode(base64Data);
    var safePrefix = (claimId ? claimId + '_' : '') + (rawKind ? rawKind + '_' : '');
    var safeName = safePrefix + fileName;
    var blob = Utilities.newBlob(bytes, mimeType, safeName);
    var file = folder.createFile(blob);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      // Domain policy may restrict ANYONE_WITH_LINK; file remains accessible via Google Drive URL
    }
    var url = file.getUrl();
    writeAuditLog_(
      session,
      'INSURANCE',
      claimId || 'NEW',
      'UPLOAD_ATTACHMENT',
      { attachment_kind: rawKind || 'GENERAL', attachment_name: fileName, attachment_url: url },
      'Uploaded insurance attachment (' + (rawKind || 'GENERAL') + '): ' + fileName
    );
    return {
      attachment_name: fileName,
      attachment_url: url
    };
  } catch (err) {
    var msg = (err && err.message) ? err.message : String(err);
    if (/permission|DriveApp|authoriz|scope/i.test(msg)) {
      throw new Error('Google Drive is not authorized yet. Run authorizeDrive() once in the Apps Script editor.');
    }
    throw new Error('Attachment upload failed: ' + msg);
  }
}
