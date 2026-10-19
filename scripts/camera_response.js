/* Nominal planar response, constrained by recovered Siemens equipment metadata.
   No patient data and no claim of a measured PSF or Siemens reconstruction. */
(function(){
  'use strict';
  const data=window.GANTRY_CAMERA_DATA;
  const FWHM_SIGMA=2*Math.sqrt(2*Math.log(2));
  const value=key=>data.parameters[key].values[0];
  const intrinsic=value('crystalIntrinsicResolution');
  const padding=value('frontPadding')+value('backSpacing')+value('crystalDepthOfInteraction');
  const profiles={
    LEHR:{length:value('holeLength'),geometric100:Math.sqrt(7.5**2-intrinsic**2),offset:padding},
    // Nominal parallel-hole ME and Symbia S HE geometry, not recovered DICOM calibration.
    MELP:{length:40.64,geometric100:10.8,offset:0},
    HE:{length:59.7,geometric100:13.2,offset:0}
  };
  function response(distanceCm,collimator,energyFamily='low',extraSigmaLegacy=0){
    if(collimator==='NONE')return null;
    const p=profiles[collimator]||profiles.LEHR,z=Math.max(0,Number(distanceCm)||0)*10;
    const geometric=p.geometric100*(p.length+p.offset+z)/(p.length+p.offset+100);
    const nominal=Math.hypot(intrinsic,geometric);
    // Keep the pre-existing educational penalty for septal penetration at I-131.
    // These mismatched-collimator tails are not measured Siemens characteristics.
    const penalty=energyFamily==='high'?({LEHR:2.25,MELP:1.45,HE:1}[collimator]||1):1;
    const sigmaMm=Math.hypot(nominal/FWHM_SIGMA*penalty,extraSigmaLegacy*560/240);
    return {model:'siemens-nominal-v1',intrinsicFwhmMm:intrinsic,
      geometricFwhmMm:geometric,nominalFwhmMm:nominal,psfSigmaMm:sigmaMm,
      geometricSlope:p.geometric100/(p.length+p.offset+100),penetrationMultiplier:penalty,
      systemFwhmMm:sigmaMm*FWHM_SIGMA,sourceDistanceMm:z,
      distanceConvention:'skin-gap proxy; source depth unavailable in projected atlas',
      provenance:collimator==='LEHR'?'recovered DICOM + manufacturer nominal reference':'manufacturer geometry + teaching energy model'};
  }
  function withDepth(metrics,meanMm,meanSquaredMm2){
    if(!Number.isFinite(metrics.psfSigmaMm)||!metrics.geometricSlope||metrics.uncollimated)return metrics;
    const mean=Math.max(0,meanMm),second=Math.max(mean*mean,meanSquaredMm2);
    const extra=(2*metrics.geometricFwhmMm*metrics.geometricSlope*mean+metrics.geometricSlope**2*second)*(metrics.penetrationMultiplier||1)**2;
    const sigma=Math.sqrt(metrics.psfSigmaMm**2+extra/FWHM_SIGMA**2);
    return {...metrics,psfSigmaMm:sigma,systemFwhmMm:sigma*FWHM_SIGMA,
      sourceDepthMeanMm:mean,sourceDepthRmsMm:Math.sqrt(second),
      model:'siemens-nominal-bone-depth-v2',
      distanceConvention:'skin gap plus attenuation-weighted bone depth moments; ROI-equivalent PSF'};
  }
  function sampling(pose,crop,w,h,metrics){
    const pixelXmm=crop.w*(pose.pixelMm||3)/w,pixelYmm=crop.h*(pose.pixelMm||3)/h;
    return {pixelXmm,pixelYmm,sigmaX:metrics.psfSigmaMm/pixelXmm,sigmaY:metrics.psfSigmaMm/pixelYmm,
      haloX:(metrics.haloSigmaMm||0)/pixelXmm,haloY:(metrics.haloSigmaMm||0)/pixelYmm};
  }
  window.GANTRY_CAMERA={response,sampling,withDepth,profiles,data,FWHM_SIGMA};
})();
