'use strict';
importScripts("../grcon_contracts.js", "../discipline_resolver.js", "../core.js", "../history_core.js",
  "../posting_conference_core.js", "../posting_conference_refinement.js",
  "../sigem_posting_central_core.js", "../sigem_posting_central_query.js");
self.onmessage = event => {
  try {
    const {records,base,previousState,options} = event.data;
    const result = self.GrconSigemCentralQuery.build(records,base,previousState,options);
    self.postMessage({ok:true,result});
  } catch (error) { self.postMessage({ok:false,error:String(error.message||error)}); }
};
