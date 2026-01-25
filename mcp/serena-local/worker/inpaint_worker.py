"""Worker for processing inpainting tasks."""
import sys
import time


def process_video(video_path: str) -> None:
    """Mock video processing function."""
    total_frames = 100
    start_time = time.time()

    for i in range(total_frames):
        # Simulate work
        time.sleep(0.01)
        processed = i + 1

        if processed % 10 == 0:
            total_time = time.time() - start_time
            # Split long line to satisfy linter
            msg = (
                f"Completed {processed}/{total_frames} frames "
                f"in {total_time:.1f}s"
            )
            print(msg, file=sys.stderr)


if __name__ == "__main__":
    process_video("test.mp4")
