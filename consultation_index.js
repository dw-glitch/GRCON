/* Shared consultation indexing: identical projection in UI fallback and Worker. */
(function(root,factory){const api=factory(root.TriagemCore||(typeof require==='function'?require('./core.js'):null),root.GrconPlannedDocumentsCore||(typeof require==='function'?require('./planned_documents_core.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;root.GrconConsultationIndex=api;})(typeof globalThis!=='undefined'?globalThis:this,function(Core,Planned){"use strict";
"use strict";
function buildIndex(lds, plannedSnapshot, control) {
    const validas = lds.filter((item) => !item.error && item.records.length);
    if (!validas.length && !control?.records.length)
        return null;
    const ldRecords = validas.flatMap((item) => item.records);
    const ldKeys = new Set(ldRecords.flatMap(row => Core.documentSearchKeys(row.document).map(value => Core.key(value))));
    const registros = [...ldRecords, ...(control?.records || []).filter(row => !Core.documentSearchKeys(row.document).some(value => ldKeys.has(Core.key(value)))).map(row => ({
            document: row.document, documentKey: row.document, source: "Controle de Solicitações", sheet: row.sheet, row: row.sourceRow,
            title: Object.entries(row.data).find(([label]) => /^(?:T[IÍ]TULO(?: DO DOCUMENTO)?|DESCRI[CÇ][AÃ]O)$/i.test(label))?.[1] || "",
            sourceTimestamp: 0,
        }))];
    const historico = validas.flatMap((item) => item.history || []);
    // Em Consultas, a coluna de alocação da LD nunca pode decidir Alocado/Não
    // alocado. Quando há snapshot oficial, todas as ocorrências entram no índice
    // já sobrescritas pela mesma fonte compartilhada. Isso também elimina falsos
    // conflitos entre LDs que apenas divergem na coluna antiga de alocação.
    const registrosOficiais = plannedSnapshot
        ? Planned.applyToRecords(registros, plannedSnapshot)
        : registros;
    return Core.buildIndex(registrosOficiais, historico);
}

return Object.freeze({buildIndex});});
