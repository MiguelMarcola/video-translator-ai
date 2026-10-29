# PRD — Vídeos com tradução, resumo e chat

Versão 0.5 • 28/10/2026 • Pipeline com Python e tradução local aprovado para o MVP

## 1. Visão do produto

Uma aplicação web na qual o usuário informa a URL de um vídeo do YouTube e escolhe um idioma. O sistema obtém o vídeo, transcreve o áudio, gera legendas no idioma escolhido e apresenta um player. Ao lado, mostra um resumo produzido por um modelo GPT e um chat para perguntas sobre o conteúdo. O usuário também pode baixar uma versão do vídeo com as legendas gravadas na imagem.

## 2. Problema e público

Pessoas que estudam ou pesquisam com vídeos precisam superar barreiras de idioma, localizar informações e esclarecer dúvidas sem assistir repetidamente ao conteúdo inteiro.

Público inicial: estudantes, profissionais e pessoas que consomem conteúdo educacional em outros idiomas. Hipótese a validar: reunir tradução, reprodução e perguntas no mesmo ambiente reduz o tempo necessário para compreender um vídeo.

## 3. Objetivo e proposta de valor

Transformar um vídeo em uma experiência de estudo: assistir com legendas no idioma escolhido, consultar uma síntese, perguntar sobre o conteúdo e guardar uma cópia legendada para uso autorizado.

Indicador principal: percentual de processamentos concluídos em que o usuário reproduz o vídeo e realiza ao menos uma ação de valor — consultar uma referência do resumo, perguntar no chat ou baixar o resultado.

## 4. Premissas propostas para o MVP

Estas decisões são propostas, não requisitos já confirmados pelo solicitante.

| Tema | Proposta inicial |
| --- | --- |
| Idiomas de destino | Português brasileiro, inglês e espanhol |
| Idioma de origem | Detectado automaticamente; informar quando não for suportado |
| Conteúdo | Um vídeo gravado por processamento; até 30 minutos |
| Qualidade de saída | Até 720p, limitada pela qualidade disponível na origem |
| Áudio | Preservar o original; sem dublagem |
| Resumo e chat | No idioma escolhido para as legendas |
| Acesso | Conta simples para acompanhar tarefas e proteger os resultados |
| Retenção | Proposta: arquivos e conteúdo derivados disponíveis por 7 dias; permitir exclusão antecipada |
| Concorrência | Uma tarefa ativa por usuário, com limites adicionais configuráveis |

## 5. Jornada principal

1. Usuário acessa a aplicação e informa uma URL de vídeo do YouTube.
2. Escolhe o idioma e solicita o processamento.
3. Sistema valida a entrada, verifica disponibilidade e limites e cria uma tarefa.
4. Interface informa a etapa atual: obtenção do vídeo, transcrição, tradução e preparação da reprodução.
5. Com o vídeo e as legendas prontos, libera o player e gera o resumo e o contexto do chat.
6. Resumo aparece ao lado do player, com referências de tempo clicáveis.
7. Usuário faz perguntas e recebe respostas vinculadas a trechos do vídeo.
8. Ao solicitar o download, o sistema prepara a versão MP4 com legendas gravadas e disponibiliza o arquivo.

Resumo e download podem terminar em momentos diferentes. Cada recurso deve exibir seu próprio estado e disponibilizar o que já estiver pronto.

## 6. Interface

### Tela de entrada

- Campo de URL, seletor de idioma e botão “Gerar vídeo”.
- Informação de duração máxima, idiomas disponíveis e prazo de disponibilidade dos arquivos.
- Validação com mensagens específicas para URL inválida, formato não aceito e vídeo indisponível.

### Tela de processamento

- Título e miniatura, quando disponíveis.
- Etapa atual e estados de espera, execução ou erro.
- Não exibir percentual ou prazo fictício quando não houver estimativa confiável.
- A tarefa continua ao sair da página; pode ser retomada pelo histórico.

### Tela de resultado

| Região | Conteúdo |
| --- | --- |
| Cabeçalho | Título, idioma escolhido, link para a origem e validade dos arquivos |
| Coluna principal | Player, ativação de legendas, controles de reprodução e download |
| Coluna lateral | Abas “Resumo” e “Chat”; referências com timestamps |
| Resumo | Visão geral, principais tópicos e conclusões apoiadas no conteúdo |
| Chat | Histórico, campo de pergunta, estado de resposta e sugestões iniciais |

Em telas pequenas, player acima do resumo e do chat. A navegação e os controles devem funcionar por teclado.

## 7. Requisitos funcionais e critérios de aceite

| ID | Requisito | Critério de aceite |
| --- | --- | --- |
| RF01 | Receber URL e idioma | Aceitar links reconhecidos de vídeos individuais; rejeitar hosts externos, playlists e entradas inválidas antes de enfileirar |
| RF02 | Validar elegibilidade | Rejeitar vídeos acima do limite ou inacessíveis com motivo compreensível |
| RF03 | Processar em segundo plano | Retornar uma tarefa identificável e permitir recuperar seu estado após atualizar a página |
| RF04 | Gerar transcrição com tempos | Persistir segmentos com início e fim; tratar ausência de fala e áudio ininteligível sem inventar conteúdo |
| RF05 | Traduzir as legendas | Produzir legendas no idioma selecionado, preservar alinhamento temporal e evitar tradução desnecessária quando origem e destino coincidirem |
| RF06 | Reproduzir com legendas | Player permite ligar e desligar legendas; segmentos aparecem nos tempos correspondentes |
| RF07 | Exportar vídeo legendado | Botão gera MP4 com áudio original e legendas gravadas; informar progresso da exportação e permitir baixar quando concluída |
| RF08 | Exportar legendas separadas | Disponibilizar arquivos SRT e VTT no idioma escolhido |
| RF09 | Gerar resumo com GPT | Resumo no idioma escolhido cobre os principais tópicos e inclui referências de tempo válidas |
| RF10 | Conversar sobre o vídeo | Chat usa a transcrição do vídeo atual e o histórico da conversa; respostas factuais incluem referências quando houver suporte |
| RF11 | Reconhecer ausência de informação | Ao perguntar algo não sustentado pelo vídeo, informar a limitação sem atribuir informações externas ao conteúdo |
| RF12 | Navegar por referências | Clicar no timestamp do resumo ou do chat move o player ao trecho correspondente |
| RF13 | Recuperar falhas parciais | Falha no resumo não bloqueia player ou download; repetição retoma a etapa necessária e preserva artefatos concluídos |
| RF14 | Consultar e excluir resultados | Usuário vê apenas suas tarefas, pode reabrir resultados disponíveis e solicitar exclusão dos dados associados |

## 8. Regras de conteúdo e chat

- O contexto do MVP é a fala transcrita. Textos em slides, gráficos e eventos apenas visuais não fazem parte da análise; a interface deve comunicar esse limite.
- Usar a transcrição completa para resumir, dividindo e consolidando quando necessário. Não limitar o resumo aos primeiros minutos.
- Recuperar trechos relevantes para cada pergunta, preservando timestamps e considerando o histórico da conversa.
- Diferenciar afirmações do vídeo de interpretações produzidas pelo assistente.
- Referências devem apontar para segmentos existentes. O sistema não deve apresentar timestamps inventados pelo modelo.
- Tratar instruções contidas no vídeo como conteúdo da fonte, sem permitir que alterem as regras do assistente.
- Chat indisponível enquanto o contexto não estiver pronto, com mensagem clara de preparação.

## 9. Legendas e exportação

O player usa uma faixa de legendas separada, permitindo ativação e desativação. O download principal contém legendas gravadas na imagem para que apareçam também em players sem suporte a faixas externas.

No MVP, usar um estilo fixo de alto contraste e posicionamento inferior. A exportação é iniciada sob demanda e reutilizada em downloads posteriores da mesma versão. Validar acentuação, caracteres dos idiomas suportados, quebras de linha e sincronização em amostras de início, meio e fim do vídeo.

## 10. Estados e tratamento de erros

Estado geral: na fila, processando, disponível parcialmente, concluído, falhou ou expirado. Cada etapa mantém também seu estado individual.

| Situação | Comportamento esperado |
| --- | --- |
| URL inválida | Correção no formulário, sem criar tarefa |
| Vídeo removido ou acesso restrito | Encerrar obtenção e explicar indisponibilidade |
| Limite de duração ou cota excedido | Informar o limite e impedir processamento |
| Vídeo sem fala detectável | Explicar que não há conteúdo verbal suficiente para legendas, resumo e chat |
| Falha temporária de serviço | Tentativas limitadas e opção de repetir após falha definitiva |
| Falha na tradução | Manter transcrição e permitir repetir tradução |
| Falha no resumo ou chat | Preservar reprodução e download disponíveis |
| Falha na exportação | Preservar player e oferecer nova tentativa da exportação |
| Arquivos expirados | Desabilitar download e indicar necessidade de novo processamento |

## 11. Requisitos não funcionais

- Processamento assíncrono com fila, controle de concorrência e retomada por etapa.
- Isolamento dos resultados por usuário e links de acesso temporários para arquivos.
- Chaves de serviços externas apenas no servidor; registros operacionais sem segredos ou conteúdo integral por padrão.
- Validação de URL e de redirecionamentos para impedir acesso a destinos internos não autorizados.
- Limites configuráveis de duração, tamanho, frequência e consumo de chat para controlar custos.
- Interface responsiva, rótulos acessíveis, estados anunciados e navegação por teclado.
- Exclusão deve abranger mídia, legendas, transcrições, contexto de busca e conversas, conforme política definida; retenção de backups deve ser explicitada antes do lançamento.
- Instrumentar duração, erros e custo estimado por etapa e por minuto de vídeo.

Metas iniciais para validação, sem compromisso de SLA: criação de tarefa em até 2 segundos no p95; primeiro texto do chat em até 5 segundos no p95 após contexto pronto; sucesso de pelo menos 95% dos processamentos elegíveis no conjunto de testes. Medir processamento por faixa de duração antes de definir prazo prometido ao usuário.

## 12. Escopo do MVP e evoluções

| MVP | Após validação |
| --- | --- |
| URL individual, três idiomas e limite de 30 minutos | Mais idiomas, vídeos longos e playlists |
| Legendas, player e exportação MP4/SRT/VTT | Editor visual de legendas e estilos personalizados |
| Resumo e chat com timestamps | Análise de slides e de conteúdo visual |
| Histórico simples e expiração dos resultados | Pastas, compartilhamento e colaboração |
| Conta, cotas e monitoramento | Assinaturas, pagamentos e planos por consumo |

Dublagem, aplicativos nativos, processamento de transmissões ao vivo e pesquisa na web pelo chat ficam fora do MVP.

## 13. Modelo conceitual de dados

| Entidade | Informações principais |
| --- | --- |
| Usuário | Identidade e cotas |
| Projeto de vídeo | Proprietário, origem, título, duração, idioma de destino e expiração |
| Tarefa | Etapa, estado, tentativas, erro e tempos de execução |
| Segmento | Texto original, tradução, início e fim |
| Artefato | Tipo, versão, localização protegida e validade |
| Resumo | Texto, idioma, versão da transcrição e referências |
| Conversa e mensagem | Projeto, autor, texto e referências aos segmentos |

## 14. Direção técnica, sujeita a validação

Separar a interface/API, os workers de mídia e os serviços de IA. O fluxo obtém a mídia, extrai áudio, transcreve, traduz e prepara legendas. A partir da transcrição, resumo e contexto do chat podem ser gerados independentemente da exportação do vídeo.

Persistir metadados e estados em banco; arquivos em armazenamento de objetos; trabalhos demorados em fila. Manter adaptadores para obtenção do vídeo, transcrição e modelos GPT, permitindo trocar provedores sem alterar o fluxo do produto. A escolha de modelos e infraestrutura fica para a especificação técnica, após medir qualidade, custo e latência.

## 15. Dependências e riscos a validar

- Obtenção de mídia do YouTube: validar a viabilidade técnica e as condições aplicáveis antes de prometer suporte amplo. O produto não deve depender de acesso irrestrito a qualquer URL. Definir comportamento para conteúdos indisponíveis e permitir apenas usos autorizados.
- Tradução e transcrição: sotaques, ruído, nomes próprios e termos técnicos podem reduzir qualidade; testar com vídeos representativos.
- Custo: medir obtenção, transcrição, tradução, GPT, renderização, armazenamento e tráfego de download. O teto de custo por minuto é uma decisão pendente.
- Conteúdo visual: perguntas sobre informações apenas na imagem podem não ser respondidas pelo MVP.
- Dependências externas: indisponibilidade ou mudanças de integração podem afetar uma etapa; manter falhas isoladas e mensagens claras.

## 16. Métricas e eventos

Medir envio de URL, rejeição por motivo, início/fim/falha de cada etapa, primeira reprodução, abertura do resumo, clique em timestamp, pergunta no chat, exportação e download concluídos.

Indicadores: taxa de conclusão, tempo até primeira reprodução, tempo total por minuto de vídeo, custo por minuto, uso do chat, taxa de respostas úteis avaliada por amostra, uso do download e retorno em 7 dias. Evitar registrar perguntas ou transcrições completas apenas para analytics.

## 17. Critérios para lançamento

- Jornada completa validada nos idiomas de destino suportados.
- Vídeos com e sem legendas de origem produzem resultado ou erro explícito.
- Arquivos exportados reproduzem áudio, vídeo e caracteres corretamente.
- Referências de resumo e chat levam ao trecho correspondente.
- Perguntas sem suporte no vídeo recebem resposta de limitação.
- Falhas parciais, repetição de etapas, expiração e exclusão foram verificadas.
- Um usuário não consegue consultar tarefas e artefatos de outro.
- Viabilidade da obtenção de mídia e orçamento operacional foram validados.

## 18. Decisões pendentes

1. Confirmar idiomas iniciais e duração máxima dos vídeos.
2. Confirmar necessidade de conta e prazo de retenção.
3. Definir público prioritário: estudo pessoal, uso profissional ou criadores.
4. Definir modelo de negócio e teto aceitável de custo por minuto.
5. Validar a estratégia de obtenção de mídia e eventual alternativa de upload de arquivo autorizado.
6. Definir o conjunto de vídeos de avaliação e metas de qualidade de legenda, resumo e chat antes da implementação.

## 19. Stack de desenvolvimento e decisões

Node.js, React e o pipeline descrito na seção 28 foram confirmados pelo solicitante. As demais tecnologias abaixo seguem como recomendações iniciais. Em caso de divergência com propostas anteriores, prevalece o registro da seção 28. As seções 19–25 detalham a direção da seção 14.

| Camada | Tecnologia proposta | Motivo e status |
| --- | --- | --- |
| Back-end | Node.js | Confirmado; API e orquestração dos workers |
| Front-end | React | Confirmado; interface, player, resumo e chat |
| Linguagens | TypeScript em modo strict + Python no worker de mídia | Proposta: API/web tipadas e ecossistema Python para transcrição |
| Build web | Vite | Proposta: aplicação autenticada sem requisito inicial de renderização no servidor |
| Rotas web | React Router | Proposta: entrada, histórico e detalhes do vídeo |
| Dados remotos | TanStack Query | Proposta: busca, cache, mutações e consulta periódica de estados |
| UI | Tailwind CSS + componentes shadcn/ui | Proposta: acelerar interface responsiva mantendo controle do código |
| Formulários | React Hook Form + Zod | Proposta: validação de URL e idioma; schemas de contratos compartilháveis |
| API | NestJS com adaptador Express | Proposta: módulos, injeção de dependências e integração com workers; Fastify é alternativa |
| Contratos | REST + OpenAPI; Zod para validação na borda | Proposta: documentação e cliente tipado gerado; tipos TypeScript sozinhos não validam entradas |
| Banco | PostgreSQL | Proposta: usuários, tarefas, segmentos, mensagens e consistência transacional |
| Acesso a dados | Prisma | Proposta: migrations e acesso tipado; SQL parametrizado quando necessário |
| Fila | BullMQ + Redis | Proposta: trabalhos demorados, tentativas e concorrência por etapa |
| Arquivos | Armazenamento compatível com S3 | Proposta: mídia e legendas fora do banco; fornecedor pendente |
| Player | HTML5 video + track WebVTT | Proposta: suficiente para MP4 e legendas; avaliar biblioteca de player apenas se os controles exigirem |
| Vídeo e áudio | FFmpeg + ffprobe executados pelo worker | Proposta: extração, inspeção, conversão e legendas gravadas |
| Obtenção do YouTube | yt-dlp encapsulado em adaptador | Candidato sujeito a prova de conceito e validação da estratégia de acesso |
| IA de texto | SDK oficial openai no servidor | Proposta: resumo e chat via API; tradução local como padrão proposto |
| Transcrição | faster-whisper em worker Python | Nova proposta prioritária para prova de conceito; API gerenciada como alternativa |
| Busca semântica | Embeddings + pgvector no PostgreSQL | Proposta para recuperar trechos; validar qualidade e integração com o ORM |
| Logs e telemetria | Pino + OpenTelemetry | Proposta: logs estruturados e rastros entre API, fila e workers |
| Testes | Vitest, React Testing Library e Playwright | Proposta: unidade, componentes e jornadas de ponta a ponta |
| Ambiente | pnpm workspaces + Docker Compose | Proposta: um repositório e serviços locais reproduzíveis |
| CI | GitHub Actions | Proposta caso o código seja hospedado no GitHub |

Usar versões estáveis compatíveis e Node.js LTS suportado no início da implementação; registrar versões no lockfile e fixar imagens de implantação. Não definir números de versão antes da validação de compatibilidade.

### Alternativas que vale debater

| Decisão | Recomendação inicial | Quando escolher alternativa |
| --- | --- | --- |
| Vite ou Next.js | Vite | Next.js se páginas públicas com SEO e renderização no servidor virarem requisito |
| NestJS ou Fastify direto | NestJS | Fastify direto se a preferência for menos estrutura e uma API menor |
| PostgreSQL ou MongoDB | PostgreSQL | Reavaliar apenas diante de uma necessidade concreta de documentos; o domínio atual tem relações claras |
| BullMQ ou RabbitMQ | BullMQ | RabbitMQ se houver padronização operacional ou integrações entre vários sistemas; implementar explicitamente retries, recuperação e estado do workflow |
| Redis ou fila gerenciada | Redis com BullMQ | Fila gerenciada, como SQS, se priorizar operação na nuvem escolhida; muda o mecanismo do worker |
| Busca vetorial já no início | pgvector na etapa do chat | Começar com contexto integral apenas se toda a transcrição couber no orçamento de tokens; nunca truncar silenciosamente |
| Infra própria ou serviços gerenciados | Banco e objetos gerenciados; API/workers em contêiner | Máquina única pode servir à prova de conceito, aceitando operação e disponibilidade mais limitadas |

## 20. Organização da aplicação

Arquitetura proposta: um repositório com módulos e processos separados — web, API, worker de orquestração Node e worker Python de mídia. Para a primeira prova de conceito, o worker Node pode executar um comando Python com contrato JSON, dispensando um serviço HTTP adicional. Não é necessário criar um microserviço por etapa.

```text
apps/web                 React, páginas, player e chat
apps/api                 NestJS, autenticação, REST e streaming do chat
apps/worker              Orquestração, mídia, transcrição e IA
workers/media-python     yt-dlp, transcrição e escrita de legendas
packages/contracts       Schemas de entrada/saída e tipos de eventos
packages/config          Configurações compartilhadas de TypeScript e lint
infra                    Docker e configuração dos ambientes
```

Módulos do back-end: auth, videos, processing, transcripts, subtitles, summaries, conversations, storage e usage. Banco e integrações ficam atrás de interfaces; o front-end não importa entidades internas de persistência.

Worker de renderização pode virar processo separado quando a carga justificar. A proposta atual usa Python para mídia e transcrição, mantendo Node como API e orquestrador. Dependências Python ficam em ambiente próprio e fixadas; FFmpeg e fontes integram a imagem de execução.

## 21. Integrações e pipeline técnico

### Obtenção e preparação

1. API valida a URL, normaliza o identificador do vídeo, verifica cota e cria o projeto e a intenção de processamento.
2. Publicação na fila deve ser recuperável: usar outbox transacional ou reconciliador de tarefas pendentes para evitar perder um processamento entre a gravação no banco e o envio à fila.
3. Worker consulta metadados pelo adaptador de origem e valida duração antes de baixar a mídia integral. Disponibilidade de título e duração depende da origem.
4. yt-dlp obtém a mídia na prova de conceito. Uma API de metadados não deve ser tratada como solução de download do arquivo.
5. ffprobe inspeciona duração, codecs e faixas; FFmpeg prepara MP4 compatível com reprodução e áudio para transcrição. Se necessário, converter codecs mesmo sem gravar legendas.
6. Salvar artefatos em bucket privado e persistir referências, versão e tamanho no banco.

Executar binários com child_process.spawn ou execFile, argumentos separados e shell desativado. Impor timeout, limite de disco, tamanho e recursos. Identificadores internos determinam caminhos; não usar nomes e argumentos arbitrários enviados pelo usuário.

### Transcrição e legendas

- Definir um adaptador SpeechToTextProvider cuja saída contenha idioma e segmentos com id, startMs, endMs e texto.
- Avaliar primeiro faster-whisper local no worker Python. Comparar com API gerenciada se hardware, tempo de processamento ou operação inviabilizarem a opção local. O teste precisa comprovar timestamps adequados às legendas; nem todo modelo de transcrição oferece a mesma granularidade.
- Se o modelo escolhido não oferecer alinhamento suficiente, avaliar outro provedor ou adicionar alinhamento temporal. Não estimar tempos distribuindo o texto uniformemente pela duração.
- Dividir áudio conforme limites do provedor, preservar offsets globais e tratar sobreposições e duplicatas nos cortes.
- Traduzir por lotes usando IDs estáveis dos segmentos e saída estruturada. Validar IDs, quantidade e ordem antes de aceitar o resultado; repetir apenas os lotes inválidos.
- Gerar VTT para o player e SRT para exportação. Produzir ASS quando necessário para estilo da renderização.
- FFmpeg com suporte a libass grava as legendas no MP4 solicitado. Incluir fontes compatíveis na imagem do worker.

### Resumo, embeddings e chat

- Usar o SDK openai no servidor, mantendo adaptadores para geração e embeddings; chaves nunca chegam ao navegador.
- Configurar modelos separadamente para tradução, resumo, chat e embeddings. Seleção final depende de avaliação de qualidade, custo, limite de contexto e latência.
- Resumo: processar todos os segmentos, por partes se necessário, consolidar e validar referências a IDs existentes.
- Busca: agrupar segmentos em blocos com IDs e intervalo temporal; gerar embeddings e persistir no pgvector. Registrar modelo, dimensão e versão do processamento para permitir reindexação.
- Pergunta: reescrever perguntas de continuidade quando necessário, buscar somente blocos do projeto autorizado e acrescentar segmentos vizinhos dentro do orçamento de contexto.
- Resposta: fornecer trechos e histórico limitado ao modelo; exigir referências por ID. A API resolve os IDs para timestamps e rejeita referências inexistentes.
- Não enviar apenas o resumo ao chat: ele pode omitir a informação que o usuário deseja perguntar.
- Oferecer streaming de texto via fetch com leitura de stream. Usar SSE para eventos de progresso ou manter polling no MVP; WebSocket não é necessário inicialmente.
- Persistir a mensagem final e suas referências. Em caso de interrupção, distinguir resposta incompleta e permitir nova tentativa sem duplicar mensagens concluídas.

## 22. Contratos iniciais da API

Rotas propostas, sujeitas ao detalhamento no OpenAPI. Todas exigem autenticação e autorização por proprietário, exceto endpoints operacionais conforme a configuração de infraestrutura.

| Método e rota | Responsabilidade |
| --- | --- |
| POST /videos | Receber youtubeUrl e targetLanguage; devolver 202 com videoId e estado |
| GET /videos | Listar projetos do usuário com paginação |
| GET /videos/:id | Retornar metadados e disponibilidade individual de player, resumo, chat e exportação |
| GET /videos/:id/status | Consultar estado e etapa atual; polling inicial sugerido de 3–5 segundos com recuo |
| GET /videos/:id/playback | Obter URLs temporárias de mídia e legenda |
| GET /videos/:id/summary | Consultar resumo e referências |
| POST /videos/:id/exports | Solicitar exportação idempotente da versão atual; devolver 202 ou resultado já existente |
| GET /videos/:id/exports/:exportId | Consultar estado e URL temporária quando pronta |
| POST /videos/:id/conversations | Criar conversa vinculada ao projeto |
| GET /conversations/:id/messages | Recuperar histórico paginado |
| POST /conversations/:id/messages | Enviar pergunta e retornar stream de eventos e resposta |
| POST /videos/:id/retries | Repetir etapa permitida após validação do estado |
| DELETE /videos/:id | Bloquear acesso imediatamente e iniciar exclusão dos dados associados |

Padronizar erros com code, message e requestId. Aceitar chave de idempotência na criação de tarefas e mensagens para evitar duplicação por repetição de requisição. URL de download não deve aparecer em listagens públicas ou permanecer válida indefinidamente.

## 23. Persistência, filas e confiabilidade

Tabelas propostas: users, videos, processing_jobs, transcript_segments, subtitle_versions, artifacts, summaries, transcript_chunks, conversations, messages, usage_events e outbox_events, caso seja adotado outbox. Referências de chat podem usar tabela associativa ou JSON validado com IDs de segmentos.

Filas propostas: ingest, transcribe, translate, summarize, index, render e cleanup. Um mesmo processo pode consumir várias filas no MVP. A conclusão da transcrição libera resumo e indexação; a tradução libera legendas. Renderização depende da mídia e das legendas e ocorre sob demanda.

BullMQ pode executar um trabalho novamente após falhas. Cada etapa deve ser idempotente, com chave baseada em projeto, etapa e versão. O banco é a fonte do estado visível ao usuário. Persistir tentativas, checkpoints, artefatos completos e motivo de falha. Usar backoff para falhas transitórias, não repetir erros permanentes de acesso e recuperar tarefas abandonadas.

Na exclusão, impedir novas etapas e gravações tardias por workers ainda ativos. Limpeza deve ser repetível e remover objetos, índices e mensagens. Expiração do bucket não substitui a limpeza dos registros e do contexto do chat.

## 24. Autenticação, infraestrutura e desenvolvimento

### Autenticação pendente

Recomendação: provedor OIDC gerenciado, como Auth0 ou Cognito, em vez de implementar senhas e recuperação no produto. Comparar com Supabase Auth se o banco também for hospedado no Supabase. Escolher um provedor, não instalar todos. API valida emissor, audiência e expiração dos tokens ou sessão; cada consulta também valida o proprietário do recurso.

### Ambiente e implantação

- Local: web, API, worker, PostgreSQL, Redis e armazenamento S3 de desenvolvimento; pode ser emulador ou bucket dedicado.
- Produção: web em hospedagem estática/CDN; API e worker em contêineres; PostgreSQL, Redis e bucket privados. Evitar executar renderização longa em funções com limites curtos de duração ou disco.
- Se AWS for escolhida: avaliar S3, RDS, ElastiCache e ECS. São candidatos, sem compromisso de adoção ou estimativa de preço nesta versão.
- Servir vídeo com suporte a requisições Range e legendas com MIME e CORS corretos. Renovar URLs expiradas para evitar interromper sessões longas.
- Separar ambientes de desenvolvimento e produção, segredos, buckets, cotas e contas de serviços. Definir espaço temporário e concorrência de renderização por medição.

### Qualidade e operação

- CI: instalação com lockfile, lint, typecheck, testes relevantes e build de web/API/worker.
- Testes prioritários: autorização, idempotência, retomada de etapa, exclusão durante execução, offsets temporais, referências do chat e jornada completa com vídeo curto autorizado.
- Avaliar IA com conjunto fixo de vídeos e perguntas, incluindo ruído, termos técnicos e perguntas sem resposta no vídeo. Não exigir igualdade literal de respostas geradas.
- Logs: requestId, videoId e jobId; métricas de fila, latência, falhas, bytes, minutos e consumo de modelos. Painel/fornecedor de observabilidade pendente.
- Configurar por ambiente: banco, fila, bucket, provedor de identidade, modelos, cotas e retenção. Arquivo de exemplo contém nomes e valores fictícios, nunca segredos reais.

## 25. Sequência sugerida de implementação e validação

1. Prova de conceito de mídia: URL → obtenção → áudio → transcrição com tempos → VTT → MP4 legendado. Validar esta cadeia antes de construir todo o produto.
2. Fundação: repositório, ambiente local, autenticação escolhida, banco, fila e contratos.
3. Jornada de vídeo: criar projeto, acompanhar processamento, retomar tela e reproduzir com legendas.
4. IA: tradução validada por segmentos, resumo com referências, indexação e chat contextual com streaming.
5. Exportação e operação: download, retries, cotas, expiração, exclusão, telemetria e testes de lançamento.

Decisões para o próximo debate: TypeScript; Vite ou Next.js; NestJS ou Fastify; BullMQ ou RabbitMQ; provedor de transcrição; autenticação; nuvem e orçamento. Confirmar escolhas progressivamente e registrar motivo, alternativa rejeitada e impacto em custo/operação.

### Referências técnicas consultadas em 28/10/2026

- [Vite](https://vite.dev/guide/): build e desenvolvimento da aplicação React.
- [NestJS — filas](https://docs.nestjs.com/techniques/queues) e [BullMQ](https://docs.bullmq.io/): integração de trabalhos assíncronos.
- [yt-dlp](https://github.com/yt-dlp/yt-dlp): distribuição e dependências do candidato de obtenção de mídia.
- [FFmpeg — filtros](https://ffmpeg.org/ffmpeg-filters.html): renderização de legendas e requisitos de libass.
- [OpenAI — transcrição](https://developers.openai.com/api/docs/guides/speech-to-text): formatos, timestamps e limites específicos de modelos; revalidar antes de implementar.
- [pgvector](https://github.com/pgvector/pgvector): busca vetorial no PostgreSQL.

As referências documentam capacidades das ferramentas; a combinação arquitetural e as recomendações são propostas para este projeto.

## 26. Proposta de simplificação com Python

Motivação: explorar bibliotecas existentes para obter áudio, transcrever com timestamps e escrever legendas, preservando Node e React nas camadas confirmadas. Esta é uma proposta para validação, não uma escolha final de infraestrutura.

| Responsabilidade | Ferramenta proposta |
| --- | --- |
| Obter áudio/vídeo da URL | yt-dlp, chamado por Python ou CLI |
| Extrair/converter áudio e gravar legendas no vídeo | FFmpeg e ffprobe |
| Transcrever e obter segmentos temporais | faster-whisper |
| Escrever SRT e VTT | Serializador pequeno validado ou biblioteca de legendas, a escolher |
| Traduzir para o idioma solicitado | Argos Translate como candidato inicial; preservar IDs e tempos dos segmentos |
| Resumo e chat | GPT via API Node, usando a transcrição persistida |

Fluxo: obter mídia → normalizar áudio → faster-whisper → segmentos JSON → tradução, se necessária → SRT/VTT → player e exportação FFmpeg. Resumo e chat reutilizam os mesmos segmentos.

Whisper oficial é uma alternativa que já oferece exportação de legendas pela CLI. faster-whisper é o candidato inicial para medir uso de memória e desempenho no hardware disponível; ele entrega segmentos e timestamps, exigindo uma etapa de escrita do arquivo. Não é necessário adicionar MoviePy ou Pydub apenas para extrair áudio se FFmpeg já cobre essa necessidade.

A tarefa de tradução do Whisper se destina a inglês; não resolve sozinha destinos arbitrários como português e espanhol. Para este produto, transcrever no idioma original e depois traduzir os segmentos com um provedor de tradução de texto. A etapa de tradução pode ser omitida quando o idioma original coincide com o solicitado.

Integração inicial proposta: worker Node executa Python como subprocesso controlado, passando caminhos e configuração em contrato validado. Python grava segmentos e artefatos em arquivos/objetos e devolve referências e metadados; não transportar vídeo como JSON ou base64. Usar saída de progresso separada do resultado final. Timeout, cancelamento e término da árvore de processos devem ser tratados pelo orquestrador. Não executar esse subprocesso dentro da requisição HTTP do usuário.

Ao separar máquinas ou escalar, escolher contrato HTTP assíncrono ou fila com consumidores Python. Não presumir que um consumidor de fila genérico implementa o protocolo BullMQ. Nesta proposta inicial, Node continua proprietário da fila e Python funciona como executor.

CPU pode ser suficiente para a prova de conceito, inclusive com quantização, mas a latência precisa ser medida. GPU é alternativa, não requisito confirmado. Registrar modelo, dispositivo, memória, tempo por minuto e qualidade em vídeos reais antes de definir capacidade e prazo do produto. Não há cobrança por minuto de uma API de transcrição local, mas permanecem custos de computação e operação.

Referências: [faster-whisper](https://github.com/SYSTRAN/faster-whisper) e [Whisper oficial](https://github.com/openai/whisper), consultados em 28/10/2026.


## 27. Tradução aberta e controle de custos

Esta seção revisa a proposta anterior de GPT para tradução: avaliar tradução local como padrão do MVP e reservar GPT para resumo e chat. Referências anteriores a tradução com GPT nas seções técnicas representam uma alternativa, não dependência obrigatória. Nenhum fallback pago deve ocorrer automaticamente sem configuração explícita e limites de consumo.

Candidato inicial: Argos Translate, biblioteca Python de tradução offline com pacotes por par de idiomas. O catálogo inclui português e português brasileiro, mas é necessário confirmar cada direção desejada e disponibilidade de modelo direto. A biblioteca é MIT/CC0; registrar também origem e licença dos pacotes de modelo selecionados.

Alternativa: modelos OPUS-MT com um runtime compatível, como Transformers ou CTranslate2 após conversão suportada. Selecionar o modelo exato por direção de tradução e validar sua licença, requisitos e qualidade; a licença do código não substitui a dos pesos.

NLLB-200 distilled 600M não é a escolha inicial para um produto comercial: seu modelo publicado usa CC-BY-NC-4.0.

Interface proposta TranslationProvider: recebe idioma de origem/destino e segmentos identificados; retorna traduções por ID. Implementar ArgosTranslationProvider inicialmente. Persistir texto original, tradução, modelo/pacote e versão. A escrita SRT/VTT continua separada do motor de tradução.

Não traduzir o arquivo SRT inteiro como texto livre: preservar IDs, timestamps e estrutura, traduzindo somente o conteúdo textual. Evitar frases cortadas sem contexto; testar agrupamento de segmentos e reconstrução das legendas, sem assumir correspondência de palavras entre idiomas. Rever quebras de linha e legibilidade após tradução. Tradução via idioma intermediário deve ser identificada e avaliada, pois pode reduzir qualidade.

Custos: GPT depende de tokens de entrada/saída e modelo; tradução local depende de CPU/GPU, memória, tempo e operação. Local elimina a cobrança por token de tradução, mas não torna a execução gratuita nem garante menor custo em baixo volume. Comparar custo por hora de vídeo, latência e qualidade em amostra representativa antes de fechar a escolha.

Prova de conceito: avaliar inglês → português brasileiro primeiro, depois as outras direções realmente necessárias. Verificar nomes próprios, termos técnicos, frases divididas entre legendas e consistência no vídeo. Registrar cobertura de pares, memória, latência e custo total. Escolher Argos se a qualidade for suficiente; comparar OPUS-MT e uma amostra de API paga apenas se necessário.

Referências consultadas em 28/10/2026: [Argos Translate](https://github.com/argosopentech/argos-translate), [catálogo de pacotes](https://www.argosopentech.com/argospm/index/), [OPUS-MT](https://github.com/Helsinki-NLP/Opus-MT) e [licença do modelo NLLB](https://huggingface.co/facebook/nllb-200-distilled-600M/tree/main).


## 28. Decisão aprovada — pipeline do MVP

Em 28/10/2026, o solicitante aprovou seguir com o pipeline proposto de transcrição e tradução local.

| Componente | Decisão |
| --- | --- |
| Interface web | React |
| API e orquestração | Node.js |
| Processamento de mídia e transcrição | Worker Python |
| Transcrição com timestamps | faster-whisper |
| Tradução das legendas | Argos Translate local |
| Extração/conversão e gravação das legendas | FFmpeg e ffprobe |
| Resumo e chat | GPT via API no servidor |
| Validação inicial | Inglês → português brasileiro |

GPT não será usado para tradução no fluxo padrão. Não haverá fallback pago automático. Argos e faster-whisper serão avaliados com vídeos representativos antes do lançamento; qualidade insuficiente exige revisão explícita da escolha, não troca silenciosa de provedor.

Preservar IDs e timestamps na tradução e reutilizar a transcrição para resumo e chat. Gerar WebVTT para o player, SRT para download e MP4 com legendas gravadas sob demanda.

Próximo passo de implementação: prova de conceito com vídeo autorizado, transcrição, tradução inglês → português brasileiro e reprodução/exportação, medindo qualidade, memória e tempo por minuto.

Permanecem em debate: Vite ou Next.js, TypeScript, framework Node, banco/ORM, fila, autenticação, hospedagem, modelos GPT e estratégia de obtenção do YouTube. yt-dlp permanece candidato para esta última. A aprovação do pipeline não confirma essas outras recomendações nem define metas de desempenho antes da medição.
