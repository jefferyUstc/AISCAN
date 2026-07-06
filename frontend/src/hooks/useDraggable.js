import { useState, useRef, useCallback, useEffect } from "react";

export function useDraggable({ initialX = 16, initialY = 16, containerRef, dragThreshold = 5 } = {}) {
    const [position, setPosition] = useState({ x: initialX, y: initialY });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0, buttonX: 0, buttonY: 0 });
    const hasDraggedRef = useRef(false);

    const handleDragStart = useCallback((e) => {
        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

        dragStartRef.current = {
            x: clientX,
            y: clientY,
            buttonX: position.x,
            buttonY: position.y,
        };
        hasDraggedRef.current = false;
        setIsDragging(true);
    }, [position]);

    const handleDragMove = useCallback((e) => {
        if (!isDragging) return;

        const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

        const deltaX = clientX - dragStartRef.current.x;
        const deltaY = dragStartRef.current.y - clientY;

        if (Math.abs(deltaX) > dragThreshold || Math.abs(deltaY) > dragThreshold) {
            hasDraggedRef.current = true;
        }

        if (hasDraggedRef.current) {
            const canvasBounds = containerRef.current?.getBoundingClientRect();
            const maxX = canvasBounds ? canvasBounds.width - 160 : 400;
            const maxY = canvasBounds ? canvasBounds.height - 60 : 400;

            const newX = Math.max(12, Math.min(maxX, dragStartRef.current.buttonX + deltaX));
            const newY = Math.max(12, Math.min(maxY, dragStartRef.current.buttonY + deltaY));
            setPosition({ x: newX, y: newY });
        }
    }, [isDragging, containerRef, dragThreshold]);

    const handleDragEnd = useCallback(() => {
        setIsDragging(false);
    }, []);

    // Stable getter so callers read the latest drag flag inside event handlers
    // (after render) instead of snapshotting the ref value during render.
    const getHasDragged = useCallback(() => hasDraggedRef.current, []);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleDragMove);
            window.addEventListener('mouseup', handleDragEnd);
            window.addEventListener('touchmove', handleDragMove, { passive: false });
            window.addEventListener('touchend', handleDragEnd);
        }
        return () => {
            window.removeEventListener('mousemove', handleDragMove);
            window.removeEventListener('mouseup', handleDragEnd);
            window.removeEventListener('touchmove', handleDragMove);
            window.removeEventListener('touchend', handleDragEnd);
        };
    }, [isDragging, handleDragMove, handleDragEnd]);

    return {
        position,
        isDragging,
        getHasDragged,
        handleDragStart,
    };
}
