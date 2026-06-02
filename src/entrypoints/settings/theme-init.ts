import { THEME_CACHE_KEY, CUSTOM_COLORS_CACHE_KEY } from '@/lib/constants';

// Synchronously apply the cached theme background before first visual paint
(function () {
    try {
        const theme = localStorage.getItem(THEME_CACHE_KEY) || 'dark-amber';
        const customColors = localStorage.getItem(CUSTOM_COLORS_CACHE_KEY);
        let bg = '#07070e';
        let fg = '#dde4f0';

        if (theme === 'light') {
            bg = '#f4f4f3';
            fg = '#2e3440';
        } else if (customColors) {
            const colors = JSON.parse(customColors);
            if (colors.background || colors.bg) {
                bg = colors.background || colors.bg;
            }
            if (colors.text) {
                fg = colors.text;
            }
        }
        document.documentElement.style.backgroundColor = bg;
        document.documentElement.style.color = fg;
    } catch (e) { }
})();
