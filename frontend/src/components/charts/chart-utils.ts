export function hideTradingViewLogo(container: HTMLElement | null) {
  if (!container) return;
  const hide = () => {
    const logo = container.querySelector('#tv-attr-logo');
    if (logo) {
      (logo as HTMLElement).style.display = 'none';
    }
  };
  hide();
  setTimeout(hide, 100);
  setTimeout(hide, 500);
}
