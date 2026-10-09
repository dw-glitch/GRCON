# GRCON — Versão C · Fase 2: Controle de GRDT, Cofre e Consultas

Data: 09/10/2026. Fonte visual: versão C escolhida pelo usuário, organizada em 18 propostas do Higgsfield.

## Escopo integrado à aplicação real

A nova folha `grcon-version-c-phase2.css` é carregada **depois** da camada base da versão C, preservando as classes e os componentes React, JavaScript e HTML já existentes. As regras de visualização só são aplicadas a telas de desktop/notebook com largura >= 1184px, exceto ajustes não destrutivos de largura intermediária e movimento reduzido. Nenhuma coluna, ação, botão ou relatório é removido.

### Controle de GRDT
- Fluxo de quatro etapas já existente fica visualmente mais compacto; continua derivando do estado real de processamento, revisão e emissão.
- Organização mais clara das três fontes (LDs, pasta opcional e relação/texto), sem substituir a busca automática de documentos no Cofre.
- Indicadores Total / Prontos / Não incluir / Em análise / Revisar mais proporcionais e com estado selecionado legível.
- Barra de pesquisa, filtros, seleção, revisão, downloads e emissão com hierarquia visual mais evidente; mantém a disposição operacional e a escolha de colunas/densidade.
- Tabela virtualizada preservada com **todas as colunas reais**; cabeçalho fixo, destaque de linha focada e rolagem interna quando necessária.
- Faixa informativa do Teams discreta; não passa a afirmar que o SIGEM recebeu o documento só por haver aviso enviado.

### Cofre
- Informações de armazenamento, objetos e rastreabilidade permanecem provenientes de R2 e das bases compartilhadas, não de métricas artificiais.
- Cartões de uso/consistência mais claros, botões de atualização/reconciliação preservados e seção de envio compacta.
- Busca e filtro de alocação ganham leitura melhor; **Alocado / Não alocado / Não identificado** continuam separados.
- Tabela com cabeçalho fixo, linhas compactas, ações (Detalhes, Abrir, Baixar, Excluir) mantidas, rolagem própria e foco visível.
- Não há nenhuma mudança na leitura, gravação, remoção ou classificação dos documentos.

### Consultas (React)
- Barra de consulta/exportação permanece acessível mesmo com rolagem; corrigido o deslocamento dela para ficar abaixo do cabeçalho fixo do GRCON.
- Resumo, filtros e tabela ganham melhor hierarquia; seleção, busca, modelo de relatório, copiar e exportar continuam disponíveis.
- Tabela de resultados preserva cabeçalhos, comentários da Fiscal 01, paginação, ordenação e detalhes existentes (nenhuma supressão de informação).
- Estado de alocação continua derivado da base oficial de Documentos Previstos.

## Restrições operacionais
- Não alteramos nenhuma regra de revisão 0, múltiplas revisões, lotes <= limite configurado, repostagem, propósito de emissão, permissões ou integração do Teams/SIGEM.
- Não alteramos esquema do banco nem a migração da foto de perfil da Fase 1.
- Não adotamos números, usuários, status ou códigos fictícios das imagens geradas por IA.
- O modo escuro usa tokens existentes. O design é otimizado para desktop/notebook, sem priorizar telas de celular.
- As tabelas com muitas colunas continuam roláveis horizontalmente dentro da área delimitada em vez de truncar ou esconder campos.

## Validação e publicação
- `tests/ux_version_c_phase2.cjs`: invariantes estáticos de presença de módulos/ações, hierarquia CSS e integração da folha; incluído em `npm test`.
- CI: executar `npm run verify`, as regressões GRDT/Cofre/Consultas, QA UX/UI Chromium e build + verificação Cloudflare.
- Homologação visual pendente em notebook corporativo (1366×768 e zoom de 100–125%) com documentos reais autorizados, estados vazios, modo escuro e filtros longos.
- Implantação só pode ser afirmada quando o commit aparecer no `deployment-meta.json` no domínio Cloudflare publicado.

## Próximas fases
Fase 3: Conferência / Pendências, distinguindo pendência parcial da GRDT inteira e mantendo exportações completas. Depois SIGEM×PW, ferramentas, administração e notificações.
