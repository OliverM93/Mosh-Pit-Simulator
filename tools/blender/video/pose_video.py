"""Video → MediaPipe 3D pose world landmarks per frame (JSON) + overlay frames for checking."""
import json, sys
import cv2
import mediapipe as mp

src, out_json, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
cap = cv2.VideoCapture(src)
fps = cap.get(cv2.CAP_PROP_FPS)
pose = mp.solutions.pose.Pose(static_image_mode=False, model_complexity=1, smooth_landmarks=True,
                              enable_segmentation=False, min_detection_confidence=0.5)
frames = []
i = 0
while True:
    ok, img = cap.read()
    if not ok:
        break
    res = pose.process(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    if res.pose_world_landmarks:
        wl = [[p.x, p.y, p.z, p.visibility] for p in res.pose_world_landmarks.landmark]
        il = [[p.x, p.y] for p in res.pose_landmarks.landmark]
        mp.solutions.drawing_utils.draw_landmarks(img, res.pose_landmarks, mp.solutions.pose.POSE_CONNECTIONS)
    else:
        wl, il = None, None
    frames.append({'world': wl, 'image': il})
    cv2.imwrite(f'{out_dir}/f{i:03d}.jpg', img)
    i += 1
json.dump({'fps': fps, 'frames': frames}, open(out_json, 'w'))
print('frames', i, 'fps', fps, 'detected', sum(f['world'] is not None for f in frames))
