/**
 * Central application configuration, schemas, RBAC permissions, and seed master lists.
 */
var APP_CONFIG = {
  APP_NAME: 'SSS & Insurance Monitoring System',
  TIMEZONE: 'Asia/Manila',
  CURRENCY: 'PHP',
  DEFAULT_ERID: '06-1758925-7-000',
  ASSETS: {
    LOGIN_BG_ID: '1NjfV_WCfL7DIEaWHc8TRg_3wrtSlRR3_',
    LOGO_ID: '1GmQnR0ClM6Jv5rLrFVEMsJC4U6Mx_FUU'
  },
  SESSION_TTL_SECONDS: 21600, // 6 hours (CacheService max)
  AGING_THRESHOLDS: {
    BANK_CREDIT_DAYS: 30,
    CHECK_ISSUE_DAYS: 14
  },
  SHEETS: {
    SSS: 'DB_SSS_Claims',
    INSURANCE: 'DB_Insurance_Claims',
    MASTERS: 'DB_Master_Lists',
    USERS: 'DB_Users',
    AUDIT: 'DB_Audit_Log'
  },
  COLUMNS: {
    DB_SSS_Claims: [
      'id', 'year', 'filing_date', 'employer_erid', 'claim_ref_no', 'ss_number',
      'employee_name', 'claim_sequence', 'client_project', 'benefit_type',
      'confinement_date', 'sickness_start', 'sickness_end', 'days_approved',
      'amount_to_release', 'hr_remarks', 'bank_status', 'date_credited',
      'amount_credited', 'bank_variance', 'bank_notes', 'date_of_check',
      'check_amount', 'check_no', 'check_variance', 'variance_reason',
      'check_notes', 'workflow_stage', 'is_advanced', 'created_by',
      'created_at', 'updated_by', 'updated_at', 'is_deleted'
    ],
    DB_Insurance_Claims: [
      'id', 'seq_no', 'year', 'employee_name', 'date_of_accident',
      'accident_type', 'expense_bearer', 'client_assigned', 'insurance_ref_no',
      'amount_released', 'date_of_submission', 'reimbursed_date',
      'amount_reimbursed', 'balance_variance', 'disallowance_reason',
      'hr_remarks', 'bank_status', 'date_credited', 'amount_credited',
      'bank_notes', 'check_required', 'date_of_check', 'check_amount',
      'check_no', 'final_status', 'check_notes', 'workflow_stage',
      'created_by', 'created_at', 'updated_by', 'updated_at', 'is_deleted'
    ],
    DB_Master_Lists: [
      'id', 'category', 'code', 'label', 'is_active', 'updated_at'
    ],
    DB_Users: [
      'user_id', 'username', 'full_name', 'email', 'role',
      'password_hash', 'salt', 'must_change_password', 'is_active',
      'created_at', 'last_login', 'photo_data'
    ],
    DB_Audit_Log: [
      'log_id', 'timestamp', 'actor_username', 'actor_role', 'module',
      'record_id', 'action', 'changed_fields_json', 'summary'
    ]
  },
  PLAIN_TEXT_COLUMNS: {
    DB_SSS_Claims: ['id', 'employer_erid', 'claim_ref_no', 'ss_number', 'check_no'],
    DB_Insurance_Claims: ['id', 'seq_no', 'insurance_ref_no', 'check_no']
  },
  CURRENCY_COLUMNS: {
    DB_SSS_Claims: ['amount_to_release', 'amount_credited', 'bank_variance', 'check_amount', 'check_variance'],
    DB_Insurance_Claims: ['amount_released', 'amount_reimbursed', 'balance_variance', 'amount_credited', 'check_amount']
  },
  DATE_COLUMNS: {
    DB_SSS_Claims: ['filing_date', 'confinement_date', 'sickness_start', 'sickness_end', 'date_credited', 'date_of_check'],
    DB_Insurance_Claims: ['date_of_accident', 'date_of_submission', 'reimbursed_date', 'date_credited', 'date_of_check']
  },
  ROLES: {
    ADMIN: 'ADMIN',
    HR: 'HR',
    BANK_ACCOUNTING: 'BANK_ACCOUNTING',
    CHECK_ISSUANCE: 'CHECK_ISSUANCE',
    VIEWER: 'VIEWER'
  },
  ROLE_LABELS: {
    ADMIN: 'System Admin',
    HR: 'HR Department',
    BANK_ACCOUNTING: 'Bank Accounting',
    CHECK_ISSUANCE: 'Check Issuance',
    VIEWER: 'Viewer (Read-Only)'
  },
  ROLE_WRITABLE_FIELDS: {
    SSS: {
      HR: [
        'filing_date', 'employer_erid', 'claim_ref_no', 'ss_number',
        'employee_name', 'claim_sequence', 'client_project', 'benefit_type',
        'confinement_date', 'sickness_start', 'sickness_end', 'days_approved',
        'amount_to_release', 'hr_remarks'
      ],
      BANK_ACCOUNTING: [
        'bank_status', 'date_credited', 'amount_credited', 'bank_notes'
      ],
      CHECK_ISSUANCE: [
        'date_of_check', 'check_amount', 'check_no', 'variance_reason', 'check_notes'
      ],
      ADMIN: [
        'filing_date', 'employer_erid', 'claim_ref_no', 'ss_number',
        'employee_name', 'claim_sequence', 'client_project', 'benefit_type',
        'confinement_date', 'sickness_start', 'sickness_end', 'days_approved',
        'amount_to_release', 'hr_remarks',
        'bank_status', 'date_credited', 'amount_credited', 'bank_notes',
        'date_of_check', 'check_amount', 'check_no', 'variance_reason', 'check_notes'
      ],
      VIEWER: []
    },
    INSURANCE: {
      HR: [
        'seq_no', 'employee_name', 'date_of_accident', 'accident_type',
        'expense_bearer', 'client_assigned', 'insurance_ref_no',
        'amount_released', 'date_of_submission', 'reimbursed_date',
        'amount_reimbursed', 'disallowance_reason', 'hr_remarks'
      ],
      BANK_ACCOUNTING: [
        'bank_status', 'date_credited', 'amount_credited', 'bank_notes'
      ],
      CHECK_ISSUANCE: [
        'check_required', 'date_of_check', 'check_amount', 'check_no',
        'final_status', 'check_notes'
      ],
      ADMIN: [
        'seq_no', 'employee_name', 'date_of_accident', 'accident_type',
        'expense_bearer', 'client_assigned', 'insurance_ref_no',
        'amount_released', 'date_of_submission', 'reimbursed_date',
        'amount_reimbursed', 'disallowance_reason', 'hr_remarks',
        'bank_status', 'date_credited', 'amount_credited', 'bank_notes',
        'check_required', 'date_of_check', 'check_amount', 'check_no',
        'final_status', 'check_notes'
      ],
      VIEWER: []
    }
  },
  SEED_MASTERS: [
    // Clients / Projects
    { category: 'CLIENT', code: 'VMC', label: 'VMC' },
    { category: 'CLIENT', code: 'URC_LA_CARLOTA', label: 'URC - La Carlota' },
    { category: 'CLIENT', code: 'SARENCO', label: 'SARENCO' },
    { category: 'CLIENT', code: 'MPI', label: 'MPI' },
    { category: 'CLIENT', code: 'ECC', label: 'ECC' },
    { category: 'CLIENT', code: 'PSV', label: 'PSV' },
    { category: 'CLIENT', code: 'PSV_OFFICE', label: 'PSV OFFICE' },
    { category: 'CLIENT', code: 'EAUC', label: 'EAUC' },
    { category: 'CLIENT', code: 'SCII', label: 'SCII' },
    { category: 'CLIENT', code: 'SMC', label: 'SMC' },
    { category: 'CLIENT', code: 'HISUMCO', label: 'HISUMCO' },
    { category: 'CLIENT', code: 'SMYPC', label: 'SMYPC' },
    { category: 'CLIENT', code: 'MPC', label: 'MPC' },
    { category: 'CLIENT', code: 'GMC', label: 'GMC' },
    { category: 'CLIENT', code: 'UPPC', label: 'UPPC' },
    { category: 'CLIENT', code: 'HSPC', label: 'HSPC' },
    { category: 'CLIENT', code: 'SAWO', label: 'SAWO' },
    { category: 'CLIENT', code: 'PASSI', label: 'PASSI' },
    { category: 'CLIENT', code: 'LA_CARLOTA', label: 'LA CARLOTA' },
    // Banks
    { category: 'BANK', code: 'BDO', label: 'CREDITED TO BDO' },
    { category: 'BANK', code: 'PNB', label: 'CREDITED TO PNB' },
    { category: 'BANK', code: 'METROBANK', label: 'CREDITED TO METROBANK' },
    // Employer ERIDs
    { category: 'ERID', code: '06-1758925-7-000', label: '06-1758925-7-000' },
    // Benefit Types
    { category: 'BENEFIT_TYPE', code: 'SB', label: 'SB (Sickness Benefit)' },
    { category: 'BENEFIT_TYPE', code: 'MATERNITY', label: 'MATERNITY' },
    { category: 'BENEFIT_TYPE', code: 'EC', label: 'EC (Employee Compensation)' },
    // Accident Types
    { category: 'ACCIDENT_TYPE', code: 'WORK-RELATED', label: 'WORK-RELATED' },
    { category: 'ACCIDENT_TYPE', code: 'NON-WORK-RELATED', label: 'NON-WORK-RELATED' },
    // Expense Bearers
    { category: 'EXPENSE_BEARER', code: 'COMPANY EXPENSE', label: 'COMPANY EXPENSE' },
    { category: 'EXPENSE_BEARER', code: 'EMPLOYEE EXPENSE', label: 'EMPLOYEE EXPENSE' }
  ]
};
