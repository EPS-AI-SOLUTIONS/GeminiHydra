import { CropView } from './CropView';
import { useCropInteractions } from './useCropInteractions';

export function CropViewContainer() {
  const interactions = useCropInteractions();

  // If there's no active photo or photos array is empty, the interaction hook
  // handles redirection to upload view, but we also need to prevent rendering
  // the main view to avoid errors.
  if (!interactions.currentPhoto) return null;

  return <CropView />;
}

export default CropViewContainer;
