import cv2
import os
import numpy as np

video_path = 'splash-video.mp4'
frames_dir = 'frames'
masks_dir = 'masks'
outpainted_dir = 'outpainted'

os.makedirs(frames_dir, exist_ok=True)
os.makedirs(masks_dir, exist_ok=True)
os.makedirs(outpainted_dir, exist_ok=True)

cap = cv2.VideoCapture(video_path)
frame_count = 0

while True:
    ret, frame = cap.read()
    if not ret:
        break
        
    h, w, _ = frame.shape
    
    # We want 16:9 aspect ratio. 
    # Let's calculate the new width based on the height.
    target_w = int(h * 16 / 9)
    if target_w <= w:
        target_w = w + int(w * 0.5) # Force expand if already wide
        
    pad_left = (target_w - w) // 2
    pad_right = target_w - w - pad_left
    
    # Pad frame with white (since background is white)
    padded_frame = cv2.copyMakeBorder(frame, 0, 0, pad_left, pad_right, cv2.BORDER_CONSTANT, value=[255, 255, 255])
    
    # Create mask (255 where we want AI to draw, 0 where we want to keep original)
    mask = np.zeros((h, target_w), dtype=np.uint8)
    mask[:, :pad_left] = 255
    mask[:, -pad_right:] = 255
    
    cv2.imwrite(os.path.join(frames_dir, f'{frame_count:04d}.png'), padded_frame)
    cv2.imwrite(os.path.join(masks_dir, f'{frame_count:04d}.png'), mask)
    
    frame_count += 1

cap.release()
print(f'Extracted and padded {frame_count} frames.')
