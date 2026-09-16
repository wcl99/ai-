# Overview Scroll Layout Design

## Goal

Make `/overview` preserve the Figma component proportions without compressing the dashboard into one viewport. The page may scroll vertically, while its cards remain responsive to the available content width.

## Layout Contract

- The application content area owns vertical scrolling.
- The dashboard has natural document height and four explicit rows.
- Metric cards remain 122px high and feature cards remain 90px high on desktop.
- The main and bottom card rows remain 340px high on desktop.
- At narrower widths, grids may reduce their column count; card content must not be vertically compressed.
- Existing `/pentest` and `/pentest/session/:sessionId` layouts are out of scope.

## Risk Chart Contract

- The SVG coordinate system remains `471 x 226`.
- The chart fills its allocated content area at the `471 / 226` aspect ratio.
- The parent clips accidental paint overflow, but does not reduce the SVG height to the remaining viewport.
- The vertical ticks remain `100`, `75`, `50`, `25`, and `0`.
- Existing live trend data and tooltip titles remain unchanged.

## CSS Isolation

Add one final `/overview` contract after legacy dashboard rules. It must reset viewport-height constraints and compressed row rules using selectors scoped by `.dashboard-page.material-dashboard`. This avoids changing unrelated pages while making the final cascade deterministic.

## Verification

- A CSS contract test verifies vertical scrolling and natural dashboard height.
- Dashboard component tests verify the fixed SVG coordinate system and axis labels.
- Browser verification at `1569 x 912` confirms that the page scrolls and the trend chart remains inside its card.
