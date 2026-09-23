import assert from 'node:assert/strict';
import test from 'node:test';
import { initProductNavigation, productFromHash } from '../navigation.mjs';

class Element {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.attributes = new Map();
    this.listeners = new Map();
    this.tabIndex = 0;
    this.hidden = false;
    this.focused = false;
    this.scrolled = false;
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(name, listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(listener);
  }
  removeEventListener(name, listener) { this.listeners.get(name)?.delete(listener); }
  dispatch(name, event = {}) { for (const listener of this.listeners.get(name) || []) listener(event); }
  focus() { this.focused = true; }
  scrollIntoView() { this.scrolled = true; }
}

function setup(hash = '') {
  const names = ['zero', 'void', 'bay'];
  const tabs = Object.fromEntries(names.map((name) => [name, new Element({ productTab: name })]));
  const panels = Object.fromEntries(names.map((name) => [name, new Element({ productPanel: name })]));
  const links = names.map((name) => new Element({ productLink: name }));
  const section = new Element();
  const document = {
    querySelector(selector) {
      if (selector === '#system') return section;
      const tab = selector.match(/^\[data-product-tab="(.+)"\]$/);
      const panel = selector.match(/^\[data-product-panel="(.+)"\]$/);
      return tab ? tabs[tab[1]] : panel ? panels[panel[1]] : null;
    },
    querySelectorAll(selector) { return selector === '[data-product-link]' ? links : []; },
  };
  const window = new Element();
  window.location = { hash };
  window.history = { pushState(_state, _title, value) { window.location.hash = value; } };
  const navigation = initProductNavigation({ document, window });
  return { tabs, panels, links, section, window, navigation };
}

test('only known product hashes select a panel', () => {
  assert.equal(productFromHash('#void'), 'void');
  assert.equal(productFromHash('#BAY'), 'bay');
  assert.equal(productFromHash('#approach'), null);
});

test('direct link and sidecar selection expose exactly one panel and update the hash', () => {
  const { tabs, panels, links, section, window, navigation } = setup('#void');
  assert.equal(navigation.active, 'void');
  assert.equal(panels.void.hidden, false);
  assert.equal(panels.zero.hidden, true);
  assert.equal(tabs.void.getAttribute('aria-selected'), 'true');
  assert.equal(section.scrolled, true);

  let prevented = false;
  links[2].dispatch('click', { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(window.location.hash, '#bay');
  assert.equal(navigation.active, 'bay');
  assert.equal(panels.bay.focused, true);
  assert.deepEqual(Object.values(panels).map((panel) => panel.hidden), [true, true, false]);
  assert.equal(links[2].getAttribute('aria-current'), 'page');
  assert.equal(links[1].getAttribute('aria-current'), null);
  navigation.dispose();
});

test('tab arrows, Home, End, and history restore selection', () => {
  const { tabs, panels, window, navigation } = setup();
  let prevented = 0;
  tabs.zero.dispatch('keydown', { key: 'ArrowRight', preventDefault() { prevented += 1; } });
  assert.equal(navigation.active, 'void');
  assert.equal(tabs.void.focused, true);
  assert.equal(window.location.hash, '#void');
  tabs.void.dispatch('keydown', { key: 'End', preventDefault() { prevented += 1; } });
  assert.equal(navigation.active, 'bay');
  tabs.bay.dispatch('keydown', { key: 'Home', preventDefault() { prevented += 1; } });
  assert.equal(navigation.active, 'zero');
  assert.equal(prevented, 3);
  window.location.hash = '#void';
  window.dispatch('popstate');
  assert.equal(navigation.active, 'void');
  assert.equal(panels.void.hidden, false);
  navigation.dispose();
  window.location.hash = '#bay';
  window.dispatch('popstate');
  assert.equal(navigation.active, 'void', 'disposed navigation no longer responds');
});
