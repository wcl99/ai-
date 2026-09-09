import fs from 'node:fs';
import path from 'node:path';

const styles = fs.readFileSync(path.join(process.cwd(), 'src', 'styles.css'), 'utf8');

describe('material responsive layout', () => {
  it('does not lock the login or application shell to a 1920px canvas', () => {
    expect(styles).not.toMatch(/\.login-page\s*\{[^}]*min-width\s*:\s*1920px/s);
    expect(styles).not.toMatch(/\.app-shell\s*\{[^}]*min-width\s*:\s*1920px/s);
  });

  it('defines a compact desktop layout and fluid wide-screen container', () => {
    expect(styles).toContain('@media (max-width:1600px)');
    expect(styles).toMatch(/\.app-content-frame\s*\{[^}]*max-width\s*:\s*min\(/s);
    expect(styles).toMatch(/\.metric-grid-six\s*\{[^}]*repeat\(auto-fit,minmax\(/s);
  });

  it('keeps horizontal scrolling local to data tables', () => {
    expect(styles).toMatch(/\.app-content:not\(\.pentest-content\) \.data-card \.ant-table-wrapper\s*\{[^}]*overflow-x\s*:\s*auto/s);
    expect(styles).toMatch(/\.app-shell\s*\{[^}]*overflow-x\s*:\s*hidden/s);
  });

  it('keeps expanded sidebar navigation vertically scrollable', () => {
    expect(styles).toMatch(/\.app-shell \.app-sider>\.ant-layout-sider-children\s*\{[^}]*height\s*:\s*100%[^}]*display\s*:\s*flex[^}]*flex-direction\s*:\s*column[^}]*overflow\s*:\s*hidden/s);
    expect(styles).toMatch(/\.app-shell \.app-sider>\.ant-layout-sider-children>\.ant-menu\s*\{[^}]*flex\s*:\s*1 1 auto[^}]*overflow-y\s*:\s*auto[^}]*overscroll-behavior\s*:\s*contain/s);
  });

  it('aligns the nested vulnerability management title with sibling menu items', () => {
    expect(styles).toMatch(/\.app-sider \.ant-menu-sub \.ant-menu-submenu-title\s*\{[^}]*margin-inline\s*:\s*16px[^}]*padding-left\s*:\s*36px\s*!important/s);
  });

  it('keeps the management title aligned while retaining indentation for its child menu items', () => {
    expect(styles).toMatch(/\.app-sider \.ant-menu-root > \.ant-menu-submenu > \.ant-menu-sub > \.ant-menu-submenu > \.ant-menu-submenu-title\s*\{[^}]*padding-left\s*:\s*36px\s*!important/s);
    expect(styles).toMatch(/\.app-sider \.ant-menu-root > \.ant-menu-submenu > \.ant-menu-sub > \.ant-menu-submenu > \.ant-menu-sub > \.ant-menu-item\s*\{[^}]*padding-left\s*:\s*56px\s*!important/s);
  });

  it('keeps the material canvas fluid on 2K and 4K displays', () => {
    expect(styles).toContain('@media (min-width:2400px)');
    expect(styles).toContain('@media (min-width:3200px)');
    expect(styles).toMatch(/\.app-content:not\(\.pentest-content\) \.page\s*\{[^}]*max-width\s*:\s*2800px/s);
  });

  it('includes pentest pages in the shared responsive shell', () => {
    expect(styles).not.toMatch(/\.pentest-shell\s*\{/s);
    expect(styles).not.toMatch(/\.pentest-content\s*\{/s);
    expect(styles).toMatch(/\.app-shell \.app-sider\s*\{/s);
    expect(styles).toMatch(/\.app-content \.pentest-welcome,\.app-content \.execution-workbench\s*\{/s);
  });

  it('keeps the vulnerability drawer inside the visible viewport', () => {
    expect(styles).toMatch(/\.material-vulnerability-drawer \.ant-drawer-content\{[^}]*height\s*:\s*100dvh[^}]*max-height\s*:\s*100dvh/s);
    expect(styles).toMatch(/\.material-vulnerability-drawer \.detail-drawer\{[^}]*height\s*:\s*100%[^}]*min-height\s*:\s*0[^}]*grid-template-rows\s*:\s*auto minmax\(0,1fr\) auto/s);
    expect(styles).toMatch(/\.material-drawer-scroll\{[^}]*overflow-y\s*:\s*auto/s);
    expect(styles).toMatch(/\.material-drawer-footer\{[^}]*position\s*:\s*relative/s);
    expect(styles).not.toMatch(/\.material-vulnerability-drawer \.detail-drawer\{[^}]*min-height\s*:\s*720px/s);
  });

  it('matches the overview material typography and shared timeline axis', () => {
    expect(styles).toMatch(/\.overview-material-panel \.dashboard-summary-block strong\{[^}]*font-size\s*:\s*13px/s);
    expect(styles).toMatch(/\.overview-material-panel \.dashboard-summary-block ul\{[^}]*font-size\s*:\s*11px/s);
    expect(styles).toMatch(/\.overview-material-panel \.activity-timeline\{[^}]*--timeline-axis-x\s*:\s*calc\(1% \+ 10px\)/s);
    expect(styles).toMatch(/\.overview-material-panel \.activity-timeline::before\{[^}]*left\s*:\s*var\(--timeline-axis-x\)[^}]*transform\s*:\s*translateX\(-50%\)/s);
    expect(styles).toMatch(/\.overview-material-panel \.dashboard-summary-block ul\{font-size\s*:\s*11px/s);
  });

  it('lets the desktop overview scroll without compressing its Figma rows', () => {
    expect(styles).toMatch(/\.app-content:has\(\.dashboard-page\.material-dashboard\)\{[^}]*height\s*:\s*auto[^}]*overflow-y\s*:\s*auto/s);
    expect(styles).toMatch(/\.dashboard-page\.material-dashboard\{[^}]*height\s*:\s*auto[^}]*grid-template-rows\s*:\s*122px 90px 340px 340px[^}]*overflow\s*:\s*visible/s);
    expect(styles).toMatch(/\.material-dashboard \.dashboard-trend-card \.dashboard-risk-trend\{[^}]*aspect-ratio\s*:\s*471\s*\/\s*226[^}]*overflow\s*:\s*hidden/s);
  });
});
