# SSS & Insurance Monitoring System — Default Accounts

All seeded accounts below are created automatically on first load (without overwriting existing accounts or changed passwords). Every newly created account prompts the user to change their initial password on first sign-in.

---

## 1. System Admin (`ADMIN`)
- **Username:** `admin`
- **Initial Password:** `123123123` *(unchanged if you already updated it)*
- **Access:** Full access to all sections (HR, Bank Accounting, Check Issuance), claim creation & deletion, legacy imports, Master Lists, User Management, and Audit Logs.

## 2. HR Department (`HR`)
- **Username:** `hr.staff`
- **Initial Password:** `HrStaff@2026`
- **Access:** Create new SSS & Insurance claims, edit Section 1 (HR Filing & Claim Details), and run Legacy Imports. Bank Accounting and Check Issuance sections are locked.

## 3. Accounting — Bank & Check Combined (`ACCOUNTING`)
- **Username:** `accounting.staff`
- **Initial Password:** `Accounting@2026`
- **Access:** Edit both Section 2 (Assigned Bank Account Crediting) and Section 3 (Check Issuance / Final `DONE` Status). Section 1 (HR) is locked and cannot create new claims.

## 4. Bank Accounting Only (`BANK_ACCOUNTING`)
- **Username:** `bank.acctg`
- **Initial Password:** `BankAcctg@2026`
- **Access:** Edit Section 2 only (`Bank Status`, `Date Credited`, `Amount Credited`, `Bank Notes`). HR and Check Issuance sections are locked.

## 5. Check Issuance Only (`CHECK_ISSUANCE`)
- **Username:** `check.issuance`
- **Initial Password:** `CheckIssue@2026`
- **Access:** Edit Section 3 only (`Date of Check`, `Check Amount`, `Check #`, `Variance Reason`, `Check Required`, `Final Status`, `Check Notes`). HR and Bank Accounting sections are locked.

## 6. Management Viewer (`VIEWER`)
- **Username:** `viewer`
- **Initial Password:** `Viewer@2026`
- **Access:** Read-only access to the Dashboard, SSS & Insurance monitoring tables, Unified Employee Lookup, Audit Log, and CSV/Print exports.
