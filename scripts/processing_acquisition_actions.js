/* One action model for the acquisition menu and its transport controls. */
(function(){
  'use strict';
  function model({draftId,hasDraft,lastId,state,waiting,kind,selectedId}){
    const running=!!lastId&&state?.finished!==true;
    const ready=hasDraft&&!draftId;
    const completed=(!!lastId||!!selectedId)&&!running;
    const type=kind==='whole'?'Cuerpo entero':kind==='dynamic'?'Dinámica':'Estática';
    const phase=waiting?'Preparando':ready?'Configuración':running?(state?.paused?'En pausa':'Adquiriendo'):
      completed?(state?.cancelled?'Cancelada':'Finalizada'):'Sin adquisición';
    const action=(id,label,enabled,group)=>({id,label,enabled:!waiting&&enabled,group});
    return {running,ready,type,phase,actions:[
      action('static','Nueva adquisición estática',!running,'Configuración'),
      action('whole','Nueva adquisición cuerpo entero',!running,'Configuración'),
      action('dynamic','Nueva adquisición dinámica',!running,'Configuración'),
      action('add','Agregar adquisición',!!selectedId&&!running&&!hasDraft,'Configuración'),
      action('start','Iniciar adquisición',ready&&!running,'Adquisición'),
      action('instant','Adquisición instantánea',ready&&!running||running&&!ready,'Adquisición'),
      action('pause',state?.paused?'Reanudar adquisición':'Pausar adquisición',running,'Adquisición'),
      action('fast','Avance rápido · '+(state?.speed||1)+'×',running,'Adquisición'),
      action('stop','Finalizar adquisición',running,'Adquisición'),
      action('current','Ver adquisición actual',!!lastId&&!hasDraft,'Resultados'),
      action('retake','Adquirir de nuevo',!!selectedId&&!running&&!hasDraft,'Resultados'),
      action('delete','Eliminar adquisición',(ready||!!selectedId)&&!running,'Resultados')
    ]};
  }
  window.GANTRY_ACQUISITION_ACTIONS={model};
})();
