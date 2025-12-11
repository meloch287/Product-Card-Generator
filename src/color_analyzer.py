from typing import Tuple, Optional
import numpy as np
from PIL import Image
from sklearn.cluster import KMeans
import colorsys


class ColorAnalyzer:
    """Color analyzer with improved filtering for accurate dominant color detection."""
    
    # Filtering thresholds
    VALUE_LOW_THRESHOLD = 10      # Exclude near-black pixels (V < 10)
    VALUE_HIGH_THRESHOLD = 245    # Exclude near-white pixels (V > 245)
    SATURATION_MIN_THRESHOLD = 10 # Exclude near-gray pixels (S < 10)
    
    # Saturation validation thresholds
    LOW_AVG_SATURATION_THRESHOLD = 15   # If avg saturation below this, return neutral
    MIN_RESULT_SATURATION = 20          # Minimum saturation for returned color
    
    # Neutral gray fallback color
    NEUTRAL_GRAY = (128, 128, 128)
    
    # Minimum pixels required for clustering
    MIN_PIXELS_FOR_CLUSTERING = 10
    
    def __init__(self, n_clusters: int = 5):
        self.n_clusters = n_clusters
        self._max_analysis_size = 150
    
    def _resize_for_analysis(self, image: Image.Image, max_size: int = 150) -> Image.Image:
        width, height = image.size
        
        if width <= max_size and height <= max_size:
            return image.copy()
        
        scale = max_size / max(width, height)
        new_width = int(width * scale)
        new_height = int(height * scale)
        
        return image.resize((new_width, new_height), Image.Resampling.LANCZOS)
    
    def _rgb_to_hsv(self, rgb_pixels: np.ndarray) -> np.ndarray:
        """Convert RGB pixels (0-255) to HSV (H: 0-360, S: 0-255, V: 0-255). Vectorized."""
        rgb_normalized = rgb_pixels.astype(np.float32) / 255.0
        
        r, g, b = rgb_normalized[:, 0], rgb_normalized[:, 1], rgb_normalized[:, 2]
        
        maxc = np.maximum(np.maximum(r, g), b)
        minc = np.minimum(np.minimum(r, g), b)
        v = maxc
        
        deltac = maxc - minc
        s = np.where(maxc != 0, deltac / maxc, 0)
        
        # Compute hue
        h = np.zeros_like(maxc)
        mask = deltac != 0
        
        rc = np.where(mask, (maxc - r) / deltac, 0)
        gc = np.where(mask, (maxc - g) / deltac, 0)
        bc = np.where(mask, (maxc - b) / deltac, 0)
        
        h = np.where(r == maxc, bc - gc, h)
        h = np.where(g == maxc, 2.0 + rc - bc, h)
        h = np.where(b == maxc, 4.0 + gc - rc, h)
        h = (h / 6.0) % 1.0
        
        hsv_pixels = np.stack([h * 360, s * 255, v * 255], axis=1)
        return hsv_pixels
    
    def _filter_pixels(self, rgb_pixels: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """
        Filter out pixels based on HSV thresholds.
        Returns filtered RGB pixels and their HSV values.
        
        Filters:
        - V < 10 (near-black)
        - V > 245 (near-white)
        - S < 10 (near-gray)
        """
        hsv_pixels = self._rgb_to_hsv(rgb_pixels)
        
        # Create mask for valid pixels
        s_channel = hsv_pixels[:, 1]
        v_channel = hsv_pixels[:, 2]
        
        valid_mask = (
            (v_channel >= self.VALUE_LOW_THRESHOLD) &
            (v_channel <= self.VALUE_HIGH_THRESHOLD) &
            (s_channel >= self.SATURATION_MIN_THRESHOLD)
        )
        
        return rgb_pixels[valid_mask], hsv_pixels[valid_mask]
    
    def _get_average_saturation(self, hsv_pixels: np.ndarray) -> float:
        """Calculate average saturation from HSV pixels."""
        if len(hsv_pixels) == 0:
            return 0.0
        return float(np.mean(hsv_pixels[:, 1]))
    
    def _get_color_saturation(self, rgb_color: Tuple[int, int, int]) -> float:
        """Get saturation value (0-255) for an RGB color."""
        r, g, b = rgb_color[0] / 255.0, rgb_color[1] / 255.0, rgb_color[2] / 255.0
        _, s, _ = colorsys.rgb_to_hsv(r, g, b)
        return s * 255
    
    def get_dominant_color(self, image: Image.Image) -> Tuple[int, int, int]:
        """
        Get dominant color with improved filtering.
        
        Filtering applied:
        - Excludes pixels with V < 10 or V > 245 (near-black/white)
        - Excludes pixels with S < 10 (near-gray)
        
        Saturation validation:
        - Returns neutral gray if average saturation < 15
        - Ensures result has saturation >= 20 when possible
        """
        resized = self._resize_for_analysis(image, self._max_analysis_size)
        
        if resized.mode != 'RGB':
            resized = resized.convert('RGB')
        
        pixels = np.array(resized)
        pixels_flat = pixels.reshape(-1, 3)
        
        # Calculate average saturation of ORIGINAL image (before filtering)
        # This is used to determine if the input has low saturation overall
        original_hsv = self._rgb_to_hsv(pixels_flat)
        original_avg_saturation = self._get_average_saturation(original_hsv)
        
        # If original image has very low average saturation, return neutral gray
        # (Requirement 5.3: low saturation input -> neutral fallback)
        if original_avg_saturation < self.LOW_AVG_SATURATION_THRESHOLD:
            return self.NEUTRAL_GRAY
        
        # Filter pixels based on HSV thresholds
        filtered_pixels, filtered_hsv = self._filter_pixels(pixels_flat)
        
        # Check average saturation of filtered pixels for clustering decision
        filtered_avg_saturation = self._get_average_saturation(filtered_hsv)
        
        # Handle edge case: too few valid pixels after filtering
        if len(filtered_pixels) < self.MIN_PIXELS_FOR_CLUSTERING:
            # Fall back to neutral gray if not enough valid pixels
            return self.NEUTRAL_GRAY
        
        # Perform K-means clustering on filtered pixels
        n_unique_colors = len(np.unique(filtered_pixels, axis=0))
        actual_clusters = min(self.n_clusters, n_unique_colors)
        
        if actual_clusters == 1:
            color = filtered_pixels[0]
            result = (int(color[0]), int(color[1]), int(color[2]))
        else:
            kmeans = KMeans(n_clusters=actual_clusters, random_state=42, n_init=10)
            kmeans.fit(filtered_pixels)
            
            labels, counts = np.unique(kmeans.labels_, return_counts=True)
            dominant_cluster_idx = labels[np.argmax(counts)]
            dominant_color = kmeans.cluster_centers_[dominant_cluster_idx]
            
            result = (int(round(dominant_color[0])), int(round(dominant_color[1])), int(round(dominant_color[2])))
        
        # Validate result saturation - boost if needed when input had decent saturation
        result_saturation = self._get_color_saturation(result)
        if result_saturation < self.MIN_RESULT_SATURATION and original_avg_saturation >= 30:
            # Boost saturation to minimum threshold while preserving hue and value
            # Add buffer (3) to ensure we meet the >= 20 requirement after rounding
            result = self._boost_saturation(result, self.MIN_RESULT_SATURATION + 3)
        
        return result
    
    def _boost_saturation(self, rgb_color: Tuple[int, int, int], target_saturation: float) -> Tuple[int, int, int]:
        """Boost the saturation of an RGB color to the target level (0-255 scale)."""
        r, g, b = rgb_color[0] / 255.0, rgb_color[1] / 255.0, rgb_color[2] / 255.0
        h, s, v = colorsys.rgb_to_hsv(r, g, b)
        
        # Set saturation to target (convert from 0-255 to 0-1 scale)
        new_s = target_saturation / 255.0
        
        # Convert back to RGB
        new_r, new_g, new_b = colorsys.hsv_to_rgb(h, new_s, v)
        
        return (int(round(new_r * 255)), int(round(new_g * 255)), int(round(new_b * 255)))
