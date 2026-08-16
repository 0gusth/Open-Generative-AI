/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./app/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./packages/studio/src/**/*.{js,jsx}",
        "./packages/Open-AI-Design-Agent/packages/design-agent/src/**/*.{js,jsx}",
        "./packages/Open-Poe-AI/packages/agents/src/**/*.{js,jsx,ts,tsx}",
        "./packages/Vibe-Workflow/packages/workflow-builder/src/**/*.{js,jsx,ts,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Apple HIG dark palette — system blue accent, layered elevated grays
                // Monochrome accent — near-white; the single blue lives only on
                // primary actions and selection, applied explicitly as #0A84FF
                primary: {
                    DEFAULT: '#F5F5F7',
                    hover: '#FFFFFF',
                },
                'app-bg': '#0f0f10',
                'panel-bg': '#171719',
                'card-bg': '#212123',
                secondary: '#98989d',
                muted: '#636366',
                // Semantic colors remapped to Apple system palette (dark variants)
                red: { 300: '#FF8A80', 400: '#FF6961', 500: '#FF453A', 600: '#E03B31' },
                rose: { 300: '#FF8A80', 400: '#FF6961', 500: '#FF453A', 600: '#E03B31' },
                green: { 300: '#7CE495', 400: '#30DB5B', 500: '#30D158', 600: '#28B34B' },
                emerald: { 300: '#7CE495', 400: '#30DB5B', 500: '#30D158', 600: '#28B34B' },
                yellow: { 300: '#FFE04B', 400: '#FFD60A', 500: '#FFD60A', 600: '#D9B609' },
                amber: { 300: '#FFE04B', 400: '#FFD60A', 500: '#FFD60A', 600: '#D9B609' },
                orange: { 300: '#FFB340', 400: '#FF9F0A', 500: '#FF9F0A', 600: '#D98708' },
            },
            fontFamily: {
                // SF Pro on Apple devices via the system stack
                sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', 'system-ui', 'sans-serif'],
            },
            borderRadius: {
                'xl': '0.75rem',
                '2xl': '1rem',
                '3xl': '1.25rem',
            },
            boxShadow: {
                // Soft elevation instead of neon glow
                'glow': '0 8px 24px rgba(0, 0, 0, 0.35), 0 0 0 0.5px rgba(255, 255, 255, 0.08)',
                'glow-accent': '0 8px 24px rgba(10, 132, 255, 0.25)',
                '3xl': '0 20px 50px -12px rgba(0, 0, 0, 0.55)',
            },
            transitionTimingFunction: {
                // Apple sheet/navigation curve — fast start, long soft landing
                'apple': 'cubic-bezier(0.32, 0.72, 0, 1)',
                // Ease-out-quint for entrances
                'out-quint': 'cubic-bezier(0.22, 1, 0.36, 1)',
            },
            transitionDuration: {
                '250': '250ms',
                '350': '350ms',
            }
        },
    },
    plugins: [],
}
