# System Settings Figma Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all five system-settings tabs with the supplied Figma layouts while preserving existing settings behavior.

**Architecture:** Keep `ManagementSettingsPage` as the settings state owner and reuse Ant Design controls. Introduce only small shared render components for the Figma card headers and save footer, then express fidelity through the existing stylesheet.

**Tech Stack:** React, TypeScript, Ant Design, Vitest, Testing Library, CSS.

---

### Task 1: Lock the five-tab content contract

**Files:**
- Modify: `apps/web/src/pages/ManagementPages.test.tsx`
- Test: `apps/web/src/pages/ManagementPages.test.tsx`

- [ ] **Step 1: Write failing tests** asserting the five Figma tab labels, representative section headings, scenario credential table, rule list and module switches.
- [ ] **Step 2: Run tests to verify they fail** with `npm test -- ManagementPages.test.tsx` from `apps/web`.
- [ ] **Step 3: Implement the Figma-derived semantic structure** in `SystemSettingsPage.tsx` using existing state and Ant Design controls.
- [ ] **Step 4: Run the focused tests** and confirm they pass.

### Task 2: Match the component library and page geometry

**Files:**
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/e2e/responsive-layout.spec.ts`

- [ ] **Step 1: Add a failing layout assertion** for full-width settings content without overlap.
- [ ] **Step 2: Run the focused test and verify failure.**
- [ ] **Step 3: Apply the Figma component dimensions, spacing, colors, borders, controls and responsive constraints** without adding a dependency or rasterizing the page.
- [ ] **Step 4: Run the frontend unit tests and build.**

### Task 3: Visual verification

**Files:**
- No production files unless comparison reveals a mismatch.

- [ ] **Step 1: Start the local frontend.**
- [ ] **Step 2: Capture each settings tab at the design viewport.**
- [ ] **Step 3: Compare against all five Figma screenshots and correct visible spacing or overflow defects.**
- [ ] **Step 4: Re-run focused tests and build, then report remaining differences.**
