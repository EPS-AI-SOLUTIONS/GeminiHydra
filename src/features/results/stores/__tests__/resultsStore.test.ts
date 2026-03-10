import { beforeEach, describe, expect, it } from 'vitest';
import type { ResultsImageData } from '@/features/results/stores/resultsStore';
import { useResultsStore } from '@/features/results/stores/resultsStore';

function createMockImageData(overrides: Partial<ResultsImageData> = {}): ResultsImageData {
  return {
    originalImage: 'data:image/jpeg;base64,original',
    restoredImage: 'data:image/jpeg;base64,restored',
    fileName: 'photo.jpg',
    mimeType: 'image/jpeg',
    improvements: ['scratch removal'],
    processingTimeMs: 3000,
    providerUsed: 'google',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('resultsStore', () => {
  beforeEach(() => {
    useResultsStore.setState({
      comparisonMode: 'slider',
      sliderPosition: 50,
      transform: { rotation: 0, zoom: 1, pan: { x: 0, y: 0 } },
      images: [],
      activeIndex: 0,
      savedToHistory: false,
      isDownloading: false,
    });
  });

  describe('initial state', () => {
    it('should have slider comparison mode by default', () => {
      expect(useResultsStore.getState().comparisonMode).toBe('slider');
    });

    it('should have slider position at 50', () => {
      expect(useResultsStore.getState().sliderPosition).toBe(50);
    });

    it('should have default transform (rotation 0, zoom 1, pan 0,0)', () => {
      expect(useResultsStore.getState().transform).toEqual({ rotation: 0, zoom: 1, pan: { x: 0, y: 0 } });
    });

    it('should start with empty images array', () => {
      expect(useResultsStore.getState().images).toEqual([]);
    });

    it('should have activeIndex at 0', () => {
      expect(useResultsStore.getState().activeIndex).toBe(0);
    });

    it('should not be saved to history', () => {
      expect(useResultsStore.getState().savedToHistory).toBe(false);
    });

    it('should not be downloading', () => {
      expect(useResultsStore.getState().isDownloading).toBe(false);
    });
  });

  describe('comparison mode', () => {
    it('should toggle to side-by-side', () => {
      useResultsStore.getState().setComparisonMode('side-by-side');
      expect(useResultsStore.getState().comparisonMode).toBe('side-by-side');
    });

    it('should toggle back to slider', () => {
      useResultsStore.getState().setComparisonMode('side-by-side');
      useResultsStore.getState().setComparisonMode('slider');
      expect(useResultsStore.getState().comparisonMode).toBe('slider');
    });
  });

  describe('slider position', () => {
    it('should set slider position', () => {
      useResultsStore.getState().setSliderPosition(75);
      expect(useResultsStore.getState().sliderPosition).toBe(75);
    });

    it('should clamp slider position to max 100', () => {
      useResultsStore.getState().setSliderPosition(150);
      expect(useResultsStore.getState().sliderPosition).toBe(100);
    });

    it('should clamp slider position to min 0', () => {
      useResultsStore.getState().setSliderPosition(-20);
      expect(useResultsStore.getState().sliderPosition).toBe(0);
    });
  });

  describe('rotation', () => {
    it('should rotate left by 90 degrees', () => {
      useResultsStore.getState().rotateLeft();
      expect(useResultsStore.getState().transform.rotation).toBe(270);
    });

    it('should rotate right by 90 degrees', () => {
      useResultsStore.getState().rotateRight();
      expect(useResultsStore.getState().transform.rotation).toBe(90);
    });

    it('should wrap rotation on full circle (right)', () => {
      for (let i = 0; i < 4; i++) {
        useResultsStore.getState().rotateRight();
      }
      expect(useResultsStore.getState().transform.rotation).toBe(0);
    });

    it('should wrap rotation on full circle (left)', () => {
      for (let i = 0; i < 4; i++) {
        useResultsStore.getState().rotateLeft();
      }
      expect(useResultsStore.getState().transform.rotation).toBe(0);
    });

    it('should reset rotation to 0', () => {
      useResultsStore.getState().rotateRight();
      useResultsStore.getState().rotateRight();
      useResultsStore.getState().resetRotation();
      expect(useResultsStore.getState().transform.rotation).toBe(0);
    });
  });

  describe('zoom', () => {
    it('should zoom in by 0.25 step', () => {
      useResultsStore.getState().zoomIn();
      expect(useResultsStore.getState().transform.zoom).toBe(1.25);
    });

    it('should zoom out by 0.25 step', () => {
      useResultsStore.getState().zoomOut();
      expect(useResultsStore.getState().transform.zoom).toBe(0.75);
    });

    it('should not exceed max zoom (4.0)', () => {
      useResultsStore.setState({ transform: { rotation: 0, zoom: 4.0, pan: { x: 0, y: 0 } } });
      useResultsStore.getState().zoomIn();
      expect(useResultsStore.getState().transform.zoom).toBe(4.0);
    });

    it('should not go below min zoom (0.25)', () => {
      useResultsStore.setState({ transform: { rotation: 0, zoom: 0.25, pan: { x: 0, y: 0 } } });
      useResultsStore.getState().zoomOut();
      expect(useResultsStore.getState().transform.zoom).toBe(0.25);
    });

    it('should reset zoom to 1 without affecting rotation', () => {
      useResultsStore.getState().rotateRight();
      useResultsStore.getState().zoomIn();
      useResultsStore.getState().zoomIn();
      useResultsStore.getState().resetZoom();
      expect(useResultsStore.getState().transform.zoom).toBe(1);
      expect(useResultsStore.getState().transform.rotation).toBe(90);
    });
  });

  describe('setImages', () => {
    it('should set images array', () => {
      const images = [createMockImageData(), createMockImageData({ fileName: 'photo2.jpg' })];
      useResultsStore.getState().setImages(images);
      expect(useResultsStore.getState().images).toHaveLength(2);
    });

    it('should reset activeIndex to 0 when setting images', () => {
      useResultsStore.setState({ activeIndex: 5 });
      useResultsStore.getState().setImages([createMockImageData()]);
      expect(useResultsStore.getState().activeIndex).toBe(0);
    });

    it('should reset savedToHistory when setting images', () => {
      useResultsStore.setState({ savedToHistory: true });
      useResultsStore.getState().setImages([createMockImageData()]);
      expect(useResultsStore.getState().savedToHistory).toBe(false);
    });

    it('should reset transform when setting images', () => {
      useResultsStore.getState().rotateRight();
      useResultsStore.getState().zoomIn();
      useResultsStore.getState().setImages([createMockImageData()]);
      expect(useResultsStore.getState().transform).toEqual({ rotation: 0, zoom: 1, pan: { x: 0, y: 0 } });
    });
  });

  describe('updateRestoredImage', () => {
    it('should update the restored image at a specific index', () => {
      const images = [createMockImageData(), createMockImageData({ fileName: 'second.jpg' })];
      useResultsStore.getState().setImages(images);
      const before = useResultsStore.getState().images[1]?.restoredImage;
      useResultsStore.getState().updateRestoredImage(1, 'data:image/png;base64,newdata');
      const after = useResultsStore.getState().images[1]?.restoredImage;
      // Store converts data URLs to blob URLs — verify the image was replaced
      expect(after).not.toBe(before);
      expect(after).toMatch(/^blob:/);
    });

    it('should not modify images for out-of-bounds index', () => {
      useResultsStore.getState().setImages([createMockImageData()]);
      const before = useResultsStore.getState().images[0]?.restoredImage;
      useResultsStore.getState().updateRestoredImage(99, 'data:new');
      // Original image unchanged — same blob URL reference
      expect(useResultsStore.getState().images[0]?.restoredImage).toBe(before);
    });
  });

  describe('setActiveIndex', () => {
    it('should set the active index', () => {
      useResultsStore.getState().setActiveIndex(2);
      expect(useResultsStore.getState().activeIndex).toBe(2);
    });
  });

  describe('setSavedToHistory', () => {
    it('should mark as saved to history', () => {
      useResultsStore.getState().setSavedToHistory(true);
      expect(useResultsStore.getState().savedToHistory).toBe(true);
    });
  });

  describe('setIsDownloading', () => {
    it('should set downloading state', () => {
      useResultsStore.getState().setIsDownloading(true);
      expect(useResultsStore.getState().isDownloading).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      useResultsStore.getState().setComparisonMode('side-by-side');
      useResultsStore.getState().setSliderPosition(80);
      useResultsStore.getState().rotateRight();
      useResultsStore.getState().zoomIn();
      useResultsStore.getState().setImages([createMockImageData()]);
      useResultsStore.getState().setActiveIndex(1);
      useResultsStore.getState().setSavedToHistory(true);
      useResultsStore.getState().setIsDownloading(true);

      useResultsStore.getState().reset();

      const state = useResultsStore.getState();
      expect(state.comparisonMode).toBe('slider');
      expect(state.sliderPosition).toBe(50);
      expect(state.transform).toEqual({ rotation: 0, zoom: 1, pan: { x: 0, y: 0 } });
      expect(state.images).toEqual([]);
      expect(state.activeIndex).toBe(0);
      expect(state.savedToHistory).toBe(false);
      expect(state.isDownloading).toBe(false);
    });
  });
});
