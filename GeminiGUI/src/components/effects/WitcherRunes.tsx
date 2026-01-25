
import { useEffect, useRef, memo } from 'react';

/**
 * WitcherRunes Component
 * Renders a falling "Matrix Rain" effect using Rune-like characters.
 * Sit between background image and glass UI.
 */
export const WitcherRunes = memo(({ isDark }: { isDark: boolean }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isDark) return; // Only active in dark mode

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Configuration
        const fontSize = 16;
        let columns = 0;
        let drops: number[] = [];

        // Runes Alphabet (Elder Futhark + Math symbols for "magical" look)
        // ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ
        // ∑∏∆∇∈∉∋∌∎∏∐∑−∓∔∕∖∗∘∙√∛∜∝∞∟∠∡∢∣∤∥∦∧∨∩∪∫∬∭∮∯∰∱∲∳∴∵
        const alphabet = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ∑∏∆∇∈∞∫∬∭∮";
        
        const resize = () => {
            if (canvas && containerRef.current) {
                canvas.width = containerRef.current.offsetWidth;
                canvas.height = containerRef.current.offsetHeight;
                
                columns = Math.floor(canvas.width / fontSize);
                // Reset drops if width changed significantly or init
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
            // Semi-transparent black to create trails
            // Use lighter alpha for "clearer" text (less smear)
            ctx.fillStyle = 'rgba(0, 10, 0, 0.08)'; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Text settings
            ctx.fillStyle = '#4ade80'; // Tailwind green-400 (Bright Neon Green/Cyan mix)
            ctx.font = `bold ${fontSize}px 'JetBrains Mono', monospace`;
            ctx.shadowBlur = 4;
            ctx.shadowColor = '#00ff41'; // Glow effect

            for (let i = 0; i < drops.length; i++) {
                // Pick random char
                const text = alphabet.charAt(Math.floor(Math.random() * alphabet.length));
                
                // Draw
                // x = column index * font size
                // y = drop value * font size
                const x = i * fontSize;
                const y = drops[i] * fontSize;

                ctx.fillText(text, x, y);

                // Sending drop back to top randomly after it has crossed screen
                // Adding randomness to drop reset to scatter them
                if (y > canvas.height && Math.random() > 0.975) {
                    drops[i] = 0;
                }

                // Increment y coordinate
                drops[i]++;
            }
        };

        // Animation Loop
        const intervalId = setInterval(draw, 45); // ~20fps for classic feel

        return () => {
            clearInterval(intervalId);
            window.removeEventListener('resize', resize);
        };
    }, [isDark]);

    if (!isDark) return null;

    return (
        <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden z-0 opacity-25 mix-blend-screen">
             <canvas ref={canvasRef} className="block w-full h-full" />
        </div>
    );
});

WitcherRunes.displayName = 'WitcherRunes';
