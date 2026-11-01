import { useEffect, useState } from 'react';
const pages = new Set(['home', 'tasks', 'focus', 'companion', 'settings', 'together', 'buddies', 'action-history']);
const currentPage = () => pages.has(location.hash.slice(1)) ? location.hash.slice(1) : 'together';
export function useAppNavigation() {
  const [page, setPage] = useState(currentPage);
  useEffect(() => {
    const sync = () => { setPage(currentPage()); window.scrollTo(0, 0); };
    window.addEventListener('popstate', sync); window.addEventListener('hashchange', sync);
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); };
  }, []);
  return { page, navigate(value) {
    if (!pages.has(value)) return;
    if (value !== page) history.pushState(null, '', '#' + value);
    setPage(value); window.scrollTo(0, 0);
  } };
}
