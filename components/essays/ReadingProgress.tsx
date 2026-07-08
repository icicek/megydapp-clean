//components/essays/ReadingProgress.tsx

"use client";

import { useEffect, useState } from "react";

export default function ReadingProgress() {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const updateProgress = () => {
            const scrollTop = window.scrollY;
            const docHeight =
                document.documentElement.scrollHeight - window.innerHeight;

            if (docHeight <= 0) {
                setProgress(0);
                return;
            }

            setProgress((scrollTop / docHeight) * 100);
        };

        updateProgress();

        window.addEventListener("scroll", updateProgress, { passive: true });
        window.addEventListener("resize", updateProgress);

        return () => {
            window.removeEventListener("scroll", updateProgress);
            window.removeEventListener("resize", updateProgress);
        };
    }, []);

    return (
        <div className="fixed left-0 top-0 z-[100] h-[2px] w-full bg-transparent">
            <div
                className="h-full bg-cyan-300 transition-[width] duration-150 ease-out"
                style={{ width: `${progress}%` }}
            />
        </div>
    );
}