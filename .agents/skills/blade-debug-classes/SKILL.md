---
name: blade-debug-classes
description: >-
  Use this skill whenever creating or editing Blade templates in PERTSERV HRIS to
  enforce concise, collision-free semantic debug class names placed first in class
  attributes so every view, section, table, form, and control is easy to inspect
  in DevTools.
---

# Blade Semantic Debug Classes

Add concise, predictable semantic class names to every Laravel Blade view, layout, and partial so DOM elements are immediately identifiable in browser DevTools without adding extra CSS overhead.

## Core Non-Negotiable Rules

1. **Semantic Class First**: Place the short lowercase `kebab-case` semantic class(es) at the **start** of the `class="..."` attribute, before Tailwind CSS v4 utility classes (for example, `class="page-header bg-white border-b border-slate-300 ..."`). For structural wrappers or items without styling utilities (`<li>`, wrapper `<div>`, `<form>`, `<div id="*-root">`), add `class="<semantic-class>"`.
2. **Keep Names Short & Flat (1–3 Words)**: Prefer concise names like `page-header`, `kpi-card`, `tbl-row`, `form-input`, `profile-hero` over verbose BEM chains.
3. **Zero Tailwind CSS v4 Utility Collisions**: Never use a built-in Tailwind v4 utility name as a debug class (otherwise Tailwind compiles unintended styles). Check the Collision Blocklist below before inventing new names.
4. **Zero Visual or Behavioral Side Effects**: Never remove or alter existing Tailwind layout/spacing/color utilities, `0px` corner rules (`no-border-radius-ui`), `id` attributes, or `data-*` JavaScript hooks (`blade-ui-jsx-logic`).
5. **Preserve Dynamic Blade Expressions**: Keep `@class` / inline PHP ternaries intact and prepend the static semantic class before them, adding `is-active` inside active state branches (e.g., `class="sidebar-nav-link {{ request()->routeIs(...) ? 'is-active px-5 ...' : 'px-6 ...' }}"`).

## Tailwind CSS v4 Collision Blocklist

Never use any of these bare names as semantic debug classes:

- `container`, `content`, `contents`
- `table`, `table-row`, `table-cell`, `table-caption`, `table-column`, `table-fixed`, `table-auto`
- `block`, `inline`, `flex`, `grid`, `hidden`, `visible`, `invisible`, `collapse`
- `border`, `outline`, `ring`, `shadow`, `truncate`

Use prefixed alternatives such as `tbl-wrap`, `tbl`, `tbl-head`, `tbl-head-row`, `tbl-th`, `tbl-body`, `tbl-row`, `tbl-td`, `panel`, `page-shell`, `form-group`.

## Shared Class Vocabulary

| Area | Standard Class Names |
| :--- | :--- |
| **`<body>` Page Tags** | `page-body` + view tag: `page-welcome`, `page-login`, `page-change-password`, `page-admin-dashboard`, `page-admin-users`, `page-admin-departments`, `page-admin-audit`, `page-admin-settings`, `page-admin-profile`, `page-hr-dashboard`, `page-hr-employees`, `page-hr-leave`, `page-hr-payroll`, `page-hr-recruitment`, `page-hr-profile`, `page-ess-dashboard`, `page-ess-leave`, `page-ess-payslips`, `page-ess-announcements`, `page-ess-profile` |
| **Portal Page Shell** | `page-shell`, `page-header`, `page-title-wrap`, `page-kicker`, `page-title`, `page-subtitle`, `page-actions`, `nav-link`, `logout-form`, `logout-btn`, `page-main`, `page-root` |
| **Sidebars** | `sidebar sidebar-admin` / `sidebar-hr` / `sidebar-ess`, `sidebar-top`, `sidebar-brand`, `sidebar-brand-link`, `sidebar-logo-box`, `sidebar-logo`, `sidebar-app-name`, `sidebar-portal-name`, `sidebar-nav`, `sidebar-nav-label`, `sidebar-nav-list`, `sidebar-nav-item`, `sidebar-nav-link` (+ `is-active`), `sidebar-footer`, `sidebar-user` (+ `is-active`), `sidebar-avatar`, `sidebar-avatar-img`, `sidebar-avatar-initials`, `sidebar-user-meta`, `sidebar-user-name`, `sidebar-user-role` |
| **Dashboards & Tables** | `kpi-grid`, `kpi-card`, `kpi-label`, `kpi-value`, `kpi-meta`, `dash-grid`, `dash-main`, `dash-side`, `panel`, `panel-head`, `panel-title`, `panel-subtitle`, `panel-badge`, `panel-list`, `panel-item`, `tbl-wrap`, `tbl`, `tbl-head`, `tbl-head-row`, `tbl-th`, `tbl-body`, `tbl-row`, `tbl-td`, `status-badge`, `quick-actions`, `action-list`, `action-btn`, `action-primary`, `action-secondary`, `emp-banner`, `emp-meta`, `emp-status`, `dept-item`, `dept-count`, `module-item`, `notice-item` |
| **Welcome Portal** | `portal-header`, `portal-header-inner`, `portal-brand`, `portal-logo`, `portal-brand-text`, `portal-app-name`, `portal-title`, `portal-auth-bar`, `portal-user-chip`, `portal-btn`, `portal-main`, `portal-intro`, `portal-heading`, `portal-subtitle`, `portal-grid`, `portal-card` (`portal-card-admin` / `portal-card-hr` / `portal-card-ess`), `portal-card-body`, `portal-badge`, `portal-card-title`, `portal-card-desc`, `portal-feature-list`, `portal-feature-item`, `portal-feature-dot`, `portal-card-foot`, `portal-card-cta`, `portal-card-locked`, `portal-footer`, `portal-footer-inner`, `portal-footer-links`, `portal-footer-link` |
| **Auth Views** | `auth-shell`, `auth-header`, `auth-header-inner`, `auth-brand`, `auth-logo`, `auth-brand-text`, `auth-app-name`, `auth-app-subtitle`, `auth-header-actions`, `auth-main`, `auth-card` (`auth-card-login` / `auth-card-password`), `auth-card-head`, `auth-card-logo-wrap`, `auth-card-logo`, `auth-badge`, `auth-title`, `auth-subtitle`, `auth-alert` (`auth-alert-success` / `auth-alert-warn` / `auth-alert-error`), `auth-form`, `password-group`, `password-toggle`, `remember-row`, `remember-label`, `remember-check`, `auth-submit`, `auth-footer`, `auth-footer-inner` |
| **Forms & Profile** | `form-group`, `form-label`, `form-input`, `form-textarea`, `form-hint`, `form-error`, `form-row-2`, `profile-wrap`, `profile-hero`, `profile-hero-row`, `profile-identity`, `profile-avatar`, `profile-avatar-img`, `profile-avatar-initials`, `profile-meta`, `profile-badges`, `profile-role-badge`, `profile-status-badge`, `profile-name`, `profile-username`, `profile-username-code`, `profile-note`, `profile-photo-actions`, `photo-input`, `photo-upload-btn`, `photo-edit-btn`, `photo-remove-btn`, `photo-editor`, `crop-panel`, `crop-label`, `crop-frame`, `crop-canvas`, `crop-controls`, `crop-control`, `crop-control-head`, `crop-value`, `crop-slider`, `crop-actions`, `crop-rotate-btn`, `crop-reset-btn`, `crop-save-btn`, `crop-cancel-btn`, `profile-grid`, `profile-account-card`, `profile-account-form`, `profile-contact-block`, `profile-section-label`, `profile-form-actions`, `profile-save-btn`, `profile-side`, `profile-password-card`, `profile-password-form`, `profile-password-btn`, `profile-201-card`, `profile-201-list`, `profile-201-row`, `profile-201-label`, `profile-201-value` |

## Separation from JavaScript Logic

- Use semantic classes strictly for DOM clarity and debugging in DevTools.
- Continue binding behavior in `resources/app/**/*.jsx` exclusively through `#*-root` IDs and `data-*` attributes per `blade-ui-jsx-logic`.

## Validation Steps

After editing any Blade view or adding new debug classes:

1. **Check for Tailwind collision class names** in `resources/views` (must return **no output**):
   ```powershell
   Get-ChildItem -Path resources\views -Recurse -Filter *.blade.php | Select-String -Pattern '\bclass="[^"]*\b(container|table-row|table-cell|table-caption|table-column|table-fixed|table-auto)\b'
   ```
2. **Rebuild assets and audit compiled CSS** to ensure none of our semantic debug classes generated unexpected Tailwind utility rules (must return **no output**):
   ```powershell
   npm run build
   Get-ChildItem -Path public\build\assets -Filter app-*.css | Select-String -Pattern '\.(page-|portal-|auth-|sidebar|kpi-|dash-|panel|tbl-|quick-actions|action-|profile-|photo-|crop-|emp-|dept-|module-|notice-|nav-link|logout-|is-active|status-badge|form-|password-|remember-)'
   ```
3. **Verify Blade compilation and `no-border-radius-ui` compliance**:
   ```powershell
   Get-ChildItem -Path resources\views,resources\js,resources\app -Recurse -Include *.blade.php,*.js,*.jsx,*.ts,*.tsx,*.css | Select-String -Pattern "\brounded\b|rounded-|border-radius" -CaseSensitive:$false
   php artisan view:cache
   php artisan view:clear
   ```
