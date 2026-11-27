const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

// -------------------- In-Memory GAS Mock --------------------
function createGasMocks() {
  const propsStore = {};
  const cacheStore = {};

  class MockRange {
    constructor(sheet, row, col, numRows, numCols) {
      this.sheet = sheet;
      this.row = row;
      this.col = col;
      this.numRows = numRows;
      this.numCols = numCols;
    }
    getValues() {
      const out = [];
      for (let r = 0; r < this.numRows; r++) {
        const rr = this.row - 1 + r;
        const rowArr = [];
        for (let c = 0; c < this.numCols; c++) {
          const cc = this.col - 1 + c;
          const val = (this.sheet.data[rr] && this.sheet.data[rr][cc] !== undefined) ? this.sheet.data[rr][cc] : '';
          rowArr.push(val);
        }
        out.push(rowArr);
      }
      return out;
    }
    setValues(values) {
      for (let r = 0; r < values.length; r++) {
        const rr = this.row - 1 + r;
        if (!this.sheet.data[rr]) this.sheet.data[rr] = [];
        for (let c = 0; c < values[r].length; c++) {
          this.sheet.data[rr][this.col - 1 + c] = values[r][c];
        }
      }
      return this;
    }
    setNumberFormat(fmt) { this.sheet.formats[`${this.col}:${fmt}`] = true; return this; }
    setFontWeight() { return this; }
    setBackground() { return this; }
    setFontColor() { return this; }
  }

  class MockSheet {
    constructor(name) {
      this.name = name;
      this.data = [];
      this.formats = {};
      this.frozenRows = 0;
    }
    getName() { return this.name; }
    getLastRow() { return this.data.length; }
    getLastColumn() {
      let max = 0;
      for (const r of this.data) if (r && r.length > max) max = r.length;
      return max;
    }
    getMaxRows() { return Math.max(this.data.length, 100); }
    setFrozenRows(n) { this.frozenRows = n; }
    getRange(row, col, numRows = 1, numCols = 1) {
      return new MockRange(this, row, col, numRows, numCols);
    }
    getDataRange() {
      return new MockRange(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1));
    }
  }

  const rawExisting = new MockSheet('Raw_2026_Legacy');
  rawExisting.data = [['Keep Me Untouched']];

  const sheets = [rawExisting];
  const mockSpreadsheet = {
    getName: () => 'SSS & Insurance Monitoring DB',
    getSheets: () => sheets.slice(),
    getSheetByName: (name) => sheets.find(s => s.name === name) || null,
    insertSheet: (name) => {
      const sh = new MockSheet(name);
      sheets.push(sh);
      return sh;
    }
  };

  function formatWithTz(date, tz, pattern) {
    // Asia/Manila is UTC+8
    const shifted = new Date(date.getTime() + 8 * 3600 * 1000);
    const yyyy = shifted.getUTCFullYear();
    const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(shifted.getUTCDate()).padStart(2, '0');
    const hh = String(shifted.getUTCHours()).padStart(2, '0');
    const mi = String(shifted.getUTCMinutes()).padStart(2, '0');
    const ss = String(shifted.getUTCSeconds()).padStart(2, '0');
    if (pattern === 'yyyy-MM-dd') return `${yyyy}-${mm}-${dd}`;
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+08:00`;
  }

  const sandbox = {
    console,
    Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error, parseInt, parseFloat, isNaN, isFinite,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => mockSpreadsheet,
      openById: () => mockSpreadsheet,
      getUi: () => ({ createMenu: () => ({ addItem: function() { return this; }, addToUi: () => {} }) })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => propsStore[k] || null,
        setProperty: (k, v) => { propsStore[k] = v; }
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => cacheStore[k] || null,
        put: (k, v) => { cacheStore[k] = v; },
        remove: (k) => { delete cacheStore[k]; }
      })
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => {},
        releaseLock: () => {}
      })
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      getUuid: () => crypto.randomUUID(),
      computeDigest: (_alg, str) => {
        const buf = crypto.createHash('sha256').update(String(str), 'utf8').digest();
        return Array.from(buf).map(b => (b > 127 ? b - 256 : b));
      },
      formatDate: (d, tz, fmt) => formatWithTz(d, tz, fmt)
    },
    HtmlService: {
      createTemplateFromFile: () => ({ evaluate: () => ({ setTitle: function() { return this; }, addMetaTag: function() { return this; } }) }),
      createHtmlOutputFromFile: () => ({ getContent: () => '' })
    }
  };

  vm.createContext(sandbox);
  const files = [
    'Config.js',
    'ValidationService.js',
    'Db.js',
    'AuthService.js',
    'SssService.js',
    'InsuranceService.js',
    'DashboardService.js',
    'ImportExportService.js',
    'Code.js'
  ];
  for (const f of files) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(code, sandbox, { filename: f });
  }
  return { sandbox, mockSpreadsheet };
}

function assertNoRawDates(val, pathStr = 'root') {
  if (val === null || val === undefined) return;
  if (val instanceof Date || Object.prototype.toString.call(val) === '[object Date]') {
    throw new Error(`Raw Date instance found at ${pathStr}`);
  }
  if (Array.isArray(val)) {
    val.forEach((v, i) => assertNoRawDates(v, `${pathStr}[${i}]`));
  } else if (typeof val === 'object') {
    for (const k of Object.keys(val)) {
      assertNoRawDates(val[k], `${pathStr}.${k}`);
    }
  }
}

// -------------------- Test Suite --------------------
function runTests() {
  const { sandbox: gas, mockSpreadsheet } = createGasMocks();

  // 1. Setup Database, URL extraction & Non-destructive preservation
  assert.strictEqual(
    gas.extractSpreadsheetId_('https://docs.google.com/spreadsheets/d/1CSw88gEyF6yHDACKoYt8O1_7uY8TMWax86ZT8KxDd_A/edit?gid=2843942647#gid=2843942647'),
    '1CSw88gEyF6yHDACKoYt8O1_7uY8TMWax86ZT8KxDd_A'
  );
  assert.strictEqual(
    gas.extractSpreadsheetId_('  1CSw88gEyF6yHDACKoYt8O1_7uY8TMWax86ZT8KxDd_A  '),
    '1CSw88gEyF6yHDACKoYt8O1_7uY8TMWax86ZT8KxDd_A'
  );
  const setupRes = gas.setSpreadsheetId('https://docs.google.com/spreadsheets/d/1CSw88gEyF6yHDACKoYt8O1_7uY8TMWax86ZT8KxDd_A/edit?gid=2843942647#gid=2843942647');
  assert.strictEqual(gas.PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'), '1CSw88gEyF6yHDACKoYt8O1_7uY8TMWax86ZT8KxDd_A');
  assert.strictEqual(setupRes.ok, true);
  assert.ok(mockSpreadsheet.getSheetByName('Raw_2026_Legacy'), 'Existing raw tab must remain untouched');
  assert.strictEqual(mockSpreadsheet.getSheetByName('Raw_2026_Legacy').data[0][0], 'Keep Me Untouched');
  for (const name of Object.values(gas.APP_CONFIG.SHEETS)) {
    assert.ok(mockSpreadsheet.getSheetByName(name), `Missing DB sheet ${name}`);
  }
  console.log('PASS: Database setup & non-destructive preservation');

  // 2. Auth, Forced Password Change & User Creation
  const loginRes = gas.apiLogin('admin', 'Admin@2026');
  assert.strictEqual(loginRes.ok, true);
  assert.strictEqual(loginRes.data.user.must_change_password, true);
  const adminToken = loginRes.data.token;

  const pwdRes = gas.apiChangePassword(adminToken, 'Admin@2026', 'NewAdmin#2026');
  assert.strictEqual(pwdRes.ok, true);
  assert.strictEqual(pwdRes.data.user.must_change_password, false);

  for (const [u, role] of [
    ['hr_staff', 'HR'],
    ['bank_staff', 'BANK_ACCOUNTING'],
    ['check_staff', 'CHECK_ISSUANCE'],
    ['viewer_staff', 'VIEWER']
  ]) {
    const cr = gas.apiSaveUser(adminToken, {
      username: u,
      full_name: u.toUpperCase(),
      role,
      password: 'Password@123',
      is_active: true
    });
    assert.strictEqual(cr.ok, true, `Failed creating ${u}: ${cr.error}`);
    assert.strictEqual(cr.data.password_hash, undefined, 'Must never expose password_hash');
  }

  const hrToken = gas.apiLogin('hr_staff', 'Password@123').data.token;
  const bankToken = gas.apiLogin('bank_staff', 'Password@123').data.token;
  const checkToken = gas.apiLogin('check_staff', 'Password@123').data.token;
  const viewerToken = gas.apiLogin('viewer_staff', 'Password@123').data.token;
  console.log('PASS: Auth, forced password change, and department user accounts');

  // 3. RBAC Field Filtering & Validation Edge Cases
  // Viewer cannot write
  const viewerFail = gas.apiSaveSss(viewerToken, { employee_name: 'TEST' });
  assert.strictEqual(viewerFail.ok, false);

  // HR creates claim and tries to smuggle bank/check fields -> must be stripped!
  const hrCreate = gas.apiSaveSss(hrToken, {
    filing_date: '2026-02-20',
    employer_erid: '0617589257-000',
    claim_ref_no: 'SNEW3972025122362954',
    ss_number: '0722929731',
    employee_name: 'NABOS, RYAN C.',
    client_project: 'vmc',
    benefit_type: 'SB',
    sickness_start: '2025-12-14',
    sickness_end: '2025-12-27',
    days_approved: 10,
    amount_to_release: 6000,
    // Unauthorized fields for HR:
    date_credited: '2026-02-24',
    check_no: '9999999'
  });
  assert.strictEqual(hrCreate.ok, true, hrCreate.error);
  assert.strictEqual(hrCreate.data.record.employer_erid, '06-1758925-7-000');
  assert.strictEqual(hrCreate.data.record.ss_number, '07-2292973-1');
  assert.strictEqual(hrCreate.data.record.client_project, 'VMC');
  assert.strictEqual(hrCreate.data.record.date_credited, '', 'HR must not write date_credited');
  assert.strictEqual(hrCreate.data.record.check_no, '', 'HR must not write check_no');

  const nabosId = hrCreate.data.record.id;

  // Bank accounting credits NABOS, tries to tamper with amount_to_release -> stripped!
  const bankUpdate = gas.apiSaveSss(bankToken, {
    id: nabosId,
    bank_status: 'CREDITED TO BDO',
    date_credited: '2026-02-24',
    amount_credited: 6000,
    amount_to_release: 1
  });
  assert.strictEqual(bankUpdate.ok, true);
  assert.strictEqual(bankUpdate.data.record.amount_to_release, 6000);
  assert.strictEqual(bankUpdate.data.record.workflow_stage, 'CREDITED_AWAITING_CHECK');

  // Check issuance enters partial check (2065 vs 6000 -> variance -3935 -> wait: 6000 - 2065 = 3935!)
  const checkUpdate = gas.apiSaveSss(checkToken, {
    id: nabosId,
    date_of_check: '2026-01-31',
    check_amount: 2065,
    check_no: '2000001093',
    variance_reason: 'Partial release'
  });
  assert.strictEqual(checkUpdate.ok, true);
  assert.strictEqual(checkUpdate.data.record.check_variance, 3935);
  assert.strictEqual(checkUpdate.data.record.workflow_stage, 'VARIANCE_FLAGGED');
  assert.strictEqual(checkUpdate.data.record.is_advanced, true);

  // Duplicate Claim Ref check
  const dupRes = gas.apiSaveSss(hrToken, {
    filing_date: '2026-02-21',
    claim_ref_no: 'SNEW3972025122362954',
    ss_number: '07-2292973-1',
    employee_name: 'NABOS, RYAN C.',
    client_project: 'VMC',
    benefit_type: 'SB',
    sickness_start: '2026-01-01',
    sickness_end: '2026-01-05',
    days_approved: 5,
    amount_to_release: 1000
  });
  assert.strictEqual(dupRes.ok, false);
  assert.ok(dupRes.error.includes('Duplicate Claim Ref No'));

  // Bad date validation (20265-07-13, 06/072026, reversed dates)
  assert.strictEqual(
    gas.apiSaveSss(hrToken, {
      filing_date: '20265-07-13',
      claim_ref_no: 'SNEW_BAD_DATE',
      ss_number: '07-1111111-1',
      employee_name: 'TEST',
      client_project: 'VMC',
      benefit_type: 'SB',
      days_approved: 1,
      amount_to_release: 500
    }).ok,
    false
  );
  assert.strictEqual(
    gas.apiSaveSss(hrToken, {
      filing_date: '2026-05-01',
      claim_ref_no: 'SNEW_REV_DATE',
      ss_number: '07-1111111-1',
      employee_name: 'TEST',
      client_project: 'VMC',
      benefit_type: 'SB',
      sickness_start: '2026-05-10',
      sickness_end: '2026-05-05',
      days_approved: 1,
      amount_to_release: 500
    }).ok,
    false
  );
  console.log('PASS: RBAC field filtering, duplicate protection, and date/variance validation');

  // 4. Consolidated Check Grouping (ASUNCION check 2000001089)
  for (const row of [
    { claim_ref_no: 'SNEW3412025121063262', ss_number: '07-2859723-5', employee_name: 'ASUNCION, RENIE F.', filing_date: '2026-01-08', days_approved: 5, amount_to_release: 2062.5, check_amount: 2062.5, check_no: '2000001089', date_of_check: '2026-01-31' },
    { claim_ref_no: 'SNEW3832025121967199', ss_number: '07-2859723-5', employee_name: 'ASUNCION, RENIE F.', filing_date: '2026-01-15', days_approved: 7, amount_to_release: 2887.5, check_amount: 2887.5, check_no: '2000001089', date_of_check: '2026-01-31' }
  ]) {
    const r = gas.apiSaveSss(adminToken, Object.assign({ client_project: 'VMC', benefit_type: 'SB', bank_status: 'CREDITED TO BDO', date_credited: '2026-01-12', amount_credited: row.amount_to_release }, row));
    assert.strictEqual(r.ok, true);
  }
  const chkGrp = gas.apiGetCheckGroup(hrToken, '2000001089');
  assert.strictEqual(chkGrp.ok, true);
  assert.strictEqual(chkGrp.data.count, 2);
  assert.strictEqual(chkGrp.data.total_approved_amount, 4950);
  console.log('PASS: Consolidated check grouping');

  // 5. Insurance Company vs Employee Expense & Disallowance
  const insComp = gas.apiSaveInsurance(hrToken, {
    employee_name: 'JOPLO, HARRY',
    date_of_accident: '2026-01-10',
    accident_type: 'WORK-RELATED',
    expense_bearer: 'COMPANY EXPENSE',
    client_assigned: 'VMC',
    insurance_ref_no: 'SIIP-ANHDA-26E00262',
    amount_released: 2286,
    date_of_submission: '2026-01-15',
    amount_reimbursed: 1886,
    disallowance_reason: 'not covered med cert 400'
  });
  assert.strictEqual(insComp.ok, true);
  assert.strictEqual(insComp.data.record.check_required, false);
  assert.strictEqual(insComp.data.record.balance_variance, 400);

  const insEmp = gas.apiSaveInsurance(hrToken, {
    employee_name: 'TOGONON, ANTONIETO',
    expense_bearer: 'EMPLOYEE EXPENSE',
    client_assigned: 'VMC',
    insurance_ref_no: 'SIIP-ANHDA-26E02847',
    amount_released: 2091.11,
    date_of_submission: '2026-06-01',
    amount_reimbursed: 2091.11
  });
  assert.strictEqual(insEmp.ok, true);
  assert.strictEqual(insEmp.data.record.check_required, true);
  console.log('PASS: Insurance expense bearer & disallowance computation');

  // 6. Legacy Multi-Section CSV Importer (2026 + 2025 + Insurance with real edge cases)
  const legacyCsv = [
    ',,SSS SICKNESS AND MATERNITY AVAILMENT MONITORING REPORT,,,,,,,,,SB- SICKNESS BENEFIT,,EC-EMPLOYEE COMPENSATION,,,,',
    'DATE,Employer ERID,Claim Ref No.,SS Number,NAME ,Confinement Date,"DAYS\nAPPROVED",AMOUNT TO RELEASED,SICKNESS START,SICKNESS END,CLIENT,REMARKS,STATUS ,DATE CREDITED,"AMOUNT \nCREDITED",DATE OF CHECK,AMOUNT, CHECK #',
    '2026-01-01,2026-01-01,2026-01-01,2026-01-01,2026-01-01,2026-01-01,2026-01-01,2026-01-01,2026-01-01,2026-01-01,,SB,CREDITED TO PNB,2026-01-01,2026-01-01,2026-01-01,2026-01-01,2026-01-01',
    '2026-07-22,06-1758925-7-000,SNEW2802026060906032,07-3426168-1,"DOLOROSA, BENNY R. - 1",2026-06-03,7,4200,2026-06-03,2026-06-09,VMC,SB,CREDITED TO BDO,2026-07-24,4200,20265-07-13,4200,2000001217',
    '2026-10-28,06-1758925-7-000,SNEW2462026060382072,07-1316879-2,"TOREMA JR, FELIX C.",2026-05-28,11,6242.5,2026-05-25,06/072026,VMC,SB,,,,,,',
    '2026-03-06,06-1758925-7-000,SNEW5392026012751441,07-3156428-4,"ALABAN, JOJIT J.",2026-01-23,15,8850,2026-01-23,2026-02-23,VMC,SB,CREDITED TO BDO,2026-03-10,8850,2026-04-01,3447.5,2000001100',
    '2025-12-20,06-1758925-7-000,SNEW2892025112828839,07-1233178-2,"PELINGON, RAMON G.",2025-10-24,30,16875,2025-10-24,2025-11-24,VMC,SB,CREDITED TO BDO,,,2026-01-13,16875,2000001073',
    'DATE,Employer ERID,Claim Ref No.,SS Number,NAME ,PROJECT,SICKNESS START,SICKNESS END,"# OF DAY\nAPPROVED",AMOUNT,REMARKS,STATUS ,DATE CREDITED,"AMOUNT \nCREDITED",DATE OF CHECK,AMOUNT 2, CHECK #',
    '2025-02-03,06-1758925-7-000,SNEW9112025020341495,0716364140,"Torno  Sr., Ronnie Pilado",vmc,2025-01-31,2025-02-06,7,4077.5,SB,CREDITED TO PNB,02/250,4077.5,2025-02-17,4077.5,2362815857',
    '2025-12-20,06-1758925-7-000,SNEW2892025112828839,07-1233178-2,"PELINGON, RAMON G.",VMC,2025-10-24,2025-11-24,30,16875,SB,CREDITED TO METRO BANK,,,2026-01-13,16875,2000001073',
    ',END OF 2025,END OF 2025,END OF 2025,END OF 2025,,END OF 2025,,,,,,END OF 2025,END OF 2025,END OF 2025,,',
    'INSURANCE / ACCIDENT MONITORING,,,,,,,,,,,,,,,,,,',
    'NO.,NAME,DATE OF ACCIDENT,ACCIDENT TYPE,Column 15,CLIENT ASSIGNED,AMOUNT RELEASED,"DATE OF \nSUBMISION",REIMBURSED DATE,REIMBURSED,Column 19,REMARKS,STATUS,"DATE\nCREDITED","AMOUNT\nCREDITED","DATE OF \nCHECK",AMOUNT, CHECK #,status ',
    ',,,,,,,,,,0,,,,,,,,',
    '1,"DAVID, JO-R S.",3.20.25,WORK-RELATED,COMPANY EXPENSE,VMC,1406.5,5.9.2025,1406,1406.5,0,SIIP-ANHDA-25E02049,,,,,,,',
    '27,"MACION,DEXTER PAUL",,WORK-RELATED,COMPANY EXPENSE,SAWO,1111,,,1411,-300,SIIP-ANHDA-26E01249,CREDIT TO MB,2026-03-23,1411,N/A,N/A,N/A,done',
    '11,,,,,,,,,,0,,,,,,,,'
  ].join('\n');

  const sssPrev = gas.apiPreviewImport(hrToken, { targetModule: 'SSS', csvText: legacyCsv });
  assert.strictEqual(sssPrev.ok, true, sssPrev.error);
  assert.strictEqual(sssPrev.data.parsedRowsCount, 6);
  // Check DOLOROSA sequence extraction & 20265 typo detection
  const dolorosa = sssPrev.data.previewRows.find(r => r.record.claim_ref_no === 'SNEW2802026060906032');
  assert.strictEqual(dolorosa.record.employee_name, 'DOLOROSA, BENNY R.');
  assert.strictEqual(dolorosa.record.claim_sequence, '1');
  assert.ok(dolorosa.anomalies.some(a => a.code === 'DATE_TYPO'));
  // Check PELINGON duplicate detection
  const dupPelingon = sssPrev.data.previewRows.filter(r => r.record.claim_ref_no === 'SNEW2892025112828839');
  assert.strictEqual(dupPelingon.length, 2);
  assert.ok(dupPelingon[1].anomalies.some(a => a.code === 'DUPLICATE_CLAIM_REF'));
  assert.strictEqual(dupPelingon[1].skipImport, true);
  // Check ALABAN variance 5402.5
  const alaban = sssPrev.data.previewRows.find(r => r.record.claim_ref_no === 'SNEW5392026012751441');
  assert.strictEqual(alaban.record.check_variance, 5402.5);

  const sssCommit = gas.apiCommitImport(hrToken, { targetModule: 'SSS', rows: sssPrev.data.previewRows });
  assert.strictEqual(sssCommit.ok, true);
  assert.strictEqual(sssCommit.data.importedCount, 5);
  assert.strictEqual(sssCommit.data.skippedDuplicatesCount, 1);

  const insPrev = gas.apiPreviewImport(hrToken, { targetModule: 'INSURANCE', csvText: legacyCsv });
  assert.strictEqual(insPrev.ok, true);
  assert.strictEqual(insPrev.data.parsedRowsCount, 2, 'Should skip empty/zero/trailing numbered rows');
  const david = insPrev.data.previewRows[0];
  assert.strictEqual(david.record.insurance_ref_no, 'SIIP-ANHDA-25E02049');
  assert.strictEqual(david.record.date_of_accident, '2025-03-20');
  assert.ok(david.anomalies.some(a => a.code === 'DATE_TYPO'), 'Should flag 1406 in reimbursed_date');
  const macion = insPrev.data.previewRows[1];
  assert.strictEqual(macion.record.balance_variance, -300);
  assert.strictEqual(macion.record.bank_status, 'CREDITED TO METROBANK');

  const insCommit = gas.apiCommitImport(hrToken, { targetModule: 'INSURANCE', rows: insPrev.data.previewRows });
  assert.strictEqual(insCommit.ok, true);
  assert.strictEqual(insCommit.data.importedCount, 2);
  console.log('PASS: Legacy multi-section CSV importer & anomaly flagging');

  // 7. Dashboard, Cross-Module Employee Lookup, Audit, CSV Export & Zero Raw Dates
  const dash = gas.apiGetDashboard(adminToken, {});
  assert.strictEqual(dash.ok, true);
  assert.ok(dash.data.sss.totalClaims >= 8);
  assert.ok(dash.data.insurance.totalClaims >= 4);

  // Add JOPLO to SSS so Employee Lookup finds JOPLO in both SSS & Insurance
  gas.apiSaveSss(hrToken, {
    filing_date: '2026-01-16',
    claim_ref_no: 'SNEW3832025121986268',
    ss_number: '33-4602312-0',
    employee_name: 'JOPLO, HARRY F.',
    client_project: 'VMC',
    benefit_type: 'SB',
    sickness_start: '2025-12-01',
    sickness_end: '2025-12-05',
    days_approved: 5,
    amount_to_release: 2950
  });
  const empHist = gas.apiEmployeeHistory(adminToken, 'JOPLO');
  assert.strictEqual(empHist.ok, true);
  assert.ok(empHist.data.totalMatches >= 1);

  const csvExp = gas.apiExportCsv(adminToken, { moduleName: 'SSS', filters: {} });
  assert.strictEqual(csvExp.ok, true);
  assert.ok(csvExp.data.csvContent.includes('Claim Ref No.'));

  const audit = gas.apiListAuditLogs(adminToken, { page: 1, pageSize: 5 });
  assert.strictEqual(audit.ok, true);
  assert.ok(audit.data.items.length === 5);
  assert.ok(audit.data.pagination.totalItems >= 5);

  const boot = gas.apiBootstrap(adminToken);
  assert.strictEqual(boot.ok, true);

  // 8. Server-side Pagination, Single-Record Fetch, Caching & Invalidation, Pure-JS Date, and Login Payload
  assert.ok(loginRes.data.masters && loginRes.data.masters.items.length > 0, 'apiLogin must include masters');
  assert.ok(loginRes.data.config && loginRes.data.config.appName, 'apiLogin must include config');

  // Pure-JS UTC+8 formatDateManila_ check (2026-06-15T17:00:00Z = 2026-06-16 01:00+08:00)
  assert.strictEqual(gas.formatDateManila_(new Date('2026-06-15T17:00:00Z')), '2026-06-16');

  const sssPage1 = gas.apiListSss(adminToken, { page: 1, pageSize: 5 });
  const sssPage2 = gas.apiListSss(adminToken, { page: 2, pageSize: 5 });
  assert.strictEqual(sssPage1.ok, true);
  assert.strictEqual(sssPage2.ok, true);
  assert.strictEqual(sssPage1.data.items.length, 5);
  assert.strictEqual(sssPage1.data.pagination.startRow, 1);
  assert.strictEqual(sssPage1.data.pagination.endRow, 5);
  assert.ok(sssPage1.data.pagination.totalItems >= 9);
  assert.strictEqual(sssPage1.data.totals.count, sssPage1.data.pagination.totalItems, 'totals must cover all filtered rows');
  assert.notStrictEqual(sssPage1.data.items[0].id, sssPage2.data.items[0].id);

  // Export CSV returns ALL rows even when pageSize < totalItems
  const csvLines = csvExp.data.csvContent.trim().split('\r\n');
  assert.strictEqual(csvLines.length - 1, sssPage1.data.pagination.totalItems);

  const insPage1 = gas.apiListInsurance(adminToken, { page: 1, pageSize: 5 });
  assert.strictEqual(insPage1.ok, true);
  assert.ok(insPage1.data.pagination.totalItems >= 4);

  const singleSss = gas.apiGetSssById(adminToken, sssPage1.data.items[0].id);
  assert.strictEqual(singleSss.ok, true);
  assert.strictEqual(singleSss.data.id, sssPage1.data.items[0].id);

  const singleIns = gas.apiGetInsuranceById(adminToken, insPage1.data.items[0].id);
  assert.strictEqual(singleIns.ok, true);
  assert.strictEqual(singleIns.data.id, insPage1.data.items[0].id);

  // Cache hit + automatic invalidation on save
  const prevTotal = sssPage1.data.pagination.totalItems;
  const newClaim = gas.apiSaveSss(hrToken, {
    filing_date: '2026-07-01',
    claim_ref_no: 'SNEW_CACHE_INVALIDATION_TEST',
    ss_number: '07-9999999-1',
    employee_name: 'CACHE TEST, USER',
    client_project: 'VMC',
    benefit_type: 'SB',
    sickness_start: '2026-06-20',
    sickness_end: '2026-06-25',
    days_approved: 5,
    amount_to_release: 2500
  });
  assert.strictEqual(newClaim.ok, true);
  const afterSave = gas.apiListSss(adminToken, { page: 1, pageSize: 5 });
  assert.strictEqual(afterSave.data.pagination.totalItems, prevTotal + 1, 'Cache must invalidate immediately on write');

  assertNoRawDates([dash, empHist, csvExp, audit, boot, chkGrp, sssPrev, insPrev, sssPage1, insPage1, singleSss, singleIns]);
  console.log('PASS: Dashboard, Employee Lookup, Pagination, Cache Invalidation, Audit Logs, CSV Export, and zero raw Date instances');
  console.log('\nALL TESTS PASSED!');
}

runTests();
