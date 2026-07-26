import imageio.v2 as imageio
import os
import glob
import cv2

frames_dir = 'outpainted'
output_video = 'splash-video-outpainted.mp4'

images = sorted(glob.glob(os.path.join(frames_dir, '*.png')))

if not images:
    print("No frames found!")
    exit(1)

# Ensure imageio uses ffmpeg to write H.264
writer = imageio.get_writer(output_video, fps=60, codec='libx264', format='FFMPEG')

for i, image_path in enumerate(images):
    # read image as RGB
    img = imageio.imread(image_path)
    writer.append_data(img)
    if i % 50 == 0:
        print(f"Processed {i}/{len(images)} frames...")

writer.close()
print("H.264 Video successfully assembled!")
