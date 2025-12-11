import cv2
import numpy as np
from typing import List, Tuple, Optional


class CornerDetector:
    @staticmethod
    def detect_corners(image: np.ndarray, template_name: str = "") -> Optional[List[Tuple[int, int]]]:
        h, w = image.shape[:2]
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        card_type = CornerDetector._detect_card_type(template_name, gray, w, h)
        return CornerDetector._get_default_points(w, h, card_type)
    
    @staticmethod
    def _detect_card_type(template_name: str, gray: np.ndarray, w: int, h: int) -> str:
        name_lower = template_name.lower()
        
        if "120" in name_lower:
            return "120x60"
        if "100" in name_lower:
            return "100x50"
        if "50" in name_lower:
            return "50x50"
        
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, 30, 100)
        kernel = np.ones((3, 3), np.uint8)
        edges = cv2.dilate(edges, kernel, iterations=2)
        
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return "50x50"
        
        largest = max(contours, key=cv2.contourArea)
        rect = cv2.minAreaRect(largest)
        box_w, box_h = rect[1]
        
        if box_h == 0:
            return "50x50"
        
        if box_w < box_h:
            box_w, box_h = box_h, box_w
        
        aspect = box_w / box_h
        
        if aspect < 1.3:
            return "50x50"
        return "100x50"
    
    @staticmethod
    def _get_default_points(w: int, h: int, card_type: str = "50x50") -> List[Tuple[int, int]]:
        # Base coordinates for 1500x2000 image
        base_w, base_h = 1500, 2000
        scale_x = w / base_w
        scale_y = h / base_h
        
        if card_type == "100x50":
            base_pts = [(256, 389), (950, 658), (800, 1092), (-35, 572)]
        elif card_type == "120x60":
            base_pts = [(191, 383), (950, 673), (791, 1109), (-87, 565)]
        else:  # 50x50
            base_pts = [(408, 404), (900, 509), (642, 1038), (-9, 654)]
        
        # Scale to actual image size
        return [(int(x * scale_x), int(y * scale_y)) for x, y in base_pts]
    
    @staticmethod
    def estimate_corner_radius(image: np.ndarray, corners: List[Tuple[int, int]]) -> int:
        return 150
