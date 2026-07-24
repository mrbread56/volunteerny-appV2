import cv2
import os
import glob

frames_dir = 'outpainted'
output_video = 'splash-video-outpainted.mp4'

# Get all png files in the directory and sort them numerically
images = sorted(glob.glob(os.path.join(frames_dir, '*.png')))

if not images:
    print("No frames found!")
    exit(1)

# Read the first image to get dimensions
frame = cv2.imread(images[0])
height, width, layers = frame.shape

# Use mp4v codec for standard mp4 output
fourcc = cv2.VideoWriter_fourcc(*'mp4v')
# Since it's a 4s video with 207 frames, fps is roughly 207/4 ~ 50 or 60. Let's use 60.
video = cv2.VideoWriter(output_video, fourcc, 50, (width, height))

for image in images:
    video.write(cv2.imread(image))

cv2.destroyAllWindows()
video.release()
print("Video successfully assembled!")
