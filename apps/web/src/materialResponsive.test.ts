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
    expect(styles).toMatch(/\.app-shell:not\(\.pentest-shell\)\s*\{[^}]*overflow-x\s*:\s*hidden/s);
  });

  it('keeps the material canvas fluid on 2K and 4K displays', () => {
    expect(styles).toContain('@media (min-width:2400px)');
    expect(styles).toContain('@media (min-width:3200px)');
    expect(styles).toMatch(/\.app-content:not\(\.pentest-content\) \.page\s*\{[^}]*max-width\s*:\s*2800px/s);
  });

  it('keeps pentest pages outside the material responsive rules', () => {
    expect(styles).toMatch(/\.pentest-shell\s*\{[^}]*min-width\s*:\s*1920px/s);
    expect(styles).toMatch(/\.app-shell:not\(\.pentest-shell\) \.app-sider\s*\{/s);
    expect(styles).toMatch(/\.app-content:not\(\.pentest-content\) \.metric-grid\s*\{/s);
  });

  it('keeps the vulnerability drawer inside the visible viewport', () => {
    expect(styles).toMatch(/\.material-vulnerability-drawer \.ant-drawer-content\{[^}]*height\s*:\s*100dvh[^}]*max-height\s*:\s*100dvh/s);
    expect(styles).toMatch(/\.material-vulnerability-drawer \.detail-drawer\{[^}]*height\s*:\s*100%[^}]*min-height\s*:\s*0[^}]*grid-template-rows\s*:\s*auto minmax\(0,1fr\) auto/s);
    expect(styles).toMatch(/\.material-drawer-scroll\{[^}]*overflow-y\s*:\s*auto/s);
    expect(styles).toMatch(/\.material-drawer-footer\{[^}]*position\s*:\s*relative/s);
    expect(styles).not.toMatch(/\.material-vulnerability-drawer \.detail-drawer\{[^}]*min-height\s*:\s*720px/s);
  });
});
