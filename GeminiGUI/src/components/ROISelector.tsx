import React, { useState, useRef } from 'react';
import { cn } from '../utils/cn';

interface ROISelectorProps {
  imageSrc: string;
  onSelectionComplete?: (rect: { x: number; y: number; width: number; height: number }) => void;
  className?: string;
}

export const ROISelector: React.FC<ROISelectorProps> = ({
  imageSrc,
  onSelectionComplete,
  className
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setStartPos({ x, y });
    setCurrentPos({ x, y });
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCurrentPos({ x, y });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    if (onSelectionComplete) {
      const width = Math.abs(currentPos.x - startPos.x);
      const height = Math.abs(currentPos.y - startPos.y);
      const x = Math.min(currentPos.x, startPos.x);
      const y = Math.min(currentPos.y, startPos.y);
      if (width > 0 && height > 0) {
        onSelectionComplete({ x, y, width, height });
      }
    }
  };

  const selectionStyle = {
    left: Math.min(startPos.x, currentPos.x),
    top: Math.min(startPos.y, currentPos.y),
    width: Math.abs(currentPos.x - startPos.x),
    height: Math.abs(currentPos.y - startPos.y),
  };

  return (
    <div 
      ref={containerRef}
      className={cn("relative inline-block cursor-crosshair select-none", className)}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <img src={imageSrc} alt="ROI Selection" className="max-w-full block pointer-events-none" />
      {isDragging && (
        <div 
          className="absolute border-2 border-green-500 bg-green-500/20"
          style={selectionStyle}
        />
      )}
    </div>
  );
};
