import '@testing-library/jest-dom/vitest';
import { message } from 'antd';
import { afterEach } from 'vitest';

afterEach(() => {
  message.destroy();
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

const getComputedStyle = window.getComputedStyle.bind(window);
Object.defineProperty(window, 'getComputedStyle', {
  value: (element: Element) => getComputedStyle(element),
});
