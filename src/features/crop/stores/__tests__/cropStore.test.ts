import { beforeEach, describe, expect, it } from 'vitest';
import type { BoundingBox } from '@/features/crop/stores/cropStore';
import { getMockDetectionBoxes, useCropStore } from '@/features/crop/stores/cropStore';

const initialState = () => ({
  detectionBoxes: [] as BoundingBox[],
  isDetecting: false,
  expectedPhotoCount: null as number | null,
  zoom: 1.0,
  activePhotoIndex: 0,
});

describe('cropStore', () => {
  beforeEach(() => {
    useCropStore.setState(initialState());
  });

  describe('initial state', () => {
    it('should start with empty detection boxes', () => {
      expect(useCropStore.getState().detectionBoxes).toEqual([]);
    });

    it('should start with isDetecting false', () => {
      expect(useCropStore.getState().isDetecting).toBe(false);
    });

    it('should start with null expectedPhotoCount', () => {
      expect(useCropStore.getState().expectedPhotoCount).toBeNull();
    });

    it('should start with zoom at 1.0', () => {
      expect(useCropStore.getState().zoom).toBe(1.0);
    });

    it('should start with activePhotoIndex at 0', () => {
      expect(useCropStore.getState().activePhotoIndex).toBe(0);
    });
  });

  describe('detection boxes', () => {
    it('should set detection boxes', () => {
      const boxes = getMockDetectionBoxes();
      useCropStore.getState().setDetectionBoxes(boxes);
      expect(useCropStore.getState().detectionBoxes).toHaveLength(3);
    });

    it('should add a single detection box', () => {
      const box: BoundingBox = {
        x: 10,
        y: 20,
        width: 100,
        height: 80,
        confidence: 0.95,
        label: 'test',
        rotation_angle: 0,
        contour: [],
        needs_outpaint: false,
      };
      useCropStore.getState().addDetectionBox(box);
      expect(useCropStore.getState().detectionBoxes).toHaveLength(1);
      expect(useCropStore.getState().detectionBoxes[0]?.label).toBe('test');
    });

    it('should remove a detection box by index', () => {
      const boxes = getMockDetectionBoxes();
      useCropStore.getState().setDetectionBoxes(boxes);
      useCropStore.getState().removeDetectionBox(1);
      expect(useCropStore.getState().detectionBoxes).toHaveLength(2);
      // The second box (scratch region) should be removed
      expect(useCropStore.getState().detectionBoxes.find((b) => b.label === 'scratch region')).toBeUndefined();
    });

    it('should clear all detection boxes', () => {
      useCropStore.getState().setDetectionBoxes(getMockDetectionBoxes());
      useCropStore.getState().clearDetectionBoxes();
      expect(useCropStore.getState().detectionBoxes).toEqual([]);
    });

    it('should set isDetecting', () => {
      useCropStore.getState().setIsDetecting(true);
      expect(useCropStore.getState().isDetecting).toBe(true);
    });
  });

  describe('expected photo count', () => {
    it('should set expected photo count', () => {
      useCropStore.getState().setExpectedPhotoCount(4);
      expect(useCropStore.getState().expectedPhotoCount).toBe(4);
    });

    it('should clear expected photo count by setting null', () => {
      useCropStore.getState().setExpectedPhotoCount(4);
      useCropStore.getState().setExpectedPhotoCount(null);
      expect(useCropStore.getState().expectedPhotoCount).toBeNull();
    });
  });

  describe('zoom controls', () => {
    it('should zoom in by 0.25 step', () => {
      useCropStore.getState().zoomIn();
      expect(useCropStore.getState().zoom).toBe(1.25);
    });

    it('should zoom out by 0.25 step', () => {
      useCropStore.getState().zoomOut();
      expect(useCropStore.getState().zoom).toBe(0.75);
    });

    it('should not exceed MAX_ZOOM (4.0)', () => {
      useCropStore.setState({ zoom: 4.0 });
      useCropStore.getState().zoomIn();
      expect(useCropStore.getState().zoom).toBe(4.0);
    });

    it('should not go below MIN_ZOOM (0.25)', () => {
      useCropStore.setState({ zoom: 0.25 });
      useCropStore.getState().zoomOut();
      expect(useCropStore.getState().zoom).toBe(0.25);
    });

    it('should reset zoom to 1.0', () => {
      useCropStore.getState().zoomIn();
      useCropStore.getState().zoomIn();
      useCropStore.getState().resetZoom();
      expect(useCropStore.getState().zoom).toBe(1.0);
    });

    it('should clamp setZoom to valid range', () => {
      useCropStore.getState().setZoom(10);
      expect(useCropStore.getState().zoom).toBe(4.0);

      useCropStore.getState().setZoom(-1);
      expect(useCropStore.getState().zoom).toBe(0.25);
    });

    it('should set exact zoom within bounds', () => {
      useCropStore.getState().setZoom(2.5);
      expect(useCropStore.getState().zoom).toBe(2.5);
    });
  });

  describe('activePhotoIndex', () => {
    it('should set active photo index', () => {
      useCropStore.getState().setActivePhotoIndex(3);
      expect(useCropStore.getState().activePhotoIndex).toBe(3);
    });
  });

  describe('resetCropState', () => {
    it('should reset all crop state to initial values', () => {
      // Modify various state properties
      useCropStore.getState().setDetectionBoxes(getMockDetectionBoxes());
      useCropStore.getState().setIsDetecting(true);
      useCropStore.getState().setExpectedPhotoCount(5);
      useCropStore.getState().setZoom(2.0);
      useCropStore.getState().setActivePhotoIndex(5);

      useCropStore.getState().resetCropState();

      const state = useCropStore.getState();
      expect(state.detectionBoxes).toEqual([]);
      expect(state.isDetecting).toBe(false);
      expect(state.expectedPhotoCount).toBeNull();
      expect(state.zoom).toBe(1.0);
      expect(state.activePhotoIndex).toBe(0);
    });
  });
});

describe('getMockDetectionBoxes', () => {
  it('should return 3 bounding boxes', () => {
    const boxes = getMockDetectionBoxes();
    expect(boxes).toHaveLength(3);
  });

  it('should include expected labels', () => {
    const boxes = getMockDetectionBoxes();
    const labels = boxes.map((b) => b.label);
    expect(labels).toContain('damaged area');
    expect(labels).toContain('scratch region');
    expect(labels).toContain('faded area');
  });

  it('should have confidence values between 0 and 1', () => {
    const boxes = getMockDetectionBoxes();
    for (const box of boxes) {
      expect(box.confidence).toBeGreaterThanOrEqual(0);
      expect(box.confidence).toBeLessThanOrEqual(1);
    }
  });
});
