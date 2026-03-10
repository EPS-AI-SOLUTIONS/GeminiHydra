import { cn } from '@jaskier/ui';
import { motion } from 'motion/react';
import CropActionBar from './CropActionBar';
import CropCanvas from './CropCanvas';
import CropHeader from './CropHeader';
import CropToolbar from './CropToolbar';
import { fadeInUp } from './cropConstants';
import { useCropInteractions } from './useCropInteractions';

export function CropViewContainer() {
  const interactions = useCropInteractions();

  const {
    photos,
    activePhotoIndex,
    detectionBoxes,
    isDetecting,
    expectedPhotoCount,
    zoom,
    aspectRatioLock,
    highlightedZoneIndex,
    isCropping,
    processingPhase,
    streamProgress,
    isDrawingMode,
    canvasContainerRef,
    canUndo,
    canRedo,
    setIsDrawingMode,
    handleReDetect,
    handleReset,
    handleDrawComplete,
    handleZoneActivate,
    removeDetectionBox,
    setExpectedPhotoCount,
    setAspectRatioLock,
    zoomIn,
    zoomOut,
    resetZoom,
    undo,
    redo,
    handleBack,
    handleApplyCrop,
    handleApplyAllPhotos,
    currentPhoto,
    setActivePhotoIndex,
  } = interactions;

  if (!currentPhoto) return null;

  return (
    <motion.div
      {...fadeInUp}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="p-6 h-full flex flex-col"
      data-testid="crop-view"
    >
      {/* �� Header ������������������������������� */}
      <CropHeader
        detectionCount={detectionBoxes.length}
        isDetecting={isDetecting}
        isCropping={isCropping}
        processingPhase={processingPhase}
        streamProgress={streamProgress}
        photoCount={photos.length}
        activePhotoIndex={activePhotoIndex}
        setActivePhotoIndex={setActivePhotoIndex}
      />

      {/* �� Main content area �������������������� */}
      <div className="flex-1 min-h-0 flex gap-4">
        {/* �� Canvas area with scroll wheel zoom (#11) �� */}
        <div
          ref={canvasContainerRef}
          className={cn('flex-1 min-w-0 glass-panel rounded-2xl overflow-hidden p-2')}
          data-testid="crop-canvas"
        >
          <CropCanvas
            src={currentPhoto.previewUrl}
            alt={currentPhoto.name}
            boxes={detectionBoxes}
            isDetecting={isDetecting}
            onRemoveBox={removeDetectionBox}
            zoom={zoom}
            highlightedZoneIndex={highlightedZoneIndex}
            isDrawingMode={isDrawingMode}
            onDrawComplete={handleDrawComplete}
          />
        </div>

        {/* �� Controls sidebar �� */}
        <CropToolbar
          detectionBoxes={detectionBoxes}
          isDetecting={isDetecting}
          expectedPhotoCount={expectedPhotoCount}
          zoom={zoom}
          aspectRatioLock={aspectRatioLock}
          isDrawingMode={isDrawingMode}
          highlightedZoneIndex={highlightedZoneIndex}
          canUndo={canUndo}
          canRedo={canRedo}
          setExpectedPhotoCount={setExpectedPhotoCount}
          onReDetect={handleReDetect}
          setAspectRatioLock={setAspectRatioLock}
          setIsDrawingMode={setIsDrawingMode}
          zoomIn={zoomIn}
          zoomOut={zoomOut}
          resetZoom={resetZoom}
          removeDetectionBox={removeDetectionBox}
          onZoneActivate={handleZoneActivate}
          undo={undo}
          redo={redo}
          onReset={handleReset}
        />
      </div>

      {/* �� Bottom action bar �������������������� */}
      <CropActionBar
        currentPhotoName={currentPhoto.name}
        photoCount={photos.length}
        isDetecting={isDetecting}
        isCropping={isCropping}
        processingPhase={processingPhase}
        onBack={handleBack}
        onApplyCrop={handleApplyCrop}
        onApplyAllPhotos={handleApplyAllPhotos}
      />
    </motion.div>
  );
}

export default CropViewContainer;
