
import { useEffect, useRef, memo } from 'react';

/**
 * WitcherRunes Component
 * Renders a falling "Matrix Rain" effect using Rune-like characters.
 * Sits between background image and glass UI.
 * Active in both dark and light modes with adapted colors.
 */
export const WitcherRunes = memo(({ isDark }: { isDark: boolean }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Fix #39: Respect prefers-reduced-motion
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Configuration - subtle background effect
        const fontSize = 14;
        let columns = 0;
        let drops: number[] = [];

        // Runes Alphabet (Elder Futhark + Math symbols for "magical" look)
        const alphabet = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ∑∏∆∇∈∞∫∬∭∮";

        // Theme-aware colors - subtle for both themes
        const trailColor = isDark ? 'rgba(0, 10, 0, 0.06)' : 'rgba(255, 255, 255, 0.08)';
        const textColor = isDark ? '#4ade80' : '#047857';
        const glowColor = isDark ? '#00ff41' : '#059669';

        const resize = () => {
            if (canvas && containerRef.current) {
                canvas.width = containerRef.current.offsetWidth;
                canvas.height = containerRef.current.offsetHeight;

                columns = Math.floor(canvas.width / fontSize);
                if (drops.length !== columns) {
                   drops = new Array(columns).fill(1);
                }
            }
        };

        // Initial resize
        resize();
        window.addEventListener('resize', resize);

        // Drawing Loop
        const draw = () => {
            ctx.fillStyle = trailColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = textColor;
            ctx.font = `bold ${fontSize}px 'JetBrains Mono', monospace`;
            ctx.shadowBlur = isDark ? 2 : 3;
            ctx.shadowColor = glowColor;

            for (let i = 0; i < drops.length; i++) {
                const text = alphabet.charAt(Math.floor(Math.random() * alphabet.length));
                const x = i * fontSize;
                const y = drops[i] * fontSize;

                ctx.fillText(text, x, y);

                if (y > canvas.height && Math.random() > 0.975) {
                    drops[i] = 0;
                }

                drops[i]++;
            }
        };

        // Throttle to ~14fps (70ms interval) for subtle background — saves CPU
        const intervalId = setInterval(draw, 70);

        // Fix #39: Apply will-change for GPU compositing
        canvas.style.willChange = 'transform';

        return () => {
            clearInterval(intervalId);
            canvas.style.willChange = 'auto'; // Clean up will-change
            window.removeEventListener('resize', resize);
        };
    }, [isDark]);

    return (
        <div
            ref={containerRef}
            className={`absolute inset-0 pointer-events-none overflow-hidden z-0 transition-[opacity] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                isDark ? 'opacity-[0.15] mix-blend-screen' : 'opacity-[0.25]'
            }`}
        >
            <canvas ref={canvasRef} className="block w-full h-full" />
        </div>
    );
});

WitcherRunes.displayName = 'WitcherRunes';
