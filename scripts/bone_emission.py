"""Continuous educational bone emission on the ICRP skeletal envelope.

Region 2/3 is mineralized bone, region 4 the medullary cavity. Hard material
labels are useful for attenuation, but assigning a different constant activity
to each creates bright blocks at long-bone material boundaries. Instead use a
continuous distance from the outer skeletal envelope. This is a visual uptake
model, not measured regional MDP concentrations or an ICRP uptake prescription.
"""
import numpy as np
from scipy.ndimage import distance_transform_edt, gaussian_filter

PARAMETERS = dict(model='continuous-skeletal-envelope-v1', voxelMm=3,
                  surfaceDepthMm=3, falloffMm=3,
                  partialVolumeSigmaMm=1.5)


def bone_emission(reg):
    """Return unit-total, noise-free activity; never modify anatomy or mu."""
    mineral = (reg == 2) | (reg == 3)
    if not mineral.any():
        raise ValueError('No mineralized skeleton in volume')
    envelope = mineral | (reg == 4)
    depth = distance_transform_edt(envelope, sampling=PARAMETERS['voxelMm'])
    depth = np.maximum(depth - PARAMETERS['surfaceDepthMm'], 0)
    # A fixed-thickness effective emitting shell across cortical, trabecular
    # and cavity boundaries avoids an artificial filled-to-hollow step. The
    # smooth inner tail approximates unresolved endosteal/partial-volume signal;
    # it is not a claim of MDP uptake in the medullary compartment.
    density = np.exp(-.5 * (depth / PARAMETERS['falloffMm']) ** 2)
    activity = np.where(envelope, density, 0).astype(np.float32)
    # Only subvoxel partial-volume smoothing; the detector PSF is applied later.
    activity = gaussian_filter(activity,
        PARAMETERS['partialVolumeSigmaMm'] / PARAMETERS['voxelMm'],
        mode='constant', truncate=3)
    activity /= activity.sum(dtype=np.float64)
    return activity
