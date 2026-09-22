import { UiMetaPill, UiPageHeader } from "../core/ui/UiPrimitives";
import { CoverLdSource, CoverPreviewAndActions, CoverReview, CoverSearch, CoverSource } from "./components/CoverComponents";
import { useCoverTool } from "./hooks/useCoverTool";
import { coverBridge } from "./services/coverBridge";

export function CoverToolApp() {
  const vm = useCoverTool();
  coverBridge.setDebugProvider(() => vm.debugState);
  return <div className="cover-tool-shell">
    <UiPageHeader eyebrow="DOCUMENTOS" title="Adicionar Capa"
      description="Localize o documento pelo título da LD, confira os dados e gere a capa oficial como primeira folha."
      meta={<><UiMetaPill>React + TypeScript</UiMetaPill><UiMetaPill>Processamento local</UiMetaPill></>}/>
    <div className="cover-principle"><strong>LD → capa → documento original</strong><span>O GRCON não inventa código, título, taxonomia ou revisão.</span></div>
    <CoverLdSource vm={vm}/><CoverSearch vm={vm}/>
    {vm.selected ? <><CoverSource vm={vm}/><CoverReview vm={vm}/><CoverPreviewAndActions vm={vm}/></> : null}
  </div>;
}