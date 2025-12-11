from typing import List, Tuple
from src.models import ValidationError


class PointValidator:
    @staticmethod
    def validate_points(points: List[Tuple[int, int]], image_width: int, image_height: int) -> None:
        if len(points) != 4:
            raise ValidationError(f"Expected 4 corner points, got {len(points)}")

        # Без ограничений по координатам - можно ставить точки где угодно
        
        if PointValidator.is_self_intersecting(points):
            raise ValidationError("Corner points form a self-intersecting quadrilateral")

    @staticmethod
    def is_convex_quadrilateral(points: List[Tuple[int, int]]) -> bool:
        if len(points) != 4:
            return False

        def cross_product_sign(o, a, b):
            return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

        signs = []
        n = len(points)
        for i in range(n):
            cp = cross_product_sign(points[i], points[(i + 1) % n], points[(i + 2) % n])
            if cp != 0:
                signs.append(cp > 0)

        if not signs:
            return False
        return all(s == signs[0] for s in signs)

    @staticmethod
    def is_self_intersecting(points: List[Tuple[int, int]]) -> bool:
        if len(points) != 4:
            return True

        def ccw(a, b, c):
            return (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0])

        def segments_intersect(p1, p2, p3, p4):
            return (ccw(p1, p3, p4) != ccw(p2, p3, p4)) and (ccw(p1, p2, p3) != ccw(p1, p2, p4))

        edges = [
            (points[0], points[1]),
            (points[1], points[2]),
            (points[2], points[3]),
            (points[3], points[0]),
        ]

        if segments_intersect(edges[0][0], edges[0][1], edges[2][0], edges[2][1]):
            return True
        if segments_intersect(edges[1][0], edges[1][1], edges[3][0], edges[3][1]):
            return True

        return False
