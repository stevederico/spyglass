/**
 * Horizontal thumbnail filmstrip for multi-screenshot slot navigation
 *
 * Renders a scrollable row of canvas-based thumbnail previews, each drawn
 * via drawComposite at thumbnail scale. Supports selecting, removing,
 * duplicating, and adding screenshot slots.
 *
 * @component
 * @param {Object} props
 * @param {Array<Object>} props.slots - Array of slot state objects (each includes composer fields + id)
 * @param {number} props.activeIndex - Currently selected slot index
 * @param {function(number): void} props.onSelect - Callback when a thumbnail is clicked
 * @param {function(number): void} props.onRemove - Callback to remove a slot by index
 * @param {function(number): void} props.onDuplicate - Callback to duplicate a slot by index
 * @param {function(): void} props.onAdd - Callback to append an empty slot
 * @returns {JSX.Element} Filmstrip thumbnail strip
 */
import React, { useState, useRef, useEffect } from 'react';
import { drawComposite, DEVICES } from './composerHelpers.js';
import { FRAME_MODELS } from './frameManifest.js';
import { X, Plus, Copy } from 'lucide-react';

/**
 * Individual thumbnail card with canvas preview and hover actions
 *
 * @component
 * @param {Object} props
 * @param {Object} props.slot - Slot composer state object
 * @param {number} props.index - Slot index in the array
 * @param {boolean} props.isActive - Whether this slot is currently selected
 * @param {boolean} props.isOnly - Whether this is the only slot (hides delete)
 * @param {function(number): void} props.onSelect - Selection callback
 * @param {function(number): void} props.onRemove - Remove callback
 * @param {function(number): void} props.onDuplicate - Duplicate callback
 */
const ThumbnailCard = React.memo(function ThumbnailCard({ slot, index, isActive, isOnly, onSelect, onRemove, onDuplicate }) {
  const canvasRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const frameModelInfo = slot.frameModel ? FRAME_MODELS[slot.frameModel] : null;
    drawComposite(canvas, { ...slot, frameModelInfo });
  }, [slot]);

  const deviceInfo = DEVICES[slot.device];
  const aspectRatio = deviceInfo
    ? (slot.orientation === 'landscape' ? deviceInfo.height / deviceInfo.width : deviceInfo.width / deviceInfo.height)
    : (9 / 19.5);

  /** @param {React.KeyboardEvent} e */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(index);
    }
  };

  return (
    <div
      className={`relative flex-shrink-0 w-[90px] rounded-md overflow-hidden cursor-pointer transition-shadow ${
        isActive ? 'ring-2 ring-primary shadow-md shadow-primary/20' : 'ring-1 ring-border/30 opacity-60 hover:opacity-100'
      }`}
      style={{ aspectRatio }}
      role="button"
      tabIndex={0}
      aria-label={`Select screenshot ${index + 1}`}
      aria-current={isActive ? 'true' : undefined}
      onClick={() => onSelect(index)}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full object-contain pointer-events-none"
      />

      {/* Slot number badge */}
      <span className="absolute top-0.5 left-0.5 bg-black/60 text-white text-[10px] leading-none font-medium rounded px-1 py-0.5">
        {index + 1}
      </span>

      {/* Hover actions */}
      {isHovered && !isOnly && (
        <button
          className="absolute top-0.5 right-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] leading-none hover:opacity-80 transition-opacity"
          onClick={(e) => { e.stopPropagation(); onRemove(index); }}
          aria-label={`Remove screenshot ${index + 1}`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
      {isHovered && (
        <button
          className="absolute bottom-0.5 right-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-muted text-muted-foreground text-[10px] leading-none hover:opacity-80 transition-opacity"
          onClick={(e) => { e.stopPropagation(); onDuplicate(index); }}
          aria-label={`Duplicate screenshot ${index + 1}`}
        >
          <Copy className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
});

export default function Filmstrip({ slots, activeIndex, onSelect, onRemove, onDuplicate, onAdd }) {
  const firstSlot = slots[0];
  const deviceInfo = firstSlot ? DEVICES[firstSlot.device] : null;
  const addAspectRatio = deviceInfo
    ? (firstSlot.orientation === 'landscape' ? deviceInfo.height / deviceInfo.width : deviceInfo.width / deviceInfo.height)
    : (9 / 19.5);

  return (
    <div className="flex items-center justify-center gap-2 px-4 py-2 shrink-0 overflow-x-auto">
        {slots.map((slot, i) => (
          <ThumbnailCard
            key={slot.id}
            slot={slot}
            index={i}
            isActive={i === activeIndex}
            isOnly={slots.length === 1}
            onSelect={onSelect}
            onRemove={onRemove}
            onDuplicate={onDuplicate}
          />
        ))}

        {/* Add slot button */}
        <button
          className="flex-shrink-0 w-[90px] rounded-md border-2 border-dashed border-border/40 flex items-center justify-center cursor-pointer text-muted-foreground hover:border-border hover:text-foreground transition-colors"
          style={{ aspectRatio: addAspectRatio }}
          onClick={onAdd}
          aria-label="Add empty screenshot slot"
        >
          <Plus className="w-5 h-5" />
        </button>
    </div>
  );
}
