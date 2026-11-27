---
name: minimal-svg-icons
description: >-
  Use this skill whenever adding, editing, or reviewing icons or SVGs in
  PERTSERV HRIS Blade views to enforce restrained, high-signal icon usage via
  <x-icon>, sharp geometric styling matching no-border-radius-ui, semantic
  debug classes (icon icon-<name>), and zero external CDNs or JSX SVG markup.
---

# Minimal Geometric SVG Icons (`<x-icon>`)

Use inline geometric SVGs sparingly to aid navigation and clarify high-signal actions—never as visual clutter.

## Icon Restraint Policy

1. **High-Signal Spots Only (Allowlist)**:
   - Sidebar navigation links (`<aside>` menus in Admin, HR, ESS)
   - Session & authentication triggers (`Sign In`, `Sign Out`, `Update Password`)
   - Portal directory hero cards (`welcome.blade.php`) and critical warning/alert banners (such as forced password updates)
   - Primary & destructive action buttons (`Upload New Photo`, `Edit Current Photo`, `Remove`, `Rotate 90°`, `Save Picture`, `Save Account Information`, and the single primary Quick Action CTA per dashboard)
2. **Forbidden Spots (Denylist — Never Add Icons Here)**:
   - KPI summary cards, table headers (`<th>`) or table cells (`<td>`), status badges
   - Form `<label>` elements or inside text `<input>` boxes
   - Secondary header links (`Portal Home`, `Admin`, `HR`, `ESS`, `Back to ...`), footer links, `Reset` / `Cancel` / secondary Quick Action buttons
   - Sidebar footer user profile cards, bullet lists, or Employee 201 `<dl>` summary rows
3. **Max 1 Icon per Control**: Never stack multiple icons inside a single button, link, or banner.

## `<x-icon>` Component Contract

- Always render icons through `resources/views/components/icon.blade.php` using `<x-icon name="..." size="sm|md|lg" />`.
- **Zero raw `<svg>` tags** directly inside page views, layouts, or partials—register any new needed icon inside `resources/views/components/icon.blade.php`.
- **Zero external icon CDNs** (no Bootstrap Icons CDN, Font Awesome CDN, or `unpkg`/`jsdelivr` links) so offline/intranet environments keep working.
- **Zero SVGs or HTML in `.jsx` files** (`blade-ui-jsx-logic`).
- **Sizes**:
  - `sm` -> `w-3.5 h-3.5` (inline buttons, header `Sign Out`)
  - `md` (default) -> `w-4 h-4` (sidebar links, alert banners, primary submit buttons)
  - `lg` -> `w-5 h-5` (Welcome portal directory cards)
- **Registered Icon Names**: `dashboard`, `users`, `user`, `building`, `clipboard-list`, `settings`, `clock`, `calendar`, `wallet`, `briefcase`, `receipt`, `megaphone`, `shield`, `login`, `logout`, `lock`, `alert`, `upload`, `crop`, `trash`, `rotate`, `check`, `plus`.

## Sharp Geometric SVG Spec & Debug Classes

Every icon rendered by `<x-icon>` must:

- Match `no-border-radius-ui` using sharp strokes (`viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="1.75"`, `stroke-linecap="square"`, `stroke-linejoin="miter"`, `aria-hidden="true"`).
- Carry semantic debug classes placed first (`icon icon-{{ $name }} {{ $sizeClass }} shrink-0`) per `blade-debug-classes`.

## Gotcha: Preserve Icons During JS Loading States

When JavaScript updates a button's loading label (for example `Signing In...` or `Saving Changes...`), assigning directly to `button.textContent = '...'` wipes out the child `<svg>`.

1. In Blade, wrap dynamic button text in `<span data-btn-label>...</span>`:
   ```html
   <button type="submit" data-submit-btn class="auth-submit inline-flex items-center justify-center gap-2 ...">
       <x-icon name="login" />
       <span data-btn-label>Sign In</span>
   </button>
   ```
2. In JS, update `(button.querySelector('[data-btn-label]') || button).textContent = label`.

## Validation Steps

After adding or updating icons:

1. **Confirm zero raw `<svg` outside the component** (must return **no output**):
   ```powershell
   Get-ChildItem -Path resources\views -Recurse -Filter *.blade.php | Where-Object { $_.FullName -notlike "*\components\icon.blade.php" } | Select-String -Pattern "<svg\b"
   ```
2. **Confirm zero external icon CDNs** (must return **no output**):
   ```powershell
   Get-ChildItem -Path resources\views -Recurse -Filter *.blade.php | Select-String -Pattern "bootstrap-icons|font-awesome|fontawesome|unpkg\.com|cdn\.jsdelivr"
   ```
3. **Rebuild assets and audit CSS + Blade compilation** (`npm run build`, audit `public/build/assets/app-*.css` for accidental `.icon` rules, `php artisan view:cache`, `php artisan view:clear`).
