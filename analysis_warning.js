(function () {
  "use strict";

  const AnalysisHistory = window.GrconAnalysisHistory;
  const RECENT_DAYS_THRESHOLD = 30;

  async function checkPreviousAnalysis(documents) {
    if (!AnalysisHistory || !documents || !documents.length) return new Map();
    
    try {
      const documentKeys = documents.map(doc => 
        AnalysisHistory.norm(doc.document || doc.name || "")
      ).filter(Boolean);
      
      if (!documentKeys.length) return new Map();

      const endDate = AnalysisHistory.localDateKey(new Date());
      const startDate = AnalysisHistory.localDateKey(
        new Date(Date.now() - RECENT_DAYS_THRESHOLD * 24 * 60 * 60 * 1000)
      );

      const result = await AnalysisHistory.queryDocuments(
        { startDate, endDate },
        { all: true }
      );

      const previousAnalysis = new Map();
      
      (result.rows || []).forEach(record => {
        const key = AnalysisHistory.norm(record.document);
        if (!documentKeys.includes(key)) return;
        
        if (!previousAnalysis.has(key)) {
          previousAnalysis.set(key, {
            document: record.document,
            lastAnalyzedAt: record.analyzedAt,
            lastStatus: record.statusDelivered,
            lastRevision: record.targetRevision,
            count: 1,
            analyses: [record]
          });
        } else {
          const existing = previousAnalysis.get(key);
          existing.count++;
          existing.analyses.push(record);
          if (record.analyzedAt > existing.lastAnalyzedAt) {
            existing.lastAnalyzedAt = record.analyzedAt;
            existing.lastStatus = record.statusDelivered;
            existing.lastRevision = record.targetRevision;
          }
        }
      });

      return previousAnalysis;
    } catch (error) {
      console.warn("Não foi possível verificar análises anteriores:", error);
      return new Map();
    }
  }

  function formatAnalysisWarning(info) {
    if (!info) return "";
    
    const date = new Date(info.lastAnalyzedAt);
    const daysAgo = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
    const timeLabel = daysAgo === 0 
      ? "hoje" 
      : daysAgo === 1 
        ? "ontem" 
        : `há ${daysAgo} dias`;
    
    const countLabel = info.count === 1 
      ? "1 vez" 
      : `${info.count} vezes`;
    
    return `Analisado ${countLabel} nos últimos ${RECENT_DAYS_THRESHOLD} dias (última: ${timeLabel}, status: ${info.lastStatus})`;
  }

  function createWarningBadge(info) {
    if (!info) return null;
    
    const badge = document.createElement("span");
    badge.className = "analysis-history-badge";
    badge.setAttribute("data-analysis-count", String(info.count));
    badge.textContent = `${info.count}×`;
    badge.title = formatAnalysisWarning(info);
    
    return badge;
  }

  window.GrconAnalysisWarning = Object.freeze({
    checkPreviousAnalysis,
    formatAnalysisWarning,
    createWarningBadge,
    RECENT_DAYS_THRESHOLD,
  });
})();
