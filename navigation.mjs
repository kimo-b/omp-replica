export const products = ['zero', 'void', 'bay'];

export function productFromHash(hash) {
  const name = String(hash || '').replace(/^#/, '').toLowerCase();
  return products.includes(name) ? name : null;
}

export function initProductNavigation({ document, window }) {
  const tabs = products.map((name) => document.querySelector(`[data-product-tab="${name}"]`));
  const panels = products.map((name) => document.querySelector(`[data-product-panel="${name}"]`));
  const section = document.querySelector('#system');
  const links = [...document.querySelectorAll('[data-product-link]')];
  if (tabs.some((tab) => !tab) || panels.some((panel) => !panel) || !section) {
    throw new Error('Product navigation requires three tabs, panels, and the system section');
  }

  let active = 'zero';
  function select(name, { hash = false, focus = false, scroll = false } = {}) {
    if (!products.includes(name)) return false;
    active = name;
    products.forEach((product, index) => {
      const selected = product === name;
      tabs[index].setAttribute('aria-selected', String(selected));
      tabs[index].tabIndex = selected ? 0 : -1;
      panels[index].hidden = !selected;
    });
    links.forEach((link) => {
      if (link.dataset.productLink === name) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    if (hash && window.location.hash !== `#${name}`) {
      window.history.pushState(null, '', `#${name}`);
    }
    if (scroll) section.scrollIntoView({ behavior: 'auto', block: 'start' });
    if (focus) panels[products.indexOf(name)].focus({ preventScroll: true });
    return true;
  }

  function onHashChange() {
    const product = productFromHash(window.location.hash);
    if (product) select(product, { scroll: true });
  }

  const remove = [];
  tabs.forEach((tab, index) => {
    const name = products[index];
    const onClick = () => select(name, { hash: true });
    const onKeydown = (event) => {
      let targetIndex;
      if (event.key === 'ArrowRight') targetIndex = (index + 1) % products.length;
      if (event.key === 'ArrowLeft') targetIndex = (index + products.length - 1) % products.length;
      if (event.key === 'Home') targetIndex = 0;
      if (event.key === 'End') targetIndex = products.length - 1;
      if (targetIndex === undefined) return;
      event.preventDefault();
      tabs[targetIndex].focus();
      select(products[targetIndex], { hash: true });
    };
    tab.addEventListener('click', onClick);
    tab.addEventListener('keydown', onKeydown);
    remove.push(() => {
      tab.removeEventListener('click', onClick);
      tab.removeEventListener('keydown', onKeydown);
    });
  });

  links.forEach((link) => {
    const onClick = (event) => {
      event.preventDefault();
      select(link.dataset.productLink, { hash: true, focus: true, scroll: true });
    };
    link.addEventListener('click', onClick);
    remove.push(() => link.removeEventListener('click', onClick));
  });

  window.addEventListener('hashchange', onHashChange);
  window.addEventListener('popstate', onHashChange);
  const initial = productFromHash(window.location.hash);
  if (initial) select(initial, { scroll: true });
  else select(active);

  return {
    get active() { return active; },
    select,
    dispose() {
      remove.forEach((callback) => callback());
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onHashChange);
    },
  };
}
