"""Regression: material labels must not create false long-bone uptake bands."""
from pathlib import Path
import sys
import unittest
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from bone_emission import bone_emission


class BoneEmissionTest(unittest.TestCase):
    def setUp(self):
        z, y, x = np.indices((100, 40, 40))
        radius = np.hypot(y - 20, x - 20)
        envelope = (radius <= 8) & (z >= 5) & (z < 95)
        self.reg = np.where(envelope, 3, 0).astype(np.uint8)
        shaft = envelope & (z >= 35) & (z < 65)
        self.reg[shaft] = 2
        self.reg[shaft & (radius < 6)] = 4

    def test_no_material_boundary_banding(self):
        old = np.where(self.reg == 2, .5, np.where(self.reg == 3, 1., 0))
        old /= old.sum()
        new = bone_emission(self.reg)
        # Same outer geometry, different material labels and hollow shaft.
        profile = new.sum(axis=(1, 2))
        np.testing.assert_allclose(profile[20:80], profile[20], rtol=1e-6)
        old_profile = old.sum(axis=(1, 2))
        self.assertGreater(old_profile[25] / old_profile[50], 3)
        self.assertLess(abs(profile[25] / profile[50] - 1), 1e-6)

    def test_conservation_support_and_input_unchanged(self):
        original = self.reg.copy()
        a = bone_emission(self.reg)
        np.testing.assert_array_equal(original, self.reg)
        self.assertAlmostEqual(float(a.sum(dtype=np.float64)), 1, places=6)
        self.assertTrue(np.isfinite(a).all())
        self.assertGreaterEqual(a.min(), 0)
        self.assertEqual(a[:, :5].max(), 0)  # no spread into distant soft tissue
        self.assertLess(a[50, 20, 20], a[50, 20, 27] * 1e-5)
        # Changes in anatomy still change the result; no fixed 2D template.
        altered = self.reg.copy()
        altered[:, :, 25:] = 0
        self.assertGreater(np.abs(a - bone_emission(altered)).sum(), .1)

    def test_empty_skeleton_rejected(self):
        with self.assertRaises(ValueError):
            bone_emission(np.zeros((10, 10, 10), np.uint8))


if __name__ == '__main__':
    unittest.main()
