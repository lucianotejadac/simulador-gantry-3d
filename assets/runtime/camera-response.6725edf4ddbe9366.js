window.GANTRY_CAMERA_DATA={"status":"equipment parameters recovered; not independently calibrated","activeReferenceChanged":false,"parameters":{"collimatorThickness":{"tag":"0055,107E","values":[25.600000381469727,25.600000381469727]},"collimatorAngularResolution":{"tag":"0055,107F","values":[0.04951455816626549,0.04951455816626549]},"holeLength":{"tag":"0061,1055","values":[24.049999237060547,24.049999237060547]},"entryHoleDiameter":{"tag":"0061,1056","values":[1.2790000438690186,1.2790000438690186]},"exitHoleDiameter":{"tag":"0061,1057","values":[1.2790000438690186,1.2790000438690186]},"frontPadding":{"tag":"0061,1058","values":[1.5,1.5]},"backSpacing":{"tag":"0061,1059","values":[4.599999904632568,4.599999904632568]},"crystalDepthOfInteraction":{"tag":"0061,105E","values":[3.069999933242798,3.069999933242798]},"crystalIntrinsicResolution":{"tag":"0061,105F","values":[3.799999952316284,3.799999952316284]}},"energyWindows":[{"name":"99m Technetium","lowerKeV":128.85250854492,"upperKeV":149.74749755859,"widthKeV":20.89498901367},{"name":"Lower Scatter","lowerKeV":107.95750427246,"upperKeV":128.85250854492,"widthKeV":20.89500427246}],"scatter":{"nominalHalfWidthRule":0.49999963486989996,"meaning":"model coefficient from equal window widths, not patient-derived calibration","siemensAppliedWeightConfirmed":false,"siemensProjectionFilterConfirmed":false,"missingReconstructionTags":["0061,1031","0061,1032","0061,1033","0061,1034"]},"responseModel":{"oldIntrinsicFWHMmm":3.5,"exportedIntrinsicResolution":[3.799999952316284,3.799999952316284],"oldFWHMat100mm":6,"pending":"Verify manufacturer units and FWHM/sigma and distance-reference conventions before converting angular response to Gaussian operator; no measured point-source response available."},"sources":["https://academy.siemens-healthineers.com/_/en-us/whats-new-in-spectsyngo-va20-reconstruction-configuration/","https://cdn0.scrvt.com/39b415fb07de4d9656c7b516d8e2d907/1800000003652335/2621fd9aefb6/dcs_syngo_mi_apps_vb20-03652335_1800000003652335.pdf"],"simulatorUse":{"model":"siemens-nominal-v1","independentlyCalibrated":false,"reference":"https://ascend-imaging.com/wp-content/uploads/2022/10/SYMBIA-E-and-S.pdf","referencePages":[7,8,9],"intrinsicConvention":"3.8 mm interpreted as nominal FWHM, consistent with 3/8 inch detector CFOV specification","lehrSystemFwhmAt100mm":7.5,"distanceConvention":"Use detector-surface gap as source distance proxy; no per-voxel source depth is available in these projected atlases. Nominal width is a surface-source lower-bound approximation.","angularParameterUsedAsSigma":false,"holeDiameterConvention":"Recovered 1.279 vs nominal 1.11 mm across hexagonal flats; convention not independently verified. Not used to set Gaussian sigma.","sensitivity":"Existing educational count-rate model retained; recovered fields contain no measured absolute sensitivity.","fieldOfView":"Retains simulator virtual 560 mm field; does not reproduce the manufacturer rectangular 533 x 387 mm UFOV."}};
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
