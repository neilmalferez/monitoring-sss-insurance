/**
 * SSS Sickness, Maternity, and EC Claim CRUD, filtering, and consolidated check queries.
 */

function listSssClaims_(session, filters) {
  ensureDatabaseReady_();
  filters = filters || {};
  var rows = readSheetObjects_(APP_CONFIG.SHEETS.SSS);
  var items = [];

  var fYear = filters.year ? String(filters.year).trim() : '';
  var fMonth = filters.month ? String(filters.month).trim() : '';
  var fClient = filters.client ? normalizeClient_(filters.client) : '';
  var fBenefit = filters.benefitType ? String(filters.benefitType).trim().toUpperCase() : '';
  var fBank = filters.bankStatus ? String(filters.bankStatus).trim().toUpperCase() : '';
  var fStage = filters.stage ? String(filters.stage).trim().toUpperCase() : '';
  var fVarOnly = toBool_(filters.varianceOnly);
  var q = filters.search ? String(filters.search).trim().toLowerCase() : '';

  var totals = {
    count: 0,
    amount_to_release: 0,
    amount_credited: 0,
    check_amount: 0,
    pending_credit_amount: 0,
    pending_check_amount: 0,
    advanced_exposure_amount: 0,
    variance_count: 0
  };

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (toBool_(r.is_deleted)) continue;

    if (fYear && String(r.year) !== fYear) continue;
    if (fMonth) {
      var refDate = String(r.filing_date || r.sickness_start || '');
      if (refDate.slice(5, 7) !== fMonth) continue;
    }
    if (fClient && normalizeClient_(r.client_project) !== fClient) continue;
    if (fBenefit && String(r.benefit_type || '').toUpperCase() !== fBenefit) continue;
    if (fBank && String(r.bank_status || 'PENDING').toUpperCase() !== fBank) continue;
    if (fStage && String(r.workflow_stage || '').toUpperCase() !== fStage) continue;

    var hasVar = (r.bank_variance !== '' && Math.abs(Number(r.bank_variance)) > 0.009) ||
                 (r.check_variance !== '' && Math.abs(Number(r.check_variance)) > 0.009);
    if (fVarOnly && !hasVar) continue;

    if (q) {
      var hay = [
        r.id, r.employee_name, r.ss_number, r.claim_ref_no,
        r.client_project, r.check_no, r.benefit_type, r.hr_remarks
      ].join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) continue;
    }

    var clean = sanitizeSssRow_(r);
    items.push(clean);

    totals.count++;
    var amtRel = Number(clean.amount_to_release) || 0;
    var amtCred = clean.amount_credited === '' ? 0 : (Number(clean.amount_credited) || 0);
    var amtChk = clean.check_amount === '' ? 0 : (Number(clean.check_amount) || 0);
    totals.amount_to_release = round2_(totals.amount_to_release + amtRel);
    totals.amount_credited = round2_(totals.amount_credited + amtCred);
    totals.check_amount = round2_(totals.check_amount + amtChk);

    if (!clean.date_credited && clean.bank_status === 'PENDING') {
      totals.pending_credit_amount = round2_(totals.pending_credit_amount + amtRel);
    }
    if (!clean.date_of_check && !clean.check_no) {
      totals.pending_check_amount = round2_(totals.pending_check_amount + amtRel);
    }
    if (clean.is_advanced && !clean.date_credited && clean.bank_status === 'PENDING') {
      totals.advanced_exposure_amount = round2_(totals.advanced_exposure_amount + amtChk);
    }
    if (hasVar) totals.variance_count++;
  }

  // Sort newest filing_date first
  items.sort(function(a, b) {
    return String(b.filing_date || b.created_at || '').localeCompare(String(a.filing_date || a.created_at || ''));
  });

  var paged = paginateArray_(items, filters.page, filters.pageSize, toBool_(filters.all));
  return { items: paged.items, totals: totals, pagination: paged.pagination };
}

function getSssClaimById_(session, id) {
  ensureDatabaseReady_();
  var targetId = String(id || '').trim();
  if (!targetId) throw new Error('SSS claim id is required.');
  var rows = readSheetObjects_(APP_CONFIG.SHEETS.SSS);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === targetId && !toBool_(rows[i].is_deleted)) {
      return sanitizeSssRow_(rows[i]);
    }
  }
  throw new Error('SSS claim "' + targetId + '" not found.');
}

function sanitizeSssRow_(r) {
  return {
    id: String(r.id || ''),
    year: r.year === '' ? '' : Number(r.year),
    filing_date: formatDateManila_(r.filing_date),
    employer_erid: String(r.employer_erid || ''),
    claim_ref_no: String(r.claim_ref_no || ''),
    ss_number: String(r.ss_number || ''),
    employee_name: String(r.employee_name || ''),
    claim_sequence: String(r.claim_sequence || ''),
    client_project: String(r.client_project || ''),
    benefit_type: String(r.benefit_type || ''),
    confinement_date: formatDateManila_(r.confinement_date),
    sickness_start: formatDateManila_(r.sickness_start),
    sickness_end: formatDateManila_(r.sickness_end),
    days_approved: r.days_approved === '' ? '' : Number(r.days_approved),
    amount_to_release: r.amount_to_release === '' ? '' : round2_(r.amount_to_release),
    hr_remarks: String(r.hr_remarks || ''),
    bank_status: String(r.bank_status || 'PENDING'),
    date_credited: formatDateManila_(r.date_credited),
    amount_credited: r.amount_credited === '' ? '' : round2_(r.amount_credited),
    bank_variance: r.bank_variance === '' ? '' : round2_(r.bank_variance),
    bank_notes: String(r.bank_notes || ''),
    date_of_check: formatDateManila_(r.date_of_check),
    check_amount: r.check_amount === '' ? '' : round2_(r.check_amount),
    check_no: String(r.check_no || ''),
    check_variance: r.check_variance === '' ? '' : round2_(r.check_variance),
    variance_reason: String(r.variance_reason || ''),
    check_notes: String(r.check_notes || ''),
    workflow_stage: String(r.workflow_stage || 'FILED_HR'),
    is_advanced: toBool_(r.is_advanced),
    created_by: String(r.created_by || ''),
    created_at: String(r.created_at || ''),
    updated_by: String(r.updated_by || ''),
    updated_at: String(r.updated_at || '')
  };
}

function normalizeSssFields_(rec) {
  var out = Object.assign({}, rec);
  if (out.employer_erid !== undefined) out.employer_erid = normalizeErid_(out.employer_erid);
  if (out.ss_number !== undefined) out.ss_number = normalizeSsNumber_(out.ss_number);
  if (out.claim_ref_no !== undefined) out.claim_ref_no = String(out.claim_ref_no || '').trim().toUpperCase();
  if (out.employee_name !== undefined) out.employee_name = normalizeEmployeeName_(out.employee_name);
  if (out.client_project !== undefined) out.client_project = normalizeClient_(out.client_project);
  if (out.benefit_type !== undefined) out.benefit_type = normalizeBenefitType_(out.benefit_type);
  if (out.bank_status !== undefined) out.bank_status = normalizeBankStatus_(out.bank_status);
  if (out.check_no !== undefined) out.check_no = String(out.check_no || '').trim();
  if (out.days_approved !== undefined && out.days_approved !== '') out.days_approved = parseIntStrict_(out.days_approved);
  if (out.amount_to_release !== undefined && out.amount_to_release !== '') out.amount_to_release = parseMoney_(out.amount_to_release);
  if (out.amount_credited !== undefined && out.amount_credited !== '') out.amount_credited = parseMoney_(out.amount_credited);
  if (out.check_amount !== undefined && out.check_amount !== '') out.check_amount = parseMoney_(out.check_amount);
  return out;
}

function saveSssClaim_(session, payload) {
  ensureDatabaseReady_();
  payload = payload || {};
  var isCreate = !payload.id;
  var filtered = filterPayloadByRole_(session.role, 'SSS', payload, isCreate);

  return withScriptLock_(function() {
    var rows = readSheetObjects_(APP_CONFIG.SHEETS.SSS, true);
    var now = nowManilaIso_();
    var existing = null;

    if (!isCreate) {
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].id === payload.id && !toBool_(rows[i].is_deleted)) {
          existing = rows[i];
          break;
        }
      }
      if (!existing) throw new Error('SSS claim "' + payload.id + '" not found.');
    }

    var base = existing ? Object.assign({}, existing) : {
      id: '',
      year: '',
      filing_date: todayManilaYmd_(),
      employer_erid: APP_CONFIG.DEFAULT_ERID,
      claim_ref_no: '',
      ss_number: '',
      employee_name: '',
      claim_sequence: '',
      client_project: '',
      benefit_type: 'SB',
      confinement_date: '',
      sickness_start: '',
      sickness_end: '',
      days_approved: '',
      amount_to_release: '',
      hr_remarks: '',
      bank_status: 'PENDING',
      date_credited: '',
      amount_credited: '',
      bank_variance: '',
      bank_notes: '',
      date_of_check: '',
      check_amount: '',
      check_no: '',
      check_variance: '',
      variance_reason: '',
      check_notes: '',
      workflow_stage: 'FILED_HR',
      is_advanced: false,
      created_by: session.username,
      created_at: now,
      updated_by: session.username,
      updated_at: now,
      is_deleted: false
    };

    var merged = Object.assign({}, base, normalizeSssFields_(filtered));
    merged.updated_by = session.username;
    merged.updated_at = now;
    merged.is_deleted = false;

    // Re-derive year from filing_date if HR updated filing_date
    if (merged.filing_date && /^\d{4}/.test(String(merged.filing_date))) {
      merged.year = parseInt(String(merged.filing_date).slice(0, 4), 10);
    }

    var validation = validateSssRecord_(merged, rows, existing ? existing.id : null, { allowLegacyDates: false });
    if (!validation.valid) {
      throw new Error(validation.errors.join(' '));
    }

    merged = computeSssDerivedFields_(merged);

    if (isCreate) {
      merged.id = generateNextId_('SSS', rows, merged.year || new Date().getFullYear());
      appendRowObject_(APP_CONFIG.SHEETS.SSS, merged);
      writeAuditLog_(
        session,
        'SSS',
        merged.id,
        'CREATE',
        { claim_ref_no: merged.claim_ref_no, employee_name: merged.employee_name, amount_to_release: merged.amount_to_release },
        'Created SSS claim ' + merged.claim_ref_no + ' for ' + merged.employee_name
      );
    } else {
      var diffFields = APP_CONFIG.ROLE_WRITABLE_FIELDS.SSS.ADMIN.concat(['workflow_stage', 'bank_variance', 'check_variance']);
      var diff = computeFieldDiff_(existing, merged, diffFields);
      updateRowObject_(APP_CONFIG.SHEETS.SSS, existing._rowIndex, merged);
      writeAuditLog_(
        session,
        'SSS',
        merged.id,
        'UPDATE',
        diff,
        'Updated SSS claim ' + merged.claim_ref_no + ' (' + Object.keys(diff).length + ' fields)'
      );
    }

    return {
      record: sanitizeSssRow_(merged),
      warnings: validation.warnings
    };
  });
}

function deleteSssClaim_(session, id) {
  if (session.role !== APP_CONFIG.ROLES.ADMIN) {
    throw new Error('Only System Admin can delete SSS claims.');
  }
  return withScriptLock_(function() {
    var rows = readSheetObjects_(APP_CONFIG.SHEETS.SSS, true);
    var target = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === id && !toBool_(rows[i].is_deleted)) {
        target = rows[i];
        break;
      }
    }
    if (!target) throw new Error('SSS claim not found.');

    var updated = Object.assign({}, target, {
      is_deleted: true,
      updated_by: session.username,
      updated_at: nowManilaIso_()
    });
    updateRowObject_(APP_CONFIG.SHEETS.SSS, target._rowIndex, updated);
    writeAuditLog_(session, 'SSS', id, 'DELETE', { is_deleted: { from: 'false', to: 'true' } }, 'Soft-deleted SSS claim ' + target.claim_ref_no);
    return { deleted: true, id: id };
  });
}

function getClaimsByCheckNo_(session, checkNo) {
  ensureDatabaseReady_();
  var chk = String(checkNo || '').trim();
  if (!chk) throw new Error('Check # is required.');

  var rows = readSheetObjects_(APP_CONFIG.SHEETS.SSS);
  var matches = [];
  var totalApproved = 0;
  var uniqueCheckAmounts = {};

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (toBool_(r.is_deleted)) continue;
    if (String(r.check_no || '').trim() === chk) {
      var clean = sanitizeSssRow_(r);
      matches.push(clean);
      totalApproved = round2_(totalApproved + (Number(clean.amount_to_release) || 0));
      if (clean.check_amount !== '') {
        uniqueCheckAmounts[String(clean.check_amount)] = Number(clean.check_amount);
      }
    }
  }

  var sumCheckPerRow = 0;
  for (var m = 0; m < matches.length; m++) {
    sumCheckPerRow = round2_(sumCheckPerRow + (Number(matches[m].check_amount) || 0));
  }

  return {
    check_no: chk,
    count: matches.length,
    total_approved_amount: totalApproved,
    total_check_amount: sumCheckPerRow,
    claims: matches
  };
}
